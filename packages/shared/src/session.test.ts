import { describe, expect, it } from 'vitest';
import { FLOOR_TIMERS_MS, generateFloorBlueprint, isShopFloor } from './content.js';
import type { PlayerId } from './domain.js';
import { deriveSeed } from './rng.js';
import { SessionEngine } from './session.js';

type InternalEngine = {
  state: SessionEngine['state'];
  runtimes: Record<PlayerId, {
    blueprint: ReturnType<typeof generateFloorBlueprint>;
    playerPosition: { x: number; y: number };
    monsters: Array<{ alive: boolean; hp: number }>;
    chests: Array<{ position: { x: number; y: number }; opened: boolean; reward: { coins: number; itemId?: string } }>;
    projectiles: Array<unknown>;
    ghost: { position: { x: number; y: number }; active: boolean } | null;
    timeRemainingMs: number;
    hazards: Array<{ position: { x: number; y: number }; radius: number }>;
  } | null>;
  grantItem(player: unknown, itemId: string): void;
  damagePlayer(playerId: PlayerId, amount: number): void;
  die(playerId: PlayerId): void;
};

function internal(engine: SessionEngine): InternalEngine {
  return engine as unknown as InternalEngine;
}

function ready(engine: SessionEngine): void {
  expect(engine.markReady('p1').ok).toBe(true);
  if (engine.state.mode === 'pvp') expect(engine.markReady('p2').ok).toBe(true);
  expect(engine.state.phase).toBe('roll');
}

function findFloor(seed: string, predicate: (floor: number) => boolean): number {
  for (let floor = 1; floor < 100; floor += 1) {
    if (predicate(floor)) return floor;
  }
  throw new Error(`No matching floor found for ${seed}`);
}

function rollInto(engine: SessionEngine, playerId: PlayerId, targetFloor: number): void {
  const player = engine.state.players[playerId];
  engine.state.activePlayer = playerId;
  engine.state.phase = 'roll';
  for (let turn = 1; turn < 10_000; turn += 1) {
    const roll = (deriveSeed(engine.state.seed, 'roll', turn, playerId) % 6) + 1;
    if (targetFloor === 100) {
      player.floor = 99;
    } else if (roll <= targetFloor) {
      player.floor = targetFloor - roll;
    } else {
      continue;
    }
    engine.state.turnNumber = turn;
    expect(engine.roll(playerId).ok).toBe(true);
    expect(player.floor).toBe(targetFloor);
    return;
  }
  throw new Error(`Could not configure a roll for floor ${targetFloor}`);
}

function clearRuntime(engine: SessionEngine): void {
  const runtime = internal(engine).runtimes[engine.state.activePlayer];
  if (!runtime) throw new Error('Expected an active combat runtime');
  for (const monster of runtime.monsters) {
    monster.alive = false;
    monster.hp = 0;
  }
  engine.tick(1);
}

function findShopFixture(): { seed: string; floor: number } {
  for (let seedIndex = 0; seedIndex < 100; seedIndex += 1) {
    const seed = `shop-fixture-${seedIndex}`;
    for (let floor = 1; floor < 100; floor += 1) {
      if (isShopFloor(seed, floor)) return { seed, floor };
    }
  }
  throw new Error('Could not find a deterministic shop fixture');
}

