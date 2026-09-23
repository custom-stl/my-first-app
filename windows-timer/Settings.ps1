# キッズタイマー おやの せってい。管理者として動く（子どもの標準アカウントからは管理者のパスワードが要る）。
# 設定ファイル（C:\ProgramData\KidsTimer\config.json）は管理者しか書けないので、子どもは変えられない。

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')

# 管理者でなければ、管理者として開きなおす（UAC）
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    try {
        Start-Process -FilePath $ps -Verb RunAs -ArgumentList @(
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
            '-File', "`"$PSCommandPath`"")
    } catch { }
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

try {
    $config = Read-KidsConfig
} catch {
    [void][System.Windows.Forms.MessageBox]::Show(
        "設定ファイルが読めなかったので、はじめの設定で開きます。`n$($_.Exception.Message)",
        'キッズタイマー', 'OK', 'Warning')
    $config = New-DefaultConfig
}

$today = Get-TodayKey
$font = New-Object System.Drawing.Font('Yu Gothic UI', 10)
$bold = New-Object System.Drawing.Font('Yu Gothic UI', 10, [System.Drawing.FontStyle]::Bold)

# この PC のユーザー（無効なアカウントや組み込みのものは出さない）
$users = @(Get-LocalUser | Where-Object {
    $_.Enabled -and $_.Name -notin @('Administrator', 'Guest', 'DefaultAccount', 'WDAGUtilityAccount', 'defaultuser0')
} | Sort-Object Name)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'キッズタイマー おやの せってい'
$form.Font = $font
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.AutoSize = $true
$form.AutoSizeMode = 'GrowAndShrink'
$form.TopMost = $true
$form.Padding = New-Object System.Windows.Forms.Padding(12)

$root = New-Object System.Windows.Forms.FlowLayoutPanel
$root.FlowDirection = 'TopDown'
$root.AutoSize = $true
$root.WrapContents = $false
$form.Controls.Add($root)

function New-Label([string]$Text, $Font = $font) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.Font = $Font
    $l.AutoSize = $true
    $l.Anchor = 'Left'
    $l.Margin = New-Object System.Windows.Forms.Padding(3, 8, 12, 3)
    return $l
}

function New-Combo([string[]]$Items, [int]$Selected, [int]$Width = 120) {
    $c = New-Object System.Windows.Forms.ComboBox
    $c.DropDownStyle = 'DropDownList'
    $c.Width = $Width
    [void]$c.Items.AddRange($Items)
    $c.SelectedIndex = $Selected
    return $c
}

# ---- ユーザーごとの じかん ----
$root.Controls.Add((New-Label 'つかえる じかん（ログインしてから カウントします）' $bold))

$grid = New-Object System.Windows.Forms.TableLayoutPanel
$grid.AutoSize = $true
$grid.ColumnCount = 5
$grid.CellBorderStyle = 'Single'
$grid.Controls.Add((New-Label 'ユーザー' $bold), 0, 0)
$grid.Controls.Add((New-Label 'じかん' $bold), 1, 0)
$grid.Controls.Add((New-Label 'きょうだけ ふやす' $bold), 2, 0)
$grid.Controls.Add((New-Label 'きょう つかった' $bold), 3, 0)
$grid.Controls.Add((New-Label '' $bold), 4, 0)

$limitItems = @('せいげん なし') + ($script:MinuteSteps | ForEach-Object { "$_ ふん" })
$bonusItems = @('なし') + ($script:MinuteSteps | ForEach-Object { "+$_ ふん" })

$rows = @()
$row = 1
foreach ($lu in $users) {
    $entry = Find-UserEntry $config $lu.Name
    $limitIdx = 0
    $bonusIdx = 0
    if ($entry) {
        $i = [array]::IndexOf($script:MinuteSteps, [int]$entry.minutes)
        if ($i -ge 0) { $limitIdx = $i + 1 }
        if ($entry.bonusDate -eq $today) {
            $j = [array]::IndexOf($script:MinuteSteps, [int]$entry.bonusMinutes)
            if ($j -ge 0) { $bonusIdx = $j + 1 }
        }
    }
    $display = $lu.Name
    if ($lu.FullName -and $lu.FullName -ne $lu.Name) { $display = "$($lu.FullName)（$($lu.Name)）" }

    $cLimit = New-Combo $limitItems $limitIdx
    $cBonus = New-Combo $bonusItems $bonusIdx
    $usedMin = [int][math]::Floor((Read-UsageSeconds $lu.Name) / 60)
    $lUsed = New-Label "$usedMin ふん"
    $bReset = New-Object System.Windows.Forms.Button
    $bReset.Text = 'きろくを 0 に'
    $bReset.AutoSize = $true

    $r = [pscustomobject]@{ Name = $lu.Name; Limit = $cLimit; Bonus = $cBonus; UsedLabel = $lUsed; Reset = $false }
    $bReset.Tag = $r
    $bReset.Add_Click({
        $this.Tag.Reset = $true
        $this.Tag.UsedLabel.Text = '0 ふん（ほぞんで リセット）'
    })

    $grid.Controls.Add((New-Label $display), 0, $row)
    $grid.Controls.Add($cLimit, 1, $row)
    $grid.Controls.Add($cBonus, 2, $row)
    $grid.Controls.Add($lUsed, 3, $row)
    $grid.Controls.Add($bReset, 4, $row)
    $rows += $r
    $row++
}
$root.Controls.Add($grid)

