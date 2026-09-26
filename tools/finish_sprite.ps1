param(
  [string]$In,
  [string]$Out,
  [int]$Tolerance = 40,
  [int]$Height = 360        # output height in px (keeps aspect)
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SpriteFinisher {
    public static void Run(string inp, string outp, int tol, int outH) {
        Bitmap s0 = new Bitmap(inp);
        int W = s0.Width, H = s0.Height;
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) g.DrawImage(s0, 0, 0, W, H);
        s0.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int st = d.Stride; byte[] p = new byte[st * H]; Marshal.Copy(d.Scan0, p, 0, p.Length);

        // background = brightest-quartile colour of the border ring (the cream reel paper)
        List<int> ring = new List<int>();
        for (int x = 0; x < W; x++) { ring.Add(x); ring.Add((H - 1) * W + x); }
        for (int y = 0; y < H; y++) { ring.Add(y * W); ring.Add(y * W + W - 1); }
        ring.Sort((i, j) => Lum(p, st, W, j).CompareTo(Lum(p, st, W, i)));
        double br = 0, bg = 0, bb = 0; int n = ring.Count / 3;
        for (int k = 0; k < n; k++) { int o = Off(st, W, ring[k]); bb += p[o]; bg += p[o + 1]; br += p[o + 2]; }
        br /= n; bg /= n; bb /= n;

        bool[] back = new bool[W * H];
        Queue<int> q = new Queue<int>();
        Func<int, double> dref = i => {
            int o = Off(st, W, i);
            double dr = p[o + 2] - br, dg = p[o + 1] - bg, db = p[o] - bb;
            return Math.Sqrt(dr * dr + dg * dg + db * db);
        };
        Func<int, int, double> dpair = (i, j) => {
            int o = Off(st, W, i), u = Off(st, W, j);
            double dr = p[o + 2] - p[u + 2], dg = p[o + 1] - p[u + 1], db = p[o] - p[u];
            return Math.Sqrt(dr * dr + dg * dg + db * db);
        };
        Action<int> seed = i => { if (!back[i] && dref(i) <= tol) { back[i] = true; q.Enqueue(i); } };
        foreach (int i in ring) seed(i);
        // also seed the cream paper that a leftover frame may enclose: scan inward from each edge midline
        for (int x = 0; x < W / 3; x++) { seed((H / 2) * W + x); seed((H / 2) * W + (W - 1 - x)); }
        for (int y = 0; y < H / 5; y++) { seed(y * W + W / 2); seed((H - 1 - y) * W + W / 2); }
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % W, y = i / W;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                int j = ny * W + nx;
                if (back[j]) continue;
                double dist = dref(j);
                // follow smooth drum shading, but never jump across an outline
                if (dist <= tol || (dist <= tol * 2.4 && dpair(i, j) <= 7)) { back[j] = true; q.Enqueue(j); }
            }
        }
        // keep only foreground components that reach into the central area
        int[] lab = new int[W * H];
        for (int i = 0; i < W * H; i++) lab[i] = back[i] ? -1 : 0;
        int cx0 = (int)(W * 0.25), cx1 = (int)(W * 0.75), cy0 = (int)(H * 0.2), cy1 = (int)(H * 0.8);
        int next = 1; var keep = new HashSet<int>();
        for (int i = 0; i < W * H; i++) {
            if (lab[i] != 0) continue;
            int id = next++; bool central = false; int size = 0;
            q.Enqueue(i); lab[i] = id;
            while (q.Count > 0) {
                int c = q.Dequeue(), x = c % W, y = c / W; size++;
                if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) central = true;
                for (int k = 0; k < 4; k++) {
                    int nx = x + dx[k], ny = y + dy[k];
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    int j = ny * W + nx; if (lab[j] != 0) continue; lab[j] = id; q.Enqueue(j);
                }
            }
            if (central && size > 50) keep.Add(id);
        }
        double[] a = new double[W * H];
        for (int i = 0; i < W * H; i++) a[i] = (lab[i] > 0 && keep.Contains(lab[i])) ? 1 : 0;
        // soft edge
        double[] s = new double[W * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            double t = 0; int c = 0;
            for (int oy = -1; oy <= 1; oy++) for (int ox = -1; ox <= 1; ox++) {
                int nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; t += a[ny * W + nx]; c++;
            }
            s[y * W + x] = t / c;
        }
        int minX = W, minY = H, maxX = -1, maxY = -1;
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int i = y * W + x; p[Off(st, W, i) + 3] = (byte)Math.Round(s[i] * 255);
            if (s[i] > 0.05) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        Marshal.Copy(p, 0, d.Scan0, p.Length); b.UnlockBits(d);
        int pad = 4;
        minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad); maxX = Math.Min(W - 1, maxX + pad); maxY = Math.Min(H - 1, maxY + pad);
        Rectangle r = new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
        int oh = outH, ow = (int)Math.Round((double)r.Width * outH / r.Height);
        Bitmap o2 = new Bitmap(ow, oh, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(o2)) {
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            g.DrawImage(b, new Rectangle(0, 0, ow, oh), r, GraphicsUnit.Pixel);
        }
        o2.Save(outp, ImageFormat.Png); o2.Dispose(); b.Dispose();
    }
    static int Off(int st, int W, int i) { return (i / W) * st + (i % W) * 4; }
    static double Lum(byte[] p, int st, int W, int i) { int o = Off(st, W, i); return 0.114 * p[o] + 0.587 * p[o + 1] + 0.299 * p[o + 2]; }
}
'@
if (-not ("SpriteFinisher" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
[SpriteFinisher]::Run($In, $Out, $Tolerance, $Height)
"sprite -> $Out"
