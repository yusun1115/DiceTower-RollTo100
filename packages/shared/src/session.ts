import {
  FLOOR_TIMERS_MS,
  generateFloorBlueprint,
  generateShopOffers,
  ITEM_DEFINITIONS
} from './content.js';
import type {
  ChestSnapshot,
  CombatSnapshot,
  Difficulty,
  FloorBlueprint,
  ItemDefinition,
  ItemInstance,
  MatchMode,
  MonsterSnapshot,
  Phase,
  PlayerId,
  PlayerState,
  SessionState,
  ShopState,
  Vec2
} from './domain.js';
import type { ClientMessage } from './protocol.js';
import type { CombatCommand } from './protocol-types.js';
import { deriveSeed, SeededRng } from './rng.js';

interface RuntimeProjectile {
  id: string;
  position: Vec2;
  velocity: Vec2;
  owner: PlayerId;
  damage: number;
  ttlMs: number;
}

interface RuntimeHazard {
  id: string;
  position: Vec2;
  radius: number;
  damage: number;
  owner: PlayerId;
  ttlMs: number;
}

interface CombatRuntime {
  blueprint: FloorBlueprint;
  playerPosition: Vec2;
  monsters: MonsterSnapshot[];
  chests: ChestSnapshot[];
  projectiles: RuntimeProjectile[];
  hazards: RuntimeHazard[];
  ghost: { position: Vec2; active: boolean } | null;
  timeRemainingMs: number;
  complete: boolean;
  attackCooldownMs: number;
  dashCooldownMs: number;
  lastDamageAt: Map<string, number>;
}

export interface SessionOptions {
  sessionId: string;
  roomCode: string;
  mode: MatchMode;
  difficulty?: Difficulty;
  seed?: string;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
}

const MAX_HEARTS = 3;
const PLAYER_SPEED = 180;
const DASH_DISTANCE = 90;
const ARENA_MARGIN = 24;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

function insideRect(point: Vec2, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function clampPosition(position: Vec2, blueprint: FloorBlueprint): Vec2 {
  return {
    x: Math.max(ARENA_MARGIN, Math.min(blueprint.width - ARENA_MARGIN, position.x)),
    y: Math.max(ARENA_MARGIN, Math.min(blueprint.height - ARENA_MARGIN, position.y))
  };
}

function item(itemId: string): ItemDefinition {
  const definition = ITEM_DEFINITIONS.find((candidate) => candidate.id === itemId);
  if (!definition) throw new Error(`Unknown item: ${itemId}`);
  return definition;
}

function newItemInstance(itemId: string): ItemInstance {
  const definition = item(itemId);
  return {
    itemId,
    remainingCombatFloors: definition.kind === 'weapon' ? definition.combatFloors : undefined,
    stacks: 1
  };
}

function createPlayer(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    floor: 0,
    hearts: MAX_HEARTS,
    maxHearts: MAX_HEARTS,
    coins: 0,
    weapon: null,
    buffs: [],
    potions: 0
  };
}

export class SessionEngine {
  readonly state: SessionState;
  private readonly ready = new Set<PlayerId>();
  private readonly commands: Record<PlayerId, CombatCommand | null> = { p1: null, p2: null };
  private readonly runtimes: Record<PlayerId, CombatRuntime | null> = { p1: null, p2: null };
  private readonly shopStates = new Map<number, ShopState>();
  private activeRuntime: CombatRuntime | null = null;
  private shopPurchaseThisTurn = false;

  constructor(options: SessionOptions) {
    const seed = options.seed ?? `${options.sessionId}:${deriveSeed(options.roomCode, options.sessionId)}`;
    this.state = {
      sessionId: options.sessionId,
      roomCode: options.roomCode,
      mode: options.mode,
      difficulty: options.difficulty,
      revision: 0,
      phase: 'lobby',
      activePlayer: 'p1',
      turnNumber: 0,
      lastRoll: null,
      seed,
      players: {
        p1: createPlayer('p1', '1P'),
        p2: createPlayer('p2', options.mode === 'cpu' ? 'CPU' : '2P')
      },
      floor: null,
      combat: { p1: null, p2: null },
      sharedShop: { floor: null, offers: [], restockAfterTurns: null },
      winner: null
    };
    if (options.mode === 'cpu') this.ready.add('p2');
  }

