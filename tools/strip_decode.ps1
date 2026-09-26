param(
  [string]$In,
  [string]$OutDir,
  [string]$Name,
  [int]$X0, [int]$Y0, [int]$X1, [int]$Y1,   # strip center line (top -> bottom), source pixels
  [int]$HalfWidth = 9
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

public static class StripDecoder {
    public static string Run(string path, string outPng, int x0, int y0, int x1, int y1, int hw) {
        Bitmap src = new Bitmap(path);
        Bitmap bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
        int W = bmp.Width, H = bmp.Height;
        BitmapData d = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] buf = new byte[d.Stride * H]; Marshal.Copy(d.Scan0, buf, 0, buf.Length); int st = d.Stride;
        bmp.UnlockBits(d);
        int n = (int)Math.Round(Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)));
        double[] R = new double[n], G = new double[n], B = new double[n], ink = new double[n];
        // background (cell paper) reference: brightest quartile of the whole strip
        List<double> lums = new List<double>();
        for (int i = 0; i < n; i++) {
            double t = i / (double)(n - 1), cx = x0 + t * (x1 - x0), cy = y0 + t * (y1 - y0);
            double r = 0, gg = 0, b = 0; int c = 0;
            for (int k = -hw; k <= hw; k++) {
                int px = (int)Math.Round(cx + k), py = (int)Math.Round(cy);
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                int o = py * st + px * 4; b += buf[o]; gg += buf[o + 1]; r += buf[o + 2]; c++;
            }
            R[i] = r / c; G[i] = gg / c; B[i] = b / c;
            lums.Add(0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]);
        }
        List<double> sorted = new List<double>(lums); sorted.Sort();
        double paper = sorted[(int)(sorted.Count * 0.85)];
        for (int i = 0; i < n; i++) {
            double mx = Math.Max(R[i], Math.Max(G[i], B[i])), mn = Math.Min(R[i], Math.Min(G[i], B[i]));
            ink[i] = Math.Max(0, paper - lums[i]) + 0.8 * (mx - mn);
        }
        // smooth and segment
        double[] sm = new double[n];
        for (int i = 0; i < n; i++) { double s = 0; int c = 0; for (int k = -2; k <= 2; k++) { int j = i + k; if (j >= 0 && j < n) { s += ink[j]; c++; } } sm[i] = s / c; }
        List<double> ss = new List<double>(sm); ss.Sort();
        double thr = ss[(int)(ss.Count * 0.35)] + 0.35 * (ss[(int)(ss.Count * 0.9)] - ss[(int)(ss.Count * 0.35)]);
        List<int[]> blobs = new List<int[]>();
        int start = -1;
        for (int i = 0; i <= n; i++) {
            bool on = i < n && sm[i] > thr;
            if (on && start < 0) start = i;
            if (!on && start >= 0) { if (i - start >= 4) blobs.Add(new int[] { start, i - 1 }); start = -1; }
        }
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("idx;y_from;y_to;R;G;B;class");
        // annotated strip image (straightened), 6x enlarged
        int outW = (2 * hw + 1) * 6 + 160, outH = n * 3;
        Bitmap o2 = new Bitmap(outW, outH);
        using (Graphics g = Graphics.FromImage(o2)) {
            g.Clear(Color.White);
            for (int i = 0; i < n; i++) {
                double t = i / (double)(n - 1), cx = x0 + t * (x1 - x0), cy = y0 + t * (y1 - y0);
                for (int k = -hw; k <= hw; k++) {
                    int px = (int)Math.Round(cx + k), py = (int)Math.Round(cy);
                    if (px < 0 || py < 0 || px >= W || py >= H) continue;
                    int o = py * st + px * 4;
                    using (SolidBrush brr = new SolidBrush(Color.FromArgb(buf[o + 2], buf[o + 1], buf[o])))
                        g.FillRectangle(brr, (k + hw) * 6, i * 3, 6, 3);
                }
            }
            Font f = new Font("Arial", 9, FontStyle.Bold);
            for (int bi = 0; bi < blobs.Count; bi++) {
                int a = blobs[bi][0], b2 = blobs[bi][1];
                // core of blob (middle 60%) for color
                int ca = a + (b2 - a) / 5, cb = b2 - (b2 - a) / 5;
                double r = 0, gg = 0, bb = 0; int c = 0;
                for (int i = ca; i <= cb; i++) { r += R[i]; gg += G[i]; bb += B[i]; c++; }
                r /= c; gg /= c; bb /= c;
                string cls = Classify(r, gg, bb, paper);
                sb.AppendLine(string.Format("{0};{1};{2};{3:F0};{4:F0};{5:F0};{6}", bi + 1, a, b2, r, gg, bb, cls));
                int yy = (a + b2) / 2 * 3;
                using (SolidBrush sw = new SolidBrush(Color.FromArgb((int)r, (int)gg, (int)bb)))
                    g.FillRectangle(sw, (2 * hw + 1) * 6 + 6, yy - 7, 22, 14);
                g.DrawRectangle(Pens.Black, (2 * hw + 1) * 6 + 6, yy - 7, 22, 14);
                g.DrawString((bi + 1) + " " + cls, f, Brushes.Black, (2 * hw + 1) * 6 + 32, yy - 8);
                g.DrawLine(Pens.Magenta, 0, a * 3, (2 * hw + 1) * 6, a * 3);
            }
        }
        o2.Save(outPng, ImageFormat.Png); o2.Dispose(); src.Dispose(); bmp.Dispose();
        return sb.ToString();
    }
    static string Classify(double r, double g, double b, double paper) {
        double mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b));
        double sat = mx > 0 ? (mx - mn) / mx : 0, lum = 0.299 * r + 0.587 * g + 0.114 * b;
        double h = 0;
        if (mx - mn > 1e-6) {
            if (mx == r) h = 60 * (((g - b) / (mx - mn)) % 6);
            else if (mx == g) h = 60 * ((b - r) / (mx - mn) + 2);
            else h = 60 * ((r - g) / (mx - mn) + 4);
        }
        if (h < 0) h += 360;
        if (lum < paper * 0.45 && sat < 0.35) return "sötét";
        if (sat < 0.18) return lum > paper * 0.8 ? "világos/szürke" : "szürke";
        if (h < 18 || h >= 330) return "piros";
        if (h < 38) return "narancs";
        if (h < 70) return "sárga";
        if (h < 170) return "zöld";
        if (h < 260) return "kék";
        return "lila";
    }
}
'@
if (-not ("StripDecoder" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$csv = [StripDecoder]::Run($In, "$OutDir\$Name.png", $X0, $Y0, $X1, $Y1, $HalfWidth)
[System.IO.File]::WriteAllText("$OutDir\$Name.csv", $csv, [System.Text.Encoding]::UTF8)
$csv
