# キッズタイマー本体。ログオン時にタスクスケジューラから子どもの権限で起動される。
# 設定（config.json）で せいげん が付いている人だけ、画面の右下に のこり時間 を出す。
# 時間切れになると 猶予のあと サインアウト／ロック／シャットダウン する。

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$UserName = $env:USERNAME

# 同じ人の二重起動をふせぐ
$createdNew = $false
$script:Mutex = New-Object System.Threading.Mutex($true, "Local\KidsTimer", [ref]$createdNew)
if (-not $createdNew) { exit 0 }

try { $script:Config = Read-KidsConfig } catch { $script:Config = New-DefaultConfig }
$script:Limit = Get-LimitMinutes $script:Config $UserName
if ($null -eq $script:Limit) { exit 0 }   # この人は せいげん なし

# ログインした時点から数えはじめる
if ($script:Config.mode -eq 'perLogin') {
    $script:Used = 0.0
    try { Write-UsageSeconds $UserName 0 } catch { }
} else {
    $script:Used = Read-UsageSeconds $UserName
}
$script:ResetStamp = Get-ResetStamp $script:Config $UserName
$script:DayKey     = Get-TodayKey
$script:LastTick   = [DateTime]::UtcNow
$script:LastSave   = [DateTime]::UtcNow
$script:LastReload = [DateTime]::UtcNow
$script:Warned5    = $false
$script:Warned1    = $false
$script:EndForm    = $null
$script:EndLeft    = 0.0

# ---- 色 ----
$ColBg     = [System.Drawing.Color]::FromArgb(255, 250, 240)
$ColInk    = [System.Drawing.Color]::FromArgb(51, 51, 51)
$ColWarn   = [System.Drawing.Color]::FromArgb(255, 226, 190)
$ColDanger = [System.Drawing.Color]::FromArgb(255, 205, 200)
$ColLink   = [System.Drawing.Color]::FromArgb(43, 108, 163)
$FontName  = 'Yu Gothic UI'

function New-Font([float]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular) {
    New-Object System.Drawing.Font($FontName, $Size, $Style)
}

# ---- おやの せってい を開く（管理者のパスワードを UAC で聞かれる）----
function Open-ParentSettings {
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $settings = Join-Path $PSScriptRoot 'Settings.ps1'
    try {
        Start-Process -FilePath $ps -Verb RunAs -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', "`"$settings`"")
    } catch {
        # UAC で「いいえ」を押したときなど。何もしない。
    }
}

# ---- 右下の小さな窓 ----
$form = New-Object System.Windows.Forms.Form
$form.Text = 'キッズタイマー'
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.BackColor = $ColBg
$form.Size = New-Object System.Drawing.Size(230, 96)
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($area.Right - $form.Width - 12), ($area.Bottom - $form.Height - 12))

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = 'のこり じかん'
$lblTitle.Font = New-Font 10
$lblTitle.ForeColor = $ColInk
$lblTitle.AutoSize = $true
$lblTitle.Location = New-Object System.Drawing.Point(12, 8)
$form.Controls.Add($lblTitle)

$lblTime = New-Object System.Windows.Forms.Label
$lblTime.Font = New-Font 26 ([System.Drawing.FontStyle]::Bold)
$lblTime.ForeColor = $ColInk
$lblTime.AutoSize = $true
$lblTime.Location = New-Object System.Drawing.Point(8, 26)
$form.Controls.Add($lblTime)

$lnkParent = New-Object System.Windows.Forms.LinkLabel
$lnkParent.Text = 'おやの せってい'
$lnkParent.Font = New-Font 9
$lnkParent.LinkColor = $ColLink
$lnkParent.AutoSize = $true
$lnkParent.Location = New-Object System.Drawing.Point(130, 72)
$lnkParent.Add_LinkClicked({ Open-ParentSettings })
$form.Controls.Add($lnkParent)

# ふちなし窓なので、どこをつかんでも うごかせるようにする
$script:DragFrom = $null
$dragDown = { param($s, $e) if ($e.Button -eq 'Left') { $script:DragFrom = $e.Location } }
$dragMove = {
    param($s, $e)
    if ($null -ne $script:DragFrom) {
        $form.Left += $e.X - $script:DragFrom.X
        $form.Top  += $e.Y - $script:DragFrom.Y
    }
}
$dragUp = { $script:DragFrom = $null }
foreach ($c in @($form, $lblTitle, $lblTime)) {
    $c.Add_MouseDown($dragDown); $c.Add_MouseMove($dragMove); $c.Add_MouseUp($dragUp)
}

