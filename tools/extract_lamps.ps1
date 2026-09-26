param(
  [string]$Lamps,      # artwork/lamps.json
  [string]$Panel,      # "top" or "reel"
  [string]$Texture,    # 2048-wide restored artwork
  [string]$OutDir,     # game/assets/lamps
  [string]$BaseOut,    # unlit base image
  [string]$Overrides = ""  # optional json { "id": "rect" | "ellipse" | "auto" }
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class LampCutter {
    static int W, H, ST; static byte[] P;

    public static void Load(string path) {
        Bitmap s = new Bitmap(path);
        W = s.Width; H = s.Height;
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) g.DrawImage(s, 0, 0, W, H);
        s.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        ST = d.Stride; P = new byte[ST * H]; Marshal.Copy(d.Scan0, P, 0, P.Length); b.UnlockBits(d); b.Dispose();
    }

    static double Lum(int x, int y) { int o = y * ST + x * 4; return 0.114 * P[o] + 0.587 * P[o + 1] + 0.299 * P[o + 2]; }
    static double Sat(int x, int y) { int o = y * ST + x * 4; int mx = Math.Max(P[o], Math.Max(P[o + 1], P[o + 2])), mn = Math.Min(P[o], Math.Min(P[o + 1], P[o + 2])); return mx == 0 ? 0 : (mx - mn) / (double)mx; }

    static int Otsu(double[] v) {
        int[] hist = new int[256]; foreach (double x in v) hist[Math.Min(255, Math.Max(0, (int)x))]++;
        double total = v.Length, sum = 0; for (int i = 0; i < 256; i++) sum += i * hist[i];
        double sumB = 0, wB = 0, best = -1; int th = 100;
        for (int t = 0; t < 256; t++) {
            wB += hist[t]; if (wB == 0) continue; double wF = total - wB; if (wF == 0) break;
            sumB += t * hist[t]; double mB = sumB / wB, mF = (sum - sumB) / wF;
            double between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; th = t; }
        }
        return th;
    }

    static bool[] Dilate(bool[] m, int w, int h, int r) {
        bool[] o = new bool[w * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            if (!m[y * w + x]) continue;
            for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; o[ny * w + nx] = true;
            }
        }
        return o;
    }
    static bool[] Erode(bool[] m, int w, int h, int r) {
        bool[] inv = new bool[w * h]; for (int i = 0; i < m.Length; i++) inv[i] = !m[i];
        bool[] d = Dilate(inv, w, h, r); bool[] o = new bool[w * h]; for (int i = 0; i < m.Length; i++) o[i] = !d[i]; return o;
    }

    // returns soft alpha (0..1) for the crop (cx,cy,cw,ch)
    public static double[] Mask(int cx, int cy, int cw, int ch, string shape, int rx, int ry, int rw, int rh) {
        double[] a = new double[cw * ch];
        if (shape == "tri") {
            // upward triangle filling the lamp rect, soft edge
            double ax = rx, ay = ry + rh, bx = rx + rw, by = ry + rh, tx = rx + rw / 2.0, ty = ry;
            Func<double, double, double, double, double, double, double> side = (x1, y1, x2, y2, px, py) => {
                double nx = y2 - y1, ny = x1 - x2, len = Math.Sqrt(nx * nx + ny * ny);
                return ((px - x1) * nx + (py - y1) * ny) / len;
            };
            for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
                double px = x + cx, py = y + cy;
                double d = Math.Min(Math.Min(-side(ax, ay, bx, by, px, py), -side(bx, by, tx, ty, px, py)), -side(tx, ty, ax, ay, px, py));
                a[y * cw + x] = Math.Max(0, Math.Min(1, (d + 2) / 5));
            }
            // orientation of the edge normals depends on winding; flip if the centre came out empty
            int ci = (ry + rh * 2 / 3 - cy) * cw + (rx + rw / 2 - cx);
            if (ci >= 0 && ci < a.Length && a[ci] < 0.5) {
                for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
                    double px = x + cx, py = y + cy;
                    double d = Math.Min(Math.Min(side(ax, ay, bx, by, px, py), side(bx, by, tx, ty, px, py)), side(tx, ty, ax, ay, px, py));
                    a[y * cw + x] = Math.Max(0, Math.Min(1, (d + 2) / 5));
                }
            }
            return a;
        }
        if (shape == "rect" || shape == "ellipse") {
            for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
                double u = (x + cx - rx) / (double)rw, v = (y + cy - ry) / (double)rh; // 0..1 inside the lamp rect
                double e;
                if (shape == "ellipse") { double dx = (u - 0.5) * 2, dy = (v - 0.5) * 2; e = (1 - Math.Sqrt(dx * dx + dy * dy)) * Math.Min(rw, rh) / 2; }
                else e = Math.Min(Math.Min(u, 1 - u) * rw, Math.Min(v, 1 - v) * rh);
                a[y * cw + x] = Math.Max(0, Math.Min(1, (e + 2) / 6));
            }
            return a;
        }
        // auto: Otsu on luminance+saturation, fill holes, keep central components, grow over the dark outline
        double[] score = new double[cw * ch];
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) score[y * cw + x] = Lum(cx + x, cy + y) * (0.6 + 0.8 * Sat(cx + x, cy + y));
        int th = Otsu(score);
        bool[] fg = new bool[cw * ch];
        for (int i = 0; i < fg.Length; i++) fg[i] = score[i] > th;
        fg = Erode(Dilate(fg, cw, ch, 3), cw, ch, 3);
        // fill holes: background = not-fg reachable from the crop border
        bool[] reach = new bool[cw * ch]; Queue<int> q = new Queue<int>();
        Action<int> seed = i => { if (!fg[i] && !reach[i]) { reach[i] = true; q.Enqueue(i); } };
        for (int x = 0; x < cw; x++) { seed(x); seed((ch - 1) * cw + x); }
        for (int y = 0; y < ch; y++) { seed(y * cw); seed(y * cw + cw - 1); }
        int[] ddx = { 1, -1, 0, 0 }, ddy = { 0, 0, 1, -1 };
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % cw, y = i / cw;
            for (int k = 0; k < 4; k++) { int nx = x + ddx[k], ny = y + ddy[k]; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue; seed(ny * cw + nx); }
        }
        for (int i = 0; i < fg.Length; i++) fg[i] = !reach[i];
        // keep components that reach the middle part of the lamp rect
        int[] lab = new int[cw * ch]; int next = 1; HashSet<int> keep = new HashSet<int>();
        int mx0 = rx - cx + rw / 4, mx1 = rx - cx + rw * 3 / 4, my0 = ry - cy + rh / 4, my1 = ry - cy + rh * 3 / 4;
        for (int i = 0; i < fg.Length; i++) {
            if (!fg[i] || lab[i] != 0) continue;
            int id = next++; bool central = false; q.Enqueue(i); lab[i] = id;
            while (q.Count > 0) {
                int c = q.Dequeue(), x = c % cw, y = c / cw;
                if (x >= mx0 && x <= mx1 && y >= my0 && y <= my1) central = true;
                for (int k = 0; k < 4; k++) { int nx = x + ddx[k], ny = y + ddy[k]; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue; int j = ny * cw + nx; if (!fg[j] || lab[j] != 0) continue; lab[j] = id; q.Enqueue(j); }
            }
            if (central) keep.Add(id);
        }
        for (int i = 0; i < fg.Length; i++) fg[i] = lab[i] > 0 && keep.Contains(lab[i]);
        fg = Dilate(fg, cw, ch, 3);
        // clip to the lamp rect (+margin) so neighbours never leak in
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
            int X = x + cx, Y = y + cy;
            if (X < rx - 6 || X > rx + rw + 6 || Y < ry - 6 || Y > ry + rh + 6) fg[y * cw + x] = false;
        }
        int count = 0; foreach (bool b in fg) if (b) count++;
        if (count < rw * rh / 12) return Mask(cx, cy, cw, ch, "rect", rx, ry, rw, rh); // segmentation failed -> soft rect
        // feather
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
            double s = 0; int n = 0;
            for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
                int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue; s += fg[ny * cw + nx] ? 1 : 0; n++;
            }
            a[y * cw + x] = s / n;
        }
        return a;
    }

    public static void SaveLamp(string outPath, int cx, int cy, int cw, int ch, double[] a) {
        Bitmap b = new Bitmap(cw, ch, PixelFormat.Format32bppArgb);
        BitmapData d = b.LockBits(new Rectangle(0, 0, cw, ch), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] o = new byte[d.Stride * ch];
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) {
            int s = (y + cy) * ST + (x + cx) * 4, t = y * d.Stride + x * 4;
            o[t] = P[s]; o[t + 1] = P[s + 1]; o[t + 2] = P[s + 2]; o[t + 3] = (byte)Math.Round(a[y * cw + x] * 255);
        }
        Marshal.Copy(o, 0, d.Scan0, o.Length); b.UnlockBits(d); b.Save(outPath, ImageFormat.Png); b.Dispose();
    }

    // darken + desaturate the lamp areas in a copy of the artwork = the "all lamps off" base image
    static double[] off;
    public static void BeginBase() { off = new double[W * H]; }
    public static void AddToBase(int cx, int cy, int cw, int ch, double[] a) {
        for (int y = 0; y < ch; y++) for (int x = 0; x < cw; x++) { int i = (y + cy) * W + (x + cx); off[i] = Math.Max(off[i], a[y * cw + x]); }
    }
    public static void SaveBase(string outPath, double dim, double desat) {
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        byte[] o = new byte[d.Stride * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int s = y * ST + x * 4, t = y * d.Stride + x * 4; double m = off[y * W + x];
            double l = 0.114 * P[s] + 0.587 * P[s + 1] + 0.299 * P[s + 2];
            double f = 1 - dim * m, ds = desat * m;
            for (int c = 0; c < 3; c++) { double v = (P[s + c] * (1 - ds) + l * ds) * f; o[t + c] = (byte)Math.Round(Math.Min(255, Math.Max(0, v))); }
            o[t + 3] = P[s + 3];
        }
        Marshal.Copy(o, 0, d.Scan0, o.Length); b.UnlockBits(d); b.Save(outPath, ImageFormat.Png); b.Dispose();
    }
    public static int Width { get { return W; } }
    public static int Height { get { return H; } }
}
'@
if (-not ("LampCutter" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$all = Get-Content $Lamps -Raw | ConvertFrom-Json
$list = @($all | Where-Object { $_.panel -eq $Panel })
$ov = @{}
if ($Overrides -and (Test-Path $Overrides)) { (Get-Content $Overrides -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $ov[$_.Name] = $_.Value } }
New-Item -ItemType Directory -Force $OutDir | Out-Null
[LampCutter]::Load($Texture)
[LampCutter]::BeginBase()
$manifest = @{}
foreach ($l in $list) {
  $r = $l.rect; $pad = 10
  $cx = [math]::Max(0, $r[0] - $pad); $cy = [math]::Max(0, $r[1] - $pad)
  $cw = [math]::Min([LampCutter]::Width - $cx, $r[2] + 2 * $pad); $ch = [math]::Min([LampCutter]::Height - $cy, $r[3] + 2 * $pad)
  $shape = if ($ov.ContainsKey($l.id)) { $ov[$l.id] } else { $l.shape }
  $a = [LampCutter]::Mask($cx, $cy, $cw, $ch, $shape, $r[0], $r[1], $r[2], $r[3])
  [LampCutter]::SaveLamp("$OutDir\$($l.id).png", $cx, $cy, $cw, $ch, $a)
  [LampCutter]::AddToBase($cx, $cy, $cw, $ch, $a)
  $manifest[$l.id] = @($cx, $cy, $cw, $ch)
}
[LampCutter]::SaveBase($BaseOut, 0.62, 0.45)
$manifest | ConvertTo-Json -Compress | Set-Content "$OutDir\_$Panel.json" -Encoding utf8
"$($list.Count) lamps cut for $Panel"
