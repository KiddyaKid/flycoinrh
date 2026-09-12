param(
  [ValidateSet('Status','Start','Stop')][string]$Action = 'Status',
  [Parameter(Mandatory=$true)][string]$Config
)
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$allowed = @('FAMILY_PYTHON','FAMILY_GRAPH','FAMILY_GRAPH_SHA256','FAMILY_ANNOTATIONS','FAMILY_OPERATOR_ADDRESS','FAMILY_STATE_DIR','FAMILY_PRIOR_TX_FILE','FAMILY_PUBLISH_FILE','FAMILY_PORT','FAMILY_RPC')
foreach ($entry in $settings.PSObject.Properties) {
  if ($entry.Name -notin $allowed) { throw 'Unsupported configuration field. Only the separately bounded DPAPI live-test signer is supported.' }
  [Environment]::SetEnvironmentVariable($entry.Name,[string]$entry.Value,'Process')
}
# A shell that previously enabled signing cannot carry that permission into this launcher.
[Environment]::SetEnvironmentVariable('FAMILY_SIGNER_KEY_FILE',$null,'Process')
$stateDir = [IO.Path]::GetFullPath($env:FAMILY_STATE_DIR)
$serverFile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'server.mjs'))
$lockFile = Join-Path $stateDir 'process.lock'
$stopFile = Join-Path $stateDir 'stop.request'
$port = if ($env:FAMILY_PORT) { [int]$env:FAMILY_PORT } else { 5190 }
$workerId = 0
$workerProcess = $null
if (Test-Path -LiteralPath $lockFile) {
  $workerId = [int](Get-Content -LiteralPath $lockFile -Raw)
  $workerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $workerId"
  if ($workerProcess -and ($workerProcess.Name -ne 'node.exe' -or $workerProcess.CommandLine -notmatch 'server\.mjs')) {
    throw 'Lock points to an unexpected process. Manual review required.'
  }
}
if ($Action -eq 'Stop') {
  if (-not $workerProcess) { Write-Output 'Already stopped.'; exit 0 }
  Set-Content -LiteralPath $stopFile -Value $workerId -NoNewline
  Write-Output 'Graceful stop requested. The current neural measurement will finish before shutdown.'
  exit 0
}
if ($Action -eq 'Start' -and -not $workerProcess) {
  foreach ($key in @('FAMILY_PYTHON','FAMILY_GRAPH','FAMILY_ANNOTATIONS','FAMILY_PRIOR_TX_FILE','FAMILY_PUBLISH_FILE')) {
    $item = [Environment]::GetEnvironmentVariable($key,'Process')
    if (-not $item -or -not (Test-Path -LiteralPath $item)) { throw "Missing file for $key" }
  }
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
  # Only two exact control files inside the verified state directory are removed, never the ledger.
  foreach ($controlFile in @($lockFile,$stopFile)) {
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($controlFile)) -ne $stateDir) { throw 'Invalid control path' }
    if (Test-Path -LiteralPath $controlFile) { Remove-Item -LiteralPath $controlFile }
  }
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $started = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverFile + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDir "worker-$stamp.out.log") -RedirectStandardError (Join-Path $stateDir "worker-$stamp.err.log")
  $awakeScript = Join-Path $PSScriptRoot 'keep-awake.ps1'
  $awakeStatus = Join-Path $stateDir "awake-$($started.Id)-$stamp.json"
  Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-File',('"'+$awakeScript+'"'),'-WorkerId',$started.Id,'-StatusFile',('"'+$awakeStatus+'"')) -WindowStyle Hidden -RedirectStandardError (Join-Path $stateDir "awake-$stamp.err.log") | Out-Null
  $videoHelper=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../scripts/family-video-tunnel.ps1'))
  $videoShell=Get-Command pwsh -ErrorAction SilentlyContinue
  if ($videoShell -and (Test-Path -LiteralPath $videoHelper)) {
    Start-Process -FilePath $videoShell.Source -ArgumentList @('-NoProfile','-File',('"'+$videoHelper+'"'),'-WorkerId',$started.Id) -WindowStyle Hidden -RedirectStandardError (Join-Path $stateDir "video-helper-$stamp.err.log") | Out-Null
  }
  Write-Output "Started worker PID $($started.Id), bounded live test. Check Status after the graph loads."
  exit 0
}
try {
  $snapshot = Invoke-RestMethod -Uri "http://127.0.0.1:$port/state" -TimeoutSec 5
  $cameraAge = if ($snapshot.camera.asOf) { [math]::Round(([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($snapshot.camera.asOf)).TotalSeconds) } else { $null }
  [PSCustomObject]@{ PID=$workerId; ProcessRunning=[bool]$workerProcess; Chain=$snapshot.status; Camera=$snapshot.camera.status; CameraAgeSeconds=$cameraAge; Births=$snapshot.births.Count; Queue=$snapshot.queueDepth; LastNeuralReadout=$snapshot.neural.asOf; ObserverError=$snapshot.observerError } | ConvertTo-Json
} catch {
  [PSCustomObject]@{ PID=$workerId; ProcessRunning=[bool]$workerProcess; Status='HTTP unavailable or still starting' } | ConvertTo-Json
}
