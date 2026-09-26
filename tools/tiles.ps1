param(
  [ValidateSet("split", "stitch")] [string]$Mode,
  [string]$In,            # split: source panel image
  [string]$Dir,           # tile directory (tiles/*.png, manifest.json, restored/*.png)
  [string]$Out,           # stitch: output master path
  [int]$Tile = 700,
  [int]$Overlap = 120,
  [double]$Scale = 2.0,
  [string]$Restored = "restored"   # stitch: subfolder with restored tiles
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Stitcher {
    // Accumulates weighted tiles; weight ramps linearly to 0 across the overlap band on inner edges.
    public static void Stitch(string[] paths, int[] xs, int[] ys, int[] ws, int[] hs, int W, int H, int ovl, string outPath) {
        double[] acc = new double[W * H * 3];
        double[] wsum = new double[W * H];
        for (int t = 0; t < paths.Length; t++) {
            Bitmap src = new Bitmap(paths[t]);
            Bitmap bmp = new Bitmap(ws[t], hs[t], PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                g.DrawImage(src, 0, 0, ws[t], hs[t]);
            }
            src.Dispose();
            BitmapData d = bmp.LockBits(new Rectangle(0, 0, ws[t], hs[t]), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            byte[] buf = new byte[d.Stride * hs[t]];
            Marshal.Copy(d.Scan0, buf, 0, buf.Length);
            int stride = d.Stride;
            bmp.UnlockBits(d); bmp.Dispose();
            bool l = xs[t] > 0, r = xs[t] + ws[t] < W, tp = ys[t] > 0, bt = ys[t] + hs[t] < H;
            for (int y = 0; y < hs[t]; y++) {
                double wy = 1;
                if (tp && y < ovl) wy = Math.Min(wy, (y + 0.5) / ovl);
                if (bt && y >= hs[t] - ovl) wy = Math.Min(wy, (hs[t] - y - 0.5) / ovl);
                for (int x = 0; x < ws[t]; x++) {
                    double wx = 1;
                    if (l && x < ovl) wx = Math.Min(wx, (x + 0.5) / ovl);
                    if (r && x >= ws[t] - ovl) wx = Math.Min(wx, (ws[t] - x - 0.5) / ovl);
                    double w = wx * wy;
                    int gx = xs[t] + x, gy = ys[t] + y;
                    if (gx >= W || gy >= H) continue;
                    int o = y * stride + x * 4, gi = gy * W + gx;
                    acc[gi * 3] += w * buf[o]; acc[gi * 3 + 1] += w * buf[o + 1]; acc[gi * 3 + 2] += w * buf[o + 2];
                    wsum[gi] += w;
                }
            }
        }
        Bitmap res = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        BitmapData rd = res.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] rb = new byte[rd.Stride * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int gi = y * W + x, o = y * rd.Stride + x * 4;
            double s = wsum[gi] > 0 ? wsum[gi] : 1;
            rb[o] = (byte)Math.Round(acc[gi * 3] / s); rb[o + 1] = (byte)Math.Round(acc[gi * 3 + 1] / s);
            rb[o + 2] = (byte)Math.Round(acc[gi * 3 + 2] / s); rb[o + 3] = 255;
        }
        Marshal.Copy(rb, 0, rd.Scan0, rb.Length);
        res.UnlockBits(rd);
        res.Save(outPath, ImageFormat.Png);
        res.Dispose();
    }
}
'@
if (-not ("Stitcher" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }

function Starts([int]$len) {
  $step = $Tile - $Overlap
  $s = @(); $p = 0
  while ($true) { if ($p + $Tile -ge $len) { $s += [math]::Max(0, $len - $Tile); break }; $s += $p; $p += $step }
  return ($s | Select-Object -Unique)
}

if ($Mode -eq "split") {
  New-Item -ItemType Directory -Force -Path "$Dir\tiles", "$Dir\restored" | Out-Null
  $src = [System.Drawing.Image]::FromFile($In)
  $imgW = [int]$src.Width; $imgH = [int]$src.Height
  $list = @()
  foreach ($ty in (Starts $imgH)) { foreach ($tx in (Starts $imgW)) {
    $tw = [int][math]::Min($Tile, $imgW - $tx); $th = [int][math]::Min($Tile, $imgH - $ty)
    $name = "t_{0:D4}_{1:D4}.png" -f $ty, $tx
    $bmp = New-Object System.Drawing.Bitmap $tw, $th
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $tw, $th), (New-Object System.Drawing.Rectangle $tx, $ty, $tw, $th), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $bmp.Save("$Dir\tiles\$name"); $bmp.Dispose()
    $list += @{ name = $name; x = $tx; y = $ty; w = $tw; h = $th }
  } }
  $src.Dispose()
  @{ width = $imgW; height = $imgH; overlap = $Overlap; tiles = $list } | ConvertTo-Json -Depth 5 | Set-Content "$Dir\manifest.json" -Encoding utf8
  "split into $($list.Count) tiles ($imgW x $imgH)"
} else {
  $m = Get-Content "$Dir\manifest.json" -Raw | ConvertFrom-Json
  $paths = @(); $xs = @(); $ys = @(); $tws = @(); $ths = @()
  foreach ($t in $m.tiles) {
    $p = "$Dir\$Restored\$($t.name)"
    if (-not (Test-Path $p)) { $p = "$Dir\tiles\$($t.name)" }
    $paths += $p
    $xs += [int][math]::Round($t.x * $Scale); $ys += [int][math]::Round($t.y * $Scale)
    $tws += [int][math]::Round($t.w * $Scale); $ths += [int][math]::Round($t.h * $Scale)
  }
  $outW = [int][math]::Round($m.width * $Scale); $outH = [int][math]::Round($m.height * $Scale)
  [Stitcher]::Stitch([string[]]$paths, [int[]]$xs, [int[]]$ys, [int[]]$tws, [int[]]$ths, $outW, $outH, [int]($m.overlap * $Scale), $Out)
  "stitched $outW x $outH -> $Out"
}
