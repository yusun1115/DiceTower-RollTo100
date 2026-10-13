export const assetUrls = {
  hero: new URL('../public/assets/runtime/hero.webp', import.meta.url).href,
  goblin: new URL('../public/assets/runtime/goblin.webp', import.meta.url).href,
  slime: new URL('../public/assets/runtime/slime.webp', import.meta.url).href,
  bat: new URL('../public/assets/runtime/bat.webp', import.meta.url).href,
  ghost: new URL('../public/assets/runtime/ghost.webp', import.meta.url).href,
  mini: new URL('../public/assets/runtime/mini.webp', import.meta.url).href,
  final: new URL('../public/assets/runtime/final.webp', import.meta.url).href,
  dice: new URL('../public/assets/runtime/dice.webp', import.meta.url).href,
  items: new URL('../public/assets/runtime/items.webp', import.meta.url).href,
  chest: new URL('../public/assets/runtime/chest.webp', import.meta.url).href,
  tower: new URL('../public/assets/runtime/tower.webp', import.meta.url).href,
  room: new URL('../public/assets/runtime/room.webp', import.meta.url).href,
  shop: new URL('../public/assets/runtime/shop.webp', import.meta.url).href
};
export type AssetName = keyof typeof assetUrls;

export class Assets {
  private images = new Map<AssetName, HTMLImageElement>();
  private failed = new Set<AssetName>();
  private disabled = import.meta.env.DEV && new URLSearchParams(location.search).get('assets') === 'off';
  get(name: AssetName): HTMLImageElement | null {
    if (this.disabled || this.failed.has(name)) return null;
    let image = this.images.get(name);
    if (!image) {
      image = new Image(); this.images.set(name, image);
      image.onerror = () => { this.failed.add(name); };
      image.src = assetUrls[name];
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
  }
  preload(...names: AssetName[]): void { names.forEach(name => this.get(name)); }
}

export const ITEM_FRAMES: Record<string, number> = {
  'iron-sword': 0, 'arc-blade': 1, 'thunder-greatsword': 2, 'ranged-edge': 3,
  'thorn-trail': 4, 'flame-dash': 5, 'heart-potion': 6, 'coin-magnet': 7
};
export const ITEM_SYMBOLS: Record<string, string> = {
  'iron-sword':'⚔', 'arc-blade':'⚔', 'thunder-greatsword':'ϟ', 'ranged-edge':'➶',
  'thorn-trail':'▲', 'flame-dash':'♨', 'heart-potion':'♥', 'coin-magnet':'●'
};
