#!/usr/bin/env bash
set -euo pipefail

# Build Wherezy.app and Wherezy-<version>-macOS.dmg cleanly on macOS.
# Optional environment variables for Developer ID signing & notarization:
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Your Name (TEAMID)"
#   APPLE_NOTARY_KEYCHAIN_PROFILE  keychain profile stored via `xcrun notarytool store-credentials`
#   APPLE_API_KEY_PATH / APPLE_API_KEY_ID / APPLE_API_ISSUER  (alternative API-key notarization)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
APP_VERSION="$("${PYTHON_BIN}" packaging/version_info.py --version)"

SKIP_FRONTEND="${SKIP_FRONTEND:-0}"
CLEAN="${CLEAN:-0}"

BUILD_ARGS=("scripts/build_binary.py")
if [[ "${SKIP_FRONTEND}" == "1" ]]; then
  BUILD_ARGS+=("--skip-frontend")
fi
if [[ "${CLEAN}" == "1" ]]; then
  BUILD_ARGS+=("--clean")
  rm -rf "dist/Wherezy" "dist/Wherezy.app" "dist/installer"
fi

echo "[macos] Building Wherezy.app (${APP_VERSION})..."
"${PYTHON_BIN}" "${BUILD_ARGS[@]}"

APP_BUNDLE="dist/Wherezy.app"
if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "Expected app bundle not found at ${APP_BUNDLE}" >&2
  exit 1
fi

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "[macos] Signing ${APP_BUNDLE} with identity '${APPLE_SIGNING_IDENTITY}'..."
  codesign --deep --force --verify --verbose --options runtime \
    --sign "${APPLE_SIGNING_IDENTITY}" "${APP_BUNDLE}"
else
  echo "[macos] APPLE_SIGNING_IDENTITY not set; skipping Developer ID codesign."
fi

mkdir -p dist/installer
DMG_PATH="dist/installer/Wherezy-${APP_VERSION}-macOS.dmg"
rm -f "${DMG_PATH}"

if command -v create-dmg >/dev/null 2>&1; then
  echo "[macos] Creating DMG via create-dmg..."
  create-dmg \
    --volname "Wherezy ${APP_VERSION}" \
    --volicon "packaging/wherezy.icns" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "Wherezy.app" 175 190 \
    --hide-extension "Wherezy.app" \
    --app-drop-link 425 190 \
    "${DMG_PATH}" \
    "${APP_BUNDLE}"
else
  echo "[macos] create-dmg not found; falling back to hdiutil..."
  DMG_STAGE="$(mktemp -d /tmp/wherezy-dmg.XXXXXX)"
  cp -R "${APP_BUNDLE}" "${DMG_STAGE}/Wherezy.app"
  ln -s /Applications "${DMG_STAGE}/Applications"
  hdiutil create -volname "Wherezy ${APP_VERSION}" -srcfolder "${DMG_STAGE}" -ov -format UDZO "${DMG_PATH}"
  rm -rf "${DMG_STAGE}"
fi

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "[macos] Signing ${DMG_PATH}..."
  codesign --force --verify --verbose --sign "${APPLE_SIGNING_IDENTITY}" "${DMG_PATH}"

  if [[ -n "${APPLE_NOTARY_KEYCHAIN_PROFILE:-}" ]]; then
    echo "[macos] Notarizing ${DMG_PATH} via keychain profile..."
    xcrun notarytool submit "${DMG_PATH}" --keychain-profile "${APPLE_NOTARY_KEYCHAIN_PROFILE}" --wait
    xcrun stapler staple "${DMG_PATH}"
  elif [[ -n "${APPLE_API_KEY_PATH:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
    echo "[macos] Notarizing ${DMG_PATH} via App Store Connect API key..."
    xcrun notarytool submit "${DMG_PATH}" --key "${APPLE_API_KEY_PATH}" --key-id "${APPLE_API_KEY_ID}" --issuer "${APPLE_API_ISSUER}" --wait
    xcrun stapler staple "${DMG_PATH}"
  else
    echo "[macos] Notarization credentials not configured; skipping xcrun notarytool."
  fi
else
  echo "[macos] Unsigned DMG produced (macOS Gatekeeper may warn on downloaded unsigned bundles)."
fi

echo "[macos] Ready: ${DMG_PATH}"
