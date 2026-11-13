"""Tests for optional HTTPS/TLS support in desktop server, CLI, config, and auth cookies."""

from __future__ import annotations

import ipaddress
import socket
import ssl
import sys

from cryptography import x509
from fastapi.testclient import TestClient
import httpx
import pytest

from backend.app.cli import should_launch_gui
from backend.app.core import config as app_config
from backend.app.core.runtime_state import set_server_paused
from backend.app.core.security import hash_pin
from backend.app.core.tls import (
    MAX_SAFE_CERT_DAYS,
    ensure_self_signed_cert,
    get_cert_sha256_fingerprint,
    resolve_tls_files,
)
from backend.app.desktop.config_store import (
    DesktopConfig,
    load_desktop_config,
    resolve_launch_command,
    save_desktop_config,
)
from backend.app.desktop.server_manager import WherezyServerManager
from backend.app.main import app
from backend.app.models import Profile


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def test_ensure_self_signed_cert_reuses_and_updates_on_ip_change(tmp_path, monkeypatch):
    cert_dir = tmp_path / "certs"
    monkeypatch.setattr("backend.app.core.tls._detect_local_ipv4", lambda: "192.168.42.10")

    cert_path, key_path = ensure_self_signed_cert(cert_dir=cert_dir, extra_hosts=["127.0.0.1"])
    assert cert_path.is_file()
    assert key_path.is_file()

    cert1 = x509.load_pem_x509_certificate(cert_path.read_bytes())
    assert (cert1.not_valid_after_utc - cert1.not_valid_before_utc).days <= MAX_SAFE_CERT_DAYS + 2
    san1 = cert1.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    san_ips_1 = {str(ip) for ip in san1.get_values_for_type(x509.IPAddress)}
    san_dns_1 = {d.lower() for d in san1.get_values_for_type(x509.DNSName)}
    assert "localhost" in san_dns_1
    assert {"127.0.0.1", "::1", "192.168.42.10"}.issubset(san_ips_1)

    # Subsequent calls on the same network reuse the persisted certificate without regeneration
    cert_path_again, _ = ensure_self_signed_cert(cert_dir=cert_dir, extra_hosts=["127.0.0.1"])
    cert2 = x509.load_pem_x509_certificate(cert_path_again.read_bytes())
    assert cert2.serial_number == cert1.serial_number

    # Switching LAN IP regenerates the certificate to include the new address in SAN
    monkeypatch.setattr("backend.app.core.tls._detect_local_ipv4", lambda: "10.10.20.30")
    cert_path_updated, _ = ensure_self_signed_cert(cert_dir=cert_dir, extra_hosts=["0.0.0.0"])
    cert3 = x509.load_pem_x509_certificate(cert_path_updated.read_bytes())
    san3 = cert3.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    san_ips_3 = set(san3.get_values_for_type(x509.IPAddress))
    assert ipaddress.ip_address("10.10.20.30") in san_ips_3
    assert cert3.serial_number != cert1.serial_number

    fp = get_cert_sha256_fingerprint(cert_path_updated)
    assert fp.count(":") == 31


def test_resolve_tls_files_disabled_and_validation(tmp_path):
    assert resolve_tls_files(https_enabled=False) == (None, None)

    cert_dir = tmp_path / "custom"
    cert_path, key_path = ensure_self_signed_cert(cert_dir=cert_dir)

    with pytest.raises(ValueError, match="together"):
        resolve_tls_files(https_enabled=True, certfile=str(cert_path), keyfile="")

    with pytest.raises(FileNotFoundError):
        resolve_tls_files(
            https_enabled=True,
            certfile=str(tmp_path / "missing-cert.pem"),
            keyfile=str(key_path),
        )

    bad_cert = tmp_path / "bad.pem"
    bad_cert.write_text("not-a-valid-pem", encoding="utf-8")
    with pytest.raises(ValueError, match="Invalid SSL certificate"):
        resolve_tls_files(https_enabled=True, certfile=str(bad_cert), keyfile=str(key_path))

    resolved_cert, resolved_key = resolve_tls_files(
        https_enabled=True, certfile=str(cert_path), keyfile=str(key_path)
    )
    assert resolved_cert == str(cert_path)
    assert resolved_key == str(key_path)


