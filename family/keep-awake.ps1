param(
  [Parameter(Mandatory=$true)][int]$WorkerId,
  [Parameter(Mandatory=$true)][string]$StatusFile
)
$ErrorActionPreference = 'Stop'
$worker = Get-Process -Id $WorkerId -ErrorAction Stop
if ($worker.ProcessName -ne 'node') { throw 'Expected the FLYFAMILY Node worker' }
$startedTicks = $worker.StartTime.ToUniversalTime().Ticks
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class FlyFamilyAwake {
  [DllImport("kernel32.dll", SetLastError=true)]
  private static extern uint SetThreadExecutionState(uint flags);
  public static void Hold(int pid, long ticks, string statusFile) {
    using (var mutex = new Mutex(false, "Local\\FLYFAMILY-Awake-" + pid + "-" + ticks)) {
      bool owned = false;
      try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
      if (!owned) return;
      bool awake = false;
      try {
        // ES_SYSTEM_REQUIRED only: the monitor may still turn off normally.
        if (SetThreadExecutionState(0x80000001u) == 0) throw new Exception("Power request failed");
        awake = true;
        while (!File.Exists(statusFile + ".stop")) {
          try {
            using (var worker = Process.GetProcessById(pid)) {
              if (worker.ProcessName != "node" || worker.StartTime.ToUniversalTime().Ticks != ticks) break;
            }
          } catch (ArgumentException) { break; }
          File.WriteAllText(statusFile, "{\"helperPid\":" + Process.GetCurrentProcess().Id + ",\"workerPid\":" + pid + ",\"active\":true,\"asOf\":\"" + DateTime.UtcNow.ToString("o") + "\"}");
          Thread.Sleep(15000);
        }
      } finally {
        if (awake) SetThreadExecutionState(0x80000000u);
        File.WriteAllText(statusFile, "{\"workerPid\":" + pid + ",\"active\":false}");
        mutex.ReleaseMutex();
      }
    }
  }
}
'@
[FlyFamilyAwake]::Hold($WorkerId,$startedTicks,[IO.Path]::GetFullPath($StatusFile))
