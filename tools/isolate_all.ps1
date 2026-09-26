param([long[]]$Seeds = @(3, 7), [string[]]$Only = @())
$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
$objs = Get-Content "$root\artwork\scene\objects.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$panels = @{ top = "$root\game\assets\top_glass.png"; reel = "$root\game\assets\reel_glass.png" }
$i = 0
foreach ($o in $objs) {
  $i++
  if ($Only.Count -and $Only -notcontains $o.id) { continue }
  $od = "$root\artwork\scene\$($o.panel)"
  $done = $true
  foreach ($s in $Seeds) { if (-not (Test-Path "$od\$($o.id)_s$s.png")) { $done = $false } }
  if ($done) { continue }
  try {
    & "$PSScriptRoot\isolate.ps1" -Panel $panels[$o.panel] -Rect ([int[]]$o.rect) -Pad $o.pad -What $o.what -Key $o.key -OutDir $od -Name $o.id -Seeds $Seeds | Out-Null
    "[$i/$($objs.Count)] $($o.panel)/$($o.id) ok"
  } catch { "[$i/$($objs.Count)] $($o.panel)/$($o.id) FAILED: $($_.Exception.Message)" }
}
"ISOLATE DONE"