$root.Controls.Add((New-Label '「きょうだけ ふやす」は きょうの あいだだけ 足されます（あしたは もとに もどります）。'))

# ---- かぞえかた ----
$root.Controls.Add((New-Label 'かぞえかた' $bold))
$rbDaily = New-Object System.Windows.Forms.RadioButton
$rbDaily.Text = '1日の合計（サインアウトして ログインしなおしても、のこり時間は つづき から）'
$rbDaily.AutoSize = $true
$rbPer = New-Object System.Windows.Forms.RadioButton
$rbPer.Text = 'ログインのたびに はじめから'
$rbPer.AutoSize = $true
if ($config.mode -eq 'perLogin') { $rbPer.Checked = $true } else { $rbDaily.Checked = $true }
$root.Controls.Add($rbDaily)
$root.Controls.Add($rbPer)

# ---- じかんに なったら ----
$root.Controls.Add((New-Label "じかんに なったら（$($script:GraceSeconds)びょう 予告してから）" $bold))
$actionKeys = @('logoff', 'lock', 'shutdown')
$actionIdx = [array]::IndexOf($actionKeys, [string]$config.action)
if ($actionIdx -lt 0) { $actionIdx = 0 }
$cAction = New-Combo @('サインアウト', 'がめんを ロック', 'シャットダウン') $actionIdx 200
$root.Controls.Add($cAction)

# ---- ボタン ----
$buttons = New-Object System.Windows.Forms.FlowLayoutPanel
$buttons.AutoSize = $true
$buttons.Margin = New-Object System.Windows.Forms.Padding(0, 16, 0, 0)
$bSave = New-Object System.Windows.Forms.Button
$bSave.Text = 'ほぞん'
$bSave.AutoSize = $true
$bCancel = New-Object System.Windows.Forms.Button
$bCancel.Text = 'やめる'
$bCancel.AutoSize = $true
$bCancel.DialogResult = 'Cancel'
$buttons.Controls.Add($bSave)
$buttons.Controls.Add($bCancel)
$root.Controls.Add($buttons)
$form.AcceptButton = $bSave
$form.CancelButton = $bCancel

$bSave.Add_Click({
    try {
        $newUsers = @()
        # 一覧に出ていない人（削除されたアカウントなど）の設定は そのまま のこす
        foreach ($old in @($config.users)) {
            if (-not ($rows | Where-Object { $_.Name -ieq $old.name })) { $newUsers += $old }
        }
        foreach ($r in $rows) {
            $old = Find-UserEntry $config $r.Name
            $minutes = 0
            if ($r.Limit.SelectedIndex -gt 0) { $minutes = $script:MinuteSteps[$r.Limit.SelectedIndex - 1] }
            $bonus = 0
            if ($r.Bonus.SelectedIndex -gt 0) { $bonus = $script:MinuteSteps[$r.Bonus.SelectedIndex - 1] }
            $stamp = ''
            if ($old -and $old.resetStamp) { $stamp = [string]$old.resetStamp }
            if ($r.Reset) {
                $stamp = (Get-Date).ToString('o')
                Write-UsageSeconds $r.Name 0
            }
            if ($minutes -gt 0 -or $stamp) {
                $bonusDate = ''
                if ($bonus -gt 0) { $bonusDate = $today }
                $newUsers += [pscustomobject]@{
                    name         = $r.Name
                    minutes      = $minutes
                    bonusDate    = $bonusDate
                    bonusMinutes = $bonus
                    resetStamp   = $stamp
                }
            }
        }
        $mode = 'daily'
        if ($rbPer.Checked) { $mode = 'perLogin' }
        Save-KidsConfig ([pscustomobject]@{
            version = 1
            mode    = $mode
            action  = $actionKeys[$cAction.SelectedIndex]
            users   = $newUsers
        })
        $form.DialogResult = 'OK'
        $form.Close()
    } catch {
        [void][System.Windows.Forms.MessageBox]::Show(
            "ほぞん できませんでした。`n$($_.Exception.Message)", 'キッズタイマー', 'OK', 'Error')
    }
})

[void]$form.ShowDialog()
