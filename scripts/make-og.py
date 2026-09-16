from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

root = Path(r"e:\soumtok\public")
img_dir = root / "images"

W, H = 1200, 630

land = Image.open(img_dir / "landscape-hero.png").convert("RGB")
scale = max(W / land.width, H / land.height)
land = land.resize((int(land.width * scale), int(land.height * scale)), Image.Resampling.LANCZOS)
left = (land.width - W) // 2
top = (land.height - H) // 2
land = land.crop((left, top, left + W, top + H))
land = ImageEnhance.Brightness(land).enhance(0.38)
land = ImageEnhance.Color(land).enhance(0.7)
land = land.filter(ImageFilter.GaussianBlur(1.2))

canvas = Image.new("RGB", (W, H), (11, 11, 10))
canvas.paste(land, (0, 0))

overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)
for x in range(0, 780):
    a = int(210 * (1 - x / 780) ** 0.55)
    draw.line([(x, 0), (x, H)], fill=(11, 11, 10, a))
for y in range(H - 90, H):
    a = int(140 * ((y - (H - 90)) / 90))
    draw.line([(0, y), (W, y)], fill=(11, 11, 10, a))
canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)

shot = Image.open(img_dir / "dashboard-preview.png").convert("RGB")
sw, sh = 620, 390
s = max(sw / shot.width, sh / shot.height)
shot = shot.resize((int(shot.width * s), int(shot.height * s)), Image.Resampling.LANCZOS)
cx = (shot.width - sw) // 2
cy = max(0, (shot.height - sh) // 5)
shot = shot.crop((cx, cy, cx + sw, cy + sh))

radius = 18
mask = Image.new("L", (sw, sh), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((0, 0, sw - 1, sh - 1), radius=radius, fill=255)
card = Image.new("RGBA", (sw, sh))
card.paste(shot)
card.putalpha(mask)

frame = Image.new("RGBA", (sw + 2, sh + 2), (0, 0, 0, 0))
fd = ImageDraw.Draw(frame)
fd.rounded_rectangle((0, 0, sw + 1, sh + 1), radius=radius + 1, outline=(245, 78, 0, 90), width=1)
sx, sy = 530, 140
canvas.alpha_composite(frame, (sx - 1, sy - 1))
canvas.alpha_composite(card, (sx, sy))

lock = Image.open(img_dir / "soumtok-lockup.png").convert("RGBA")
bbox = lock.getbbox()
if bbox:
    lock = lock.crop(bbox)
lh = 52
lw = int(lock.width * (lh / lock.height))
lock = lock.resize((lw, lh), Image.Resampling.LANCZOS)
canvas.alpha_composite(lock, (72, 88))


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = Path(r"C:\Windows\Fonts") / name
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default()


title_font = font("segoeuib.ttf", 54)
body_font = font("segoeui.ttf", 24)
small_font = font("segoeui.ttf", 18)
kicker_font = font("segoeuib.ttf", 16)

text = ImageDraw.Draw(canvas)
text.text((72, 168), "AFRICA'S #1 CODING PLATFORM", font=kicker_font, fill=(245, 78, 0, 255))
text.multiline_text(
    (72, 198),
    "A coding agent for\nthe desks that ship.",
    font=title_font,
    fill=(255, 255, 255, 255),
    spacing=6,
)
text.multiline_text(
    (72, 340),
    "Studio. GitHub. Frontier models.\nHand the work over.",
    font=body_font,
    fill=(200, 200, 194, 255),
    spacing=6,
)
text.text((72, 540), "Built in Nairobi  ·  soumtok.com", font=small_font, fill=(143, 143, 136, 255))

rgb = canvas.convert("RGB")
rgb.save(root / "og.png", "PNG", optimize=True)
rgb.save(root / "og.jpg", "JPEG", quality=88, optimize=True, progressive=True)
print("png", (root / "og.png").stat().st_size, "jpg", (root / "og.jpg").stat().st_size)
