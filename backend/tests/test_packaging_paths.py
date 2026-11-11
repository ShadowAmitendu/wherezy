"""Tests for frozen/wheel/source path resolution, logging setup, migrations, and CLI wiring."""

import logging
import sqlite3
import sys
from pathlib import Path

import pytest

from backend.app import cli
from backend.app.core import config, logging_setup, migrations
from backend.app.desktop import config_store


def test_default_data_dir_env_precedence(monkeypatch, tmp_path):
    primary = tmp_path / "primary"
    secondary = tmp_path / "secondary"

    monkeypatch.setenv("DATA_DIR", str(secondary))
    monkeypatch.setenv("WHEREZY_DATA_DIR", str(primary))
    assert config.resolve_default_data_dir() == primary.resolve()

    monkeypatch.delenv("WHEREZY_DATA_DIR")
    assert config.resolve_default_data_dir() == secondary.resolve()


def test_default_data_dir_frozen_uses_per_user_appdata_never_install_dir(monkeypatch, tmp_path):
    monkeypatch.delenv("WHEREZY_DATA_DIR", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)

    fake_exe = tmp_path / "Programs" / "Wherezy" / "Wherezy.exe"
    fake_exe.parent.mkdir(parents=True, exist_ok=True)
    # Even if an old ./data directory existed next to the executable, frozen mode must not default there
    (fake_exe.parent / "data").mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(config.sys, "frozen", True, raising=False)
    monkeypatch.setattr(config.sys, "executable", str(fake_exe))

    local_appdata = tmp_path / "LocalAppData"
    monkeypatch.setenv("LOCALAPPDATA", str(local_appdata))
    monkeypatch.setattr(config.sys, "platform", "win32")

    assert config.resolve_default_data_dir() == local_appdata / "Wherezy" / "data"
    assert config_store.get_default_desktop_data_dir("win32") == local_appdata / "Wherezy" / "data"
    assert config_store.get_app_support_dir("win32") == local_appdata / "Wherezy"

    # macOS uses ~/Library/Application Support/Wherezy/data
    fake_home = tmp_path / "MacHome"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    assert (
        config.get_user_data_base_dir("darwin") / "data"
        == fake_home / "Library" / "Application Support" / "Wherezy" / "data"
    )


