import type { ShopSnapshot, Vec2 } from './domain.js';

export const SHOP_INTERACT_RADIUS = 68;
export const PLAYER_PROTECTION_MS = 900;
export const OWNER_TRAIL_ARM_MS = 400;

export function createWorldShop(floor: number): ShopSnapshot {
  return {
    floor, playerPosition: {x:480,y:425}, exitPosition:{x:890,y:445},
    pedestals: Array.from({length:4},(_,index)=>({slotId:`${floor}-${index}`,position:{x:210+index*180,y:250}}))
  };
}

export function shopDistance(a: Vec2, b: Vec2): number { return Math.hypot(a.x-b.x,a.y-b.y); }
export function nearestShopPedestal(shop: ShopSnapshot): ShopSnapshot['pedestals'][number] | undefined {
  return shop.pedestals.filter(p=>shopDistance(p.position,shop.playerPosition)<=SHOP_INTERACT_RADIUS)
    .sort((a,b)=>shopDistance(a.position,shop.playerPosition)-shopDistance(b.position,shop.playerPosition))[0];
}
