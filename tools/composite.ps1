param(
  [string]$Base,      # 2x master
  [string]$Patches,   # json list: { src, src_rect:[x,y,w,h] (raw px covered by src), paste:[x,y,w,h] (raw px), feather (raw px, optional) }
  [string]$Out,
  [double]$Scale = 2.0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Compositor2 {
    public static void Paste(Bitmap baseBmp, string srcPath, double[] srcRect, double[] paste, double feather, double scale) {
        Bitmap src = new Bitmap(srcPath);
        double sx = src.Width / srcRect[2], sy = src.Height / srcRect[3];
        RectangleF from = new RectangleF((float)((paste[0] - srcRect[0]) * sx), (float)((paste[1] - srcRect[1]) * sy), (float)(paste[2] * sx), (float)(paste[3] * sy));
        int pw = (int)Math.Round(paste[2] * scale), ph = (int)Math.Round(paste[3] * scale);
        int px = (int)Math.Round(paste[0] * scale), py = (int)Math.Round(paste[1] * scale);
        Bitmap patch = new Bitmap(pw, ph, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(patch)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(src, new RectangleF(0, 0, pw, ph), from, GraphicsUnit.Pixel);
        }
        src.Dispose();
        BitmapData pd = patch.LockBits(new Rectangle(0, 0, pw, ph), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int ps = pd.Stride; byte[] pb = new byte[ps * ph]; Marshal.Copy(pd.Scan0, pb, 0, pb.Length); patch.UnlockBits(pd); patch.Dispose();
        BitmapData d = baseBmp.LockBits(new Rectangle(0, 0, baseBmp.Width, baseBmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int bs = d.Stride; byte[] bb = new byte[bs * baseBmp.Height]; Marshal.Copy(d.Scan0, bb, 0, bb.Length);
        double f = Math.Max(2, feather * scale);
        for (int y = 0; y < ph; y++) for (int x = 0; x < pw; x++) {
            int gx = px + x, gy = py + y;
            if (gx < 0 || gy < 0 || gx >= baseBmp.Width || gy >= baseBmp.Height) continue;
            double e = Math.Min(Math.Min(x + 0.5, pw - x - 0.5), Math.Min(y + 0.5, ph - y - 0.5));
            double a = Math.Min(1.0, e / f); a = a * a * (3 - 2 * a);
            int po = y * ps + x * 4, bo = gy * bs + gx * 4;
            for (int c = 0; c < 3; c++) bb[bo + c] = (byte)Math.Round(bb[bo + c] * (1 - a) + pb[po + c] * a);
        }
        Marshal.Copy(bb, 0, d.Scan0, bb.Length); baseBmp.UnlockBits(d);
    }
}
'@
if (-not ("Compositor2" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$list = Get-Content $Patches -Raw -Encoding UTF8 | ConvertFrom-Json
$srcBase = New-Object System.Drawing.Bitmap $Base
$bmp = New-Object System.Drawing.Bitmap $srcBase.Width, $srcBase.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.DrawImage($srcBase, 0, 0, $srcBase.Width, $srcBase.Height); $g.Dispose(); $srcBase.Dispose()
$root = Split-Path $Patches -Parent
$n = 0
foreach ($p in $list) {
  $src = if ([System.IO.Path]::IsPathRooted($p.src)) { $p.src } else { Join-Path $root $p.src }
  $feather = if ($p.feather) { [double]$p.feather } else { [math]::Max(6, 0.1 * [math]::Min($p.paste[2], $p.paste[3])) }
  [Compositor2]::Paste($bmp, $src, [double[]]$p.src_rect, [double[]]$p.paste, $feather, $Scale)
  $n++
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
"composited $n patches -> $Out"
