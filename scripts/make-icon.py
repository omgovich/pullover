#!/usr/bin/env python3
"""Turn the source artwork into build/icon.icns (macOS squircle + Apple padding).

Usage: python3 scripts/make-icon.py [source] [crop]   (source defaults to build/icon-source.jpg)

`crop` is the side of the square cut from the source, centred on the braid —
smaller crop means a tighter composition. Default 1250 (source is 2048).
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BODY, SS, CANVAS = 824, 4, 1024  # Apple's grid: 824 body inside a 1024 canvas
BUILD = Path('build')


def squircle(side: int, n: float = 5.0) -> Image.Image:
    """Superellipse mask approximating the macOS continuous-corner shape."""
    mask = Image.new('L', (side, side), 0)
    pts = []
    for i in range(2048):
        t = 2 * math.pi * i / 2048
        ct, st = math.cos(t), math.sin(t)
        x = math.copysign(abs(ct) ** (2.0 / n), ct)
        y = math.copysign(abs(st) ** (2.0 / n), st)
        pts.append(((x + 1) / 2 * (side - 1), (y + 1) / 2 * (side - 1)))
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    return mask


def main(src: str, crop: int) -> None:
    im = Image.open(src).convert('RGB')
    cx, cy = im.width // 2, 1022 * im.height // 2048  # braid sits just above centre
    art = im.crop((cx - crop // 2, cy - crop // 2, cx + crop // 2, cy + crop // 2))

    BUILD.mkdir(exist_ok=True)
    art.resize((CANVAS, CANVAS), Image.LANCZOS).save(BUILD / 'icon-fullbleed.png')

    body = art.resize((BODY * SS, BODY * SS), Image.LANCZOS).convert('RGBA')
    body.putalpha(squircle(BODY * SS))
    body = body.resize((BODY, BODY), Image.LANCZOS)

    icon = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    icon.paste(body, ((CANVAS - BODY) // 2, (CANVAS - BODY) // 2), body)
    icon.save(BUILD / 'icon.png')

    iconset = BUILD / 'icon.iconset'
    subprocess.run(['rm', '-rf', iconset], check=True)
    iconset.mkdir()
    for px, name in [(16, 'icon_16x16'), (32, 'icon_16x16@2x'), (32, 'icon_32x32'),
                     (64, 'icon_32x32@2x'), (128, 'icon_128x128'), (256, 'icon_128x128@2x'),
                     (256, 'icon_256x256'), (512, 'icon_256x256@2x'), (512, 'icon_512x512'),
                     (1024, 'icon_512x512@2x')]:
        icon.resize((px, px), Image.LANCZOS).save(iconset / f'{name}.png')
    subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(BUILD / 'icon.icns')], check=True)
    subprocess.run(['rm', '-rf', iconset], check=True)
    print(f'build/icon.icns ← {src} (crop {crop})')


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'build/icon-source.jpg'
    main(src, int(sys.argv[2]) if len(sys.argv) > 2 else 1250)