def test_default_data_dir_wheel_install_uses_home_wherezy(monkeypatch, tmp_path):
    monkeypatch.delenv("WHEREZY_DATA_DIR", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.setattr(config.sys, "frozen", False, raising=False)
    monkeypatch.setattr(config, "resolve_repo_root", lambda app_pkg_dir=None: None)

    fake_home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    assert config.resolve_default_data_dir() == fake_home / ".wherezy" / "data"


def test_resource_path_and_frontend_dist_resolution(monkeypatch, tmp_path):
    meipass = tmp_path / "_MEI12345"
    frozen_dist = meipass / "frontend" / "dist"
    frozen_dist.mkdir(parents=True)
    (frozen_dist / "index.html").write_text("<html>frozen</html>", encoding="utf-8")

    monkeypatch.setattr(config.sys, "frozen", True, raising=False)
    monkeypatch.setattr(config.sys, "_MEIPASS", str(meipass), raising=False)

    resolved_bundle = config.resolve_bundle_dir()
    assert resolved_bundle == meipass.resolve()
    assert config.resource_path("frontend/dist/index.html") == (frozen_dist / "index.html").resolve()
    assert config.resolve_frontend_dist(resolved_bundle, tmp_path / "pkg") == frozen_dist.resolve()

    # Wheel/pipx fallback to static_dist inside package
    monkeypatch.setattr(config.sys, "frozen", False, raising=False)
    pkg_dir = tmp_path / "site_pkg" / "backend" / "app"
    static_dist = pkg_dir / "static_dist"
    static_dist.mkdir(parents=True)
    (static_dist / "index.html").write_text("<html>wheel</html>", encoding="utf-8")

    empty_bundle = tmp_path / "empty_bundle"
    empty_bundle.mkdir(parents=True)
    assert config.resolve_frontend_dist(empty_bundle, pkg_dir) == static_dist


def test_frozen_windowed_stdio_redirects_to_rotating_log(monkeypatch, tmp_path):
    logs_dir = tmp_path / "Logs Dir 用户"
    monkeypatch.setenv("WHEREZY_LOGS_DIR", str(logs_dir))
    monkeypatch.setattr(logging_setup.sys, "frozen", True, raising=False)
    monkeypatch.setattr(logging_setup.sys, "stdout", None)
    monkeypatch.setattr(logging_setup.sys, "stderr", None)

    orig_handlers_state = logging_setup._FILE_HANDLER
    try:
        log_file = logging_setup.configure_logging_and_stdio(["--minimized"])
        assert log_file == (logs_dir / "wherezy.log").resolve()
        assert sys.stdout is not None
        assert sys.stderr is not None
        print("Windowed print test message ✓")
        sys.stderr.write("Windowed stderr warning\n")
        sys.stdout.flush()
        sys.stderr.flush()
        for h in logging.getLogger("wherezy.stdio").handlers:
            h.flush()
        text = log_file.read_text(encoding="utf-8")
        assert "Windowed print test message" in text
        assert "Windowed stderr warning" in text
    finally:
        if logging_setup._FILE_HANDLER is not None:
            for name in ("wherezy", "wherezy.desktop", "wherezy.stdio", "uvicorn", "uvicorn.error", "uvicorn.access", "backend"):
                lg = logging.getLogger(name)
                if logging_setup._FILE_HANDLER in lg.handlers:
                    lg.removeHandler(logging_setup._FILE_HANDLER)
            logging_setup._FILE_HANDLER.close()
        logging_setup._FILE_HANDLER = orig_handlers_state


def test_migrations_create_pre_upgrade_backup_and_guard_downgrade(tmp_path):
    db_file = tmp_path / "inventory.db"
    conn = sqlite3.connect(str(db_file))
    try:
        conn.execute("PRAGMA user_version = 13")
        conn.execute("CREATE TABLE profiles (id INTEGER PRIMARY KEY, name TEXT)")
        conn.commit()
    finally:
        conn.close()

    # Run pending v14 migration -> must back up v13 DB before migrating
    try:
        migrations.run_migrations(db_file)
    except migrations.MigrationError:
        # Full schema wasn't created for 014 if profiles columns differ; verify backup was created first!
        pass

    backups_dir = tmp_path / "backups"
    backups = list(backups_dir.glob("pre-upgrade-v13-to-v*.zip"))
    assert len(backups) == 1

    # Newer DB version than supported by app must fail safely without corrupting DB
    newer_db = tmp_path / "newer.db"
    conn2 = sqlite3.connect(str(newer_db))
    try:
        conn2.execute("PRAGMA user_version = 999")
        conn2.commit()
    finally:
        conn2.close()

    with pytest.raises(migrations.MigrationError, match="newer than supported"):
        migrations.run_migrations(newer_db)


def test_cli_parser_and_env_wiring(monkeypatch, tmp_path):
    data_target = tmp_path / "custom-data"
    parser = cli.build_parser(default_reload=False)
    args = parser.parse_args(
        ["--host", "127.0.0.1", "--port", "9090", "--data-dir", str(data_target), "--no-reload"]
    )
    assert args.host == "127.0.0.1"
    assert args.port == 9090
    assert args.reload is False

    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.delenv("WHEREZY_DATA_DIR", raising=False)
    monkeypatch.delenv("HOST", raising=False)
    monkeypatch.delenv("WHEREZY_HOST", raising=False)
    monkeypatch.delenv("PORT", raising=False)
    monkeypatch.delenv("WHEREZY_PORT", raising=False)

    cli.apply_cli_env(args)
    assert Path(config.os.environ["DATA_DIR"]) == data_target.resolve()
    assert Path(config.os.environ["WHEREZY_DATA_DIR"]) == data_target.resolve()
    assert config.os.environ["WHEREZY_HOST"] == "127.0.0.1"
    assert config.os.environ["WHEREZY_PORT"] == "9090"
