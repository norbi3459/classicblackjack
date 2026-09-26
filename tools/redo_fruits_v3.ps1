# Candidates for the fruits whose new version the owner rejected (orange, plum, cherries, grapes, watermelon).
# A: the old sprite (true to the machine's shapes) cleaned up in the lemon's style, without the thick border band.
# B: the liked lemon turned into the fruit, with the machine's shape described exactly.
param([string[]]$Only = @(), [long[]]$Seeds = @(5, 19))
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$old = "$root\artwork\sprites_old"
$lemon = "$root\game\assets\sprites\citrom.png"
$work = "$root\artwork\symbols_v3"
New-Item -ItemType Directory -Force $work | Out-Null
$shape = @{
  szilva = "a dark blue-purple plum lying on its side: a horizontal oval, a little pointed at the right end, like the lemon's shape";
  narancs = "an orange lying on its side: a slightly horizontal oval with a small navel dimple at the right end";
  cseresznye = "two round shiny red cherries side by side, their green stems joined at the top in a V, with one green leaf";
  szolo = "a wide, flat bunch of round shiny red grapes lying horizontally (wider than tall), with a short stem at the top";
  dinnye = "a whole green striped watermelon lying horizontally, its left end cut off flat showing a round red face with a light rind ring"
}
function OnGreen($path, $out) {
  $im = [System.Drawing.Image]::FromFile($path)
  $S = 768; $scale = [math]::Min(560 / $im.Width, 560 / $im.Height)
  $b = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::FromArgb(0, 255, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $w = [int]($im.Width * $scale); $h = [int]($im.Height * $scale)
  $g.DrawImage($im, [int](($S - $w) / 2), [int](($S - $h) / 2), $w, $h); $g.Dispose(); $im.Dispose()
  $b.Save($out); $b.Dispose()
}
$lemonIn = "$work\_lemon_in.png"
if (-not (Test-Path $lemonIn)) { OnGreen $lemon $lemonIn }
$style = "a clean smooth cartoon illustration: thin warm brown outline, smooth soft airbrushed shading, one soft glossy white highlight at the upper left, rich saturated colours"
foreach ($n in $shape.Keys) {
  if ($Only.Count -and $Only -notcontains $n) { continue }
  $inA = "$work\${n}_A_in.png"; OnGreen "$old\$n.png" $inA
  $pA = "Redraw this fruit-machine reel symbol ($($shape[$n])) keeping exactly its shape, pose and orientation, as $style. " +
    "Remove the thick orange or cream border band around it: no border, no frame, no shadow. Complete, nothing cut off, no face, no text. " +
    "The background must be a pure flat bright green (#00FF00)."
  $pB = "Turn this lemon into $($shape[$n]). Keep exactly the same drawing style as the lemon: $style. " +
    "Only the fruit changes. Complete, nothing cut off, no face, no text. The background stays a pure flat bright green (#00FF00)."
  foreach ($s in $Seeds) {
    foreach ($v in @("A", "B")) {
      $raw = "$work\${n}_${v}${s}_raw.png"
      $in = if ($v -eq "A") { $inA } else { $lemonIn }
      $p = if ($v -eq "A") { $pA } else { $pB }
      if (-not (Test-Path $raw)) { & "$PSScriptRoot\qwen_edit.ps1" -In $in -Out $raw -Prompt $p -Seed $s | Out-Null }
      & "$PSScriptRoot\chromakey.ps1" -In $raw -Out "$work\${n}_${v}${s}.png"
    }
  }
  "$n done"
}
"FRUITS V3 DONE"
