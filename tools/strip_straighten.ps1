param(
  [string]$In, [string]$Out,
  [double]$Scale = 2.0,          # source image scale relative to raw coords
  [double[]]$Lines,              # per strip: x0,y0,x1,y1 (raw coords), 4 values each
  [int]$HalfWidth = 20,          # raw px
  [int]$Zoom = 6
)
Add-Type -AssemblyName System.Drawing
$src = New-Object System.Drawing.Bitmap $In
$n = $Lines.Count / 4
$len = 0; for ($i = 0; $i -lt $n; $i++) { $dx = $Lines[4*$i+2]-$Lines[4*$i]; $dy = $Lines[4*$i+3]-$Lines[4*$i+1]; $len = [math]::Max($len, [math]::Sqrt($dx*$dx+$dy*$dy)) }
$colW = (2 * $HalfWidth + 1) * $Zoom; $H = [int]($len * $Zoom)
$sheet = New-Object System.Drawing.Bitmap ([int]($n * ($colW + 70) + 60)), ($H + 20)
$g = [System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::White)
$f = New-Object System.Drawing.Font "Arial", 11, ([System.Drawing.FontStyle]::Bold)
for ($s = 0; $s -lt $n; $s++) {
  $x0 = $Lines[4*$s]; $y0 = $Lines[4*$s+1]; $x1 = $Lines[4*$s+2]; $y1 = $Lines[4*$s+3]
  $L = [math]::Sqrt(($x1-$x0)*($x1-$x0)+($y1-$y0)*($y1-$y0)); $ux = ($x1-$x0)/$L; $uy = ($y1-$y0)/$L; $px = -$uy; $py = $ux
  $col = New-Object System.Drawing.Bitmap ([int](2*$HalfWidth+1)), ([int]$L)
  for ($t = 0; $t -lt [int]$L; $t++) { for ($k = -$HalfWidth; $k -le $HalfWidth; $k++) {
    $sx = ($x0 + $ux*$t + $px*$k) * $Scale; $sy = ($y0 + $uy*$t + $py*$k) * $Scale
    $ix = [int][math]::Round($sx); $iy = [int][math]::Round($sy)
    if ($ix -ge 0 -and $iy -ge 0 -and $ix -lt $src.Width -and $iy -lt $src.Height) { $col.SetPixel($k + $HalfWidth, $t, $src.GetPixel($ix, $iy)) }
  } }
  $ox = [int]($s * ($colW + 70) + 60)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($col, $ox, 10, $colW, [int]($L * $Zoom))
  $g.DrawString("T$($s+1)", $f, [System.Drawing.Brushes]::Black, [float]($ox + $colW/2 - 10), [float]0)
  for ($t = 0; $t -le [int]$L; $t += 10) {
    $yy = [float](10 + $t * $Zoom)
    $g.DrawLine([System.Drawing.Pens]::Gray, [float]($ox + $colW), $yy, [float]($ox + $colW + 8), $yy)
    if ($t % 20 -eq 0) { $g.DrawString("$t", $f, [System.Drawing.Brushes]::Gray, [float]($ox + $colW + 10), [float]($yy - 8)) }
  }
  $col.Dispose()
}
$g.Dispose(); $sheet.Save($Out); $sheet.Dispose(); $src.Dispose()
"ok"

