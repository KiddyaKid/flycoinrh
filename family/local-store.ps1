function Initialize-FlyFamilyStore {
  param([Parameter(Mandatory=$true)][string]$Path)
  $directory=[IO.Directory]::CreateDirectory($Path)
  if(($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_STORE_DENIED'}
  $user=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  # Read and modify only the DACL. Setting the owner can require SeRestorePrivilege.
  $access=$directory.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
  $rules=@($access.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $correct=$access.AreAccessRulesProtected -and $rules.Count -eq 2
  foreach($sid in @($user,$system)){
    $matching=@($rules | Where-Object {
      $_.IdentityReference.Value -eq $sid.Value -and
      $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
      $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and
      $_.InheritanceFlags -eq ([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit) -and
      $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None
    })
    if($matching.Count -ne 1){$correct=$false}
  }
  if(-not $correct){
    $access.SetAccessRuleProtection($true,$false)
    foreach($rule in @($access.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){[void]$access.RemoveAccessRuleSpecific($rule)}
    foreach($sid in @($user,$system)){
      $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
      $access.AddAccessRule($rule)
    }
    $directory.SetAccessControl($access)
  }
}

function Test-FlyFamilyStore {
  param([Parameter(Mandatory=$true)][string]$Path)
  Initialize-FlyFamilyStore -Path $Path
  $probe=Join-Path $Path ('check-'+[Guid]::NewGuid().ToString('N')+'.dpapi')
  $secret=$null; $recovered=$null
  try {
    $secret=ConvertTo-SecureString 'FLYFAMILY storage check only' -AsPlainText -Force
    $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $probe -NoNewline
    $recovered=Get-Content -LiteralPath $probe -Raw | ConvertTo-SecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($recovered)
    try {if([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) -ne 'FLYFAMILY storage check only'){throw 'DPAPI_CHECK_FAILED'}}
    finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  } finally {
    if($secret){$secret.Dispose()}; if($recovered){$recovered.Dispose()}
    if(Test-Path -LiteralPath $probe){Remove-Item -LiteralPath $probe}
  }
}
