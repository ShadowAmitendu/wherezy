<#
.SYNOPSIS
    Build the bundled Wherezy desktop directory and Windows installer (Wherezy-Setup-<version>.exe).
#>
[CmdletBinding()]
param(
    [switch]$SkipFrontend,
    [switch]$SkipInstaller,
    [switch]$Clean,
    [switch]$InstallPyInstaller,
    [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

function Resolve-Python {
    param([string]$Preferred)
    if ($Preferred) { return $Preferred }
    $venvPy = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (Test-Path $venvPy) { return $venvPy }
    return "python"
}

function Find-Iscc {
    $cmd = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $paths = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe")
    )
    foreach ($candidate in $paths) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    return $null
}

function Find-SignTool {
    $cmd = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    if (Test-Path $kitsRoot) {
        $found = Get-ChildItem -Path $kitsRoot -Filter "signtool.exe" -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Invoke-CodeSign {
    param([string]$TargetPath)
    $pfxPath = $env:WINDOWS_SIGNING_CERT_PATH
    $pfxB64 = $env:WINDOWS_SIGNING_CERT_BASE64
    $pfxPass = $env:WINDOWS_SIGNING_CERT_PASSWORD
    $timestampUrl = if ($env:WINDOWS_SIGNING_TIMESTAMP_URL) { $env:WINDOWS_SIGNING_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }

    if (-not $pfxPath -and -not $pfxB64) {
        return
    }

    $signTool = Find-SignTool
    if (-not $signTool) {
        Write-Warning "Signing certificate configured, but signtool.exe was not found. Skipping signing for $TargetPath."
        return
    }

    $tempCert = $null
    if (-not $pfxPath -and $pfxB64) {
        $tempCert = Join-Path ([System.IO.Path]::GetTempPath()) ("wherezy-sign-" + [guid]::NewGuid().ToString("N") + ".pfx")
        [System.IO.File]::WriteAllBytes($tempCert, [Convert]::FromBase64String($pfxB64))
        $pfxPath = $tempCert
    }

    try {
        Write-Host "[sign] Signing $TargetPath ..."
        $args = @("sign", "/fd", "SHA256", "/tr", $timestampUrl, "/td", "SHA256", "/f", $pfxPath)
        if ($pfxPass) {
            $args += @("/p", $pfxPass)
        }
        $args += $TargetPath
        & $signTool @args
        if ($LASTEXITCODE -ne 0) {
            throw "signtool.exe failed for $TargetPath with exit code $LASTEXITCODE"
        }
    } finally {
        if ($tempCert -and (Test-Path $tempCert)) {
            Remove-Item $tempCert -Force -ErrorAction SilentlyContinue
        }
    }
}

$Python = Resolve-Python -Preferred $PythonExe
Write-Host "[build] Using Python: $Python"

$VersionScript = Join-Path $RepoRoot "packaging\version_info.py"
$AppVersion = (& $Python $VersionScript --version).Trim()
if ($LASTEXITCODE -ne 0 -or -not $AppVersion) {
    throw "Failed to read APP_VERSION from backend/app/core/version.py"
}
$NumericVersion = (& $Python $VersionScript --numeric-version).Trim()
Write-Host "[build] Target version: $AppVersion ($NumericVersion)"

if ($Clean) {
    foreach ($dir in @("build\pyinstaller", "dist\Wherezy", "dist\installer")) {
        if (Test-Path $dir) {
            Write-Host "[build] Cleaning $dir ..."
            Remove-Item $dir -Recurse -Force
        }
    }
}

$buildArgs = @("scripts\build_binary.py")
if ($SkipFrontend) { $buildArgs += "--skip-frontend" }
if ($Clean) { $buildArgs += "--clean" }
if ($InstallPyInstaller) { $buildArgs += "--install-pyinstaller" }

& $Python @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller bundle build failed with exit code $LASTEXITCODE"
}

$BundledExe = Join-Path $RepoRoot "dist\Wherezy\Wherezy.exe"
if (-not (Test-Path $BundledExe)) {
    throw "Expected PyInstaller output not found at $BundledExe"
}

Invoke-CodeSign -TargetPath $BundledExe

if ($SkipInstaller) {
    Write-Host "[build] Skipping Inno Setup installer build (-SkipInstaller set)."
    exit 0
}

& $Python (Join-Path $RepoRoot "packaging\wizard_art.py")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate wizard branding BMPs"
}

$Iscc = Find-Iscc
if (-not $Iscc) {
    throw "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 (e.g. 'winget install JRSoftware.InnoSetup') or pass -SkipInstaller."
}

$InstallerOutDir = Join-Path $RepoRoot "dist\installer"
New-Item -ItemType Directory -Path $InstallerOutDir -Force | Out-Null

Write-Host "[build] Compiling installer with $Iscc ..."
& $Iscc `
    "/DMyAppVersion=$AppVersion" `
    "/DMyAppNumericVersion=$NumericVersion" `
    "/DSourceDistDir=$(Join-Path $RepoRoot 'dist\Wherezy')" `
    "/DOutputInstallerDir=$InstallerOutDir" `
    (Join-Path $RepoRoot "installer\wherezy.iss")
if ($LASTEXITCODE -ne 0) {
    throw "ISCC.exe failed with exit code $LASTEXITCODE"
}

$SetupExe = Join-Path $InstallerOutDir "Wherezy-Setup-$AppVersion.exe"
if (-not (Test-Path $SetupExe)) {
    throw "Expected installer output not found at $SetupExe"
}

Invoke-CodeSign -TargetPath $SetupExe
Write-Host "[build] Installer ready: $SetupExe"
