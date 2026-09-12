param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
# WinForms callbacks must not depend on lazy module loading in their event scope.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$pilot=Get-Content -LiteralPath (Join-Path $root 'build\external-pilot\pilot.json') -Raw | ConvertFrom-Json
$owner='0x9cA6276184A59d23Ef97e1CD06c02C4A6Af3322C'
$addressScript=Join-Path $PSScriptRoot 'key-address.mjs'
$automaticScript=Join-Path $PSScriptRoot 'auto-sign-local.ps1'
$diagnosticFile=Join-Path $root 'build\external-pilot\key-import-status.json'
$nodeBinary=(Get-Command node -ErrorAction Stop).Source
. (Join-Path $PSScriptRoot 'local-store.ps1')
$store=Join-Path $env:LOCALAPPDATA 'FlyFamily'
# Verify permissions and DPAPI before requesting any private key.
Test-FlyFamilyStore -Path $store
$form=New-Object Windows.Forms.Form
$form.Text='FLYFAMILY - Local encrypted wallet import'
$form.Size=New-Object Drawing.Size(610,360)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$label=New-Object Windows.Forms.Label
$label.Location=New-Object Drawing.Point(22,20)
$label.Size=New-Object Drawing.Size(560,130)
$label.Text="ONE test child: $($pilot.name)`r`nWallet: $owner`r`nCumulative limit: 0.02 ETH. No initial buy.`r`nPaste once below. Encrypted with your Windows account.`r`nThe key is not sent to chat, the browser, GitHub or Vercel."
$label.Font=New-Object Drawing.Font('Segoe UI',10)
$box=New-Object Windows.Forms.TextBox
$box.Location=New-Object Drawing.Point(22,155)
$box.Size=New-Object Drawing.Size(550,28)
$box.UseSystemPasswordChar=$true
$button=New-Object Windows.Forms.Button
$button.Text='Encrypt and enable ONE test launch'
$button.Location=New-Object Drawing.Point(22,205)
$button.Size=New-Object Drawing.Size(350,38)
$status=New-Object Windows.Forms.Label
$status.Location=New-Object Drawing.Point(22,255)
$status.Size=New-Object Drawing.Size(550,50)
$button.Add_Click({
  $button.Enabled=$false
  $stage='format'
  $check=$null
  try {
    $box.Text=$box.Text.Trim()
    if($box.Text -notmatch '^(0x)?[0-9a-fA-F]{64}$'){throw 'Invalid key'}
    if(-not $box.Text.StartsWith('0x')){$box.Text='0x'+$box.Text}
    $stage='address-check'
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$nodeBinary
    $info.Arguments='"'+$addressScript+'"'
    $info.WorkingDirectory=$root
    $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $check=New-Object Diagnostics.Process; $check.StartInfo=$info
    [void]$check.Start(); $check.StandardInput.Write($box.Text); $check.StandardInput.Close()
    $address=$check.StandardOutput.ReadToEnd().Trim(); $check.WaitForExit()
    if($check.ExitCode -ne 0 -or $address -notmatch '^0x[0-9a-fA-F]{40}$'){throw 'Address check failed'}
    $stage='wallet-mismatch'
    if($address -ne $owner){throw 'Wrong wallet'}
    $stage='storage-permissions'
    Initialize-FlyFamilyStore -Path $store
    $stage='windows-encryption'
    $secure=ConvertTo-SecureString $box.Text -AsPlainText -Force
    try { $secure | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $store 'signer.dpapi') -NoNewline }
    finally { $secure.Dispose(); $box.Clear() }
    $stage='scope-save'
    @{owner=$owner; chainId=4663; birthId=$pilot.id; maxLaunches=1; budgetETH='0.02'; expiresAt=[DateTime]::UtcNow.AddDays(7).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $store 'scope.json')
    $stage='start-signer'
    $launchArguments=@('-NoProfile','-File',('"'+$automaticScript+'"'),'-Config',('"'+$Config+'"'))
    Start-Process powershell.exe -ArgumentList $launchArguments -WindowStyle Hidden | Out-Null
    @{status='imported'; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $diagnosticFile
    $form.Close()
  } catch {
    $box.Clear()
    # Never record ErrorRecord, exception text, command text or any input value.
    @{status='failed'; stage=$stage; exceptionType=$_.Exception.GetType().Name; line=$_.InvocationInfo.ScriptLineNumber; at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $diagnosticFile
    $messages=@{
      'format'='Expected 64 hexadecimal characters (optional 0x). Outer spaces are removed.'
      'address-check'='Local address verification failed. Your key was not saved.'
      'wallet-mismatch'="Valid key, different wallet: $address. Expected $owner."
      'storage-permissions'='Windows folder permission setup failed. This is not a wrong-key error.'
      'windows-encryption'='Windows encryption failed. This is not a wrong-key error.'
      'scope-save'='Key encrypted, but launch scope could not be saved.'
      'start-signer'='Key encrypted, but automatic signer could not start.'
    }
    $status.Text=$messages[$stage]
    $button.Enabled=$true
  } finally {if($check){$check.Dispose()}}
})
$form.Controls.AddRange(@($label,$box,$button,$status))
$form.AcceptButton=$button
[void]$form.ShowDialog()
$box.Clear()
