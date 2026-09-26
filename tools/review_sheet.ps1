param([string]$Dir, [string]$Elements, [string]$Out, [long[]]$Seeds = @(42, 7), [int]$CellH = 220, [string[]]$Only = @())
Add-Type -AssemblyName System.Drawing
$els = Get-Content $Elements -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Only.Count -gt 0) { $els = $els | Where-Object { $Only -contains $_.name } }
$cols = 1 + $Seeds.Count
$rows = @()
foreach ($e in $els) {
  $paths = @("$Dir\$($e.name)_crop.png") + ($Seeds | ForEach-Object { "$Dir\$($e.name)_s$($_).png" })
  $cw = [int]([math]::Min(560, $CellH * $e.w / $e.h))
  $rows += @{ name = $e.name; paths = $paths; cw = $cw; ch = [int]($cw * $e.h / $e.w) }
}
$maxW = ($rows | ForEach-Object { $_.cw } | Measure-Object -Maximum).Maximum
$totalH = 0; foreach ($r in $rows) { $totalH += $r.ch + 26 }
$sheetW = [int](160 + $cols * ($maxW + 8)); $sheetH = [int]$totalH
$sheet = New-Object System.Drawing.Bitmap $sheetW, $sheetH
$g = [System.Drawing.Graphics]::FromImage($sheet); $g.Clear([System.Drawing.Color]::White)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$f = New-Object System.Drawing.Font "Arial", 11, ([System.Drawing.FontStyle]::Bold)
$y = 0
foreach ($r in $rows) {
  $g.DrawString($r.name, $f, [System.Drawing.Brushes]::Black, 4, [float]($y + 4))
  for ($i = 0; $i -lt $r.paths.Count; $i++) {
    if (-not (Test-Path $r.paths[$i])) { continue }
    $im = [System.Drawing.Image]::FromFile($r.paths[$i])
    $g.DrawImage($im, [int](160 + $i * ($maxW + 8)), [int]($y + 22), [int]$r.cw, [int]$r.ch)
    $im.Dispose()
  }
  $y += $r.ch + 26
}
$g.Dispose(); $sheet.Save($Out); $sheet.Dispose()
"sheet $sheetW x $sheetH"
