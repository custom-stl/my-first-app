# キッズタイマー 共通部品（KidsTimer.ps1 / Settings.ps1 / Install.ps1 から読み込む）
# Windows PowerShell 5.1 で動くように書く（?? や三項演算子は使わない）。
# 日本語を含むので UTF-8（BOM付き）で保存すること。BOMがないと 5.1 では文字化けする。

$script:AppName     = 'KidsTimer'
$script:InstallDir  = Join-Path $env:ProgramFiles 'KidsTimer'
$script:DataDir     = Join-Path $env:ProgramData 'KidsTimer'
$script:ConfigPath  = Join-Path $script:DataDir 'config.json'
$script:UsageDir    = Join-Path $script:DataDir 'usage'
$script:MinuteSteps = @(5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60)
$script:GraceSeconds = 60   # 時間切れから サインアウト等 までの猶予

function Get-TodayKey { (Get-Date).ToString('yyyy-MM-dd') }

function New-DefaultConfig {
    [pscustomobject]@{
        version = 1
        mode    = 'daily'    # daily: 1日の合計 / perLogin: ログインのたびに リセット
        action  = 'logoff'   # logoff / lock / shutdown
        users   = @()        # @{ name; minutes; bonusDate; bonusMinutes; resetStamp }
    }
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $text = [IO.File]::ReadAllText($Path)   # BOMがあっても読める
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json)
}

function Write-JsonFile([string]$Path, $Object) {
    $json = $Object | ConvertTo-Json -Depth 6
    $tmp = "$Path.tmp"
    [IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}

# 設定を読む。壊れていたら例外を投げる（呼び出し側で前回の値を使い続ける）。
function Read-KidsConfig {
    $cfg = Read-JsonFile $script:ConfigPath
    if ($null -eq $cfg) { return (New-DefaultConfig) }
    if (-not $cfg.mode)   { $cfg | Add-Member -NotePropertyName mode -NotePropertyValue 'daily' -Force }
    if (-not $cfg.action) { $cfg | Add-Member -NotePropertyName action -NotePropertyValue 'logoff' -Force }
    $cfg | Add-Member -NotePropertyName users -NotePropertyValue @($cfg.users | Where-Object { $_ }) -Force
    return $cfg
}

function Save-KidsConfig($Config) { Write-JsonFile $script:ConfigPath $Config }

function Find-UserEntry($Config, [string]$UserName) {
    foreach ($u in @($Config.users)) {
        if ($u -and $u.name -ieq $UserName) { return $u }
    }
    return $null
}

# その人の きょうの せいげん（分）。せいげん なし なら $null。
function Get-LimitMinutes($Config, [string]$UserName) {
    $u = Find-UserEntry $Config $UserName
    if ($null -eq $u -or [int]$u.minutes -le 0) { return $null }
    $total = [int]$u.minutes
    if ($u.bonusDate -eq (Get-TodayKey) -and [int]$u.bonusMinutes -gt 0) {
        $total += [int]$u.bonusMinutes
    }
    return $total
}

# おやが「きょうの きろくを リセット」した印。変わったら タイマーは 0 から数えなおす。
function Get-ResetStamp($Config, [string]$UserName) {
    $u = Find-UserEntry $Config $UserName
    if ($null -eq $u -or -not $u.resetStamp) { return '' }
    return [string]$u.resetStamp
}

function Get-UsagePath([string]$UserName) {
    $safe = ($UserName -replace '[\\/:*?"<>|]', '_')
    Join-Path $script:UsageDir "$safe.json"
}

# きょう つかった秒数。日付が変わっていたら 0。
function Read-UsageSeconds([string]$UserName) {
    try {
        $u = Read-JsonFile (Get-UsagePath $UserName)
        if ($u -and $u.date -eq (Get-TodayKey)) { return [double]$u.usedSeconds }
    } catch { }
    return 0.0
}

function Write-UsageSeconds([string]$UserName, [double]$Seconds) {
    Write-JsonFile (Get-UsagePath $UserName) ([pscustomobject]@{
        date        = Get-TodayKey
        usedSeconds = [math]::Round($Seconds)
    })
}

function Format-Clock([double]$Seconds) {
    if ($Seconds -lt 0) { $Seconds = 0 }
    $s = [int][math]::Ceiling($Seconds)
    '{0}:{1:00}' -f [int][math]::Floor($s / 60), ($s % 60)
}
