# Redraws every reel symbol crisp and complete on a green chroma background, then keys it out.
param([string[]]$Only = @(), [long[]]$Seeds = @(3, 7))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = "$root\game\assets\sprites"
$work = "$root\artwork\symbols_hd"
New-Item -ItemType Directory -Force $work | Out-Null
$desc = @{
  szilva = "a dark blue-purple plum with a short stem"; citrom = "a yellow lemon"; narancs = "an orange";
  dinnye = "a whole green striped watermelon with a slice cut out showing the red flesh"; alma = "a deep bright cherry-red shiny apple (strong saturated red, no yellow or green on the skin) with a short brown stem and a green leaf";
  szolo = "a flat horizontal bunch of shiny red grapes with a small stem"; korte = "a yellow-green pear lying on its side, slightly tilted, with a dark green leaf";
  cseresznye = "a pair of two shiny red cherries joined by green stems"; csillag = "a red five-pointed star"; csengo = "a golden bell";
  bar = "a 'BAR' sign: white bold letters on a dark plate with a golden frame"
}
foreach ($n in $desc.Keys) {
  if ($Only.Count -and $Only -notcontains $n) { continue }
  # current sprite centred on flat green, with room around it
  $im = [System.Drawing.Image]::FromFile("$src\$n.png")
  $S = 768; $scale = [math]::Min(560 / $im.Width, 560 / $im.Height)
  $b = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(0, 255, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $w = [int]($im.Width * $scale); $h = [int]($im.Height * $scale)
  $g.DrawImage($im, [int](($S - $w) / 2), [int](($S - $h) / 2), $w, $h); $g.Dispose(); $im.Dispose()
  $in = "$work\${n}_in.png"; $b.Save($in); $b.Dispose()
  $p = "Redraw this slot-machine reel symbol, $($desc[$n]), as a clean, crisp, high-resolution printed artwork symbol in the classic fruit-machine style: " +
    "bold dark outline, a thin light cream outer border band, smooth airbrushed shading and glossy highlights. Keep its colors, pose and proportions. " +
    "Draw the whole object complete, nothing cut off, centred. Remove any leftover background, frame or shadow pieces around it. " +
    "The background must be a pure flat bright green (#00FF00) chroma-key background."
  foreach ($s in $Seeds) {
    $raw = "$work\${n}_s${s}_raw.png"
    if (-not (Test-Path $raw)) { & "$PSScriptRoot\qwen_edit.ps1" -In $in -Out $raw -Prompt $p -Seed $s | Out-Null }
    & "$PSScriptRoot\chromakey.ps1" -In $raw -Out "$work\${n}_s$s.png"
  }
  "$n done"
}
"SYMBOLS DONE"

