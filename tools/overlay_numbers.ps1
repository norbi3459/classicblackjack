param(
  [string]$In,          # 2x master
  [string]$Numbers,     # json: [{ "n": "13", "x": 1240, "y": 1610, "r": 17 }] raw coords, r = disc radius
  [string]$Out,
  [double]$Scale = 2.0,
  [string]$Font = "Georgia",
  [int[]]$Disc = @(24, 30, 28),
  [int[]]$Ring = @(165, 160, 145),
  [int[]]$Ink = @(222, 208, 118)
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$nums = Get-Content $Numbers -Raw -Encoding UTF8 | ConvertFrom-Json
$src = New-Object System.Drawing.Bitmap $In
$bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, 0, 0, $src.Width, $src.Height); $src.Dispose()
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$discBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($Disc[0], $Disc[1], $Disc[2]))
$inkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($Ink[0], $Ink[1], $Ink[2]))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
foreach ($n in $nums) {
  $cx = [double]$n.x * $Scale; $cy = [double]$n.y * $Scale; $r = [double]$n.r * $Scale
  $ringPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($Ring[0], $Ring[1], $Ring[2])), ([float]([math]::Max(1.5, $r * 0.09)))
  $g.FillEllipse($discBrush, [float]($cx - $r), [float]($cy - $r), [float](2 * $r), [float](2 * $r))
  $g.DrawEllipse($ringPen, [float]($cx - $r), [float]($cy - $r), [float](2 * $r), [float](2 * $r))
  $txt = [string]$n.n
  $size = if ($txt.Length -ge 2) { $r * 1.05 } else { $r * 1.25 }
  $fnt = New-Object System.Drawing.Font $Font, ([float]$size), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $state = $g.Save()
  $g.TranslateTransform([float]$cx, [float]($cy + $r * 0.04))
  if ($txt.Length -ge 2) { $g.ScaleTransform([float]0.82, [float]1.0) }
  $g.DrawString($txt, $fnt, $inkBrush, [float]0, [float]0, $fmt)
  $g.Restore($state)
  $fnt.Dispose(); $ringPen.Dispose()
}
$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"numbers drawn: $($nums.Count) -> $Out"
