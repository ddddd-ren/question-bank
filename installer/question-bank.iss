#ifndef AppVersion
  #define AppVersion "0.1.4"
#endif

#define AppName "题库系统"
#define AppExeName "question-bank.exe"

[Setup]
AppId={{E5A97169-35A1-45C3-A6C1-19A64594DF90}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Question Bank
DefaultDirName={localappdata}\Programs\QuestionBank
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#AppExeName}
SetupIconFile=..\assets\app-icon.ico
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
OutputDir=..\output
OutputBaseFilename=题库系统-{#AppVersion}-测试版-安装程序

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加快捷方式："; Flags: unchecked

[Files]
Source: "..\output\windows-package\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\resources\app-icon.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\resources\app-icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "启动{#AppName}"; Flags: postinstall nowait skipifsilent
