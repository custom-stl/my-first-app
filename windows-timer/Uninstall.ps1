# キッズタイマー アンインストール（おやの 管理者アカウントで実行する）

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $ps -Verb RunAs -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    exit 0
}

try {
    Unregister-ScheduledTask -TaskName $script:AppName -Confirm:$false -ErrorAction SilentlyContinue

    # 動いている タイマーを とめる
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -like '*KidsTimer.ps1*' } |
        ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }

    Remove-Item -LiteralPath (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\キッズタイマー せってい.lnk') -Force -ErrorAction SilentlyContinue

    $answer = Read-Host '設定と きろく（C:\ProgramData\KidsTimer）も けしますか？ [y/N]'
    if ($answer -match '^[yY]') {
        Remove-Item -LiteralPath $script:DataDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    # 自分自身が Program Files の中にあるときも けせるよう、最後に けす
    Set-Location $env:TEMP
    Remove-Item -LiteralPath $script:InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'アンインストール しました。'
} catch {
    Write-Host "しっぱい しました: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host 'Enter キーで とじます'
