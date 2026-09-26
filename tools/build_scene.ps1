# Collects the redrawn object sprites into game/assets/objects and writes game/scene.js
param([double]$Res = 2.0)   # sprite pixels per layout pixel
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$objs = Get-Content "$root\artwork\scene\objects.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$picksFile = "$root\artwork\scene\picks.json"
$picks = @{}
if (Test-Path $picksFile) { (Get-Content $picksFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $picks[$_.Name] = $_.Value } }
$outDir = "$root\game\assets\objects"
New-Item -ItemType Directory -Force $outDir | Out-Null
$inv = [System.Globalization.CultureInfo]::InvariantCulture
# objects whose fitted position is not trusted (their photo region differs too much from the redrawn sprite)
$noFit = [System.Collections.Generic.HashSet[string]]::new([string[]]@("reelFrame", "cardWheelFrame", "wheelDisc", "helpsBanner", "rowBar"))
# windows cut out of frame sprites (layout px, rounded rect x,y,w,h,r) so the reels show through
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class HoleFill {
    // clears the window-fill colour left around a cut-out window: flood from the (already transparent) centre
    // through transparent pixels and pixels close to the fill colour found at the window edge
    public static void Clear(Bitmap b, int cx, int cy, int tol) {
        int W = b.Width, H = b.Height;
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int st = d.Stride; byte[] p = new byte[st * H]; Marshal.Copy(d.Scan0, p, 0, p.Length);
        bool[] seen = new bool[W * H]; Queue<int> q = new Queue<int>();
        q.Enqueue(cy * W + cx); seen[cy * W + cx] = true;
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % W, y = i / W, o = y * st + x * 4;
            bool clear = p[o + 3] < 20;
            if (!clear) {
                // the window fill is purple/magenta/blue: blue channel clearly above green
                int B = p[o], G = p[o + 1], R = p[o + 2];
                bool fill = B > G + 35 && (R > G + 10 || B > 150);
                if (!fill) continue;
                p[o + 3] = 0;
            }
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                int j = ny * W + nx; if (seen[j]) continue; seen[j] = true; q.Enqueue(j);
            }
        }
        Marshal.Copy(p, 0, d.Scan0, p.Length); b.UnlockBits(d);
    }
    // the see-through window of a frame: flood from the centre over transparent pixels.
    // Saves a white mask (grown by 'grow' px, cropped to the window box) and returns
    // box x0,y0,x1,y1 (sprite px) and the window's tilt angle (radians, from second moments).
    public static double[] Window(Bitmap b, int cx, int cy, int grow, string maskPath) {
        int W = b.Width, H = b.Height;
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int st = d.Stride; byte[] p = new byte[st * H]; Marshal.Copy(d.Scan0, p, 0, p.Length); b.UnlockBits(d);
        bool[] win = new bool[W * H]; Queue<int> q = new Queue<int>();
        q.Enqueue(cy * W + cx); win[cy * W + cx] = true;
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        double sx = 0, sy = 0, n = 0;
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % W, y = i / W; sx += x; sy += y; n++;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                int j = ny * W + nx; if (win[j]) continue;
                if (p[ny * st + nx * 4 + 3] > 60) continue;
                win[j] = true; q.Enqueue(j);
            }
        }
        double mx = sx / n, my = sy / n, cxx = 0, cyy = 0, cxy = 0;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) if (win[y * W + x]) { double ex = x - mx, ey = y - my; cxx += ex * ex; cyy += ey * ey; cxy += ex * ey; }
        // angle of the long (vertical) axis from vertical
        double ang = 0.5 * Math.Atan2(2 * cxy, cxx - cyy); // axis angle from x axis
        double tilt = ang > 0 ? ang - Math.PI / 2 : ang + Math.PI / 2;
        // grow
        bool[] g2 = new bool[W * H];
        int x0 = W, y0 = H, x1 = 0, y1 = 0;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            if (!win[y * W + x]) continue;
            for (int oy = -grow; oy <= grow; oy += 1) for (int ox = -grow; ox <= grow; ox += 1) {
                if (ox * ox + oy * oy > grow * grow) continue;
                int nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                g2[ny * W + nx] = true;
            }
        }
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) if (g2[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        int mw = x1 - x0 + 1, mh = y1 - y0 + 1;
        Bitmap m = new Bitmap(mw, mh, PixelFormat.Format32bppArgb);
        BitmapData md = m.LockBits(new Rectangle(0, 0, mw, mh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] mp = new byte[md.Stride * mh];
        for (int y = 0; y < mh; y++) for (int x = 0; x < mw; x++) if (g2[(y + y0) * W + (x + x0)]) { int o = y * md.Stride + x * 4; mp[o] = 255; mp[o + 1] = 255; mp[o + 2] = 255; mp[o + 3] = 255; }
        Marshal.Copy(mp, 0, md.Scan0, mp.Length); m.UnlockBits(md); m.Save(maskPath, ImageFormat.Png); m.Dispose();
        return new double[] { x0, y0, x1 + 1, y1 + 1, tilt };
    }
}
'@
$holes = @{ reelFrame = @(453, 410, 184, 348, 36); cardWheelFrame = @(1382, 420, 190, 215, 14) }
function CutHole($bmp, $box, $h, $res) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $x = ($h[0] - $box[0]) * $res; $y = ($h[1] - $box[1]) * $res; $w = $h[2] * $res; $hh = $h[3] * $res; $r = $h[4] * $res
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc([float]$x, [float]$y, [float](2*$r), [float](2*$r), 180, 90); $p.AddArc([float]($x+$w-2*$r), [float]$y, [float](2*$r), [float](2*$r), 270, 90)
  $p.AddArc([float]($x+$w-2*$r), [float]($y+$hh-2*$r), [float](2*$r), [float](2*$r), 0, 90); $p.AddArc([float]$x, [float]($y+$hh-2*$r), [float](2*$r), [float](2*$r), 90, 90)
  $p.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 0, 0, 0))), $p)
  $g.Dispose()
}
$items = @()
foreach ($o in $objs) {
  $seed = if ($picks.ContainsKey($o.id)) { $picks[$o.id] } else { 3 }
  if ($seed -eq "skip") { continue }
  $sp = "$root\artwork\scene\$($o.panel)\$($o.id)_s$seed.png"
  $bx = "$root\artwork\scene\$($o.panel)\$($o.id)_s$seed.box"
  $fit = "$root\artwork\scene\$($o.panel)\$($o.id)_s$seed.fit"
  if ((Test-Path $fit) -and -not $noFit.Contains($o.id)) {
    # trust the fitted place only if it matched well and did not jump to a neighbour
    $b0 = (Get-Content $bx).Trim().Split(" ") | ForEach-Object { [double]::Parse($_, $inv) }
    $f = (Get-Content $fit).Trim().Split(" ") | ForEach-Object { [double]::Parse($_, $inv) }
    $moved = [math]::Sqrt([math]::Pow($f[0] + $f[2] / 2 - $b0[0] - $b0[2] / 2, 2) + [math]::Pow($f[1] + $f[3] / 2 - $b0[1] - $b0[3] / 2, 2))
    $score = if ($f.Count -ge 5) { $f[4] } else { 1 }
    if ($score -ge 0.6 -and $moved -le 48 -and ($f[2] / $b0[2]) -le 1.7 -and ($f[2] / $b0[2]) -ge 0.8) { $bx = $fit }
  }
  if (-not (Test-Path $sp) -or -not (Test-Path $bx)) { continue }
  $box = @((Get-Content $bx).Trim().Split(" ") | ForEach-Object { [double]::Parse($_, $inv) })
  # regular rows/columns of printed cards: put each sprite into its exact cell (aspect kept, centred)
  if ($o.id -eq "wc") {
    # the centre label fills the wheel's centre
    $k = 1.32; $cx0 = $box[0] + $box[2] / 2; $cy0 = $box[1] + $box[3] / 2
    $box = @(($cx0 - $box[2] * $k / 2), ($cy0 - $box[3] * $k / 2), ($box[2] * $k), ($box[3] * $k))
  }
  if ($o.id -match '^(r_|c_|m_|bps_|bpc_)' ) {
    $im0 = [System.Drawing.Image]::FromFile($sp); $ar = $im0.Width / $im0.Height; $im0.Dispose()
    $cw0 = $o.rect[2]; $ch0 = $o.rect[3]
    if ($cw0 / $ch0 -gt $ar) { $hh = $ch0; $ww = $hh * $ar } else { $ww = $cw0; $hh = $ww / $ar }
    $box = @(($o.rect[0] + ($cw0 - $ww) / 2), ($o.rect[1] + ($ch0 - $hh) / 2), $ww, $hh)
  }
  # printed card row 2..A: every card the same size, even gaps
  $rowIds = @("r_2", "r_3", "r_4", "r_5", "r_6", "r_7", "r_8", "r_9", "r_J", "r_Q", "r_K", "r_A")
  $ri = [array]::IndexOf($rowIds, $o.id)
  if ($ri -ge 0) { $box = @((112 + $ri * 93.17 + 3.5), 103, 86.2, 122) }
  # Match Play wheel: the 8 symbols exactly every 45 degrees on one ring around the wheel centre
  $wheelAng = @{ w_bar = -90; w_csengo = -45; w_bj = 0; w_szilva = 45; w_citrom = 90; w_dinnye = 135; w_narancs = 180; w_szolo = 225 }
  if ($wheelAng.ContainsKey($o.id)) {
    $ang = $wheelAng[$o.id] * [math]::PI / 180
    $mw = 142; $mh = 120
    if ($o.id -eq "w_bj") { $mw = 196; $mh = 136 }
    if ($o.id -eq "w_bar") { $mw = 158; $mh = 90 }
    $sc = [math]::Min($mw / $box[2], $mh / $box[3])
    $ww = $box[2] * $sc; $hh = $box[3] * $sc
    $cx = 957 + 192 * [math]::Cos($ang); $cy = 1150 + 192 * [math]::Sin($ang)
    $box = @(($cx - $ww / 2), ($cy - $hh / 2), $ww, $hh)
  }
  if ($o.id -eq "wc") { $box = @((957 - $box[2] / 2), (1150 - $box[3] / 2), $box[2], $box[3]) }
  # the blue ribbon behind the collected cards 2..9 sits centred under their zigzag
  if ($o.id -eq "cardRibbon") { $box = @((1886 - $box[2] / 2), $box[1], $box[2], $box[3]) }
  $w = [int][math]::Max(2, [math]::Round($box[2] * $Res)); $h = [int][math]::Max(2, [math]::Round($box[3] * $Res))
  $src = [System.Drawing.Image]::FromFile($sp)
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $w, $h); $g.Dispose(); $src.Dispose()
  $winInfo = $null
  if ($o.id -eq "reelFrame") {
    # clear any leftover window fill, then measure the real window opening of the drawn frame
    $cxp = [int]($w / 2); $cyp = [int]($h / 2)
    [HoleFill]::Clear($bmp, $cxp, $cyp, 95)
    $wv = [HoleFill]::Window($bmp, $cxp, $cyp, [int](7 * $Res), "$outDir\reelWindowMask.png")
    # straighten the drawn frame: rotate it back by its measured tilt, then measure again
    $deg = -$wv[4] * 180 / [math]::PI
    $rot = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gr = [System.Drawing.Graphics]::FromImage($rot)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.TranslateTransform([float]($w / 2), [float]($h / 2)); $gr.RotateTransform([float]$deg); $gr.TranslateTransform([float](-$w / 2), [float](-$h / 2))
    $gr.DrawImage($bmp, 0, 0, $w, $h); $gr.Dispose(); $bmp.Dispose(); $bmp = $rot
    $wv = [HoleFill]::Window($bmp, $cxp, $cyp, [int](7 * $Res), "$outDir\reelWindowMask.png")
    "frame tilt corrected by $([math]::Round($deg,2)) deg, residual $([math]::Round($wv[4]*180/[math]::PI,2)) deg"
    $winInfo = @{ fx0 = $wv[0] / $w; fy0 = $wv[1] / $h; fx1 = $wv[2] / $w; fy1 = $wv[3] / $h; tilt = $wv[4] }
  }
  $bmp.Save("$outDir\$($o.id).png", [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  $places = @()
  if ($o.reuse) {
    foreach ($r in $o.reuse) {
      $dx = $r.rect[0] - $o.rect[0]; $dy = $r.rect[1] - $o.rect[1]
      $places += @{ lamp = $r.id; rect = @([math]::Round($box[0] + $dx, 1), [math]::Round($box[1] + $dy, 1), [math]::Round($box[2], 1), [math]::Round($box[3], 1)) }
    }
  } else {
    $places += @{ lamp = $o.lamp; rect = @([math]::Round($box[0], 1), [math]::Round($box[1], 1), [math]::Round($box[2], 1), [math]::Round($box[3], 1)) }
  }
  foreach ($pl in $places) {
    $it = [ordered]@{ id = $o.id; panel = $o.panel; src = "assets/objects/$($o.id).png"; rect = $pl.rect; lamp = $pl.lamp; z = $o.z }
    if ($winInfo) {
      $r = $pl.rect
      $it.window = @([math]::Round($r[0] + $winInfo.fx0 * $r[2], 1), [math]::Round($r[1] + $winInfo.fy0 * $r[3], 1),
        [math]::Round(($winInfo.fx1 - $winInfo.fx0) * $r[2], 1), [math]::Round(($winInfo.fy1 - $winInfo.fy0) * $r[3], 1), [math]::Round($winInfo.tilt, 4))
      $it.mask = "assets/objects/reelWindowMask.png"
    }
    $items += $it
  }
}
$json = ConvertTo-Json -InputObject $items -Depth 5 -Compress
"// generated by tools/build_scene.ps1 - every printed object of the machine as its own sprite`n(function (root) { (root.CBJ = root.CBJ || {}).scene = $json; })(typeof window !== `"undefined`" ? window : globalThis);" |
  Set-Content "$root\game\scene.js" -Encoding UTF8
"scene: $($items.Count) placements from $(@($items | ForEach-Object { $_['id'] } | Sort-Object -Unique).Count) sprites"
