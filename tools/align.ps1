param(
  [string]$Ref,         # original tile (defines geometry)
  [string]$Img,         # restored image (any size, same content)
  [string]$Out,         # aligned output
  [double]$OutScale = 2.0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Aligner {
    static byte[] Load(Bitmap src, int w, int h, out int stride) {
        Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(src, 0, 0, w, h);
        }
        BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        stride = d.Stride;
        byte[] buf = new byte[stride * h];
        Marshal.Copy(d.Scan0, buf, 0, buf.Length);
        b.UnlockBits(d); b.Dispose();
        return buf;
    }
    static float[] Grad(byte[] buf, int stride, int w, int h) {
        float[] l = new float[w * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int o = y * stride + x * 4;
            l[y * w + x] = 0.114f * buf[o] + 0.587f * buf[o + 1] + 0.299f * buf[o + 2];
        }
        float[] gm = new float[w * h];
        for (int y = 1; y < h - 1; y++) for (int x = 1; x < w - 1; x++) {
            float gx = l[y * w + x + 1] - l[y * w + x - 1];
            float gy = l[(y + 1) * w + x] - l[(y - 1) * w + x];
            gm[y * w + x] = (float)Math.Sqrt(gx * gx + gy * gy);
        }
        return gm;
    }
    static float Sample(float[] im, int w, int h, double x, double y) {
        int x0 = (int)Math.Floor(x), y0 = (int)Math.Floor(y);
        if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return float.NaN;
        double fx = x - x0, fy = y - y0;
        return (float)((1 - fx) * (1 - fy) * im[y0 * w + x0] + fx * (1 - fy) * im[y0 * w + x0 + 1]
                     + (1 - fx) * fy * im[(y0 + 1) * w + x0] + fx * fy * im[(y0 + 1) * w + x0 + 1]);
    }
    static double Ncc(float[] a, float[] b, int w, int h, double s, double dx, double dy, int margin) {
        double cx = w / 2.0, cy = h / 2.0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; int n = 0;
        for (int y = margin; y < h - margin; y += 1) for (int x = margin; x < w - margin; x += 1) {
            float bv = Sample(b, w, h, s * (x - cx) + cx + dx, s * (y - cy) + cy + dy);
            if (float.IsNaN(bv)) continue;
            float av = a[y * w + x];
            sa += av; sb += bv; saa += av * av; sbb += bv * bv; sab += av * bv; n++;
        }
        if (n < 100) return -1;
        double cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n;
        return cov / Math.Sqrt(Math.Max(va * vb, 1e-9));
    }
    // returns {scale, dx, dy, ncc} in reference pixel units; maps ref(x,y) -> img(s*(x-cx)+cx+dx, ...)
    public static double[] Find(string refPath, string imgPath) {
        Bitmap r = new Bitmap(refPath), m = new Bitmap(imgPath);
        int W = r.Width, H = r.Height;
        double best = -2, bs = 1, bx = 0, by = 0;
        int[] divs = { 4, 2 };
        double sLo = 0.94, sHi = 1.06, sStep = 0.01; int shiftR = 10;
        foreach (int div in divs) {
            int w = W / div, h = H / div, st;
            float[] a = Grad(Load(r, w, h, out st), st, w, h);
            float[] b = Grad(Load(m, w, h, out st), st, w, h);
            double cbx = bx / div, cby = by / div;
            int sr = div == 4 ? shiftR : 3;
            double lbest = -2, ls = bs, lx = cbx, ly = cby;
            for (double s = sLo; s <= sHi + 1e-9; s += sStep)
                for (int iy = -sr; iy <= sr; iy++) for (int ix = -sr; ix <= sr; ix++) {
                    double dx = cbx + ix * (div == 4 ? 1.0 : 0.5), dy = cby + iy * (div == 4 ? 1.0 : 0.5);
                    double v = Ncc(a, b, w, h, s, dx, dy, 6);
                    if (v > lbest) { lbest = v; ls = s; lx = dx; ly = dy; }
                }
            best = lbest; bs = ls; bx = lx * div; by = ly * div;
            sLo = bs - 0.01; sHi = bs + 0.01; sStep = 0.0025;
        }
        r.Dispose(); m.Dispose();
        return new double[] { bs, bx, by, best };
    }
    public static void Apply(string imgPath, int refW, int refH, double s, double dx, double dy, double outScale, string outPath) {
        Bitmap m = new Bitmap(imgPath);
        int W = (int)Math.Round(refW * outScale), H = (int)Math.Round(refH * outScale);
        // img scaled to W x H; in those units the transform is the same with shifts scaled
        int st;
        byte[] buf = Load(m, W, H, out st);
        m.Dispose();
        double cx = W / 2.0, cy = H / 2.0, ddx = dx * outScale, ddy = dy * outScale;
        Bitmap o = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        BitmapData od = o.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] ob = new byte[od.Stride * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            double sx = s * (x + 0.5 - cx) + cx + ddx - 0.5, sy = s * (y + 0.5 - cy) + cy + ddy - 0.5;
            int x0 = (int)Math.Floor(sx), y0 = (int)Math.Floor(sy);
            double fx = sx - x0, fy = sy - y0;
            for (int c = 0; c < 4; c++) {
                double acc = 0;
                for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
                    int px = Math.Min(Math.Max(x0 + i, 0), W - 1), py = Math.Min(Math.Max(y0 + j, 0), H - 1);
                    acc += (i == 0 ? 1 - fx : fx) * (j == 0 ? 1 - fy : fy) * buf[py * st + px * 4 + c];
                }
                ob[y * od.Stride + x * 4 + c] = (byte)Math.Round(Math.Min(255, Math.Max(0, acc)));
            }
        }
        Marshal.Copy(ob, 0, od.Scan0, ob.Length);
        o.UnlockBits(od);
        o.Save(outPath, ImageFormat.Png); o.Dispose();
    }
}
'@
if (-not ("Aligner" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$r = [System.Drawing.Image]::FromFile($Ref); $rw = $r.Width; $rh = $r.Height; $r.Dispose()
$p = [Aligner]::Find($Ref, $Img)
if ($Out) { [Aligner]::Apply($Img, $rw, $rh, $p[0], $p[1], $p[2], $OutScale, $Out) }
"scale={0:N4} dx={1:N2} dy={2:N2} ncc={3:N3}" -f $p[0], $p[1], $p[2], $p[3]
