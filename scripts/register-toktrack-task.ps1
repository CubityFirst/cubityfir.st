<#
  Registers (or replaces) the "cubityfirst toktrack upload" scheduled task, which runs
  upload-toktrack.ps1 every 12 hours (midnight and noon) and at logon, as the current user and only while
  they're logged on (the snapr key lives in their Credential Manager). It runs through
  `conhost --headless`, so no window flashes up.

  Remove it with: Unregister-ScheduledTask -TaskName 'cubityfirst toktrack upload'
#>
$ErrorActionPreference = 'Stop'
$name = 'cubityfirst toktrack upload'
$script = Join-Path $PSScriptRoot 'upload-toktrack.ps1'

$action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\conhost.exe" `
    -Argument "--headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""

# Starting from the next midnight or noon, then every 12 hours
$now = Get-Date
$start = $now.Date.AddHours(12 * ([math]::Floor($now.Hour / 12) + 1))
$repeat = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 12)
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$logon.Delay = 'PT5M'

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Trigger $repeat, $logon -Settings $settings `
    -Principal $principal -Description 'Uploads toktrack daily usage to R2 for cubityfir.st (scripts/upload-toktrack.ps1)' -Force | Out-Null

Get-ScheduledTask -TaskName $name | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime
