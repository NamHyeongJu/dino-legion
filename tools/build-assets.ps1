# Slices the Dino Nest creature sheets into trimmed frame strips and writes js/sheets.js.
# Usage: powershell -ExecutionPolicy Bypass -File tools\build-assets.ps1 [-Src C:\Git\dino-nest-1\dino-nest-unity]
param([string]$Src = 'C:\Git\dino-nest-1\dino-nest-unity')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$res = Join-Path $Src 'Assets\Resources\DinoNest'
$out = Join-Path $root 'assets'

# Port of DinoArt.Load (frame split by connected components at alpha >= 220, assigned to the
# 3x2 cell holding their centroid) and DinoArt.EnemyVariant (golden / spectral eye detection).
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;

public static class Slicer
{
    static int A(int p) { return (p >> 24) & 255; }
    static int R(int p) { return (p >> 16) & 255; }
    static int G(int p) { return (p >> 8) & 255; }
    static int B(int p) { return p & 255; }
    static string N(double v) { return Math.Round(v, 1).ToString(CultureInfo.InvariantCulture); }

    public static string Slice(string src, string dst, double scale, bool spectral)
    {
        int W, H; int[] px;
        using (var bmp = new Bitmap(src))
        {
            W = bmp.Width; H = bmp.Height; px = new int[W * H];
            var bd = bmp.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            Marshal.Copy(bd.Scan0, px, 0, W * H);
            bmp.UnlockBits(bd);
        }
        int cellW = W / 3, cellH = H / 2;
        var owner = new int[W * H];
        var queue = new int[W * H];
        var minX = new int[6]; var minY = new int[6]; var maxX = new int[6]; var maxY = new int[6];
        for (int f = 0; f < 6; f++) { minX[f] = int.MaxValue; minY[f] = int.MaxValue; maxX[f] = -1; maxY[f] = -1; }
        for (int seed = 0; seed < px.Length; seed++)
        {
            if (owner[seed] != 0 || A(px[seed]) < 220) continue;
            int head = 0, tail = 0; long sx = 0, sy = 0;
            queue[tail++] = seed; owner[seed] = -1;
            while (head < tail)
            {
                int i = queue[head++], y = i / W, x = i - y * W;
                sx += x; sy += y;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dy == 0) continue;
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                    int n = ny * W + nx;
                    if (owner[n] == 0 && A(px[n]) >= 220) { owner[n] = -1; queue[tail++] = n; }
                }
            }
            if (tail < 32) { for (int i = 0; i < tail; i++) owner[queue[i]] = -2; continue; }
            int col = Math.Min(2, Math.Max(0, (int)(sx / tail) / cellW));
            int row = Math.Min(1, Math.Max(0, (int)(sy / tail) / cellH));
            int fr = row * 3 + col;
            for (int i = 0; i < tail; i++)
            {
                int k = queue[i], y = k / W, x = k - y * W;
                owner[k] = fr + 1;
                if (x < minX[fr]) minX[fr] = x; if (y < minY[fr]) minY[fr] = y;
                if (x > maxX[fr]) maxX[fr] = x; if (y > maxY[fr]) maxY[fr] = y;
            }
        }

        var frames = new Bitmap[6];
        var info = new string[6];
        int stripW = 0, stripH = 0;
        for (int f = 0; f < 6; f++)
        {
            if (maxX[f] < 0) { info[f] = null; continue; }
            int x0 = Math.Max(0, minX[f] - 2), y0 = Math.Max(0, minY[f] - 2);
            int x1 = Math.Min(W - 1, maxX[f] + 2), y1 = Math.Min(H - 1, maxY[f] + 2);
            int w = x1 - x0 + 1, h = y1 - y0 + 1;
            var crop = new int[w * h];
            for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++)
            {
                int i = y * W + x;
                bool belongs = owner[i] == f + 1;
                if (!belongs && A(px[i]) > 0)
                    for (int dy = -1; dy <= 1 && !belongs; dy++) for (int dx = -1; dx <= 1 && !belongs; dx++)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < W && ny >= 0 && ny < H && owner[ny * W + nx] == f + 1) belongs = true;
                    }
                if (belongs) crop[(y - y0) * w + x - x0] = px[i];
            }

            // Eye: the brightest small golden blob away from the centre line (purple flame for the spectral rex).
            var mask = new bool[crop.Length];
            for (int i = 0; i < crop.Length; i++)
            {
                int c = crop[i], r = R(c), g = G(c), b = B(c);
                mask[i] = A(c) > 200 && (spectral
                    ? b > 100 && r > 45 && b > r * 1.12 && b > g * 1.4
                    : r > 150 && g > 100 && g < 240 && b < g * .55 && r > g * .95);
            }
            var q = new int[crop.Length];
            double bestScore = 0, ex = double.NaN, ey = 0, er = 0;
            for (int seed = 0; seed < mask.Length; seed++)
            {
                if (!mask[seed]) continue;
                int head = 0, tail = 0, bx0 = w, bx1 = 0, by0 = h, by1 = 0;
                long sx = 0, sy = 0; double bright = 0;
                q[tail++] = seed; mask[seed] = false;
                while (head < tail)
                {
                    int i = q[head++], x = i % w, y = i / w;
                    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
                    sx += x; sy += y; bright += G(crop[i]);
                    for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        int n = ny * w + nx;
                        if (mask[n]) { mask[n] = false; q[tail++] = n; }
                    }
                }
                if (tail < 2 || tail > (spectral ? 25000 : 360) || bx1 - bx0 > (spectral ? 180 : 30) || by1 - by0 > (spectral ? 180 : 30)) continue;
                double cx = sx / (double)tail, cy = sy / (double)tail;
                double score = bright / tail + Math.Abs(cx / w - .5) * 100;
                if (score <= bestScore) continue;
                bestScore = score;
                if (spectral) { ex = bx1 - 8; ey = by1 - 8; er = 10; }
                else { ex = cx + .5; ey = cy + .5; er = Math.Max(bx1 - bx0, by1 - by0) * .5 + 1; }
            }

            int tw = Math.Max(1, (int)Math.Round(w * scale)), th = Math.Max(1, (int)Math.Round(h * scale));
            using (var full = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            {
                var bd = full.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                Marshal.Copy(crop, 0, bd.Scan0, crop.Length);
                full.UnlockBits(bd);
                var small = new Bitmap(tw, th, PixelFormat.Format32bppPArgb);
                using (var g = Graphics.FromImage(small))
                using (var ia = new ImageAttributes())
                {
                    ia.SetWrapMode(WrapMode.TileFlipXY);
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    g.DrawImage(full, new Rectangle(0, 0, tw, th), 0, 0, w, h, GraphicsUnit.Pixel, ia);
                }
                frames[f] = small;
            }
            // [stripX, stripW, stripH, w, h, eyeX, eyeY, eyeR] - sizes in sheet px, eye relative to the bottom-centre pivot.
            info[f] = "[" + stripW + "," + tw + "," + th + "," + w + "," + h + "," +
                (double.IsNaN(ex) ? "null,null,0" : N(ex - w * .5) + "," + N(ey - h) + "," + N(er)) + "]";
            stripW += tw + 2;
            stripH = Math.Max(stripH, th);
        }
        using (var strip = new Bitmap(Math.Max(1, stripW), Math.Max(1, stripH), PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(strip))
            {
                g.CompositingMode = CompositingMode.SourceCopy;
                int x = 0;
                for (int f = 0; f < 6; f++) if (frames[f] != null) { g.DrawImageUnscaled(frames[f], x, 0); x += frames[f].Width + 2; frames[f].Dispose(); }
            }
            strip.Save(dst, ImageFormat.Png);
        }
        var sb = new StringBuilder("[");
        for (int f = 0; f < 6; f++) { if (f > 0) sb.Append(","); sb.Append(info[f] ?? "null"); }
        return sb.Append("]").ToString();
    }
}
'@