def test_server_manager_https_lifecycle_and_error_handling(tmp_path, monkeypatch):
    cert_dir = tmp_path / "mgr_certs"
    monkeypatch.setenv("WHEREZY_CERT_DIR", str(cert_dir))
    manager = WherezyServerManager()
    port = _pick_free_port()

    try:
        # Invalid custom cert surfaces clean error instead of hanging
        bad_snap = manager.start(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            use_https=True,
            ssl_certfile=str(tmp_path / "nope.pem"),
            ssl_keyfile=str(tmp_path / "nope.key"),
        )
        assert bad_snap.status == "error"
        assert bad_snap.error_message and "TLS certificate error" in bad_snap.error_message

        snap = manager.start(
            host="127.0.0.1",
            port=port,
            data_dir=str(app_config.DATA_DIR),
            use_https=True,
            wait_timeout=8.0,
        )
        assert snap.status == "running", f"Expected running, got {snap}"
        assert snap.use_https is True
        assert snap.local_url == f"https://127.0.0.1:{port}"
        assert snap.cert_fingerprint

        cert_file = cert_dir / "wherezy-cert.pem"
        assert cert_file.is_file()

        res = httpx.get(
            f"{snap.local_url}/api/health",
            verify=ssl.create_default_context(cafile=str(cert_file)),
            timeout=5.0,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        logs = "\n".join(manager.get_logs())
        assert f"https://127.0.0.1:{port}" in logs
        assert "TLS SHA-256 fingerprint" in logs
    finally:
        set_server_paused(False)
        manager.stop(timeout=5.0)


def test_auth_cookie_sets_secure_only_for_https(db_session):
    user = Profile(
        name="HttpsUser",
        username="httpsuser",
        role="member",
        pin_hash=hash_pin("secret123"),
        is_active=1,
    )
    db_session.add(user)
    db_session.commit()

    http_client = TestClient(app, base_url="http://testserver")
    http_res = http_client.post("/api/auth/login", json={"username": "httpsuser", "pin": "secret123"})
    assert http_res.status_code == 200
    http_cookie = http_res.headers.get("set-cookie", "")
    assert "hi_session=" in http_cookie
    assert "; Secure" not in http_cookie and "; secure" not in http_cookie

    https_client = TestClient(app, base_url="https://testserver")
    https_res = https_client.post("/api/auth/login", json={"username": "httpsuser", "pin": "secret123"})
    assert https_res.status_code == 200
    https_cookie = https_res.headers.get("set-cookie", "")
    assert "hi_session=" in https_cookie
    assert "secure" in https_cookie.lower()


def test_desktop_config_https_roundtrip_and_cli_flags(tmp_path, monkeypatch):
    cfg_path = tmp_path / "cfg" / "desktop.json"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))

    defaults = load_desktop_config()
    assert defaults.use_https is False
    assert defaults.ssl_certfile == ""
    assert defaults.ssl_keyfile == ""

    cfg = DesktopConfig(
        host="0.0.0.0",
        port=8443,
        data_dir=str(tmp_path / "data"),
        use_https=True,
        ssl_certfile=str(tmp_path / "cert.pem"),
        ssl_keyfile=str(tmp_path / "key.pem"),
    )
    save_desktop_config(cfg)
    reloaded = load_desktop_config()
    assert reloaded.use_https is True
    assert reloaded.ssl_certfile == str(tmp_path / "cert.pem")
    assert reloaded.ssl_keyfile == str(tmp_path / "key.pem")

    assert "--https" in resolve_launch_command(use_https=True)
    assert "--no-https" in resolve_launch_command(use_https=False)

    assert should_launch_gui(["--https"], platform="win32", environ={}) is False
    assert should_launch_gui(["--ssl"], platform="win32", environ={}) is False
    assert should_launch_gui(["--gui", "--https"], platform="win32", environ={}) is True

    import desktop_main

    captured_calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "backend.app.desktop.app.run_desktop_app",
        lambda **kwargs: captured_calls.append(kwargs) or 0,
    )
    assert desktop_main.main(["--gui", "--https", "--minimized"]) == 0
    assert captured_calls == [
        {
            "host": None,
            "port": None,
            "data_dir": None,
            "use_https": True,
            "ssl_certfile": None,
            "ssl_keyfile": None,
            "minimized": True,
            "open_browser": False,
        }
    ]


def test_desktop_gui_https_toggle_and_lan_notice(tmp_path, monkeypatch):
    import os
    from backend.app.desktop.app import WherezyDesktopApp

    if sys.platform.startswith("linux") and not (
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    ):
        monkeypatch.setenv("QT_QPA_PLATFORM", "offscreen")

    cfg_path = tmp_path / "gui_https.json"
    cert_dir = tmp_path / "gui_certs"
    monkeypatch.setenv("WHEREZY_DESKTOP_CONFIG", str(cfg_path))
    monkeypatch.setenv("WHEREZY_CERT_DIR", str(cert_dir))

    free_port = _pick_free_port()
    save_desktop_config(
        DesktopConfig(
            host="127.0.0.1",
            port=free_port,
            data_dir=str(app_config.DATA_DIR),
            auto_start_server=False,
            lan_notice_shown=False,
            use_https=False,
        )
    )

    desktop = WherezyDesktopApp(enable_tray=False, enable_ipc=False)

    try:
        desktop._resolve_lan_notice(enable_lan=True, enable_https=True)
        assert load_desktop_config(cfg_path).host == "0.0.0.0"
        assert load_desktop_config(cfg_path).use_https is True
        assert desktop.chk_use_https.isChecked() is True
        assert desktop._local_url_preview.startswith("https://")

        snap = desktop.handle_start_or_resume()
        assert snap.status == "running"
        assert snap.use_https is True
        r_https = httpx.get(
            f"https://127.0.0.1:{free_port}/api/health",
            verify=ssl.create_default_context(cafile=str(cert_dir / "wherezy-cert.pem")),
            timeout=5.0,
        )
        assert r_https.status_code == 200

        desktop.chk_use_https.setChecked(False)
        desktop.app.processEvents()
        assert load_desktop_config(cfg_path).use_https is False
        r_http = httpx.get(f"http://127.0.0.1:{free_port}/api/health", timeout=5.0)
        assert r_http.status_code == 200
    finally:
        desktop.quit_app()
        desktop.app.processEvents()
        set_server_paused(False)
