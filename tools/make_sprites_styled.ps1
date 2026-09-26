$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = "$root\artwork\sprites"
$qwen = "$PSScriptRoot\qwen_edit.ps1"
$ref = "$out\szilva_in.png"
$style = "Draw it in exactly the same style as the plum in image 2: the same airbrushed painted shading, the same thick brownish-orange outline, the same light cream outer border band around the whole shape, the same soft glossy highlights. Centered on the plain light cream reel background of image 1, same size. Remove everything else."
$jobs = @(
  @("cseresznye", "Replace the plum in image 1 with a pair of two shiny red cherries joined by green stems with a small green leaf. "),
  @("korte", "Replace the plum in image 1 with a yellow-green pear with a short brown stem and a small green leaf. "),
  @("szolo", "Replace the plum in image 1 with a bunch of shiny red grapes with a small green leaf on top. "),
  @("alma", "Replace the plum in image 1 with a shiny red apple with a short stem and a green leaf. ")
)
foreach ($j in $jobs) {
  foreach ($s in 5, 17) {
    $o = "$out\$($j[0])_st$s.png"
    if (Test-Path $o) { continue }
    & $qwen -In "$out\szilva_in.png" -Ref $ref -Out $o -Prompt ($j[1] + $style) -Seed $s | Out-Null
    "$($j[0]) seed $s done"
  }
}
"STYLED DONE"
