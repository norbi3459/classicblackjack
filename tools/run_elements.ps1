param(
  [string]$Panel,          # raw panel texture (source pixels)
  [string]$Elements,       # elements json
  [string]$OutDir,
  [long[]]$Seeds = @(42, 7),
  [string[]]$Only = @(),
  [ValidateSet("preserve", "redraw", "edit", "vector")] [string]$Style = "preserve",
  [double]$OutScale = 2.0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$qwen = Join-Path $PSScriptRoot "qwen_edit.ps1"
$align = Join-Path $PSScriptRoot "align.ps1"
if ($Style -eq "vector") {
  $prefix = "Redraw this blurry photo crop of a printed slot-machine glass panel as clean, crisp, high-resolution vector-style print artwork, " +
    "like the original printer's artwork file: razor-sharp edges, clean solid color fills with smooth airbrushed gradients, crisp outlines, " +
    "perfectly legible lettering. Keep exactly the same layout, composition, sizes, positions, shapes, colors and glow; do not move, zoom, crop, add or remove anything; " +
    "do not add any text that is not already there. Remove all photographic blur, noise, glare, reflections and texture. "
} elseif ($Style -eq "edit") {
  $prefix = "Text edit on a photo of a printed slot-machine sign. "
} elseif ($Style -eq "redraw") {
  $prefix = "Restore this photo of a backlit printed slot-machine glass panel into clean, sharp, high-resolution print artwork. " +
    "Keep exactly the same layout, shapes, colors, glow and style; do not move, add or remove anything. Remove blur, noise, glare and artifacts. " +
    "Redraw all blurry lettering as crisp, clean printed letters, correctly spelled: "
} else {
  $prefix = "Restore this blurry photo crop of a backlit printed slot-machine glass sign into clean, sharp, high-resolution print artwork. " +
    "Keep exactly the same composition, size, position, shapes, colors, outlines, glow and background; do not move, zoom, crop, add or remove anything. " +
    "Do not add any text or objects that are not already there. Remove blur, noise, glare and compression artifacts. "
}
$els = Get-Content $Elements -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force $OutDir | Out-Null
$src = [System.Drawing.Image]::FromFile($Panel)
foreach ($e in $els) {
  if ($Only.Count -gt 0 -and $Only -notcontains $e.name) { continue }
  $crop = "$OutDir\$($e.name)_crop.png"
  if (-not (Test-Path $crop)) {
    $bmp = New-Object System.Drawing.Bitmap ([int]$e.w), ([int]$e.h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, ([int]$e.w), ([int]$e.h)), (New-Object System.Drawing.Rectangle ([int]$e.x), ([int]$e.y), ([int]$e.w), ([int]$e.h)), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $bmp.Save($crop); $bmp.Dispose()
  }
  foreach ($s in $Seeds) {
    $raw = "$OutDir\$($e.name)_s${s}_raw.png"
    $al = "$OutDir\$($e.name)_s${s}.png"
    if (Test-Path $al) { continue }
    if (-not (Test-Path $raw)) { & $qwen -In $crop -Out $raw -Prompt ($prefix + $e.text) -Seed $s | Out-Null }
    $r = & $align -Ref $crop -Img $raw -Out $al -OutScale $OutScale
    "$($e.name) seed $s : $r"
  }
}
$src.Dispose()
"ELEMENTS DONE"
