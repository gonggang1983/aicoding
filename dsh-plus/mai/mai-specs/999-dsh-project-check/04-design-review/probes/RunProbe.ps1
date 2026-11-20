# Isolated design experiment only; no package installation or production code.
param([switch]$KeepArtifacts, [switch]$Strict)
$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 8) { throw 'Probe requires x64 PowerShell.' }
$source = Join-Path $PSScriptRoot 'G03Probe.cs'
Add-Type -Path $source

function Remove-SyntheticTree([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Cleanup refused: reparse point remains at $Path"
    }
    if ($item.PSIsContainer) {
        foreach ($child in @(Get-ChildItem -LiteralPath $Path -Force)) {
            Remove-SyntheticTree $child.FullName
        }
        [IO.Directory]::Delete($Path, $false)
    } else { [IO.File]::Delete($Path) }
}

$runs = @()
foreach ($suffix in @('ascii', '中文 space')) {
    $root = Join-Path $env:TEMP ('g03-probe-' + [guid]::NewGuid().ToString('N') + '-' + $suffix)
    $rows = if ($Strict) { @([G03Probe]::RunStrict($root)) } else { @([G03Probe]::Run($root)) }
    # This traversal is only cleanup for the owned synthetic fixture, not a security provider.
    $removed = $false
    if (-not $KeepArtifacts) { Remove-SyntheticTree $root; $removed = -not (Test-Path -LiteralPath $root) }
    $runs += [pscustomobject]@{ root=$root; rows=$rows; artifactsRemoved=$removed }
}
[pscustomobject]@{
    mode=$(if ($Strict) { 'strict-share-read-only' } else { 'original-share-read-write' })
    utc=[DateTime]::UtcNow.ToString('o')
    os=[Environment]::OSVersion.Version.ToString()
    processBits=([IntPtr]::Size * 8)
    powershell=$PSVersionTable.PSVersion.ToString()
    sourceSha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    runs=$runs
    limitations=@('No real DSH host', 'No full volume-to-target chain proof', 'No cancellation or crash injection', 'No concurrent multi-process publication stress')
} | ConvertTo-Json -Depth 6
