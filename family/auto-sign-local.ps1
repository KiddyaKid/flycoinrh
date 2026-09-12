param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$cfg=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
foreach($name in @('FAMILY_STATE_DIR','FAMILY_PRIOR_TX_FILE')){[Environment]::SetEnvironmentVariable($name,[string]$cfg.$name,'Process')}
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& node (Join-Path $PSScriptRoot 'auto-sign.mjs')
