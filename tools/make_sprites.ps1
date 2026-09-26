$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$tex = "$root\3d\textures\reel_glass_final.png"     # 4096 x 2320 (2x of the 2048 layout)
$out = "$root\artwork\sprites"
New-Item -ItemType Directory -Force $out | Out-Null
$qwen = "$PSScriptRoot\qwen_edit.ps1"

# name, center x/y in 2048-layout coords, prompt
$jobs = @(
  @("szilva",  865, 470, "Show only the dark purple plum, centered, on the plain light cream reel background. Keep the plum exactly as it is: same shape, colors, outline, highlights and painted style. Remove everything else. Sharpen."),
  @("citrom", 1175, 470, "Show only the yellow lemon, centered, on the plain light cream reel background. Keep the lemon exactly as it is: same shape, colors, outline, highlights and painted style. Remove everything else. Sharpen."),
  @("narancs", 545, 665, "Show only the orange fruit, centered, on the plain light cream reel background. Keep the orange exactly as it is: same shape, colors, outline, highlights and painted style. Remove everything else. Sharpen."),
  @("dinnye",  545, 470, "Remove the small playing card on the right. Show only the watermelon, centered, on the plain light cream reel background. Keep the watermelon exactly as it is: same shape, colors, outline and painted style. Sharpen."),
  @("csillag", 545, 568, "Remove the small playing card on the right and the thin horizontal line. Show only the red star, centered, on the plain light cream reel background. Keep the star exactly as it is: same shape, colors, outline and painted style. Sharpen."),
  @("alma",    865, 568, "Remove the small playing card on the right and the thin horizontal line. Show only the red apple with its green leaf, centered, on the plain light cream reel background. Keep the apple exactly as it is: same shape, colors, outline and painted style. Sharpen."),
  @("csengo",  865, 665, "Show only the golden bell, centered, on the plain light cream reel background. Keep the bell exactly as it is: same shape, colors, outline, highlights and painted style. Remove everything else. Sharpen."),
  @("bar",    1175, 670, "Show only the 'BAR' sign, centered, on the plain light cream reel background. Keep it exactly as it is: same shape, colors, lettering and style. Remove everything else. Sharpen."),
  @("cseresznye", 865, 470, "Replace the plum with a pair of two shiny red cherries joined by green stems with a small green leaf, drawn in exactly the same painted cartoon style, same thick dark outline, same lighting and highlights, same size and position, on the plain light cream reel background. Remove everything else."),
  @("korte",   865, 470, "Replace the plum with a yellow-green pear with a short brown stem and a small green leaf, drawn in exactly the same painted cartoon style, same thick dark outline, same lighting and highlights, same size and position, on the plain light cream reel background. Remove everything else."),
  @("szolo",   865, 470, "Replace the plum with a bunch of shiny red grapes with a small green leaf on top, drawn in exactly the same painted cartoon style, same thick dark outline, same lighting and highlights, same size and position, on the plain light cream reel background. Remove everything else.")
)
$src = [System.Drawing.Image]::FromFile($tex)
foreach ($j in $jobs) {
  $name = $j[0]; $cx = [int]$j[1] * 2; $cy = [int]$j[2] * 2
  $w = 460; $h = 260
  $crop = "$out\${name}_in.png"
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), (New-Object System.Drawing.Rectangle ([int]($cx - $w / 2)), ([int]($cy - $h / 2)), $w, $h), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $bmp.Save($crop); $bmp.Dispose()
  foreach ($s in 3, 11) {
    $o = "$out\${name}_s$s.png"
    if (Test-Path $o) { continue }
    & $qwen -In $crop -Out $o -Prompt ("Edit this crop of a slot-machine reel. " + $j[3]) -Seed $s | Out-Null
    "$name seed $s done"
  }
}
$src.Dispose()
"SPRITES DONE"