  markReady(playerId: PlayerId): CommandResult {
    if (this.state.phase !== 'lobby') return { ok: false, error: 'Match is already started.' };
    const wasReady = this.ready.has(playerId);
    this.ready.add(playerId);
    if (this.ready.has('p1') && this.ready.has('p2')) {
      this.state.phase = 'roll';
      this.state.turnNumber = 1;
      this.state.activePlayer = 'p1';
    }
    if (!wasReady) this.touch();
    return { ok: true };
  }

  handle(playerId: PlayerId, message: ClientMessage): CommandResult {
    if (message.type === 'ready') return this.markReady(playerId);
    if (message.type === 'roll') return this.roll(playerId);
    if (message.type === 'combat') return this.setCombatCommand(playerId, message.command);
    if (message.type === 'buy') return this.buy(playerId, message.slotId);
    if (message.type === 'use-potion') return this.usePotion(playerId);
    if (message.type === 'finish-shop') return this.finishShop(playerId);
    return { ok: false, error: 'Message is handled by the lobby server.' };
  }

  roll(playerId: PlayerId): CommandResult {
    if (!this.isActive(playerId) || this.state.phase !== 'roll') return { ok: false, error: 'It is not your roll.' };
    const roll = (deriveSeed(this.state.seed, 'roll', this.state.turnNumber, playerId) % 6) + 1;
    const player = this.state.players[playerId];
    this.state.lastRoll = roll;
    player.floor = Math.min(100, player.floor + roll);
    this.enterFloor(playerId, player.floor);
    this.touch();
    return { ok: true };
  }

  tick(deltaMs: number): void {
    if (this.state.phase !== 'combat' || !this.activeRuntime) return;
    const playerId = this.state.activePlayer;
    const player = this.state.players[playerId];
    const runtime = this.activeRuntime;
    const command = this.commands[playerId] ?? { moveX: 0, moveY: 0, aim: { x: 1, y: 0 } };
    runtime.timeRemainingMs = Math.max(0, runtime.timeRemainingMs - deltaMs);
    runtime.attackCooldownMs = Math.max(0, runtime.attackCooldownMs - deltaMs);
    runtime.dashCooldownMs = Math.max(0, runtime.dashCooldownMs - deltaMs);
    this.applyMovement(runtime, command, deltaMs, playerId);
    this.applyAttack(runtime, command, player, playerId);
    this.applyMonsterMovement(runtime, player, playerId, deltaMs);
    this.applyProjectiles(runtime, player, playerId, deltaMs);
    this.applyHazards(runtime, player, playerId, deltaMs);
    this.applyChestInteraction(runtime, command, player);
    this.applyGhost(runtime, playerId, deltaMs);
    if (runtime.timeRemainingMs === 0 && !runtime.ghost?.active) {
      runtime.ghost = { position: { x: runtime.blueprint.width / 2, y: 40 }, active: true };
    }
    if (runtime.complete) {
      this.completeCombat(playerId);
    }
    this.touch();
  }

  getSnapshot(): SessionState {
    const snapshot = clone(this.state);
    snapshot.combat = {
      p1: this.runtimes.p1 ? this.toSnapshot(this.runtimes.p1) : null,
      p2: this.runtimes.p2 ? this.toSnapshot(this.runtimes.p2) : null
    };
    snapshot.sharedShop = this.currentShopState();
    return snapshot;
  }

  private currentShopState(): ShopState {
    const floor = this.state.floor?.floor;
    if (floor !== undefined && this.shopStates.has(floor)) return clone(this.shopStates.get(floor)!);
    return clone(this.state.sharedShop);
  }

