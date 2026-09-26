param(
  [string]$In, [string]$Out,
  [int]$Height = 0,       # 0 = keep size
  [string]$BoxOut = "",   # optional: writes the trim box as fractions of the input "x0 y0 x1 y1"
  [switch]$NoTrim
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class ChromaKey2 {
    // Key colour is measured on the image border (median), alpha comes from the colour distance to it,
    // the foreground colour is recovered by un-mixing the key colour out of edge pixels.
    public static double[] Run(string inp, string outp, int outH, bool trim) {
        Bitmap s0 = new Bitmap(inp); int W = s0.Width, H = s0.Height;
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) g.DrawImage(s0, 0, 0, W, H);
        s0.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int st = d.Stride; byte[] p = new byte[st * H]; Marshal.Copy(d.Scan0, p, 0, p.Length);
        List<int>[] ch = { new List<int>(), new List<int>(), new List<int>() };
        Action<int, int> sample = (x, y) => { int o = y * st + x * 4; ch[0].Add(p[o]); ch[1].Add(p[o + 1]); ch[2].Add(p[o + 2]); };
        for (int x = 0; x < W; x += 2) { sample(x, 1); sample(x, H - 2); }
        for (int y = 0; y < H; y += 2) { sample(1, y); sample(W - 2, y); }
        double[] k = new double[3];
        for (int c = 0; c < 3; c++) { ch[c].Sort(); k[c] = ch[c][ch[c].Count / 2]; }
        double lo = 38, hi = 110;
        int minX = W, minY = H, maxX = -1, maxY = -1;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int o = y * st + x * 4;
            double db = p[o] - k[0], dg = p[o + 1] - k[1], dr = p[o + 2] - k[2];
            double dist = Math.Sqrt(db * db + dg * dg + dr * dr);
            double a = Math.Min(1, Math.Max(0, (dist - lo) / (hi - lo)));
            if (a > 0 && a < 1) {
                for (int c = 0; c < 3; c++) {
                    double v = (p[o + c] - (1 - a) * k[c]) / a;
                    p[o + c] = (byte)Math.Round(Math.Min(255, Math.Max(0, v)));
                }
            }
            p[o + 3] = (byte)Math.Round(a * 255);
            if (a > 0.15) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        Marshal.Copy(p, 0, d.Scan0, p.Length); b.UnlockBits(d);
        if (maxX < minX) { minX = 0; minY = 0; maxX = W - 1; maxY = H - 1; }
        Rectangle r = trim ? Rectangle.FromLTRB(Math.Max(0, minX - 2), Math.Max(0, minY - 2), Math.Min(W, maxX + 3), Math.Min(H, maxY + 3)) : new Rectangle(0, 0, W, H);
        int oh = outH > 0 ? outH : r.Height, ow = (int)Math.Round((double)r.Width * oh / r.Height);
        Bitmap o2 = new Bitmap(ow, oh, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(o2)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(b, new Rectangle(0, 0, ow, oh), r, GraphicsUnit.Pixel);
        }
        o2.Save(outp, ImageFormat.Png); o2.Dispose(); b.Dispose();
        return new double[] { (double)r.Left / W, (double)r.Top / H, (double)r.Right / W, (double)r.Bottom / H };
    }
}
'@
if (-not ("ChromaKey2" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$box = [ChromaKey2]::Run($In, $Out, $Height, -not $NoTrim)
if ($BoxOut) { ($box | ForEach-Object { $_.ToString([System.Globalization.CultureInfo]::InvariantCulture) }) -join " " | Set-Content $BoxOut -Encoding ascii }
