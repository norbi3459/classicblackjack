param(
  [string]$Panel,                 # source texture (2048 layout px)
  [int[]]$Rect,                   # x,y,w,h of the object in layout px
  [double]$Pad = 0.25,            # context padding (fraction of the larger side)
  [string]$What,                  # description of the object (and what to change/remove on it)
  [ValidateSet("green", "blue", "magenta")] [string]$Key = "green",
  [string]$OutDir,
  [string]$Name,
  [long[]]$Seeds = @(3)
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$qwen = Join-Path $PSScriptRoot "qwen_edit.ps1"
$keyText = @{ green = "pure flat bright green (#00FF00) chroma-key"; blue = "pure flat bright blue (#0000FF) chroma-key"; magenta = "pure flat magenta (#FF00FF) chroma-key" }[$Key]
New-Item -ItemType Directory -Force $OutDir | Out-Null

$src = [System.Drawing.Image]::FromFile($Panel)
$p = [int]([math]::Max($Rect[2], $Rect[3]) * $Pad)
$cx = [math]::Max(0, $Rect[0] - $p); $cy = [math]::Max(0, $Rect[1] - $p)
$cw = [math]::Min($src.Width - $cx, $Rect[2] + 2 * $p); $ch = [math]::Min($src.Height - $cy, $Rect[3] + 2 * $p)
$crop = "$OutDir\${Name}_in.png"
$bmp = New-Object System.Drawing.Bitmap $cw, $ch
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $cw, $ch), (New-Object System.Drawing.Rectangle $cx, $cy, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose(); $bmp.Save($crop); $bmp.Dispose(); $src.Dispose()

$prompt = "This is a blurry photo crop of a backlit printed slot-machine glass panel. Extract only the object in the center: $What " +
  "Redraw it as a clean, crisp, high-resolution printed artwork element: sharp edges, clean colors, smooth airbrushed gradients, crisp outlines, perfectly legible lettering. " +
  "Keep exactly its original shape, proportions, colors, lettering and style, same size and position. " +
  "Remove everything around it: replace the whole surrounding background with a $keyText background. No shadow, no glow on the background, no frame."
foreach ($s in $Seeds) {
  $raw = "$OutDir\${Name}_s${s}_raw.png"
  if (-not (Test-Path $raw)) { & $qwen -In $crop -Out $raw -Prompt $prompt -Seed $s | Out-Null }
  $boxFile = "$OutDir\${Name}_s$s.box"
  & (Join-Path $PSScriptRoot "chromakey.ps1") -In $raw -Out "$OutDir\${Name}_s$s.png" -BoxOut $boxFile
  # sprite rect in layout px = trim box (fractions of the crop) mapped onto the crop
  $f = (Get-Content $boxFile).Split(" ") | ForEach-Object { [double]::Parse($_, [System.Globalization.CultureInfo]::InvariantCulture) }
  $rx = $cx + $f[0] * $cw; $ry = $cy + $f[1] * $ch; $rw = ($f[2] - $f[0]) * $cw; $rh = ($f[3] - $f[1]) * $ch
  ("{0:0.0} {1:0.0} {2:0.0} {3:0.0}" -f $rx, $ry, $rw, $rh).Replace(",", ".") | Set-Content $boxFile -Encoding ascii
}
"isolated $Name"