  private isActive(playerId: PlayerId): boolean {
    return this.state.activePlayer === playerId && this.state.phase !== 'victory';
  }

  private enterFloor(playerId: PlayerId, floor: number): void {
    const blueprint = generateFloorBlueprint(this.state.seed, floor);
    this.state.floor = blueprint;
    this.commands[playerId] = null;
    this.runtimes[playerId] = null;
    this.activeRuntime = null;
    this.state.players[playerId].hearts = MAX_HEARTS;
    this.shopPurchaseThisTurn = false;
    if (blueprint.type === 'shop') {
      const existing = this.shopStates.get(floor) ?? {
        floor,
        offers: blueprint.shopOffers,
        restockAfterTurns: null
      };
      this.shopStates.set(floor, existing);
      this.state.sharedShop = clone(existing);
      this.state.phase = 'shop';
      return;
    }
    const runtime: CombatRuntime = {
      blueprint,
      playerPosition: { x: 80, y: blueprint.height / 2 },
      monsters: blueprint.monsters.map((monster) => ({ ...monster, alive: true })),
      chests: blueprint.chests.map((chest) => ({ ...chest, opened: false })),
      projectiles: [],
      hazards: [],
      ghost: null,
      timeRemainingMs: FLOOR_TIMERS_MS[blueprint.type],
      complete: false,
      attackCooldownMs: 0,
      dashCooldownMs: 0,
      lastDamageAt: new Map()
    };
    this.runtimes[playerId] = runtime;
    this.activeRuntime = runtime;
    this.state.combat[playerId] = this.toSnapshot(runtime);
    this.state.phase = 'combat';
  }

  private setCombatCommand(playerId: PlayerId, command: CombatCommand): CommandResult {
    if (!this.isActive(playerId) || this.state.phase !== 'combat') return { ok: false, error: 'Combat is not active.' };
    this.commands[playerId] = command;
    this.touch();
    return { ok: true };
  }

  private applyMovement(runtime: CombatRuntime, command: CombatCommand, deltaMs: number, playerId: PlayerId): void {
    const direction = normalize(command.moveX, command.moveY);
    const previous = runtime.playerPosition;
    const distanceMoved = PLAYER_SPEED * (deltaMs / 1000);
    let next = clampPosition({ x: previous.x + direction.x * distanceMoved, y: previous.y + direction.y * distanceMoved }, runtime.blueprint);
    if (command.dash && runtime.dashCooldownMs === 0) {
      const aim = normalize(command.aim.x, command.aim.y);
      next = clampPosition({ x: next.x + aim.x * DASH_DISTANCE, y: next.y + aim.y * DASH_DISTANCE }, runtime.blueprint);
      runtime.dashCooldownMs = 900;
      if (this.hasBuff(this.state.players[playerId], 'flame-dash')) {
        runtime.hazards.push({ id: `fire-${Date.now()}`, position: previous, radius: 34, damage: 25, owner: playerId, ttlMs: 2400 });
      }
    }
    const obstacle = runtime.blueprint.obstacles.find((candidate) => insideRect(next, candidate));
    if (obstacle) {
      const key = `obstacle:${obstacle.x}:${obstacle.y}`;
      const now = Date.now();
      const lastHit = runtime.lastDamageAt.get(key) ?? 0;
      if (now - lastHit > 1000) {
        runtime.lastDamageAt.set(key, now);
        this.damagePlayer(playerId, 1);
      }
      return;
    }
    runtime.playerPosition = next;
    if (distance(previous, next) > 0 && this.hasBuff(this.state.players[playerId], 'thorn-trail')) {
      runtime.hazards.push({ id: `thorn-${Date.now()}`, position: previous, radius: 20, damage: 12, owner: playerId, ttlMs: 3500 });
    }
  }

