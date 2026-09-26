param(
  [string]$Raw,        # original rectified panel (1x)
  [string]$Restored,   # restored master (2x)
  [string]$Out,
  [string]$MaskOut = "",
  [double]$LumLo = 30, [double]$LumHi = 62,     # dark range (0-255)
  [double]$StdLo = 5,  [double]$StdHi = 13,     # smoothness range
  [int]$Radius = 7
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class DarkProtect {
    static byte[] Load(string p, int W, int H, out int st) {
        Bitmap s = new Bitmap(p);
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(s, 0, 0, W, H);
        }
        s.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        st = d.Stride; byte[] buf = new byte[st * H]; Marshal.Copy(d.Scan0, buf, 0, buf.Length);
        b.UnlockBits(d); b.Dispose(); return buf;
    }
    static double[] Box(double[] a, int W, int H, int r) {
        double[] t = new double[W * H], o = new double[W * H];
        for (int y = 0; y < H; y++) {
            double s = 0; int n = 0;
            for (int x = -r; x < W + r; x++) {
                int xa = x + r, xr = x - r - 1;
                if (xa >= 0 && xa < W) { s += a[y * W + xa]; n++; }
                if (xr >= 0 && xr < W) { s -= a[y * W + xr]; n--; }
                if (x >= 0 && x < W) t[y * W + x] = s / n;
            }
        }
        for (int x = 0; x < W; x++) {
            double s = 0; int n = 0;
            for (int y = -r; y < H + r; y++) {
                int ya = y + r, yr = y - r - 1;
                if (ya >= 0 && ya < H) { s += t[ya * W + x]; n++; }
                if (yr >= 0 && yr < H) { s -= t[yr * W + x]; n--; }
                if (y >= 0 && y < H) o[y * W + x] = s / n;
            }
        }
        return o;
    }
    static double Smooth(double e0, double e1, double v) { double t = Math.Min(1, Math.Max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
    public static void Run(string raw, string rest, string outp, string maskp, double l0, double l1, double s0, double s1, int r) {
        Bitmap rb = new Bitmap(rest); int W = rb.Width, H = rb.Height; rb.Dispose();
        int sr, sq;
        byte[] R = Load(raw, W, H, out sr);
        byte[] Q = Load(rest, W, H, out sq);
        double[] lum = new double[W * H], lum2 = new double[W * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int o = y * sr + x * 4; double l = 0.114 * R[o] + 0.587 * R[o + 1] + 0.299 * R[o + 2];
            lum[y * W + x] = l; lum2[y * W + x] = l * l;
        }
        double[] m = Box(lum, W, H, r), m2 = Box(lum2, W, H, r);
        double[] w = new double[W * H];
        for (int i = 0; i < W * H; i++) {
            double sd = Math.Sqrt(Math.Max(0, m2[i] - m[i] * m[i]));
            w[i] = (1 - Smooth(l0, l1, m[i])) * (1 - Smooth(s0, s1, sd));
        }
        w = Box(w, W, H, 3);
        Bitmap ob = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        BitmapData od = ob.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] O = new byte[od.Stride * H];
        byte[] M = maskp != "" ? new byte[od.Stride * H] : null;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int i = y * W + x, o = y * od.Stride + x * 4, oq = y * sq + x * 4, orr = y * sr + x * 4;
            double a = w[i];
            for (int c = 0; c < 3; c++) O[o + c] = (byte)Math.Round(Q[oq + c] * (1 - a) + R[orr + c] * a);
            O[o + 3] = 255;
            if (M != null) { byte v = (byte)Math.Round(a * 255); M[o] = v; M[o + 1] = v; M[o + 2] = v; M[o + 3] = 255; }
        }
        Marshal.Copy(O, 0, od.Scan0, O.Length); ob.UnlockBits(od);
        ob.Save(outp, ImageFormat.Png); ob.Dispose();
        if (M != null) {
            Bitmap mb = new Bitmap(W, H, PixelFormat.Format32bppArgb);
            BitmapData md = mb.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            Marshal.Copy(M, 0, md.Scan0, M.Length); mb.UnlockBits(md); mb.Save(maskp, ImageFormat.Png); mb.Dispose();
        }
    }
}
'@
if (-not ("DarkProtect" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
[DarkProtect]::Run($Raw, $Restored, $Out, $MaskOut, $LumLo, $LumHi, $StdLo, $StdHi, $Radius)
"OK $Out"
