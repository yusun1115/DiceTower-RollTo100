"""Package existing game art; preserve originals and share one scale/foot anchor.

Uses the installed sprite-pipeline normalizer, not generative image editing.
Only runtime derivatives are required by the client build.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--normalizer', required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('sprite_normalizer', args.normalizer)
normalizer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(normalizer)
root = Path(__file__).resolve().parents[1] / 'apps/client/public/assets'
out = root / 'runtime'
out.mkdir(parents=True, exist_ok=True)
manifest = {}

def sheet(name, source, columns, rows, cell, normalize=True):
    image = Image.open(root / source).convert('RGBA')
    slots = [image.crop((round(x * image.width / columns), round(y * image.height / rows),
                         round((x + 1) * image.width / columns), round((y + 1) * image.height / rows)))
             for y in range(rows) for x in range(columns)]
    if normalize:
        contents = [normalizer.crop_to_content(slot, 8) for slot in slots]
        largest = normalizer.max_content_size(contents)
        scale = min(cell / largest[0], cell / largest[1]) * .94
        frames = [normalizer.compose_frame(frame, cell, scale) for frame in contents]
    else:
        frames = [slot.resize((cell, cell), Image.Resampling.LANCZOS) for slot in slots]
    packed = Image.new('RGBA', (cell * len(frames), cell))
    for i, frame in enumerate(frames):
        packed.alpha_composite(frame, (i * cell, 0))
    target = out / (name + '.webp')
    packed.save(target, 'WEBP', quality=88, method=6)
    manifest[name] = dict(source=source, cell=cell, frames=len(frames), width=packed.width,
                          height=packed.height, pivot=[.5, 1], bytes=target.stat().st_size)

for name, source in [('hero', 'player-hero'), ('goblin', 'monster-goblin'),
                     ('slime', 'monster-slime'), ('bat', 'monster-bat'),
                     ('ghost', 'hazard-ghost'), ('mini', 'boss-mini'), ('final', 'boss-final')]:
    sheet(name, f'characters/animations/{source}-animations.png', 4, 4, 96)
sheet('dice', 'ui/dice-faces.png', 3, 2, 160, False)
sheet('items', 'items/item-icons.png', 4, 2, 96)
sheet('chest', 'props/chest-states.png', 2, 1, 96)

for name, source, size in [
    ('tower', 'environment/backgrounds/tower-progression-background.png', (512, 768)),
    ('room', 'environment/backgrounds/dungeon-normal-room.png', (960, 540)),
    ('shop', 'environment/backgrounds/shop-interior.png', (960, 640))]:
    image = Image.open(root / source).convert('RGB').resize(size, Image.Resampling.LANCZOS)
    target = out / (name + '.webp')
    image.save(target, 'WEBP', quality=84, method=6)
    manifest[name] = dict(source=source, width=size[0], height=size[1], bytes=target.stat().st_size)
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(manifest), 'totalBytes': sum(x['bytes'] for x in manifest.values()),
                  'assets': manifest}, ensure_ascii=False, indent=2))