describe('authoritative session state', () => {
  it('keeps a human lobby gated and stores CPU difficulty', () => {
    const pvp = new SessionEngine({ sessionId: 'pvp', roomCode: 'PVP1', mode: 'pvp', seed: 'lobby-seed' });
    expect(pvp.roll('p1').ok).toBe(false);
    expect(pvp.markReady('p1').ok).toBe(true);
    expect(pvp.state.phase).toBe('lobby');
    expect(pvp.getSnapshot().readyPlayers).toEqual(['p1']);
    expect(pvp.markReady('p2').ok).toBe(true);
    expect(pvp.state.phase).toBe('roll');

    const cpu = new SessionEngine({ sessionId: 'cpu', roomCode: 'CPU1', mode: 'cpu', difficulty: 'hard', seed: 'cpu-seed' });
    expect(cpu.state.players.p2.name).toBe('CPU');
    expect(cpu.state.difficulty).toBe('hard');
    expect(cpu.getSnapshot().readyPlayers).toContain('p2');
    expect(cpu.markReady('p1').ok).toBe(true);
    expect(cpu.state.phase).toBe('roll');
  });

  it('rejects inactive actions and increments revision only for accepted state changes', () => {
    const engine = new SessionEngine({ sessionId: 'turns', roomCode: 'TURN', mode: 'pvp', seed: 'turn-seed' });
    ready(engine);
    const beforeRoll = engine.state.revision;
    expect(engine.roll('p2').ok).toBe(false);
    expect(engine.state.revision).toBe(beforeRoll);
    rollInto(engine, 'p1', findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal'));
    const beforeInactiveCommand = engine.state.revision;
    expect(engine.handle('p2', {
      type: 'combat',
      command: { moveX: 1, moveY: 0, aim: { x: 1, y: 0 }, attack: true }
    }).ok).toBe(false);
    expect(engine.state.revision).toBe(beforeInactiveCommand);
    expect(engine.handle('p1', {
      type: 'combat',
      command: { moveX: 1, moveY: 0, aim: { x: 1, y: 0 }, attack: true }
    }).ok).toBe(true);
    expect(engine.state.revision).toBeGreaterThan(beforeInactiveCommand);
  });

  it('caps dice movement at floor 100 and gives boss floors precedence', () => {
    const engine = new SessionEngine({ sessionId: 'cap', roomCode: 'CAP1', mode: 'cpu', seed: 'cap-seed' });
    ready(engine);
    engine.state.players.p1.floor = 99;
    engine.state.activePlayer = 'p1';
    engine.state.phase = 'roll';
    expect(engine.roll('p1').ok).toBe(true);
    expect(engine.state.players.p1.floor).toBe(100);
    expect(engine.state.floor?.type).toBe('final-boss');
    expect(engine.state.floor?.floor).toBe(100);
    expect(generateFloorBlueprint('classification', 10).type).toBe('mini-boss');
    expect(generateFloorBlueprint('classification', 10).rooms).toHaveLength(3);
    expect(generateFloorBlueprint('classification', 100).type).toBe('final-boss');
  });

  it('removes exactly one heart per contact and locks the match after final-boss victory', () => {
    const engine = new SessionEngine({ sessionId: 'damage', roomCode: 'DMG1', mode: 'cpu', seed: 'damage-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const runtime = internal(engine).runtimes.p1;
    if (!runtime) throw new Error('Expected damage runtime');
    const firstMonster = runtime.monsters[0] as unknown as { position: { x: number; y: number }; alive: boolean };
    firstMonster.position = { ...runtime.playerPosition };
    engine.tick(1);
    expect(engine.state.players.p1.hearts).toBe(2);
    const floorBeforeDeath = engine.state.players.p1.floor;
    internal(engine).damagePlayer('p1', 2);
    expect(engine.state.players.p1.hearts).toBe(3);
    expect(engine.state.players.p1.floor).toBe(Math.max(1, floorBeforeDeath - 3));
    expect(engine.state.activePlayer).toBe('p2');

    const final = new SessionEngine({ sessionId: 'winner', roomCode: 'WIN1', mode: 'cpu', seed: 'winner-seed' });
    ready(final);
    rollInto(final, 'p1', 100);
    const finalRuntime = internal(final).runtimes.p1;
    if (!finalRuntime) throw new Error('Expected final-boss runtime');
    finalRuntime.monsters.forEach((monster) => { monster.alive = false; monster.hp = 0; });
    final.tick(1);
    expect(final.state.phase).toBe('victory');
    expect(final.state.winner).toBe('p1');
    const revision = final.state.revision;
    expect(final.handle('p1', { type: 'roll' }).ok).toBe(false);
    expect(final.state.revision).toBe(revision);
  });

  it('treats an attempted obstacle collision as one authoritative heart hit', () => {
    const engine = new SessionEngine({ sessionId: 'obstacle', roomCode: 'OBS1', mode: 'cpu', seed: 'obstacle-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const runtime = internal(engine).runtimes.p1;
    if (!runtime) throw new Error('Expected obstacle runtime');
    const obstacle = runtime.blueprint.obstacles[0];
    runtime.playerPosition = { x: obstacle.x - 0.1, y: obstacle.y + obstacle.height / 2 };
    for (const monster of runtime.monsters) {
      (monster as unknown as { position: { x: number; y: number } }).position = { x: 900, y: 500 };
    }
    expect(engine.handle('p1', {
      type: 'combat',
      command: { moveX: 1, moveY: 0, aim: { x: 1, y: 0 } }
    }).ok).toBe(true);
    engine.tick(1);
    expect(engine.state.players.p1.hearts).toBe(2);
  });

  it('creates independent combat instances from the same blueprint and passes control once', () => {
    const engine = new SessionEngine({ sessionId: 'instances', roomCode: 'INST', mode: 'pvp', seed: 'instance-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const firstBlueprint = engine.state.floor;
    expect(firstBlueprint).not.toBeNull();
    clearRuntime(engine);
    expect(engine.state.phase).toBe('roll');
    expect(engine.state.activePlayer).toBe('p2');
    expect(engine.handle('p1', { type: 'roll' }).ok).toBe(false);

    rollInto(engine, 'p2', normalFloor);
    expect(engine.state.floor).toEqual(firstBlueprint);
    const snapshot = engine.getSnapshot();
    expect(snapshot.combat.p1?.monsters.every((monster) => !monster.alive)).toBe(true);
    expect(snapshot.combat.p2?.monsters.every((monster) => monster.alive)).toBe(true);
    expect(snapshot.combat.p1?.chests.every((chest) => !chest.opened)).toBe(true);
  });

  it('applies the three-floor death penalty and preserves inventory for heart and ghost death', () => {
    const engine = new SessionEngine({ sessionId: 'death', roomCode: 'DEATH', mode: 'cpu', seed: 'death-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => floor >= 4 && generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    internal(engine).grantItem(engine.state.players.p1, 'thorn-trail');
    const floorBeforeDeath = engine.state.players.p1.floor;
    internal(engine).die('p1');
    expect(engine.state.players.p1.floor).toBe(Math.max(1, floorBeforeDeath - 3));
    expect(engine.state.players.p1.buffs.map((buff) => buff.itemId)).toContain('thorn-trail');
    expect(engine.state.activePlayer).toBe('p2');

    const ghostEngine = new SessionEngine({ sessionId: 'ghost-death', roomCode: 'GHOST', mode: 'cpu', seed: 'ghost-seed' });
    ready(ghostEngine);
    const ghostFloor = findFloor(ghostEngine.state.seed, (floor) => floor >= 4 && generateFloorBlueprint(ghostEngine.state.seed, floor).type === 'normal');
    rollInto(ghostEngine, 'p1', ghostFloor);
    const ghostRuntime = internal(ghostEngine).runtimes.p1;
    if (!ghostRuntime) throw new Error('Expected ghost runtime');
    ghostRuntime.timeRemainingMs = 0;
    ghostEngine.tick(1);
    expect(ghostRuntime.ghost?.active).toBe(true);
    ghostRuntime.ghost!.position = { ...ghostRuntime.playerPosition };
    const expectedFloor = Math.max(1, ghostEngine.state.players.p1.floor - 3);
    ghostEngine.tick(1);
    expect(ghostEngine.state.players.p1.floor).toBe(expectedFloor);
    expect(ghostEngine.state.activePlayer).toBe('p2');
  });

  it('uses the authoritative timer values and keeps the ghost invulnerable', () => {
    const fixtures: Array<[number, keyof typeof FLOOR_TIMERS_MS]> = [[4, 'normal'], [10, 'mini-boss'], [100, 'final-boss']];
    for (const [requestedFloor, type] of fixtures) {
      const seed = `timer-seed-${requestedFloor}`;
      const floor = type === 'normal'
        ? findFloor(seed, (candidate) => candidate >= requestedFloor && generateFloorBlueprint(seed, candidate).type === 'normal')
        : requestedFloor;
      const engine = new SessionEngine({ sessionId: `timer-${floor}`, roomCode: `T${floor}`, mode: 'cpu', seed });
      ready(engine);
      rollInto(engine, 'p1', floor);
      expect(engine.getSnapshot().combat.p1?.timeRemainingMs).toBe(FLOOR_TIMERS_MS[type]);
    }

    const engine = new SessionEngine({ sessionId: 'ghost', roomCode: 'GHOST', mode: 'cpu', seed: 'timer-ghost' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const runtime = internal(engine).runtimes.p1;
    if (!runtime) throw new Error('Expected combat runtime');
    runtime.timeRemainingMs = 0;
    engine.tick(1);
    expect(runtime.ghost?.active).toBe(true);
    expect(engine.handle('p1', {
      type: 'combat',
      command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, attack: true }
    }).ok).toBe(true);
    engine.tick(1);
    expect(runtime.ghost?.active).toBe(true);
  });

  it('keeps boss completion gated until every required boss is defeated', () => {
    const engine = new SessionEngine({ sessionId: 'boss-gate', roomCode: 'BOSS', mode: 'cpu', seed: 'boss-gate-seed' });
    ready(engine);
    rollInto(engine, 'p1', 10);
    const runtime = internal(engine).runtimes.p1;
    if (!runtime) throw new Error('Expected boss runtime');
    for (const monster of runtime.monsters) {
      if (monster.hp < 200) monster.alive = false;
    }
    engine.tick(1);
    expect(engine.state.phase).toBe('combat');
    expect(runtime.monsters.some((monster) => monster.alive)).toBe(true);
    runtime.monsters.forEach((monster) => { monster.alive = false; monster.hp = 0; });
    engine.tick(1);
    expect(engine.state.phase).toBe('roll');
    expect(engine.state.activePlayer).toBe('p2');
  });
});

describe('shops, items, and combat economy', () => {
  it('shares shop stock, allows multiple purchases, and restocks after three later player turns', () => {
    const fixture = findShopFixture();
    const engine = new SessionEngine({ sessionId: 'shop', roomCode: 'SHOP', mode: 'pvp', seed: fixture.seed });
    ready(engine);
    engine.state.players.p1.coins = 200;
    rollInto(engine, 'p1', fixture.floor);
    const initial = engine.getSnapshot().sharedShop;
    expect(initial.offers.length).toBeGreaterThanOrEqual(2);
    const first = initial.offers[0];
    const second = initial.offers[1];
    expect(engine.handle('p1', { type: 'buy', slotId: first.slotId }).ok).toBe(true);
    expect(engine.handle('p1', { type: 'buy', slotId: second.slotId }).ok).toBe(true);
    expect(engine.handle('p1', { type: 'buy', slotId: first.slotId }).ok).toBe(false);
    expect(engine.getSnapshot().sharedShop.offers.map((offer) => offer.slotId)).not.toContain(first.slotId);
    expect(engine.handle('p1', { type: 'finish-shop' }).ok).toBe(true);
    expect(engine.getSnapshot().sharedShop.restockAfterTurns).toBe(3);

    rollInto(engine, 'p2', fixture.floor);
    expect(engine.getSnapshot().sharedShop.offers.map((offer) => offer.slotId)).not.toContain(first.slotId);
    expect(engine.handle('p2', { type: 'buy', slotId: first.slotId }).ok).toBe(false);
    expect(engine.handle('p2', { type: 'finish-shop' }).ok).toBe(true);
    expect(engine.getSnapshot().sharedShop.restockAfterTurns).toBe(2);

    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    clearRuntime(engine);
    rollInto(engine, 'p2', normalFloor);
    clearRuntime(engine);
    expect(engine.getSnapshot().sharedShop.restockAfterTurns).toBeNull();
    expect(engine.getSnapshot().sharedShop.offers).toHaveLength(initial.offers.length);
  });

  it('caps potion healing and keeps temporary weapon durability tied to combat floors', () => {
    const engine = new SessionEngine({ sessionId: 'potion', roomCode: 'POT', mode: 'cpu', seed: 'potion-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    internal(engine).grantItem(engine.state.players.p1, 'heart-potion');
    engine.state.players.p1.hearts = 2;
    expect(engine.handle('p1', { type: 'use-potion' }).ok).toBe(true);
    expect(engine.state.players.p1.hearts).toBe(3);
    expect(engine.handle('p1', { type: 'use-potion' }).ok).toBe(false);
    expect(engine.state.players.p1.hearts).toBe(3);

    internal(engine).grantItem(engine.state.players.p1, 'iron-sword');
    expect(engine.state.players.p1.weapon?.remainingCombatFloors).toBe(5);
    clearRuntime(engine);
    expect(engine.state.players.p1.weapon?.remainingCombatFloors).toBe(4);

    const shopEngine = new SessionEngine({ sessionId: 'weapon-shop', roomCode: 'WPN', mode: 'cpu', seed: fixtureSeedForShop() });
    ready(shopEngine);
    internal(shopEngine).grantItem(shopEngine.state.players.p1, 'thunder-greatsword');
    const shop = findFloor(shopEngine.state.seed, (floor) => isShopFloor(shopEngine.state.seed, floor));
    rollInto(shopEngine, 'p1', shop);
    expect(shopEngine.handle('p1', { type: 'finish-shop' }).ok).toBe(true);
    expect(shopEngine.state.players.p1.weapon?.remainingCombatFloors).toBe(1);
  });

  it('composes projectile and risk buffs and preserves them across death', () => {
    const engine = new SessionEngine({ sessionId: 'buffs', roomCode: 'BUFF', mode: 'cpu', seed: 'buff-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const player = engine.state.players.p1;
    internal(engine).grantItem(player, 'ranged-edge');
    internal(engine).grantItem(player, 'thorn-trail');
    const runtimeBefore = internal(engine).runtimes.p1;
    if (!runtimeBefore) throw new Error('Expected buff runtime');
    for (const monster of runtimeBefore.monsters) {
      monster.hp = 999_999;
      (monster as unknown as { position: { x: number; y: number } }).position = { x: 900, y: 500 };
    }
    expect(engine.handle('p1', {
      type: 'combat',
      command: { moveX: 1, moveY: 0, aim: { x: 1, y: 0 }, attack: true }
    }).ok).toBe(true);
    engine.tick(1);
    const runtime = internal(engine).runtimes.p1;
    if (!runtime) throw new Error('Expected buff runtime');
    expect(runtime.hazards.length).toBeGreaterThan(0);
    expect(runtime.projectiles.length).toBe(2);
    expect(runtime.playerPosition.x).toBeGreaterThan(80);
    expect(player.hearts).toBe(2);
    internal(engine).die('p1');
    expect(player.buffs.map((buff) => buff.itemId)).toEqual(['ranged-edge', 'thorn-trail']);
  });

  it('gives each participant the same chest reward candidate independently', () => {
    const engine = new SessionEngine({ sessionId: 'chests', roomCode: 'CHEST', mode: 'pvp', seed: 'chest-seed' });
    ready(engine);
    const normalFloor = findFloor(engine.state.seed, (floor) => generateFloorBlueprint(engine.state.seed, floor).type === 'normal');
    rollInto(engine, 'p1', normalFloor);
    const firstRuntime = internal(engine).runtimes.p1;
    if (!firstRuntime) throw new Error('Expected first chest runtime');
    firstRuntime.monsters = [];
    const firstChest = firstRuntime.chests[0];
    firstRuntime.playerPosition = { ...firstChest.position };
    expect(engine.handle('p1', {
      type: 'combat',
      command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, interact: true }
    }).ok).toBe(true);
    engine.tick(1);
    expect(firstChest.opened).toBe(true);
    const firstReward = firstChest.reward;
    expect(engine.state.phase).toBe('roll');
    rollInto(engine, 'p2', normalFloor);
    const secondRuntime = internal(engine).runtimes.p2;
    if (!secondRuntime) throw new Error('Expected second chest runtime');
    secondRuntime.monsters = [];
    const secondChest = secondRuntime.chests[0];
    expect(secondChest.reward).toEqual(firstReward);
    secondRuntime.playerPosition = { ...secondChest.position };
    expect(engine.handle('p2', {
      type: 'combat',
      command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, interact: true }
    }).ok).toBe(true);
    engine.tick(1);
    expect(secondChest.opened).toBe(true);
    expect(engine.state.players.p1.coins).toBe(firstReward.coins);
    expect(engine.state.players.p2.coins).toBe(secondChest.reward.coins);
  });
});

function fixtureSeedForShop(): string {
  return findShopFixture().seed;
}
