import type { ChestBlueprint, EffectDefinition, FloorBlueprint, ItemDefinition, MonsterBlueprint, ShopOffer, Vec2 } from './domain.js';
import { deriveSeed, hashSeed, SeededRng } from './rng.js';

export const FLOOR_TIMERS_MS = {
  normal: 90_000,
  'mini-boss': 180_000,
  'final-boss': 300_000
} as const;

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  {
    id: 'iron-sword',
    name: '철검',
    kind: 'weapon',
    price: 8,
    rarity: 'common',
    duration: 5,
    combatFloors: 5,
    tags: ['sword', 'melee'],
    effects: [{ trigger: 'attack', target: 'enemy', effect: 'damage', magnitude: 22, tags: ['physical'] }]
  },
  {
    id: 'arc-blade',
    name: '아크 블레이드',
    kind: 'weapon',
    price: 18,
    rarity: 'rare',
    duration: 3,
    combatFloors: 3,
    tags: ['sword', 'melee', 'arc'],
    effects: [{ trigger: 'attack', target: 'enemy', effect: 'projectile', magnitude: 30, tags: ['arc'] }]
  },
  {
    id: 'thunder-greatsword',
    name: '천둥 대검',
    kind: 'weapon',
    price: 34,
    rarity: 'legendary',
    duration: 1,
    combatFloors: 1,
    tags: ['sword', 'melee', 'thunder'],
    effects: [{ trigger: 'attack', target: 'area', effect: 'damage', magnitude: 70, tags: ['thunder'] }]
  },
  {
    id: 'ranged-edge',
    name: '원거리 칼날',
    kind: 'passive',
    price: 15,
    rarity: 'rare',
    duration: 'match',
    tags: ['projectile', 'sword'],
    effects: [{ trigger: 'attack', target: 'enemy', effect: 'projectile', magnitude: 14, tags: ['sword-wave'] }]
  },
  {
    id: 'thorn-trail',
    name: '가시 발자국',
    kind: 'passive',
    price: 13,
    rarity: 'rare',
    duration: 'match',
    risk: 'owner-harm',
    tags: ['movement', 'thorn', 'risk'],
    effects: [{ trigger: 'move', target: 'trail', effect: 'thorn-trail', magnitude: 12, tags: ['friendly-fire'] }]
  },
  {
    id: 'flame-dash',
    name: '화염 대시',
    kind: 'passive',
    price: 16,
    rarity: 'rare',
    duration: 'match',
    tags: ['dash', 'fire'],
    effects: [{ trigger: 'dash', target: 'area', effect: 'fire-dash', magnitude: 25, tags: ['burn'] }]
  },
  {
    id: 'heart-potion',
    name: '회복 물약',
    kind: 'consumable',
    price: 7,
    rarity: 'common',
    tags: ['heal'],
    effects: [{ trigger: 'use', target: 'self', effect: 'heal', magnitude: 1, tags: ['heart'] }]
  },
  {
    id: 'coin-magnet',
    name: '코인 자석',
    kind: 'passive',
    price: 11,
    rarity: 'common',
    duration: 'match',
    tags: ['coin', 'utility'],
    effects: [{ trigger: 'kill', target: 'self', effect: 'coin', magnitude: 2, tags: ['bonus'] }]
  }
];

function position(rng: SeededRng, width: number, height: number): Vec2 {
  return { x: rng.int(80, width - 80), y: rng.int(80, height - 80) };
}

export function isShopFloor(matchSeed: string, floor: number): boolean {
  if (floor <= 0 || floor >= 100 || floor % 10 === 0) return false;
  return hashSeed(matchSeed, 'shop', floor) % 5 === 0;
}

export function generateShopOffers(matchSeed: string, floor: number, cycle = 0): ShopOffer[] {
  const rng = new SeededRng(deriveSeed(matchSeed, 'shop-offers', floor, cycle));
  const available = [...ITEM_DEFINITIONS];
  const offers: ShopOffer[] = [];
  const count = Math.min(4, available.length);
  for (let index = 0; index < count; index += 1) {
    const item = available.splice(rng.int(0, available.length - 1), 1)[0];
    offers.push({ slotId: `${floor}-${index}`, itemId: item.id, price: item.price });
  }
  return offers;
}

