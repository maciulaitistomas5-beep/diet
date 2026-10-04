"""Draws the app icons (a green tile with a white apple) into ../icons/. Needs Pillow: python3 tools/make_icons.py"""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
GREEN_TOP = (46, 168, 120)
GREEN_BOTTOM = (22, 125, 88)
WHITE = (255, 255, 255)
SS = 4  # supersampling for smooth edges


def tile(size, glyph_scale):
    n = size * SS
    img = Image.new("RGB", (n, n))
    px = img.load()
    for y in range(n):
        t = y / (n - 1)
        row = tuple(int(GREEN_TOP[i] + (GREEN_BOTTOM[i] - GREEN_TOP[i]) * t) for i in range(3))
        for x in range(n):
            px[x, y] = row
    d = ImageDraw.Draw(img)
    cx, cy = n / 2, n * 0.54
    r = n * 0.215 * glyph_scale
    # apple body: two overlapping lobes and a rounded base
    d.ellipse([cx - 1.55 * r, cy - 1.05 * r, cx + 0.15 * r, cy + 1.05 * r], fill=WHITE)
    d.ellipse([cx - 0.15 * r, cy - 1.05 * r, cx + 1.55 * r, cy + 1.05 * r], fill=WHITE)
    d.ellipse([cx - 1.3 * r, cy - 0.2 * r, cx + 1.3 * r, cy + 1.45 * r], fill=WHITE)
    # the notch at the top
    d.ellipse([cx - 0.32 * r, cy - 1.25 * r, cx + 0.32 * r, cy - 0.72 * r], fill=(34, 148, 104))
    # stem
    d.rounded_rectangle([cx - 0.07 * r, cy - 1.75 * r, cx + 0.07 * r, cy - 0.95 * r], radius=0.07 * r, fill=WHITE)
    # leaf
    leaf = Image.new("L", (n, n), 0)
    ld = ImageDraw.Draw(leaf)
    ld.ellipse([cx + 0.1 * r, cy - 2.0 * r, cx + 1.25 * r, cy - 1.25 * r], fill=255)
    leaf = leaf.rotate(-18, center=(cx + 0.65 * r, cy - 1.6 * r))
    img.paste(WHITE, mask=leaf)
    return img.resize((size, size), Image.LANCZOS)


def save(name, size, glyph_scale):
    tile(size, glyph_scale).save(os.path.join(OUT, name), optimize=True)
    print("wrote", name)


os.makedirs(OUT, exist_ok=True)
save("icon-180.png", 180, 1.0)             # iPhone Home Screen (iOS rounds the corners itself)
save("icon-192.png", 192, 1.0)
save("icon-512.png", 512, 1.0)
save("icon-maskable-512.png", 512, 0.78)   # glyph inside the safe zone for adaptive icons
