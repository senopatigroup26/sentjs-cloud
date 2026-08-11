; Sentja Cloud - Inno Setup Script
; Proper installer with UI, device registration, and clean uninstall

#define MyAppName "Sentja Cloud"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Sentja Group"
#define MyAppURL "https://cloud.sentjagroup.tech"
#define MyAppExeName "SentjaTray.exe"
#define MyAppAssocName MyAppName + " File"
#define MyAppAssocExt ".sentja"
#define MyAppAssocKey StringChange(MyAppAssocName, " ", "") + MyAppAssocExt

[Setup]
AppId={{8A7D8B9C-3E4F-5A6B-7C8D-9E0F1A2B3C4D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=.\InnoSetup-Output
OutputBaseFilename=SentjaCloudSetup-{#MyAppVersion}
SetupIconFile=.\SentjaTray\Resources\logo.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
DisableDirPage=no
DisableReadyPage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Run at Windows startup"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: ".\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: ".\SentjaTray\Resources\logo.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SentjaCloud"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{autopf}\{#MyAppName}"
Type: filesandordirs; Name: "{group}\{#MyAppName}"
Type: files; Name: "{autodesktop}\{#MyAppName}.lnk"
Type: files; Name: "{autostartup}\{#MyAppName}.lnk"

[Code]
var
  DeviceNamePage: TInputQueryWizardPage;
  ResultPage: TOutputMsgWizardPage;
  RegisterSuccess: Boolean;
  DeviceId: String;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
var
  ComputerName: String;
begin
  // Get computer name as default device name
  ComputerName := GetComputerNameString;
  
  // Create device name input page
  DeviceNamePage := CreateInputQueryPage(wpLicense,
    'Device Registration', 'Register this device with Sentja Cloud',
    'Enter a name for this device. This name will help you identify this computer in the admin panel.');
  DeviceNamePage.Add('Device Name:', False);
  
  // Set computer name as default
  DeviceNamePage.Values[0] := ComputerName;
  
  // Create result page
  ResultPage := CreateOutputMsgPage(DeviceNamePage.ID,
    'Device Registration', 'Registering your device...',
    'Please wait while your device is being registered with Sentja Cloud.');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  DeviceName: String;
  ResultCode: Integer;
  PowerShellCmd: String;
  TempFile: String;
  Lines: TArrayOfString;
  I: Integer;
  HardwareId: String;
begin
  Result := True;
  
  if CurPageID = DeviceNamePage.ID then
  begin
    DeviceName := Trim(DeviceNamePage.Values[0]);
    
    if DeviceName = '' then
    begin
      MsgBox('Please enter a device name.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    
    // Show progress
    ResultPage.SetText('Registering device: ' + DeviceName, 
                      'Collecting hardware information and registering with server...');
    WizardForm.NextButton.Enabled := False;
    
    // Generate hardware ID
    HardwareId := GetMD5OfString(GetComputerNameString + '-' + GetUserNameString);
    
    // Register device using PowerShell
    TempFile := ExpandConstant('{tmp}\register.ps1');
    SaveStringToFile(TempFile, 
      '$deviceName = ''' + DeviceName + ''';' + #13#10 +
      '$hardwareId = ''' + HardwareId + ''';' + #13#10 +
      '$apiUrl = ''https://api-cloud.sentjagroup.tech/api'';' + #13#10 +
      'try {' + #13#10 +
      '  $body = @{ ' + #13#10 +
      '    device_name = $deviceName; ' + #13#10 +
      '    hardware_id = $hardwareId; ' + #13#10 +
      '    os_type = ''Windows''; ' + #13#10 +
      '    os_version = [System.Environment]::OSVersion.VersionString ' + #13#10 +
      '  } | ConvertTo-Json;' + #13#10 +
      '  $response = Invoke-RestMethod -Uri "$apiUrl/devices/register" -Method POST -Body $body -ContentType "application/json";' + #13#10 +
      '  if ($response.success) {' + #13#10 +
      '    $deviceId = $response.data.device_id;' + #13#10 +
      '    $token = $response.data.token;' + #13#10 +
      '    # Save to config' + #13#10 +
      '    $configDir = "$env:ProgramData\Sentja";' + #13#10 +
      '    if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null; }' + #13#10 +
      '    $config = @{' + #13#10 +
      '      DeviceId = $deviceId;' + #13#10 +
      '      DeviceName = $deviceName;' + #13#10 +
      '      Token = $token;' + #13#10 +
      '      HardwareId = $hardwareId' + #13#10 +
      '    };' + #13#10 +
      '    $config | ConvertTo-Json | Out-File "$configDir\device.json" -Encoding UTF8;' + #13#10 +
      '    Write-Output "SUCCESS|$deviceId";' + #13#10 +
      '  } else {' + #13#10 +
      '    Write-Output "ERROR|Registration failed: $($response.error.message)";' + #13#10 +
      '  }' + #13#10 +
      '} catch {' + #13#10 +
      '  Write-Output "ERROR|$($_.Exception.Message)";' + #13#10 +
      '}', False);
    
    // Execute PowerShell
    PowerShellCmd := 'powershell.exe -ExecutionPolicy Bypass -File "' + TempFile + '"';
    
    if Exec('cmd.exe', '/C ' + PowerShellCmd + ' > "' + TempFile + '.out"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      Sleep(1000); // Wait for file to be written
      
      if LoadStringsFromFile(TempFile + '.out', Lines) then
      begin
        for I := 0 to GetArrayLength(Lines) - 1 do
        begin
          if Pos('SUCCESS|', Lines[I]) = 1 then
          begin
            DeviceId := Copy(Lines[I], 9, Length(Lines[I]));
            RegisterSuccess := True;
            ResultPage.SetText('Device registered successfully!', 
                              'Device Name: ' + DeviceName + #13#10 +
                              'Device ID: ' + DeviceId + #13#10#13#10 +
                              'Your device is now registered and ready to sync files.' + #13#10 +
                              'Click Next to continue installation.');
            Result := True;
            WizardForm.NextButton.Enabled := True;
            Exit;
          end
          else if Pos('ERROR|', Lines[I]) = 1 then
          begin
            MsgBox('Registration failed: ' + Copy(Lines[I], 7, Length(Lines[I])) + #13#10#13#10 +
                   'You can register the device manually after installation.', mbError, MB_OK);
            // Allow to continue even if registration failed
            Result := True;
            WizardForm.NextButton.Enabled := True;
            Exit;
          end;
        end;
      end;
    end;
    
    // If we get here, something went wrong but allow to continue
    MsgBox('Failed to register device automatically. ' + #13#10 +
           'Please check your internet connection.' + #13#10#13#10 +
           'You can register the device manually after installation.', mbInformation, MB_OK);
    Result := True;
    WizardForm.NextButton.Enabled := True;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    if RegisterSuccess then
    begin
      WizardForm.FinishedLabel.Caption := 
        'Sentja Cloud has been installed successfully.' + #13#10#13#10 +
        'Device registered and ready to sync files!' + #13#10 +
        'Click Finish to launch the application.';
    end else
    begin
      WizardForm.FinishedLabel.Caption := 
        'Sentja Cloud has been installed successfully.' + #13#10#13#10 +
        'Please register your device in the application.' + #13#10 +
        'Click Finish to launch the application.';
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  AppDataPath, ProgramDataPath: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    // Stop running processes
    Exec('taskkill.exe', '/F /IM SentjaTray.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec('taskkill.exe', '/F /IM SentjaCloudService.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(1000);
    
    // Ask about user data
    if MsgBox('Do you want to remove all application data (including sync settings)?', 
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      AppDataPath := ExpandConstant('{userappdata}\Sentja');
      ProgramDataPath := ExpandConstant('{commonappdata}\Sentja');
      
      if DirExists(AppDataPath) then
        DelTree(AppDataPath, True, True, True);
        
      if DirExists(ProgramDataPath) then
        DelTree(ProgramDataPath, True, True, True);
    end;
    
    // Remove desktop shortcuts manually
    DeleteFile(ExpandConstant('{autodesktop}\{#MyAppName}.lnk'));
    DeleteFile(ExpandConstant('{autostartup}\{#MyAppName}.lnk'));
  end;
end;