export function generateFloorBlueprint(matchSeed: string, floor: number): FloorBlueprint {
  const safeFloor = Math.max(1, Math.min(100, floor));
  const seed = deriveSeed(matchSeed, 'floor', safeFloor);
  const rng = new SeededRng(seed);
  const type = safeFloor === 100
    ? 'final-boss'
    : safeFloor % 10 === 0
      ? 'mini-boss'
      : isShopFloor(matchSeed, safeFloor)
        ? 'shop'
        : 'normal';
  const width = 960;
  const height = 540;
  const roomCount = type === 'normal' || type === 'shop' ? 1 : 3;
  const rooms = Array.from({ length: roomCount }, (_, index) => ({
    x: 32 + index * 304,
    y: 32,
    width: type === 'normal' || type === 'shop' ? width - 64 : 272,
    height: height - 64
  }));
  const obstacleCount = type === 'shop' ? 0 : type === 'normal' ? 5 + Math.floor(safeFloor / 20) : 10;
  const obstacles = Array.from({ length: obstacleCount }, (_, index) => ({
    x: 100 + rng.int(0, width - 220),
    y: 90 + rng.int(0, height - 180),
    width: 28 + rng.int(0, 50),
    height: 28 + rng.int(0, 50)
  }));
  const monsters: MonsterBlueprint[] = [];
  if (type !== 'shop') {
    const regularCount = type === 'normal' ? 3 + Math.min(5, Math.floor(safeFloor / 15)) : 5 + Math.floor(safeFloor / 10);
    for (let index = 0; index < regularCount; index += 1) {
      monsters.push({
        id: `monster-${safeFloor}-${index}`,
        type: (['goblin', 'slime', 'bat'] as const)[index % 3],
        position: position(rng, width, height),
        hp: 30 + safeFloor * 2,
        required: true,
        coinReward: 2 + Math.floor(safeFloor / 10)
      });
    }
    if (type === 'mini-boss' || type === 'final-boss') {
      monsters.push({
        id: `boss-${safeFloor}`,
        type: type === 'final-boss' ? 'final-boss' : 'mini-boss',
        position: { x: width / 2, y: height / 2 },
        hp: type === 'final-boss' ? 900 : 180 + safeFloor * 8,
        required: true,
        coinReward: type === 'final-boss' ? 100 : 20 + safeFloor
      });
    }
  }
  const chests: ChestBlueprint[] = type === 'shop' ? [] : [0, 1].map((index) => ({
    id: `chest-${safeFloor}-${index}`,
    position: position(rng, width, height),
    reward: {
      coins: 5 + rng.int(0, 5),
      itemId: rng.pick(ITEM_DEFINITIONS).id
    }
  }));
  return {
    floor: safeFloor,
    seed,
    type,
    width,
    height,
    rooms,
    obstacles,
    monsters,
    chests,
    shopOffers: type === 'shop' ? generateShopOffers(matchSeed, safeFloor) : []
  };
}

export function validateItemDefinitions(items: readonly unknown[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const validKinds = new Set(['weapon', 'passive', 'consumable']);
  const validRarities = new Set(['common', 'rare', 'legendary']);
  const validTriggers = new Set(['attack', 'move', 'hit', 'dash', 'kill', 'use']);
  const validTargets = new Set(['enemy', 'self', 'area', 'trail']);
  const validEffects = new Set(['projectile', 'thorn-trail', 'heal', 'damage', 'fire-dash', 'coin']);
  for (const raw of items) {
    const candidate = (raw ?? {}) as Partial<ItemDefinition>;
    const id = typeof candidate.id === 'string' ? candidate.id : '<missing-id>';
    if (!candidate.id || !candidate.name) errors.push(`item id and name are required: ${id}`);
    if (ids.has(id)) errors.push(`duplicate item id: ${id}`);
    ids.add(id);
    if (!validKinds.has(String(candidate.kind))) errors.push(`invalid item kind: ${id}`);
    if (!validRarities.has(String(candidate.rarity))) errors.push(`invalid rarity: ${id}`);
    if (typeof candidate.price !== 'number' || !Number.isFinite(candidate.price) || candidate.price <= 0) {
      errors.push(`non-positive price: ${id}`);
    }
    if (candidate.kind === 'weapon' && (!candidate.combatFloors || candidate.combatFloors < 1 || candidate.combatFloors > 5)) {
      errors.push(`weapon duration must be 1..5: ${id}`);
    }
    if (candidate.duration !== undefined && candidate.duration !== 'match' &&
      (typeof candidate.duration !== 'number' || !Number.isInteger(candidate.duration) || candidate.duration < 1)) {
      errors.push(`invalid item duration: ${id}`);
    }
    if (!Array.isArray(candidate.tags) || candidate.tags.length === 0) errors.push(`item tags are required: ${id}`);
    if (!Array.isArray(candidate.effects) || candidate.effects.length === 0) {
      errors.push(`item has no effects: ${id}`);
      continue;
    }
    for (const effect of candidate.effects) {
      const current = (effect ?? {}) as Partial<EffectDefinition>;
      if (!validTriggers.has(String(current.trigger)) || !validTargets.has(String(current.target)) || !validEffects.has(String(current.effect))) {
        errors.push(`invalid effect combination: ${id}`);
      }
      if (typeof current.magnitude !== 'number' || !Number.isFinite(current.magnitude) || current.magnitude <= 0) {
        errors.push(`invalid effect magnitude: ${id}`);
      }
      if (!Array.isArray(current.tags) || current.tags.length === 0) errors.push(`effect tags are required: ${id}`);
      if (current.trigger === 'move' && (current.target !== 'trail' || current.effect !== 'thorn-trail')) {
        errors.push(`move effects must create a thorn trail: ${id}`);
      }
      if (current.trigger === 'dash' && (current.target !== 'area' || current.effect !== 'fire-dash')) {
        errors.push(`dash effects must create a fire area: ${id}`);
      }
      if (current.trigger === 'use' && (current.target !== 'self' || current.effect !== 'heal')) {
        errors.push(`use effects must heal the owner: ${id}`);
      }
      if (current.trigger === 'kill' && (current.target !== 'self' || current.effect !== 'coin')) {
        errors.push(`kill effects must award coins: ${id}`);
      }
    }
    if (candidate.risk === 'owner-harm' && !candidate.effects.some((effect) => effect.tags.includes('friendly-fire'))) {
      errors.push(`owner-harm items must declare friendly-fire: ${id}`);
    }
  }
  return errors;
}

export function validateContentCatalog(): string[] {
  return validateItemDefinitions(ITEM_DEFINITIONS);
}

if (typeof process !== 'undefined' && process.argv.includes('--validate')) {
  const errors = validateContentCatalog();
  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Validated ${ITEM_DEFINITIONS.length} item definitions.`);
  }
}