  private applyAttack(runtime: CombatRuntime, command: CombatCommand, player: PlayerState, playerId: PlayerId): void {
    if (!command.attack || runtime.attackCooldownMs > 0) return;
    const aim = normalize(command.aim.x, command.aim.y);
    const definition = player.weapon ? item(player.weapon.itemId) : null;
    const damage = definition?.effects[0]?.magnitude ?? 18;
    runtime.projectiles.push({
      id: `projectile-${Date.now()}-${Math.random()}`,
      position: { ...runtime.playerPosition },
      velocity: { x: aim.x * 420, y: aim.y * 420 },
      owner: playerId,
      damage,
      ttlMs: 900
    });
    if (this.hasBuff(player, 'ranged-edge')) {
      runtime.projectiles.push({
        id: `wave-${Date.now()}-${Math.random()}`,
        position: { ...runtime.playerPosition },
        velocity: { x: aim.x * 480, y: aim.y * 480 },
        owner: playerId,
        damage: 14,
        ttlMs: 900
      });
    }
    runtime.attackCooldownMs = definition?.rarity === 'legendary' ? 700 : 380;
  }

  private applyMonsterMovement(runtime: CombatRuntime, player: PlayerState, playerId: PlayerId, deltaMs: number): void {
    const now = Date.now();
    for (const monster of runtime.monsters) {
      if (!monster.alive) continue;
      const direction = normalize(runtime.playerPosition.x - monster.position.x, runtime.playerPosition.y - monster.position.y);
      monster.position = clampPosition({
        x: monster.position.x + direction.x * 34 * deltaMs / 1000,
        y: monster.position.y + direction.y * 34 * deltaMs / 1000
      }, runtime.blueprint);
      if (distance(monster.position, runtime.playerPosition) < 28) {
        const lastHit = runtime.lastDamageAt.get(monster.id) ?? 0;
        if (now - lastHit > 850) {
          runtime.lastDamageAt.set(monster.id, now);
          this.damagePlayer(playerId, 1);
          if (player.hearts <= 0) return;
        }
      }
    }
    for (const obstacle of runtime.blueprint.obstacles) {
      if (insideRect(runtime.playerPosition, obstacle)) {
        const lastHit = runtime.lastDamageAt.get(`obstacle:${obstacle.x}:${obstacle.y}`) ?? 0;
        if (now - lastHit > 1000) {
          runtime.lastDamageAt.set(`obstacle:${obstacle.x}:${obstacle.y}`, now);
          this.damagePlayer(playerId, 1);
        }
      }
    }
  }

  private applyProjectiles(runtime: CombatRuntime, player: PlayerState, playerId: PlayerId, deltaMs: number): void {
    const survivors: RuntimeProjectile[] = [];
    for (const projectile of runtime.projectiles) {
      projectile.position = {
        x: projectile.position.x + projectile.velocity.x * deltaMs / 1000,
        y: projectile.position.y + projectile.velocity.y * deltaMs / 1000
      };
      projectile.ttlMs -= deltaMs;
      const monster = runtime.monsters.find((candidate) => candidate.alive && distance(candidate.position, projectile.position) < 24);
      if (monster) {
        monster.hp -= projectile.damage;
        if (monster.hp <= 0) {
          monster.alive = false;
          player.coins += monster.coinReward;
          if (this.hasBuff(player, 'coin-magnet')) player.coins += 2;
        }
        continue;
      }
      if (projectile.ttlMs > 0 && projectile.position.x >= 0 && projectile.position.x <= runtime.blueprint.width && projectile.position.y >= 0 && projectile.position.y <= runtime.blueprint.height) {
        survivors.push(projectile);
      }
    }
    runtime.projectiles = survivors;
    if (runtime.monsters.every((monster) => !monster.required || !monster.alive)) runtime.complete = true;
    if (runtime.blueprint.type === 'final-boss' && runtime.monsters.some((monster) => monster.type === 'final-boss' && !monster.alive)) {
      this.state.winner = playerId;
      this.state.phase = 'victory';
    }
  }