$creatures = 'Rex', 'Stego', 'Spino', 'Allo', 'Pachy', 'Trike', 'Raptor', 'Ptero', 'Sauropod', 'Ankylo', 'DeathRex'
$motions = 'Walk', 'Attack', 'Death'
$dir = Join-Path $out 'creatures'
New-Item -ItemType Directory -Force $dir | Out-Null
$lines = @()
foreach ($c in $creatures) {
  $spectral = $c -eq 'DeathRex'
  $scale = if ($spectral) { 0.8 } else { 0.45 }
  foreach ($m in $motions) {
    $name = "$c$m"
    $png = Join-Path $dir "$name.png"
    $fr = [Slicer]::Slice((Join-Path $res "Creatures\$name.bytes"), $png, $scale, $spectral)
    $lines += "  ${name}: { f: 'assets/creatures/$name.png', fr: $fr },"
    Write-Host "  $name"
  }
}

$fonts = Join-Path $out 'fonts'
New-Item -ItemType Directory -Force $fonts | Out-Null
foreach ($f in 'Jua-Regular.ttf', 'BlackHanSans-Regular.ttf', 'OFL-Jua.txt', 'OFL-BlackHanSans.txt') {
  Copy-Item (Join-Path $res "Fonts\$f") (Join-Path $fonts $f) -Force
}

$js = @"
'use strict';
// Generated by tools/build-assets.ps1 from the Dino Nest creature sheets - do not edit.
// Each frame: [stripX, stripW, stripH, w, h, eyeX, eyeY, eyeR]; w/h/eye are in source sheet px,
// eye is relative to the frame's bottom-centre pivot (null when no eye was found).
const SHEETS = {
$($lines -join "`n")
};
"@
Set-Content -Path (Join-Path $root 'js\sheets.js') -Value $js -Encoding UTF8
Write-Host 'assets built'
