#!/usr/bin/env python3
"""Draw the menu-bar glyph and print it as the base64 data URLs tray.ts embeds.

Usage: python3 scripts/make-tray-icon.py

The shape is lucide's `git-pull-request` on a 24x24 grid: a circle at (6,6),
a circle at (18,18), a vertical line down from the first, and a path that
leaves the first circle rightwards, turns a rounded corner, and drops to the
second.

It is a macOS *template* image — pure alpha, no colour. macOS tints it black
on a light menu bar, white on a dark one, and inverts it while the menu is
open, which is why drawing it in black with alpha is correct rather than
picking a colour.

Rendered at 4x and downsampled so the strokes land smooth without any
antialiasing support in ImageDraw.
"""

import base64
import io
import math

from PIL import Image, ImageDraw

SS = 8  # supersampling factor
GRID = 24.0  # lucide's viewBox


def draw(size: int) -> Image.Image:
    px = size * SS
    scale = px / GRID
    img = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(img)
    w = 2.0 * scale  # lucide's stroke-width: 2

    def pt(x: float, y: float) -> tuple[float, float]:
        return x * scale, y * scale

    def circle(cx: float, cy: float, r: float) -> None:
        x, y = pt(cx, cy)
        rr = r * scale
        d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=255, width=round(w))

    def line(x1: float, y1: float, x2: float, y2: float) -> None:
        d.line([pt(x1, y1), pt(x2, y2)], fill=255, width=round(w))

    circle(6, 6, 3)
    circle(18, 18, 3)
    line(6, 9, 6, 21)  # down from the top circle
    line(13, 6, 16, 6)  # out to the right

    # The rounded corner: a quarter arc of radius 2 centred at (16, 8),
    # sweeping from due north to due east, joining the two segments below.
    cx, cy, r = pt(16, 8)[0], pt(16, 8)[1], 2 * scale
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-90, end=0, fill=255, width=round(w))

    line(18, 8, 18, 15)  # down into the bottom circle

    small = img.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.putalpha(small)  # black pixels, alpha from the drawing
    return out


def data_url(size: int) -> str:
    buf = io.BytesIO()
    draw(size).save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    for size in (16, 32):
        url = data_url(size)
        print(f"// {size}x{size}, {len(url)} chars")
        print(f"'{url}',")
        print()