  private applyHazards(runtime: CombatRuntime, player: PlayerState, playerId: PlayerId, deltaMs: number): void {
    const now = Date.now();
    runtime.hazards = runtime.hazards.filter((hazard) => {
      hazard.ttlMs -= deltaMs;
      if (distance(hazard.position, runtime.playerPosition) < hazard.radius && now - (runtime.lastDamageAt.get(hazard.id) ?? 0) > 900) {
        runtime.lastDamageAt.set(hazard.id, now);
        this.damagePlayer(playerId, 1);
      }
      for (const monster of runtime.monsters) {
        if (monster.alive && distance(hazard.position, monster.position) < hazard.radius) {
          monster.hp -= hazard.damage * deltaMs / 1000;
          if (monster.hp <= 0) {
            monster.alive = false;
            player.coins += monster.coinReward;
          }
        }
      }
      return hazard.ttlMs > 0;
    });
  }

  private applyChestInteraction(runtime: CombatRuntime, command: CombatCommand, player: PlayerState): void {
    if (!command.interact) return;
    const chest = runtime.chests.find((candidate) => !candidate.opened && distance(candidate.position, runtime.playerPosition) < 42);
    if (!chest) return;
    chest.opened = true;
    player.coins += chest.reward.coins;
    if (chest.reward.itemId) this.grantItem(player, chest.reward.itemId);
  }

  private applyGhost(runtime: CombatRuntime, playerId: PlayerId, deltaMs: number): void {
    if (!runtime.ghost?.active) return;
    const direction = normalize(runtime.playerPosition.x - runtime.ghost.position.x, runtime.playerPosition.y - runtime.ghost.position.y);
    runtime.ghost.position = {
      x: runtime.ghost.position.x + direction.x * 48 * deltaMs / 1000,
      y: runtime.ghost.position.y + direction.y * 48 * deltaMs / 1000
    };
    if (distance(runtime.ghost.position, runtime.playerPosition) < 24) this.die(playerId);
  }

  private damagePlayer(playerId: PlayerId, amount: number): void {
    if (this.state.phase !== 'combat') return;
    const player = this.state.players[playerId];
    player.hearts = Math.max(0, player.hearts - amount);
    if (player.hearts === 0) this.die(playerId);
  }

  private die(playerId: PlayerId): void {
    if (!this.isActive(playerId)) return;
    const player = this.state.players[playerId];
    player.floor = Math.max(1, player.floor - 3);
    player.hearts = MAX_HEARTS;
    this.runtimes[playerId] = null;
    this.activeRuntime = null;
    this.finishTurn();
  }

  private completeCombat(playerId: PlayerId): void {
    if (!this.isActive(playerId) || this.state.phase !== 'combat') return;
    const player = this.state.players[playerId];
    if (player.weapon?.remainingCombatFloors !== undefined) {
      player.weapon.remainingCombatFloors -= 1;
      if (player.weapon.remainingCombatFloors <= 0) player.weapon = null;
    }
    if (this.state.floor?.type === 'final-boss') {
      this.state.winner = playerId;
      this.state.phase = 'victory';
      return;
    }
    this.finishTurn();
  }

  private finishTurn(countCurrentTurn = true): void {
    if (this.state.phase === 'victory') return;
    if (countCurrentTurn) this.decrementShopTimers();
    this.activeRuntime = null;
    this.state.floor = null;
    this.state.combat = { p1: null, p2: null };
    this.state.phase = 'roll';
    this.state.activePlayer = this.state.activePlayer === 'p1' ? 'p2' : 'p1';
    this.state.turnNumber += 1;
    this.shopPurchaseThisTurn = false;
    this.touch();
  }