# 子どもが × や Alt+F4 で閉じられないようにする（Windows の終了時は閉じる）
$form.Add_FormClosing({
    param($s, $e)
    if ($e.CloseReason -eq 'UserClosing') { $e.Cancel = $true }
})

# ---- おしらせ（数秒で自動で消える）----
function Show-Notice([string]$Text, $Color) {
    $n = New-Object System.Windows.Forms.Form
    $n.FormBorderStyle = 'None'
    $n.StartPosition = 'Manual'
    $n.ShowInTaskbar = $false
    $n.TopMost = $true
    $n.BackColor = $Color
    $n.Size = New-Object System.Drawing.Size(360, 110)
    $n.Location = New-Object System.Drawing.Point(($area.Left + ($area.Width - 360) / 2), ($area.Top + 40))
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.Font = New-Font 18 ([System.Drawing.FontStyle]::Bold)
    $l.ForeColor = $ColInk
    $l.Dock = 'Fill'
    $l.TextAlign = 'MiddleCenter'
    $l.Add_Click({ $this.FindForm().Close() })
    $n.Controls.Add($l)
    $t = New-Object System.Windows.Forms.Timer
    $t.Interval = 10000
    $t.Add_Tick({ $this.Stop(); $n.Close() }.GetNewClosure())
    $n.Add_FormClosed({ $t.Dispose() }.GetNewClosure())
    [System.Media.SystemSounds]::Exclamation.Play()
    $n.Show()
    $t.Start()
}

# ---- 時間切れの画面（全画面）----
function Show-EndScreen {
    if ($script:EndForm) { return }
    $script:EndLeft = $script:GraceSeconds
    $f = New-Object System.Windows.Forms.Form
    $f.FormBorderStyle = 'None'
    $f.WindowState = 'Maximized'
    $f.TopMost = $true
    $f.ShowInTaskbar = $false
    $f.BackColor = $ColBg

    $panel = New-Object System.Windows.Forms.TableLayoutPanel
    $panel.Dock = 'Fill'
    $panel.ColumnCount = 1
    $panel.RowCount = 5
    [void]$panel.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 30)))
    [void]$panel.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$panel.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$panel.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize')))
    [void]$panel.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 70)))

    $big = New-Object System.Windows.Forms.Label
    $big.Text = 'じかんに なったよ。 おしまい！'
    $big.Font = New-Font 36 ([System.Drawing.FontStyle]::Bold)
    $big.ForeColor = $ColInk
    $big.AutoSize = $true
    $big.Anchor = 'None'
    $panel.Controls.Add($big, 0, 1)

    $script:EndCount = New-Object System.Windows.Forms.Label
    $script:EndCount.Font = New-Font 18
    $script:EndCount.ForeColor = $ColInk
    $script:EndCount.AutoSize = $true
    $script:EndCount.Anchor = 'None'
    $script:EndCount.Margin = New-Object System.Windows.Forms.Padding(0, 24, 0, 24)
    $panel.Controls.Add($script:EndCount, 0, 2)

    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = 'おやの せってい（じかんを ふやす）'
    $btn.Font = New-Font 12
    $btn.AutoSize = $true
    $btn.Padding = New-Object System.Windows.Forms.Padding(12, 6, 12, 6)
    $btn.Anchor = 'None'
    $btn.Add_Click({ Open-ParentSettings })
    $panel.Controls.Add($btn, 0, 3)

    $f.Controls.Add($panel)
    $f.Add_FormClosing({ param($s, $e) if ($e.CloseReason -eq 'UserClosing' -and $script:EndForm) { $e.Cancel = $true } })
    $script:EndForm = $f
    Update-EndScreen
    [System.Media.SystemSounds]::Hand.Play()
    $f.Show()
}

function Update-EndScreen {
    $msg = switch ($script:Config.action) {
        'shutdown' { 'パソコンを きります' }
        'lock'     { 'がめんを ロックします' }
        default    { 'サインアウトします' }
    }
    $script:EndCount.Text = "あと $([int][math]::Ceiling($script:EndLeft)) びょうで $msg。 ほぞんするものは いま ほぞんしてね。"
}

