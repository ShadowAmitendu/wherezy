"""Tests for frozen/wheel/source path resolution and CLI option wiring."""

from pathlib import Path
from backend.app import cli
from backend.app.core import config


def test_default_data_dir_env_precedence(monkeypatch, tmp_path):
    primary = tmp_path / "primary"
    secondary = tmp_path / "secondary"

    monkeypatch.setenv("DATA_DIR", str(secondary))
    monkeypatch.setenv("WHEREZY_DATA_DIR", str(primary))
    assert config.resolve_default_data_dir() == primary.resolve()

    monkeypatch.delenv("WHEREZY_DATA_DIR")
    assert config.resolve_default_data_dir() == secondary.resolve()


def test_default_data_dir_frozen_uses_executable_parent(monkeypatch, tmp_path):
    monkeypatch.delenv("WHEREZY_DATA_DIR", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)

    fake_exe = tmp_path / "portable" / "wherezy.exe"
    fake_exe.parent.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(config.sys, "frozen", True, raising=False)
    monkeypatch.setattr(config.sys, "executable", str(fake_exe))

    assert config.resolve_default_data_dir() == fake_exe.parent.resolve() / "data"


def test_default_data_dir_wheel_install_uses_home_wherezy(monkeypatch, tmp_path):
    monkeypatch.delenv("WHEREZY_DATA_DIR", raising=False)
    monkeypatch.delenv("DATA_DIR", raising=False)
    monkeypatch.setattr(config.sys, "frozen", False, raising=False)
    monkeypatch.setattr(config, "resolve_repo_root", lambda app_pkg_dir=None: None)

    fake_home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))

    assert config.resolve_default_data_dir() == fake_home / ".wherezy" / "data"


def test_bundle_and_frontend_dist_resolution_in_frozen_and_wheel_modes(monkeypatch, tmp_path):
    meipass = tmp_path / "_MEI12345"
    frozen_dist = meipass / "frontend" / "dist"
    frozen_dist.mkdir(parents=True)
    (frozen_dist / "index.html").write_text("<html>frozen</html>", encoding="utf-8")

    monkeypatch.setattr(config.sys, "frozen", True, raising=False)
    monkeypatch.setattr(config.sys, "_MEIPASS", str(meipass), raising=False)

    resolved_bundle = config.resolve_bundle_dir()
    assert resolved_bundle == meipass.resolve()
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
