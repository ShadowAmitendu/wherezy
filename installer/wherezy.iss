; Inno Setup script for Wherezy (per-user Windows installer, zero elevation required).
; Invoked via scripts/build_windows.ps1 or:
;   ISCC.exe /DMyAppVersion=2.3.8 /DMyAppNumericVersion=2.3.8.0 installer\wherezy.iss

#ifndef MyAppVersion
  #define MyAppVersion "2.3.8"
#endif

#ifndef MyAppNumericVersion
  #define MyAppNumericVersion "2.3.8.0"
#endif

#ifndef SourceDistDir
  #define SourceDistDir "..\dist\Wherezy"
#endif

#ifndef OutputInstallerDir
  #define OutputInstallerDir "..\dist\installer"
#endif

[Setup]
AppId={{8D6B2A1E-7B19-4C4D-9B3C-2F8A1E54D0C2}
AppName=Wherezy
AppVersion={#MyAppVersion}
AppVerName=Wherezy {#MyAppVersion}
AppPublisher=Wherezy
AppPublisherURL=https://shadowamitendu.github.io/wherezy/
AppSupportURL=https://github.com/ShadowAmitendu/wherezy/issues
AppUpdatesURL=https://github.com/ShadowAmitendu/wherezy/releases
DefaultDirName={localappdata}\Programs\Wherezy
DefaultGroupName=Wherezy
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputInstallerDir}
OutputBaseFilename=Wherezy-Setup-{#MyAppVersion}
SetupIconFile=..\packaging\wherezy.ico
UninstallDisplayIcon={app}\Wherezy.exe
UninstallDisplayName=Wherezy
LicenseFile=..\LICENSE
WizardStyle=modern
WizardImageFile=..\packaging\wizard_banner.bmp
WizardSmallImageFile=..\packaging\wizard_small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=yes
CloseApplicationsFilter=Wherezy.exe
RestartApplications=no
VersionInfoVersion={#MyAppNumericVersion}
VersionInfoProductName=Wherezy
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCompany=Wherezy
VersionInfoDescription=Wherezy Home Inventory Installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostart"; Description: "Start Wherezy when I sign in (minimized to system tray)"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
Source: "{#SourceDistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Wherezy"; Filename: "{app}\Wherezy.exe"; Comment: "Wherezy Home Inventory Server Controller"
Name: "{autodesktop}\Wherezy"; Filename: "{app}\Wherezy.exe"; Tasks: desktopicon; Comment: "Wherezy Home Inventory Server Controller"

[Registry]
; Clean up HKCU Run autostart key on uninstall even if Wherezy.exe was already removed
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Wherezy"; Flags: uninsdeletevalue dontcreatekey

[Run]
Filename: "{app}\Wherezy.exe"; Parameters: "--enable-autostart"; Tasks: autostart; Flags: runhidden waituntilterminated
Filename: "{app}\Wherezy.exe"; Description: "{cm:LaunchProgram,Wherezy}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Wherezy.exe"; Parameters: "--disable-autostart"; Flags: runhidden waituntilterminated; RunOnceId: "WherezyDisableAutostart"

[Code]
const
  APP_UNINSTALL_KEY = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8D6B2A1E-7B19-4C4D-9B3C-2F8A1E54D0C2}_is1';
  RUN_REG_KEY = 'Software\Microsoft\Windows\CurrentVersion\Run';

function IsWherezyProcessRunning(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec(
    ExpandConstant('{cmd}'),
    '/C tasklist /FI "IMAGENAME eq Wherezy.exe" /FO CSV /NH | find /I "Wherezy.exe" >nul',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    Result := (ResultCode = 0);
  end;
end;

procedure StopRunningWherezy(const AppExePath: String);
var
  ResultCode: Integer;
  I: Integer;
begin
  if FileExists(AppExePath) then
  begin
    Exec(AppExePath, '--quit', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  for I := 0 to 31 do
  begin
    if not IsWherezyProcessRunning() then
      Exit;
    Sleep(250);
  end;

  if IsWherezyProcessRunning() then
  begin
    Exec('taskkill.exe', '/F /IM Wherezy.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(500);
  end;
end;

function ResolveInstalledWherezyExe(): String;
var
  PrevDir: String;
  Candidate: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, APP_UNINSTALL_KEY, 'InstallLocation', PrevDir) then
  begin
    Candidate := AddBackslash(PrevDir) + 'Wherezy.exe';
    if FileExists(Candidate) then
    begin
      Result := Candidate;
      Exit;
    end;
  end;
  Candidate := ExpandConstant('{localappdata}\Programs\Wherezy\Wherezy.exe');
  if FileExists(Candidate) then
    Result := Candidate;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExistingExe: String;
begin
  Result := '';
  ExistingExe := ResolveInstalledWherezyExe();
  if (ExistingExe <> '') or IsWherezyProcessRunning() then
  begin
    StopRunningWherezy(ExistingExe);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  RunVal: String;
begin
  if CurStep = ssPostInstall then
  begin
    { Keep existing Start-with-Windows preference synced after upgrades even if task wasn't toggled }
    if (not WizardIsTaskSelected('autostart')) and
       RegQueryStringValue(HKCU, RUN_REG_KEY, 'Wherezy', RunVal) then
    begin
      Exec(ExpandConstant('{app}\Wherezy.exe'), '--enable-autostart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;

function InitializeUninstall(): Boolean;
var
  InstalledExe: String;
begin
  InstalledExe := ExpandConstant('{app}\Wherezy.exe');
  if FileExists(InstalledExe) or IsWherezyProcessRunning() then
  begin
    StopRunningWherezy(InstalledExe);
  end;
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataRoot: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RegDeleteValue(HKCU, RUN_REG_KEY, 'Wherezy');
    DataRoot := ExpandConstant('{localappdata}\Wherezy');
    if DirExists(DataRoot) then
    begin
      DeleteFile(AddBackslash(DataRoot) + 'desktop-instance.json');
      if not UninstallSilent then
      begin
        if MsgBox(
          'Do you also want to delete your personal Wherezy data, database, photos, settings, and logs at:' +
          Chr(13) + Chr(10) + Chr(13) + Chr(10) + DataRoot + Chr(13) + Chr(10) + Chr(13) + Chr(10) +
          'Choose No to keep your data safe for future upgrades or reinstalls.',
          mbConfirmation,
          MB_YESNO or MB_DEFBUTTON2
        ) = IDYES then
        begin
          DelTree(DataRoot, True, True, True);
        end;
      end;
    end;
  end;
end;
