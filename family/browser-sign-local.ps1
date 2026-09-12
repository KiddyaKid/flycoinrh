param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$Host.UI.RawUI.WindowTitle='FLYFAMILY - sign the PONS page request - ONE child'
$cfg=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
foreach($key in @('FAMILY_STATE_DIR','FAMILY_PRIOR_TX_FILE')){[Environment]::SetEnvironmentVariable($key,[string]$cfg.$key,'Process')}
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Write-Host 'This signs the actual PONS page request after the recorded neural clicks.'
Write-Host 'One test child only. No initial purchase. Key stays in local memory.'
& node (Join-Path $PSScriptRoot 'browser-sign.mjs') --execute
Write-Host ('Signer exit code: '+$LASTEXITCODE)
Read-Host 'Press Enter to close'
