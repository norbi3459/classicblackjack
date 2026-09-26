param(
  [string]$In,
  [string]$Out,
  [double[]]$Quad,   # TLx,TLy, TRx,TRy, BRx,BRy, BLx,BLy in source pixels
  [int]$W,
  [int]$H
)
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Homography {
    static double[] Solve(double[,] A, double[] b) {
        int n = b.Length;
        for (int c = 0; c < n; c++) {
            int p = c;
            for (int r = c + 1; r < n; r++) if (Math.Abs(A[r, c]) > Math.Abs(A[p, c])) p = r;
            for (int k = 0; k < n; k++) { double t = A[c, k]; A[c, k] = A[p, k]; A[p, k] = t; }
            double tb = b[c]; b[c] = b[p]; b[p] = tb;
            for (int r = 0; r < n; r++) {
                if (r == c) continue;
                double f = A[r, c] / A[c, c];
                for (int k = c; k < n; k++) A[r, k] -= f * A[c, k];
                b[r] -= f * b[c];
            }
        }
        double[] x = new double[n];
        for (int i = 0; i < n; i++) x[i] = b[i] / A[i, i];
        return x;
    }

    public static void Warp(string inPath, string outPath, double[] q, int W, int H) {
        double[] u = { 0, W, W, 0 };
        double[] v = { 0, 0, H, H };
        double[,] A = new double[8, 8];
        double[] b = new double[8];
        for (int i = 0; i < 4; i++) {
            double x = q[2 * i], y = q[2 * i + 1];
            A[2*i, 0] = u[i]; A[2*i, 1] = v[i]; A[2*i, 2] = 1;
            A[2*i, 6] = -u[i] * x; A[2*i, 7] = -v[i] * x; b[2*i] = x;
            A[2*i+1, 3] = u[i]; A[2*i+1, 4] = v[i]; A[2*i+1, 5] = 1;
            A[2*i+1, 6] = -u[i] * y; A[2*i+1, 7] = -v[i] * y; b[2*i+1] = y;
        }
        double[] h = Solve(A, b);

        Bitmap srcImg = new Bitmap(inPath);
        Bitmap src = new Bitmap(srcImg.Width, srcImg.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(src)) g.DrawImage(srcImg, 0, 0, srcImg.Width, srcImg.Height);
        srcImg.Dispose();
        int sw = src.Width, sh = src.Height;
        BitmapData sd = src.LockBits(new Rectangle(0, 0, sw, sh), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int ss = sd.Stride;
        byte[] sb = new byte[ss * sh];
        Marshal.Copy(sd.Scan0, sb, 0, sb.Length);
        src.UnlockBits(sd); src.Dispose();

        Bitmap dst = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        BitmapData dd = dst.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        int ds = dd.Stride;
        byte[] db = new byte[ds * H];

        for (int y = 0; y < H; y++) {
            double vv = y + 0.5;
            for (int x = 0; x < W; x++) {
                double uu = x + 0.5;
                double den = h[6] * uu + h[7] * vv + 1.0;
                double sx = (h[0] * uu + h[1] * vv + h[2]) / den - 0.5;
                double sy = (h[3] * uu + h[4] * vv + h[5]) / den - 0.5;
                int x0 = (int)Math.Floor(sx), y0 = (int)Math.Floor(sy);
                double fx = sx - x0, fy = sy - y0;
                int o = y * ds + x * 4;
                for (int ch = 0; ch < 4; ch++) {
                    double acc = 0;
                    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
                        int px = Math.Min(Math.Max(x0 + i, 0), sw - 1);
                        int py = Math.Min(Math.Max(y0 + j, 0), sh - 1);
                        double wgt = (i == 0 ? 1 - fx : fx) * (j == 0 ? 1 - fy : fy);
                        acc += wgt * sb[py * ss + px * 4 + ch];
                    }
                    db[o + ch] = (byte)Math.Min(255, Math.Max(0, Math.Round(acc)));
                }
            }
        }
        Marshal.Copy(db, 0, dd.Scan0, db.Length);
        dst.UnlockBits(dd);
        dst.Save(outPath, ImageFormat.Png);
        dst.Dispose();
    }
}
'@
if (-not ("Homography" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
[Homography]::Warp($In, $Out, $Quad, $W, $H)
"OK $Out"
