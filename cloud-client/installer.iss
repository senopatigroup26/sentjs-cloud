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
  EmailPage: TInputQueryWizardPage;
  PasswordPage: TInputQueryWizardPage;
  ResultPage: TOutputMsgWizardPage;
  RegisterSuccess: Boolean;
  DeviceId: String;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure InitializeWizard;
begin
  // Create email input page
  EmailPage := CreateInputQueryPage(wpLicense,
    'Account Login', 'Please enter your Sentja Cloud credentials',
    'Enter your email and password to register this device.');
  EmailPage.Add('Email:', False);
  EmailPage.Add('Password:', True);
  
  // Set default values
  EmailPage.Values[0] := 'owner@sge.com';
  
  // Create result page
  ResultPage := CreateOutputMsgPage(EmailPage.ID,
    'Device Registration', 'Registering your device...',
    'Please wait while your device is being registered with Sentja Cloud.');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Email, Password: String;
  ResultCode: Integer;
  PowerShellCmd: String;
  TempFile: String;
  Lines: TArrayOfString;
  I: Integer;
begin
  Result := True;
  
  if CurPageID = EmailPage.ID then
  begin
    Email := EmailPage.Values[0];
    Password := EmailPage.Values[1];
    
    if (Email = '') or (Password = '') then
    begin
      MsgBox('Please enter both email and password.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    
    // Show progress
    ResultPage.SetText('Registering device with email: ' + Email, 
                      'Please wait...');
    WizardForm.NextButton.Enabled := False;
    
    // Register device using PowerShell
    TempFile := ExpandConstant('{tmp}\register.ps1');
    SaveStringToFile(TempFile, 
      '$email = ''' + Email + ''';' + #13#10 +
      '$password = ''' + Password + ''';' + #13#10 +
      '$apiUrl = ''https://api-cloud.sentjagroup.tech/api'';' + #13#10 +
      'try {' + #13#10 +
      '  $body = @{ email = $email; password = $password } | ConvertTo-Json;' + #13#10 +
      '  $response = Invoke-RestMethod -Uri "$apiUrl/auth/login" -Method POST -Body $body -ContentType "application/json";' + #13#10 +
      '  if ($response.success) {' + #13#10 +
      '    Write-Output "SUCCESS|$($response.data.user.id)";' + #13#10 +
      '  } else {' + #13#10 +
      '    Write-Output "ERROR|Login failed: $($response.error.message)";' + #13#10 +
      '  }' + #13#10 +
      '} catch {' + #13#10 +
      '  Write-Output "ERROR|$($_.Exception.Message)";' + #13#10 +
      '}', False);
    
    // Execute PowerShell
    PowerShellCmd := 'powershell.exe -ExecutionPolicy Bypass -File "' + TempFile + '"';
    
    if Exec('cmd.exe', '/C ' + PowerShellCmd + ' > "' + TempFile + '.out"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if LoadStringsFromFile(TempFile + '.out', Lines) then
      begin
        for I := 0 to GetArrayLength(Lines) - 1 do
        begin
          if Pos('SUCCESS|', Lines[I]) = 1 then
          begin
            DeviceId := Copy(Lines[I], 9, Length(Lines[I]));
            RegisterSuccess := True;
            ResultPage.SetText('Device registered successfully!', 
                              'Device ID: ' + DeviceId + #13#10#13#10 +
                              'Click Next to continue installation.');
            Result := True;
            Exit;
          end
          else if Pos('ERROR|', Lines[I]) = 1 then
          begin
            MsgBox('Registration failed: ' + Copy(Lines[I], 7, Length(Lines[I])), mbError, MB_OK);
            Result := False;
            WizardForm.NextButton.Enabled := True;
            Exit;
          end;
        end;
      end;
    end;
    
    // If we get here, something went wrong
    MsgBox('Failed to connect to server. Please check your internet connection.', mbError, MB_OK);
    Result := False;
    WizardForm.NextButton.Enabled := True;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpFinished then
  begin
    WizardForm.FinishedLabel.Caption := 
      'Sentja Cloud has been installed successfully.' + #13#10#13#10 +
      'Device registered and ready to use!' + #13#10 +
      'Click Finish to launch the application.';
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
