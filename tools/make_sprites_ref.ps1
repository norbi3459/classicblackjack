$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$d = "$root\artwork\sprites"
$qwen = "$PSScriptRoot\qwen_edit.ps1"
$style = " Keep the plain light cream reel background of image 1, centered, same size as the plum. Remove everything else."
$jobs = @(
  @("szolo", "$d\ref_szolo.png", "Replace the plum in image 1 with the red grape bunch exactly as it looks in image 2: the same wide, flat, horizontal oval cluster of glossy round red berries, the same golden-orange outline with the small yellow stem on the top left, the same airbrushed shading and highlights."),
  @("korte", "$d\ref_korte.png", "Replace the plum in image 1 with a yellow-green pear lying on its side and tilted slightly, its narrow top pointing up to the right with a dark green leaf on the top right, like the pears in image 2. Draw it in the same style as the plum in image 1: airbrushed shading, glossy highlights, brownish-orange outline and a light cream border band.")
)
foreach ($j in $jobs) {
  foreach ($s in 5, 17, 23) {
    $o = "$d\$($j[0])_ref$s.png"
    if (Test-Path $o) { continue }
    & $qwen -In "$d\szilva_in.png" -Ref $j[1] -Out $o -Prompt ($j[2] + $style) -Seed $s | Out-Null
    "$($j[0]) seed $s done"
  }
}
"REF DONE"
