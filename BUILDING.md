# Building & Releasing Wherezy Desktop

Wherezy packages its FastAPI/Uvicorn backend, built React UI (`frontend/dist`), SQLite migrations, starter templates, icons, and TTK Bootstrap + Tray desktop controller into native desktop bundles using PyInstaller `--onedir` mode (`wherezy.spec` + `desktop_main.py`).

All versions are driven from a single Python source of truth in `backend/app/core/version.py` (`APP_VERSION`), also reflected in `pyproject.toml`.

---

## Prerequisites

### Windows (Primary Target)
- **Python 3.12+** (matches `backend/requirements.txt`, >= 3.11 required in `pyproject.toml`)
- **Node.js 22 LTS** & `npm` (for building `frontend/dist`)
- **PyInstaller 6.x** (`pip install pyinstaller`)
- **Inno Setup 6** (`ISCC.exe`) for building `Wherezy-Setup-<version>.exe`:
  ```powershell
  winget install --id JRSoftware.InnoSetup --scope user
  ```
- *(Optional, for signed releases)* Windows SDK `signtool.exe` and a PFX Authenticode certificate.

### macOS (Secondary Target)
- **Python 3.12+**, **Node.js 22 LTS**, **PyInstaller 6.x**
- **macOS Xcode Command Line Tools** (`hdiutil`, `codesign`, `xcrun`)
- *(Optional)* `create-dmg` (`brew install create-dmg`) for styled `.dmg` drag-to-Applications images (the build script falls back to `hdiutil` cleanly if absent).

---

## Local Builds

### Windows (`Wherezy-Setup-<version>.exe`)
From the repository root in PowerShell:

```powershell
# Install Python runtime + PyInstaller dependencies into .venv (example)
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt pyinstaller

# Full clean build: frontend -> PyInstaller --onedir -> Inno Setup installer
powershell -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1 -Clean
```

Outputs:
- Unpacked `--onedir` app bundle: `dist\Wherezy\Wherezy.exe`
- Per-user Windows installer (no UAC elevation required): `dist\installer\Wherezy-Setup-<version>.exe`