function Close-EndScreen {
    if ($script:EndForm) {
        $f = $script:EndForm
        $script:EndForm = $null
        $f.Close()
        $f.Dispose()
    }
}

function Invoke-TimeUpAction {
    try { Write-UsageSeconds $UserName $script:Used } catch { }
    switch ($script:Config.action) {
        'shutdown' { & shutdown.exe /s /f /t 0 }
        'lock'     {
            & rundll32.exe user32.dll,LockWorkStation
            $script:EndLeft = 15   # ロックを解除しても、また少ししたら ロックする
        }
        default    { & shutdown.exe /l /f }
    }
    if ($script:EndLeft -le 0) { $script:EndLeft = 30 }   # うまく いかなかったら 30びょう後に もういちど
}

# ---- 1秒ごとの処理 ----
function Update-Timer {
    $now = [DateTime]::UtcNow
    $delta = ($now - $script:LastTick).TotalSeconds
    $script:LastTick = $now
    # スリープ明けや時計の変更で大きく飛んだ分は数えない
    if ($delta -lt 0 -or $delta -gt 5) { $delta = 1 }

    # 5秒ごとに設定を読み直す（おやが じかんを ふやした／へらした を反映）
    if (($now - $script:LastReload).TotalSeconds -ge 5) {
        $script:LastReload = $now
        try {
            $script:Config = Read-KidsConfig
            $newLimit = Get-LimitMinutes $script:Config $UserName
            if ($null -eq $newLimit) {
                # せいげん が外された
                Close-EndScreen
                [System.Windows.Forms.Application]::Exit()
                return
            }
            $script:Limit = $newLimit
            # おやが「きょうの きろくを リセット」したとき
            $stamp = Get-ResetStamp $script:Config $UserName
            if ($stamp -ne $script:ResetStamp) {
                $script:ResetStamp = $stamp
                $script:Used = 0.0
                $script:EndLeft = $script:GraceSeconds
            }
        } catch { }
    }

    # 日付が変わったら 1日の合計 は 0 から
    $today = Get-TodayKey
    if ($today -ne $script:DayKey) {
        $script:DayKey = $today
        if ($script:Config.mode -ne 'perLogin') { $script:Used = 0.0 }
    }

    $limitSec = $script:Limit * 60
    $remaining = $limitSec - $script:Used

    if ($remaining -gt 0) {
        $script:Used += $delta
        $remaining = $limitSec - $script:Used
    }

    if (($now - $script:LastSave).TotalSeconds -ge 10) {
        $script:LastSave = $now
        try { Write-UsageSeconds $UserName $script:Used } catch { }
    }

    $lblTime.Text = Format-Clock $remaining

    # じかんが ふえて しきい値より上に もどったら、もういちど しらせる
    if ($remaining -gt 300) { $script:Warned5 = $false }
    if ($remaining -gt 60)  { $script:Warned1 = $false }

    if ($remaining -le 0) {
        $form.BackColor = $ColDanger
        Show-EndScreen
        $script:EndLeft -= $delta
        Update-EndScreen
        if ($script:EndLeft -le 0) { Invoke-TimeUpAction }
        return
    }

    Close-EndScreen
    if ($remaining -le 60) {
        $form.BackColor = $ColDanger
        if (-not $script:Warned1) { $script:Warned1 = $true; $script:Warned5 = $true; Show-Notice 'あと 1ぷん だよ' $ColDanger }
    } elseif ($remaining -le 300) {
        $form.BackColor = $ColWarn
        if (-not $script:Warned5) { $script:Warned5 = $true; Show-Notice 'あと 5ふん だよ' $ColWarn }
    } else {
        $form.BackColor = $ColBg
    }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({ try { Update-Timer } catch { } })

$form.Add_Shown({
    Update-Timer
    $timer.Start()
    if ($script:Limit * 60 - $script:Used -gt 0) {
        Show-Notice "きょうは $([int][math]::Ceiling(($script:Limit * 60 - $script:Used) / 60))ふん つかえるよ" $ColBg
    }
})

[System.Windows.Forms.Application]::Run($form)

$timer.Stop()
try { Write-UsageSeconds $UserName $script:Used } catch { }
$script:Mutex.ReleaseMutex()