  private decrementShopTimers(): void {
    for (const [floor, shop] of this.shopStates) {
      if (shop.restockAfterTurns === null) continue;
      shop.restockAfterTurns -= 1;
      this.state.sharedShop = clone(shop);
      if (shop.restockAfterTurns <= 0) {
        shop.offers = generateShopOffers(this.state.seed, floor, this.state.turnNumber);
        shop.restockAfterTurns = null;
        this.state.sharedShop = clone(shop);
      }
    }
  }

  private buy(playerId: PlayerId, slotId: string): CommandResult {
    if (!this.isActive(playerId) || this.state.phase !== 'shop' || !this.state.floor) return { ok: false, error: 'Shop is not active.' };
    const shop = this.shopStates.get(this.state.floor.floor);
    if (!shop) return { ok: false, error: 'Shop inventory is unavailable.' };
    const offerIndex = shop.offers.findIndex((offer) => offer.slotId === slotId);
    if (offerIndex < 0) return { ok: false, error: 'Item is out of stock.' };
    const offer = shop.offers[offerIndex];
    const player = this.state.players[playerId];
    if (player.coins < offer.price) return { ok: false, error: 'Not enough coins.' };
    player.coins -= offer.price;
    shop.offers.splice(offerIndex, 1);
    if (shop.restockAfterTurns === null) shop.restockAfterTurns = 3;
    this.shopPurchaseThisTurn = true;
    this.grantItem(player, offer.itemId);
    this.state.sharedShop = clone(shop);
    this.touch();
    return { ok: true };
  }

  private finishShop(playerId: PlayerId): CommandResult {
    if (!this.isActive(playerId) || this.state.phase !== 'shop') return { ok: false, error: 'Shop is not active.' };
    this.finishTurn(!this.shopPurchaseThisTurn);
    return { ok: true };
  }

  private usePotion(playerId: PlayerId): CommandResult {
    if (!this.isActive(playerId) || (this.state.phase !== 'combat' && this.state.phase !== 'shop')) {
      return { ok: false, error: 'Potion cannot be used right now.' };
    }
    const player = this.state.players[playerId];
    if (player.potions <= 0 || player.hearts >= MAX_HEARTS) return { ok: false, error: 'Potion cannot be used.' };
    player.potions -= 1;
    player.hearts = Math.min(MAX_HEARTS, player.hearts + 1);
    this.touch();
    return { ok: true };
  }

  private grantItem(player: PlayerState, itemId: string): void {
    const definition = item(itemId);
    if (definition.kind === 'consumable') {
      player.potions += 1;
    } else if (definition.kind === 'weapon') {
      player.weapon = newItemInstance(itemId);
    } else {
      const existing = player.buffs.find((buff) => buff.itemId === itemId);
      if (existing) existing.stacks += 1;
      else player.buffs.push(newItemInstance(itemId));
    }
  }

  private hasBuff(player: PlayerState, itemId: string): boolean {
    return player.buffs.some((buff) => buff.itemId === itemId);
  }

  private touch(): void {
    this.state.revision += 1;
  }

  private toSnapshot(runtime: CombatRuntime): CombatSnapshot {
    return {
      floor: runtime.blueprint.floor,
      type: runtime.blueprint.type,
      obstacles: runtime.blueprint.obstacles.map((obstacle) => ({ ...obstacle })),
      playerPosition: { ...runtime.playerPosition },
      monsters: runtime.monsters.map((monster) => ({ ...monster, position: { ...monster.position } })),
      chests: runtime.chests.map((chest) => ({ ...chest, position: { ...chest.position } })),
      projectiles: runtime.projectiles.map(({ id, position, velocity, owner }) => ({ id, position: { ...position }, velocity: { ...velocity }, owner })),
      hazards: runtime.hazards.map(({ id, position, radius, damage, owner }) => ({ id, position: { ...position }, radius, damage, owner })),
      ghost: runtime.ghost ? { position: { ...runtime.ghost.position }, active: runtime.ghost.active } : null,
      timeRemainingMs: runtime.timeRemainingMs,
      complete: runtime.complete
    };
  }
}
