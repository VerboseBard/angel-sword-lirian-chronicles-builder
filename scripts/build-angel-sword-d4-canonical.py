"""Build a clean, number-free Angel Sword D4 panel without touching its line art.

The AI-edited reference supplies only pearlescent ivory texture. The original
panel supplies every structural pixel: frame, blue inlays, filigree, sword,
wings, jewel, and alpha. Feathered, locally color-matched texture patches cover
the three legacy numerals so the JavaScript roller can add one authoritative
corner-number layer later.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "dice" / "new-angelsword" / "d4-canonical-source.png"
TEXTURE_REFERENCE = ROOT / "assets" / "dice" / "new-angelsword" / "d4-numberless-texture-reference.png"
OUTPUT = ROOT / "assets" / "dice" / "new-angelsword" / "d4-canonical-blank.png"


def soft_ellipse(size, feather=5):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    inset = feather * 2
    draw.ellipse((inset, inset, size[0] - inset, size[1] - inset), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))


def antialiased_polygon_mask(size, points, scale=4, feather=0.8):
    """Return a softly antialiased polygon mask in the image's coordinates."""
    mask = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    scaled_points = [(round(x * scale), round(y * scale)) for x, y in points]
    ImageDraw.Draw(mask).polygon(scaled_points, fill=255)
    mask = mask.resize(size, Image.Resampling.LANCZOS)
    return mask.filter(ImageFilter.GaussianBlur(feather)) if feather else mask


def matched_texture_patch(reference, source, box, sample_box, angle=0):
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    patch = reference.crop(sample_box).resize((width, height), Image.Resampling.LANCZOS)
    if angle:
        patch = patch.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)

    patch_array = np.asarray(patch.convert("RGB"), dtype=np.float32)
    source_array = np.asarray(source.convert("RGB"), dtype=np.float32)

    # Match each repaired area to a narrow ring around its destination. This
    # removes the pale circular look of the earlier deterministic overlays.
    ring_left = max(0, left - 8)
    ring_top = max(0, top - 8)
    ring_right = min(source.width, right + 8)
    ring_bottom = min(source.height, bottom + 8)
    ring = source_array[ring_top:ring_bottom, ring_left:ring_right]
    ring_pixels = ring.reshape(-1, 3)
    ivory = ring_pixels[
        (ring_pixels[:, 0] > 168)
        & (ring_pixels[:, 1] > 155)
        & (ring_pixels[:, 2] > 140)
        & ((ring_pixels.max(axis=1) - ring_pixels.min(axis=1)) < 78)
    ]
    if len(ivory) < 32:
        ivory = ring_pixels
    ring_mean = ivory.mean(axis=0)
    ring_std = np.maximum(ivory.std(axis=0), 3.0)
    patch_mean = patch_array.reshape(-1, 3).mean(axis=0)
    patch_std = np.maximum(patch_array.reshape(-1, 3).std(axis=0), 3.0)
    corrected = (patch_array - patch_mean) * np.minimum(ring_std / patch_std, 1.35) + ring_mean
    corrected = np.clip(corrected, 0, 255).astype(np.uint8)
    return Image.fromarray(corrected, mode="RGB").convert("RGBA")


def repeat_apex_corner_module(canvas):
    """Use one approved apex sector for all three D4 result corners.

    The prior art used three separately drawn blue corner fields. Rotating the
    complete apex sector around the equilateral triangle centroid gives every
    possible upward result the same blue-to-gold ratio and spacing.
    """
    center = (192.0, 247.67)
    top_sector = ((192.0, 24.0), (263.5, 171.0), (120.5, 171.0))
    source_mask = antialiased_polygon_mask(canvas.size, top_sector)
    source = canvas.copy()
    output = canvas.copy()

    for angle in (120.0, -120.0):
        rotated_source = source.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            center=center,
            expand=False,
        )
        rotated_mask = source_mask.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            center=center,
            expand=False,
        )
        output.paste(rotated_source, (0, 0), rotated_mask)

    # The corner sectors meet behind the central sword-and-wings emblem. Keep
    # that authoritative line art pixel-for-pixel while retaining the repeated
    # corner treatment around it.
    emblem_polygon = (
        (192, 171), (222, 198), (286, 218), (286, 251),
        (238, 272), (214, 328), (170, 328), (146, 272),
        (98, 251), (98, 218), (162, 198),
    )
    emblem_mask = antialiased_polygon_mask(canvas.size, emblem_polygon, feather=0.6)
    output.paste(source, (0, 0), emblem_mask)
    output.putalpha(canvas.getchannel("A"))
    return output


def main():
    source = Image.open(SOURCE).convert("RGBA")
    reference_full = Image.open(TEXTURE_REFERENCE).convert("RGB")

    # Crop the generated triangle itself, then normalize it to the original
    # 384-pixel coordinate system. Only interior ivory is sampled below.
    reference = reference_full.crop((79, 69, 1176, 1171)).resize(source.size, Image.Resampling.LANCZOS)
    result = source.copy()

    repairs = [
        # destination box, clean ivory sample, sample rotation
        ((152, 88, 232, 184), (140, 88, 220, 172), 0),
        ((78, 246, 154, 350), (140, 88, 220, 172), -16),
        ((232, 246, 308, 350), (140, 88, 220, 172), 16),
    ]
    for box, sample_box, angle in repairs:
        patch = matched_texture_patch(reference, source, box, sample_box, angle)
        mask = soft_ellipse((box[2] - box[0], box[3] - box[1]), feather=5)
        result.alpha_composite(Image.composite(patch, result.crop(box), mask), dest=(box[0], box[1]))

    # Remove the last short baseline left immediately above the sword handle.
    artifact_box = (170, 158, 214, 183)
    patch = matched_texture_patch(
        reference,
        source,
        artifact_box,
        (143, 114, 187, 139),
    )
    artifact_mask = soft_ellipse(
        (artifact_box[2] - artifact_box[0], artifact_box[3] - artifact_box[1]),
        feather=2,
    )
    result.alpha_composite(
        Image.composite(patch, result.crop(artifact_box), artifact_mask),
        dest=(artifact_box[0], artifact_box[1]),
    )

    result = repeat_apex_corner_module(result)

    # The destination alpha and all pixels outside the three feathered repair
    # regions remain exactly those of the original face.
    result.putalpha(source.getchannel("A"))
    result.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