Useful flags:
- `-SkipFrontend` — reuse existing `frontend\dist`
- `-SkipInstaller` — stop after PyInstaller `--onedir` build (`dist\Wherezy\`)
- `-InstallPyInstaller` — install `pyinstaller` into the active Python environment if missing

### macOS (`Wherezy.app` & `.dmg`)
```bash
CLEAN=1 bash scripts/build_macos.sh
```

Outputs:
- App bundle: `dist/Wherezy.app` (`CFBundleIdentifier = com.wherezy.desktop`, `LSUIElement = true` for menu-bar behavior)
- Disk image: `dist/installer/Wherezy-<version>-macOS.dmg`

---

## Code Signing, SmartScreen & Notarization

### Windows Authenticode Signing
Unsigned executables and installers trigger **Windows SmartScreen** ("Windows protected your PC") warnings on first download/run.

To sign both `dist\Wherezy\Wherezy.exe` and `dist\installer\Wherezy-Setup-<version>.exe` automatically in local builds or GitHub Actions, set either:
- `WINDOWS_SIGNING_CERT_PATH` (local `.pfx` file path) **or** `WINDOWS_SIGNING_CERT_BASE64` (base64 `.pfx` secret in CI)
- `WINDOWS_SIGNING_CERT_PASSWORD`
- *(Optional)* `WINDOWS_SIGNING_TIMESTAMP_URL` (defaults to `http://timestamp.digicert.com`)

If no signing certificate is provided, `build_windows.ps1` skips signing cleanly and produces an unsigned installer.

### macOS Developer ID Signing & Notarization
Unsigned `.app` / `.dmg` bundles trigger macOS Gatekeeper warnings unless signed with a Developer ID Application certificate and notarized.

Configure these optional environment variables / GitHub Actions secrets before running `scripts/build_macos.sh`:
- `APPLE_SIGNING_IDENTITY` (e.g., `Developer ID Application: Example Corp (TEAMID)`)
- Either `APPLE_NOTARY_KEYCHAIN_PROFILE` **or** (`APPLE_API_KEY_PATH`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`)

If `APPLE_SIGNING_IDENTITY` is unset, `scripts/build_macos.sh` skips `codesign` and `xcrun notarytool` gracefully.

---

## Automated Releases (GitHub Actions)

`.github/workflows/build-binaries.yml` runs on manual dispatch (`workflow_dispatch`) and on tag pushes (`v*`):
1. **`build-windows`**: installs Inno Setup 6, builds frontend + `--onedir` bundle + `Wherezy-Setup-<version>.exe`, smoke-tests the frozen binary from a path containing spaces & non-ASCII characters, and uploads `wherezy-windows-installer`.
2. **`build-macos`**: builds `Wherezy.app` + `.dmg`, smoke-tests the `.app` binary, and uploads `wherezy-macos-dmg`.
3. **`build-linux`** & **`build-package`**: builds Linux `--onedir` tarball and Python wheel/sdist.
4. **`release`** (on `refs/tags/v*`): generates `SHA256SUMS.txt` and creates a GitHub Release attaching all artifacts.

### Cutting a Release
1. Update `APP_VERSION` in `backend/app/core/version.py` and `version` in `pyproject.toml` (and `frontend/package.json` if desired).
2. Run tests locally (`.\.venv\Scripts\python.exe -m pytest backend/tests` and `npm.cmd --prefix frontend run test`).
3. Commit changes, tag `v<version>`, and push the tag:
   ```powershell
   git tag v2.3.0
   git push origin main v2.3.0
   ```
4. Wait for `.github/workflows/build-binaries.yml` to finish and verify the attached installer assets on the GitHub Release page.

---

## Clean Windows 10/11 VM Test Checklist

Run these checks on a clean Windows 10/11 VM without Python, Node.js, or Git installed:

1. **Per-user install (no admin):**
   - Double-click `Wherezy-Setup-<version>.exe`.
   - Accept the MIT License page; verify default install path is `%LOCALAPPDATA%\Programs\Wherezy` with **no UAC admin prompt**.
   - Check Desktop shortcut and "Start Wherezy when I sign in", finish with "Launch Wherezy" checked.
   - Verify no console window flashes during setup or app launch.
2. **First run & persistence locations:**
   - Verify the Controller window opens, server transitions to `Running`, and the first-run Network & Firewall notice appears (`127.0.0.1` local HTTP default, plus `LAN + HTTPS` or `LAN Only (HTTP)` options).
   - Click **Open Web UI** and confirm the React app loads at `http://127.0.0.1:8000` and lets you add a sample item.
   - Toggle **Enable HTTPS (TLS)** in Settings (or pass `--https`) and confirm the URL updates to `https://...`, a local certificate is written to `%LOCALAPPDATA%\Wherezy\certs\`, and the page loads cleanly over HTTPS after accepting the self-signed certificate prompt.
   - Verify data/config/logs were written to `%LOCALAPPDATA%\Wherezy\` (`desktop.json`, `data\inventory.db`, `logs\wherezy.log`, `certs\`) and **not** inside `%LOCALAPPDATA%\Programs\Wherezy\`.
3. **Single instance & port-in-use handling:**
   - Launch Wherezy again from Start Menu/Desktop -> existing window focuses without starting a second copy.
   - Minimize/close to tray, bind another process to port `8000` (e.g., temporary listener), restart server -> verify friendly port-in-use message and **Pick a Free Port & Start** button recovers cleanly.
4. **Autostart:**
   - Sign out and sign back into Windows -> confirm Wherezy launches automatically minimized in the system tray and serves requests.
   - Toggle **Start with OS** off in the Controller UI and back on -> confirm `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` value `"Wherezy"` matches `"<install>\Wherezy.exe" --gui --minimized`.
5. **Upgrade over running older version:**
   - Keep Wherezy open in the tray, then run a newer `Wherezy-Setup-<next>.exe` (or re-run installer).
   - Confirm installer stops the running Wherezy instance gracefully via `--quit`, replaces files cleanly without duplicate Start Menu/Desktop shortcuts or duplicate Run registry entries, and preserves your existing items, photos, and settings in `%LOCALAPPDATA%\Wherezy\`.
6. **Uninstall (Keep Data vs Delete Data):**
   - Run uninstall while Wherezy is open in the tray -> verify it stops Wherezy cleanly before removing files.
   - Choose **No** on the "delete personal data" prompt -> verify `%LOCALAPPDATA%\Programs\Wherezy\`, Start Menu/Desktop shortcuts, and HKCU Run entry are gone while `%LOCALAPPDATA%\Wherezy\data\` remains intact.
   - Reinstall, then uninstall again and choose **Yes** -> verify `%LOCALAPPDATA%\Wherezy\` is removed cleanly and no `Wherezy.exe` process remains in Task Manager.
