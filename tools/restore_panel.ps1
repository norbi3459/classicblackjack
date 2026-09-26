param(
  [string]$Dir,
  [string]$PromptFile,
  [string]$OutSub = "restored_v2",
  [long]$Seed = 42
)
$ErrorActionPreference = "Stop"
$qwen = Join-Path $PSScriptRoot "qwen_edit.ps1"
$align = Join-Path $PSScriptRoot "align.ps1"
$prompt = Get-Content $PromptFile -Raw -Encoding UTF8
$m = Get-Content "$Dir\manifest.json" -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force "$Dir\$OutSub" | Out-Null
$i = 0
foreach ($t in $m.tiles) {
  $i++
  $raw = "$Dir\$OutSub\raw_$($t.name)"
  $out = "$Dir\$OutSub\$($t.name)"
  if (Test-Path $out) { "[$i/$($m.tiles.Count)] skip $($t.name)"; continue }
  if (-not (Test-Path $raw)) { & $qwen -In "$Dir\tiles\$($t.name)" -Out $raw -Prompt $prompt -Seed $Seed | Out-Null }
  $r = & $align -Ref "$Dir\tiles\$($t.name)" -Img $raw -Out $out
  "[$i/$($m.tiles.Count)] $($t.name)  $r"
}
"DONE $Dir"
