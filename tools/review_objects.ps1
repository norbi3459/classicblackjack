# Contact sheet of redrawn objects: source crop | seed A | seed B, on a dark checkerboard
param([string]$Panel = "top", [int]$From = 0, [int]$Count = 12, [long[]]$Seeds = @(3, 7), [string]$Out)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$all = Get-Content "$root\artwork\scene\objects.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$objs = @($all | Where-Object { $_.panel -eq $Panel })
$sel = $objs | Select-Object -Skip $From -First $Count
$cell = 260; $cols = 1 + $Seeds.Count
$sheet = New-Object System.Drawing.Bitmap ([int](170 + $cols * ($cell + 8))), ([int]($sel.Count * ($cell + 8)))
$g = [System.Drawing.Graphics]::FromImage($sheet)
for ($y = 0; $y -lt $sheet.Height; $y += 16) { for ($x = 0; $x -lt $sheet.Width; $x += 16) {
  $c = if ((($x + $y) / 16) % 2 -eq 0) { [System.Drawing.Color]::FromArgb(58, 58, 66) } else { [System.Drawing.Color]::FromArgb(40, 40, 46) }
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $c), $x, $y, 16, 16) } }
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$f = New-Object System.Drawing.Font "Arial", 12, ([System.Drawing.FontStyle]::Bold)
$row = 0
foreach ($o in $sel) {
  $y0 = $row * ($cell + 8)
  $g.DrawString($o.id, $f, [System.Drawing.Brushes]::Yellow, 4, [float]($y0 + 4))
  $files = @("$root\artwork\scene\$Panel\$($o.id)_in.png") + ($Seeds | ForEach-Object { "$root\artwork\scene\$Panel\$($o.id)_s$_.png" })
  for ($i = 0; $i -lt $files.Count; $i++) {
    if (-not (Test-Path $files[$i])) { continue }
    $im = [System.Drawing.Image]::FromFile($files[$i])
    $s = [math]::Min($cell / $im.Width, $cell / $im.Height)
    $g.DrawImage($im, [int](170 + $i * ($cell + 8)), [int]$y0, [int]($im.Width * $s), [int]($im.Height * $s))
    $im.Dispose()
  }
  $row++
}
$g.Dispose(); $sheet.Save($Out); $sheet.Dispose()
"sheet: $($sel.Count) objects"
