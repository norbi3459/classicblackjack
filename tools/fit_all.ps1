# Snaps every redrawn sprite onto the exact place and size its object has on the restored photo
# (template matching on luminance, alpha-weighted). Writes <id>_s<seed>.fit next to the .box file.
param([string[]]$Only = @(), [double]$ScaleLo = 0.72, [double]$ScaleHi = 1.38, [int]$Shift = 70)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Fitter {
    public class Img { public int W, H; public float[] L; public float[] A; }
    static Img Load(string path, double scale, bool alpha) {
        Bitmap s = new Bitmap(path);
        int W = Math.Max(2, (int)Math.Round(s.Width * scale)), H = Math.Max(2, (int)Math.Round(s.Height * scale));
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
            g.DrawImage(s, 0, 0, W, H);
        }
        s.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] p = new byte[d.Stride * H]; Marshal.Copy(d.Scan0, p, 0, p.Length); int st = d.Stride; b.UnlockBits(d); b.Dispose();
        Img im = new Img { W = W, H = H, L = new float[W * H], A = alpha ? new float[W * H] : null };
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int o = y * st + x * 4;
            im.L[y * W + x] = 0.114f * p[o] + 0.587f * p[o + 1] + 0.299f * p[o + 2];
            if (alpha) im.A[y * W + x] = p[o + 3] / 255f;
        }
        return im;
    }
    static Img panel; static double panelScale;
    public static void LoadPanel(string path, double scale) { panel = Load(path, scale, false); panelScale = scale; }

    static float Sample(Img im, double x, double y) {
        int x0 = (int)Math.Floor(x), y0 = (int)Math.Floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= im.W - 1 || y0 >= im.H - 1) return float.NaN;
        double fx = x - x0, fy = y - y0;
        return (float)((1 - fx) * (1 - fy) * im.L[y0 * im.W + x0] + fx * (1 - fy) * im.L[y0 * im.W + x0 + 1]
            + (1 - fx) * fy * im.L[(y0 + 1) * im.W + x0] + fx * fy * im.L[(y0 + 1) * im.W + x0 + 1]);
    }
    // score of placing the sprite (sw x sh, in panel px at panelScale) with top-left (px,py)
    static double Score(Img sp, double px, double py, double sw, double sh, int step) {
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, wsum = 0;
        for (int y = 0; y < sp.H; y += step) for (int x = 0; x < sp.W; x += step) {
            float a = sp.A[y * sp.W + x]; if (a < 0.5f) continue;
            float v = Sample(panel, px + (x + 0.5) * sw / sp.W, py + (y + 0.5) * sh / sp.H);
            if (float.IsNaN(v)) return -2;
            float u = sp.L[y * sp.W + x];
            sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v; wsum++;
        }
        if (wsum < 30) return -2;
        double cov = sab - sa * sb / wsum, va = saa - sa * sa / wsum, vb = sbb - sb * sb / wsum;
        return cov / Math.Sqrt(Math.Max(va * vb, 1e-6));
    }
    // box = x,y,w,h in layout px. returns fitted box + score
    public static double[] Fit(string spritePath, double bx, double by, double bw, double bh, double sLo, double sHi, double shift) {
        double k = panelScale;
        Bitmap tmp = new Bitmap(spritePath); int sw0 = tmp.Width, sh0 = tmp.Height; tmp.Dispose();
        // sprite resampled to its display size at panel scale
        Img sp = Load(spritePath, Math.Max(bw, bh) * k / Math.Max(sw0, sh0), true);
        double cx = (bx + bw / 2) * k, cy = (by + bh / 2) * k;
        double best = -3, bs = 1, ba = 1, bdx = 0, bdy = 0;
        // coarse
        for (double s = sLo; s <= sHi + 1e-9; s += 0.04) {
            double w = bw * k * s, h = bh * k * s;
            for (double dy = -shift * k; dy <= shift * k; dy += 2) for (double dx = -shift * k; dx <= shift * k; dx += 2) {
                double v = Score(sp, cx + dx - w / 2, cy + dy - h / 2, w, h, 2);
                if (v > best) { best = v; bs = s; bdx = dx; bdy = dy; }
            }
        }
        // refine scale, aspect and shift
        double s0 = bs, dx0 = bdx, dy0 = bdy;
        for (double s = s0 - 0.04; s <= s0 + 0.04 + 1e-9; s += 0.01)
            for (double a = 0.92; a <= 1.08 + 1e-9; a += 0.02) {
                double w = bw * k * s, h = bh * k * s * a;
                for (double dy = dy0 - 3; dy <= dy0 + 3; dy += 0.5) for (double dx = dx0 - 3; dx <= dx0 + 3; dx += 0.5) {
                    double v = Score(sp, cx + dx - w / 2, cy + dy - h / 2, w, h, 1);
                    if (v > best) { best = v; bs = s; ba = a; bdx = dx; bdy = dy; }
                }
            }
        double fw = bw * bs, fh = bh * bs * ba;
        double fcx = (cx + bdx) / k, fcy = (cy + bdy) / k;
        return new double[] { fcx - fw / 2, fcy - fh / 2, fw, fh, best };
    }
}
'@
if (-not ("Fitter" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$root = Split-Path $PSScriptRoot -Parent
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$all = Get-Content "$root\artwork\scene\objects.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$picks = @{}
if (Test-Path "$root\artwork\scene\picks.json") { (Get-Content "$root\artwork\scene\picks.json" -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $picks[$_.Name] = $_.Value } }
foreach ($panel in "top", "reel") {
  $list = @($all | Where-Object { $_.panel -eq $panel -and ($Only.Count -eq 0 -or $Only -contains $_.id) })
  if (-not $list.Count) { continue }
  [Fitter]::LoadPanel("$root\game\assets\$($panel)_glass.png", 0.5)
  foreach ($o in $list) {
    $seed = if ($picks.ContainsKey($o.id)) { $picks[$o.id] } else { 3 }
    if ($seed -eq "skip") { continue }
    $base = "$root\artwork\scene\$panel\$($o.id)_s$seed"
    if (-not (Test-Path "$base.png") -or -not (Test-Path "$base.box")) { continue }
    $b = (Get-Content "$base.box").Trim().Split(" ") | ForEach-Object { [double]::Parse($_, $inv) }
    $r = [Fitter]::Fit("$base.png", $b[0], $b[1], $b[2], $b[3], $ScaleLo, $ScaleHi, $Shift)
    ("{0:0.0} {1:0.0} {2:0.0} {3:0.0} {4:0.000}" -f $r[0], $r[1], $r[2], $r[3], $r[4]).Replace(",", ".") | Set-Content "$base.fit" -Encoding ascii
    "{0,-16} score {1:0.000}  moved ({2:0},{3:0}) size {4:0.00}x" -f $o.id, $r[4], ($r[0] + $r[2] / 2 - $b[0] - $b[2] / 2), ($r[1] + $r[3] / 2 - $b[1] - $b[3] / 2), ($r[2] / $b[2])
  }
}
"FIT DONE"
