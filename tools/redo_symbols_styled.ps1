# Redraws the reel symbols in the style of the ones the owner likes (lemon, star): image1 = the symbol,
# image2 = lemon + star as the style sample. Output on green chroma, then keyed out.
param([string[]]$Only = @(), [long[]]$Seeds = @(11, 23, 37))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = "$root\game\assets\sprites"
$work = "$root\artwork\symbols_v2"
New-Item -ItemType Directory -Force $work | Out-Null
$desc = @{
  szilva = "an oval, slightly egg-shaped dark blue-purple plum with a faint vertical groove and a short brown stem";
  narancs = "a round orange with a small green leaf at the top";
  alma = "a shiny deep red apple with a short brown stem and one green leaf";
  szolo = "a bunch of shiny red grapes, upright, with a small stem";
  korte = "a yellow-green pear standing upright with a dark green leaf";
  cseresznye = "a pair of two shiny red cherries joined by green stems";
  csengo = "a golden bell with a small clapper";
  dinnye = "a whole round green striped watermelon with a wedge cut out showing the red flesh and black seeds"
}
# style sample: the lemon and the star side by side on green
$refPath = "$work\_style_ref.png"
if (-not (Test-Path $refPath)) {
  $rb = New-Object System.Drawing.Bitmap 1024, 512
  $rg = [System.Drawing.Graphics]::FromImage($rb); $rg.Clear([System.Drawing.Color]::FromArgb(0, 255, 0))
  $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $i = 0
  foreach ($n in @("citrom", "csillag")) {
    $im = [System.Drawing.Image]::FromFile("$src\$n.png")
    $sc = [math]::Min(420 / $im.Width, 420 / $im.Height)
    $w = [int]($im.Width * $sc); $h = [int]($im.Height * $sc)
    $rg.DrawImage($im, [int](256 + 512 * $i - $w / 2), [int](256 - $h / 2), $w, $h); $im.Dispose(); $i++
  }
  $rg.Dispose(); $rb.Save($refPath); $rb.Dispose()
}
foreach ($n in $desc.Keys) {
  if ($Only.Count -and $Only -notcontains $n) { continue }
  # start from the liked lemon itself: the model keeps its drawing style and only changes the fruit
  $S = 768
  $b = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(0, 255, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $im = [System.Drawing.Image]::FromFile("$src\citrom.png")
  $scale = [math]::Min(560 / $im.Width, 560 / $im.Height)
  $w = [int]($im.Width * $scale); $h = [int]($im.Height * $scale)
  $g.DrawImage($im, [int](($S - $w) / 2), [int](($S - $h) / 2), $w, $h); $im.Dispose(); $g.Dispose()
  $in = "$work\_lemon_in.png"; $b.Save($in); $b.Dispose()
  $p = "Turn this lemon into $($desc[$n]). Keep exactly the same drawing style as the lemon: the same thin warm brown outline, " +
    "the same smooth soft airbrushed shading, the same soft glossy white highlight on the upper left, the same lighting and the same clean cartoon look. " +
    "Only the fruit changes. Upright, centred, complete, nothing cut off, no face, no text. " +
    "The background stays a pure flat bright green (#00FF00)."
  foreach ($s in $Seeds) {
    $raw = "$work\${n}_L${s}_raw.png"
    if (-not (Test-Path $raw)) { & "$PSScriptRoot\qwen_edit.ps1" -In $in -Out $raw -Prompt $p -Seed $s | Out-Null }
    & "$PSScriptRoot\chromakey.ps1" -In $raw -Out "$work\${n}_L$s.png"
  }
  "$n done"
}
"SYMBOLS V2 DONE"
