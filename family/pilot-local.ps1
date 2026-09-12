param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$Host.UI.RawUI.WindowTitle='FLYFAMILY - browser pilot - NO SIGNING'
$settings=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
foreach($key in @('FAMILY_PYTHON','FAMILY_GRAPH','FAMILY_GRAPH_SHA256','FAMILY_ANNOTATIONS','FAMILY_STATE_DIR','FAMILY_PRIOR_TX_FILE')) {
 [Environment]::SetEnvironmentVariable($key,[string]$settings.$key,'Process')
}
Write-Host 'FLYFAMILY: browser rehearsal from a confirmed FLYBRAIN swap replay.'
Write-Host 'No key is needed. This version only captures a PONS transaction request.'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& node (Join-Path $PSScriptRoot 'browser-pilot.mjs')
Write-Host ('Pilot exited with code '+$LASTEXITCODE+'. Do not repeat if a transaction is pending.')
Read-Host 'Press Enter to close'
