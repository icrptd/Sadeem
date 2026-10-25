; Inno Setup script for Sadeem
#define AppName "Sadeem"
#define AppVer "1.0.0"
[Setup]
AppId={{6E1B2F6A-5D3C-4B7A-9A11-5ADEE0000001}
AppName={#AppName}
AppVersion={#AppVer}
AppPublisher=Rami Almalki
DefaultDirName={autopf}\Sadeem
DefaultGroupName=Sadeem
OutputBaseFilename=Sadeem-Setup-{#AppVer}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\Sadeem.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"
Name: "ctxmenu"; Description: "إضافة «فتح بواسطة سديم» إلى قائمة الزر الأيمن / Add 'Open with Sadeem' to the context menu"
[Files]
Source: "dist\Sadeem\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{group}\Sadeem"; Filename: "{app}\Sadeem.exe"
Name: "{autodesktop}\Sadeem"; Filename: "{app}\Sadeem.exe"; Tasks: desktopicon
[Registry]
Root: HKCU; Subkey: "Software\Classes\Applications\Sadeem.exe\shell\open\command"; ValueType: string; ValueData: """{app}\Sadeem.exe"" ""%1"""; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Sadeem.exe\DefaultIcon"; ValueType: string; ValueData: "{app}\_internal\ui\doc.ico"
Root: HKCU; Subkey: "Software\Classes\Applications\Sadeem.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "Sadeem"
Root: HKA; Subkey: "Software\Classes\Sadeem.TextFile"; ValueType: string; ValueData: "ملف نصي — سديم"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Sadeem.TextFile\DefaultIcon"; ValueType: string; ValueData: "{app}\_internal\ui\doc.ico"
Root: HKA; Subkey: "Software\Classes\Sadeem.TextFile\shell\open\command"; ValueType: string; ValueData: """{app}\Sadeem.exe"" ""%1"""
Root: HKA; Subkey: "Software\Classes\.txt\OpenWithProgids"; ValueType: none; ValueName: "Sadeem.TextFile"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: none; ValueName: "Sadeem.TextFile"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\.log\OpenWithProgids"; ValueType: none; ValueName: "Sadeem.TextFile"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\*\shell\Sadeem"; ValueType: string; ValueData: "فتح بواسطة سديم"; Flags: uninsdeletekey; Tasks: ctxmenu
Root: HKA; Subkey: "Software\Classes\*\shell\Sadeem"; ValueType: string; ValueName: "Icon"; ValueData: "{app}\Sadeem.exe"; Tasks: ctxmenu
Root: HKA; Subkey: "Software\Classes\*\shell\Sadeem\command"; ValueType: string; ValueData: """{app}\Sadeem.exe"" ""%1"""; Tasks: ctxmenu
[Run]
Filename: "{app}\Sadeem.exe"; Description: "تشغيل سديم"; Flags: nowait postinstall skipifsilent
