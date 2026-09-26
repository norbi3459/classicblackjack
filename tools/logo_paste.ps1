param(
  [ValidateSet("cutout", "paste")] [string]$Mode,
  [string]$In,              # cutout: clean logo on plain background; paste: cutout PNG with alpha
  [string]$Out,
  [int]$Tolerance = 60,     # cutout: max RGB distance to the border colour
  [string]$Target = "",     # paste: master image to paste into
  [int[]]$Rect = @(),       # paste: target rect x,y,w,h in master pixels
  [int[]]$SrcRect = @(),    # paste: optional sub-rect of the cutout
  [double]$Match = 0.6,     # paste: 0 = keep logo colours, 1 = fully match target region colour stats
  [double]$Angle = 0        # paste: rotation in degrees
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LogoTool {
    static byte[] Bytes(Bitmap b, out int st) {
        BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        st = d.Stride; byte[] buf = new byte[st * b.Height]; Marshal.Copy(d.Scan0, buf, 0, buf.Length); b.UnlockBits(d); return buf;
    }
    static void Put(Bitmap b, byte[] buf) {
        BitmapData d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(buf, 0, d.Scan0, buf.Length); b.UnlockBits(d);
    }
    static Bitmap Argb(string p) {
        Bitmap s = new Bitmap(p); Bitmap b = new Bitmap(s.Width, s.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) g.DrawImage(s, 0, 0, s.Width, s.Height); s.Dispose(); return b;
    }
    public static void Cutout(string inp, string outp, int tol) {
        Bitmap b = Argb(inp); int W = b.Width, H = b.Height, st; byte[] buf = Bytes(b, out st);
        double sr = 0, sg = 0, sb = 0; int n = 0;
        for (int x = 0; x < W; x++) foreach (int y in new int[] { 0, H - 1 }) { int o = y * st + x * 4; sb += buf[o]; sg += buf[o + 1]; sr += buf[o + 2]; n++; }
        for (int y = 0; y < H; y++) foreach (int x in new int[] { 0, W - 1 }) { int o = y * st + x * 4; sb += buf[o]; sg += buf[o + 1]; sr += buf[o + 2]; n++; }
        double rr = sr / n, rg = sg / n, rb = sb / n;
        bool[] bg = new bool[W * H]; Queue<int> q = new Queue<int>();
        Func<int, bool> near = i => { int o = (i / W) * st + (i % W) * 4; double dr = buf[o + 2] - rr, dg = buf[o + 1] - rg, db = buf[o] - rb; return dr * dr + dg * dg + db * db <= tol * tol; };
        for (int x = 0; x < W; x++) foreach (int y in new int[] { 0, H - 1 }) { int i = y * W + x; if (!bg[i] && near(i)) { bg[i] = true; q.Enqueue(i); } }
        for (int y = 0; y < H; y++) foreach (int x in new int[] { 0, W - 1 }) { int i = y * W + x; if (!bg[i] && near(i)) { bg[i] = true; q.Enqueue(i); } }
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % W, y = i / W;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                int j = ny * W + nx; if (bg[j] || !near(j)) continue; bg[j] = true; q.Enqueue(j);
            }
        }
        double[] a = new double[W * H];
        for (int i = 0; i < W * H; i++) a[i] = bg[i] ? 0 : 1;
        double[] s = new double[W * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            double t = 0; int c = 0;
            for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) { int nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; t += a[ny * W + nx]; c++; }
            s[y * W + x] = t / c;
        }
        int minX = W, minY = H, maxX = 0, maxY = 0;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int i = y * W + x; buf[y * st + x * 4 + 3] = (byte)Math.Round(s[i] * 255);
            if (s[i] > 0.05) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        Put(b, buf);
        Bitmap c2 = b.Clone(new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1), PixelFormat.Format32bppArgb);
        c2.Save(outp, ImageFormat.Png); c2.Dispose(); b.Dispose();
    }
    public static void Paste(string cut, string target, string outp, int[] rect, int[] src, double match, double angle) {
        Bitmap cb = Argb(cut);
        Rectangle sr = src.Length == 4 ? new Rectangle(src[0], src[1], src[2], src[3]) : new Rectangle(0, 0, cb.Width, cb.Height);
        int w = rect[2], h = rect[3];
        Bitmap lg = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(lg)) {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TranslateTransform(w / 2f, h / 2f); g.RotateTransform((float)angle); g.TranslateTransform(-w / 2f, -h / 2f);
            g.DrawImage(cb, new Rectangle(0, 0, w, h), sr, GraphicsUnit.Pixel);
        }
        cb.Dispose();
        int ls; byte[] L = Bytes(lg, out ls); lg.Dispose();
        Bitmap tb = Argb(target); int ts; byte[] T = Bytes(tb, out ts);
        double[] ml = new double[3], mt = new double[3], vl = new double[3], vt = new double[3]; double wsum = 0;
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            double a = L[y * ls + x * 4 + 3] / 255.0; if (a < 0.5) continue;
            int gx = rect[0] + x, gy = rect[1] + y; if (gx < 0 || gy < 0 || gx >= tb.Width || gy >= tb.Height) continue;
            for (int c = 0; c < 3; c++) { double lv = L[y * ls + x * 4 + c], tv = T[gy * ts + gx * 4 + c]; ml[c] += lv; mt[c] += tv; vl[c] += lv * lv; vt[c] += tv * tv; }
            wsum++;
        }
        double[] gain = new double[3], off = new double[3];
        for (int c = 0; c < 3; c++) {
            ml[c] /= wsum; mt[c] /= wsum;
            double sl = Math.Sqrt(Math.Max(1, vl[c] / wsum - ml[c] * ml[c])), stt = Math.Sqrt(Math.Max(1, vt[c] / wsum - mt[c] * mt[c]));
            double gfull = Math.Max(stt / sl, 0.6);
            gain[c] = 1 + match * (gfull - 1);
            off[c] = match * (mt[c] - ml[c] * gfull);
        }
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int gx = rect[0] + x, gy = rect[1] + y; if (gx < 0 || gy < 0 || gx >= tb.Width || gy >= tb.Height) continue;
            int lo = y * ls + x * 4, to = gy * ts + gx * 4; double a = L[lo + 3] / 255.0; if (a <= 0) continue;
            for (int c = 0; c < 3; c++) {
                double v = Math.Min(255, Math.Max(0, L[lo + c] * gain[c] + off[c]));
                T[to + c] = (byte)Math.Round(T[to + c] * (1 - a) + v * a);
            }
        }
        Put(tb, T); tb.Save(outp, ImageFormat.Png); tb.Dispose();
    }
}
'@
if (-not ("LogoTool" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
if ($Mode -eq "cutout") { [LogoTool]::Cutout($In, $Out, $Tolerance); "cutout -> $Out" }
else { [LogoTool]::Paste($In, $Target, $Out, [int[]]$Rect, [int[]]$SrcRect, $Match, $Angle); "pasted -> $Out" }
