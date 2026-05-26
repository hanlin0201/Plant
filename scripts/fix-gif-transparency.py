from PIL import Image, ImageSequence
from pathlib import Path
import argparse

DEFAULT_BG_COLORS = [(254, 254, 254), (237, 237, 237)]


def parse_rgb(values):
    colors = []
    for v in values:
        parts = v.split(',')
        if len(parts) != 3:
            raise ValueError(f'Invalid color: {v}, expected r,g,b')
        colors.append(tuple(int(x) for x in parts))
    return colors


def fix_gif_transparency(src: Path, dst: Path, bg_colors, tolerance: int):
    im = Image.open(src)
    frames = []
    durations = []

    for frame in ImageSequence.Iterator(im):
        rgba = frame.convert('RGBA')
        pixels = list(rgba.getdata())
        output = []
        for r, g, b, a in pixels:
            is_bg = any(
                abs(r - br) <= tolerance and abs(g - bg) <= tolerance and abs(b - bb) <= tolerance
                for br, bg, bb in bg_colors
            )
            output.append((0, 0, 0, 0) if is_bg else (r, g, b, a))

        rgba.putdata(output)
        frames.append(rgba.quantize(colors=255, method=Image.Quantize.FASTOCTREE))
        durations.append(frame.info.get('duration', im.info.get('duration', 80)))

    frames[0].save(
        dst,
        save_all=True,
        append_images=frames[1:],
        loop=im.info.get('loop', 0),
        duration=durations,
        transparency=0,
        disposal=2,
        optimize=False,
    )


def main():
    parser = argparse.ArgumentParser(description='Replace checkerboard background in GIF with transparency.')
    parser.add_argument('inputs', nargs='+', help='Input GIF files')
    parser.add_argument('--suffix', default='_fixed', help='Output suffix before extension')
    parser.add_argument('--tolerance', type=int, default=10, help='Color match tolerance')
    parser.add_argument('--bg', nargs='*', default=['254,254,254', '237,237,237'], help='Background colors, e.g. 254,254,254')
    parser.add_argument('--overwrite', action='store_true', help='Overwrite source file')
    args = parser.parse_args()

    bg_colors = parse_rgb(args.bg)

    for raw in args.inputs:
        src = Path(raw)
        if not src.exists():
            print(f'[skip] missing: {src}')
            continue
        if src.suffix.lower() != '.gif':
            print(f'[skip] not gif: {src}')
            continue

        dst = src if args.overwrite else src.with_name(f'{src.stem}{args.suffix}{src.suffix}')
        fix_gif_transparency(src, dst, bg_colors, args.tolerance)
        print(f'[ok] {src} -> {dst}')


if __name__ == '__main__':
    main()
