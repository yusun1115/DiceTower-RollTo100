export type PlayerId = 'p1' | 'p2';
export type MatchMode = 'pvp' | 'cpu';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'lobby' | 'roll' | 'floor-setup' | 'combat' | 'shop' | 'resolved' | 'victory';
export type FloorType = 'normal' | 'shop' | 'mini-boss' | 'final-boss';
export type ItemKind = 'weapon' | 'passive' | 'consumable';
export type EffectRisk = 'none' | 'owner-harm' | 'friendly-fire';
export type ItemDuration = number | 'match';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EffectDefinition {
  trigger: 'attack' | 'move' | 'hit' | 'dash' | 'kill' | 'use';
  target: 'enemy' | 'self' | 'area' | 'trail';
  effect: 'projectile' | 'thorn-trail' | 'heal' | 'damage' | 'fire-dash' | 'coin';
  magnitude: number;
  tags: string[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: ItemKind;
  price: number;
  rarity: 'common' | 'rare' | 'legendary';
  duration?: ItemDuration;
  risk?: EffectRisk;
  combatFloors?: number;
  tags: string[];
  effects: EffectDefinition[];
}

export interface ItemInstance {
  itemId: string;
  remainingCombatFloors?: number;
  stacks: number;
}

export interface Reward {
  coins: number;
  itemId?: string;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  floor: number;
  hearts: number;
  maxHearts: 3;
  coins: number;
  weapon: ItemInstance | null;
  buffs: ItemInstance[];
  potions: number;
}

export interface MonsterBlueprint {
  id: string;
  type: 'goblin' | 'slime' | 'bat' | 'mini-boss' | 'final-boss';
  position: Vec2;
  hp: number;
  required: boolean;
  coinReward: number;
}

export interface ChestBlueprint {
  id: string;
  position: Vec2;
  reward: Reward;
}

export interface ShopOffer {
  slotId: string;
  itemId: string;
  price: number;
}

export interface FloorBlueprint {
  floor: number;
  seed: number;
  type: FloorType;
  width: number;
  height: number;
  rooms: Rect[];
  obstacles: Rect[];
  monsters: MonsterBlueprint[];
  chests: ChestBlueprint[];
  shopOffers: ShopOffer[];
}

export interface MonsterSnapshot extends MonsterBlueprint {
  alive: boolean;
}

export interface ChestSnapshot extends ChestBlueprint {
  opened: boolean;
}

export interface CombatSnapshot {
  floor: number;
  type: FloorType;
  obstacles: Rect[];
  playerPosition: Vec2;
  monsters: MonsterSnapshot[];
  chests: ChestSnapshot[];
  projectiles: Array<{ id: string; position: Vec2; velocity: Vec2; owner: PlayerId }>;
  hazards: Array<{ id: string; position: Vec2; radius: number; damage: number; owner: PlayerId }>;
  ghost: { position: Vec2; active: boolean } | null;
  timeRemainingMs: number;
  complete: boolean;
}

export interface SessionState {
  sessionId: string;
  roomCode: string;
  mode: MatchMode;
  difficulty?: Difficulty;
  revision: number;
  phase: Phase;
  activePlayer: PlayerId;
  turnNumber: number;
  lastRoll: number | null;
  readyPlayers: PlayerId[];
  seed: string;
  players: Record<PlayerId, PlayerState>;
  floor: FloorBlueprint | null;
  combat: Record<PlayerId, CombatSnapshot | null>;
  sharedShop: ShopState;
  winner: PlayerId | null;
}

export interface ShopState {
  floor: number | null;
  offers: ShopOffer[];
  restockAfterTurns: number | null;
}
