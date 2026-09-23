# キッズタイマー インストール（おやの 管理者アカウントで実行する）
#  1. C:\Program Files\KidsTimer にプログラムを置く（子どもは書きかえられない）
#  2. C:\ProgramData\KidsTimer に設定を置く（設定は管理者だけ書ける／使った時間は だれでも書ける）
#  3. ログオンしたら タイマーが起動するよう タスクスケジューラに登録する
#  4. スタートメニューに「キッズタイマー せってい」を作る
#  5. せってい画面を開く

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
. (Join-Path $src 'Common.ps1')

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $ps -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    exit 0
}

# SID で指定する（日本語版の Windows でもグループ名に左右されない）
$SidAdmins = 'S-1-5-32-544'
$SidSystem = 'S-1-5-18'
$SidUsers  = 'S-1-5-32-545'

try {
    Write-Host 'キッズタイマーを インストールします...'

    # 1. プログラム
    New-Item -ItemType Directory -Path $script:InstallDir -Force | Out-Null
    foreach ($f in 'Common.ps1', 'KidsTimer.ps1', 'Settings.ps1', 'Uninstall.ps1') {
        Copy-Item -LiteralPath (Join-Path $src $f) -Destination $script:InstallDir -Force
    }
    Get-ChildItem -LiteralPath $script:InstallDir -File | Unblock-File

    # 2. 設定と きろく
    New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
    New-Item -ItemType Directory -Path $script:UsageDir -Force | Out-Null
    & icacls.exe $script:DataDir /inheritance:r /grant:r "*${SidAdmins}:(OI)(CI)F" "*${SidSystem}:(OI)(CI)F" "*${SidUsers}:(OI)(CI)RX" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "フォルダの権限を設定できませんでした: $script:DataDir" }
    & icacls.exe $script:UsageDir /grant "*${SidUsers}:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "フォルダの権限を設定できませんでした: $script:UsageDir" }
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) { Save-KidsConfig (New-DefaultConfig) }

    # 3. ログオン時に起動するタスク（ログオンした人の権限で動く）
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $timerPath = Join-Path $script:InstallDir 'KidsTimer.ps1'
    $usersGroup = (New-Object Security.Principal.SecurityIdentifier($SidUsers)).Translate([Security.Principal.NTAccount]).Value
    $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$timerPath`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $taskPrincipal = New-ScheduledTaskPrincipal -GroupId $usersGroup -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances Parallel
    Register-ScheduledTask -TaskName $script:AppName -Action $action -Trigger $trigger `
        -Principal $taskPrincipal -Settings $settings -Description 'キッズタイマー（ログインしてからの使用時間を数える）' -Force | Out-Null

    # 4. スタートメニュー
    $menu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\キッズタイマー せってい.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut($menu)
    $lnk.TargetPath = $ps
    $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $script:InstallDir 'Settings.ps1')`""
    $lnk.IconLocation = "$env:SystemRoot\System32\imageres.dll,-1028"
    $lnk.Description = 'キッズタイマーの じかんを 設定します（管理者）'
    $lnk.Save()

    Write-Host 'インストールできました。せってい画面を開きます。'
    # 5. せってい画面
    & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $script:InstallDir 'Settings.ps1')
    Write-Host ''
    Write-Host '子どもの アカウントで ログインしなおすと、右下に のこり時間が 出ます。'
    Write-Host 'せっていは スタートメニューの「キッズタイマー せってい」から いつでも変えられます。'
} catch {
    Write-Host ''
    Write-Host "しっぱい しました: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host 'Enter キーで とじます'
