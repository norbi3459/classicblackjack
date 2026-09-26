# Finds the dark round circles in a drawn sprite and returns their centres/radii in layout px.
# Usage: find_circles.ps1 -Sprite <png> -Rect x,y,w,h -Out <json>
param([string]$Sprite, [double[]]$Rect, [string]$Out, [int]$MinArea = 150)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$code = @'
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class CircleFinder {
    public static List<double[]> Find(string path, int minArea) {
        Bitmap s = new Bitmap(path); int W = s.Width, H = s.Height;
        Bitmap b = new Bitmap(W, H, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(b)) g.DrawImage(s, 0, 0, W, H); s.Dispose();
        BitmapData d = b.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] p = new byte[d.Stride * H]; Marshal.Copy(d.Scan0, p, 0, p.Length); int st = d.Stride; b.UnlockBits(d); b.Dispose();
        bool[] dark = new bool[W * H];
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
            int o = y * st + x * 4; if (p[o + 3] < 200) continue;
            int mx = Math.Max(p[o], Math.Max(p[o + 1], p[o + 2]));
            dark[y * W + x] = mx < 95;
        }
        int[] lab = new int[W * H]; var res = new List<double[]>(); var q = new Queue<int>(); int next = 1;
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        for (int i = 0; i < W * H; i++) {
            if (!dark[i] || lab[i] != 0) continue;
            long sx = 0, sy = 0; int n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0; q.Enqueue(i); lab[i] = next;
            while (q.Count > 0) {
                int c = q.Dequeue(), x = c % W, y = c / W; sx += x; sy += y; n++;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                for (int k = 0; k < 4; k++) { int nx = x + dx[k], ny = y + dy[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; int j = ny * W + nx; if (!dark[j] || lab[j] != 0) continue; lab[j] = next; q.Enqueue(j); }
            }
            next++;
            int bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            double fill = (double)n / (bw * bh), ar = (double)bw / bh;
            // round blob: fills ~pi/4 of its box, aspect ~1
            if (n >= minArea && ar > 0.75 && ar < 1.33 && fill > 0.6 && fill < 0.92)
                res.Add(new double[] { (double)sx / n / W, (double)sy / n / H, (bw + bh) / 4.0 / W, n });
        }
        return res;
    }
}
'@
if (-not ("CircleFinder" -as [type])) { Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing }
$found = [CircleFinder]::Find($Sprite, $MinArea)
$list = @($found | ForEach-Object { [ordered]@{ x = [math]::Round($Rect[0] + $_[0] * $Rect[2], 1); y = [math]::Round($Rect[1] + $_[1] * $Rect[3], 1); r = [math]::Round($_[2] * $Rect[2], 1) } })
ConvertTo-Json -InputObject $list | Set-Content $Out -Encoding UTF8
"$($list.Count) circles"
