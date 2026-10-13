import { describe, expect, it } from 'vitest';
import { generateFloorBlueprint, isShopFloor } from './content.js';
import { deriveSeed } from './rng.js';
import { SessionEngine } from './session.js';
import { PRESENTATION_EVENT_LIMIT } from './presentation.js';

function engine() {
  const session = new SessionEngine({ sessionId: 'feel', roomCode: 'FEEL', mode: 'cpu', seed: 'feel-fixture' });
  session.markReady('p1');
  return session;
}
function enter(session: SessionEngine, floor: number) {
  session.state.phase = 'roll';
  session.state.activePlayer = 'p1';
  for (let turn = 1; turn < 100; turn++) {
    const roll = deriveSeed(session.state.seed, 'roll', turn, 'p1') % 6 + 1;
    if (floor < roll && floor !== 100) continue;
    session.state.turnNumber = turn;
    session.state.players.p1.floor = floor === 100 ? 99 : floor - roll;
    expect(session.roll('p1').ok).toBe(true);
    return;
  }
  throw new Error('Fixture roll not found');
}
function normalFloor(session: SessionEngine) {
  return Array.from({ length: 8 }, (_, i) => i + 3).find(f => generateFloorBlueprint(session.state.seed, f).type === 'normal')!;
}
function runtime(session: SessionEngine) {
  return (session as unknown as { runtimes: Record<string, {
    blueprint: { obstacles: unknown[] }; playerPosition: { x: number; y: number };
    monsters: Array<{ id: string; hp: number; alive: boolean; position: { x: number; y: number } }>;
    timeRemainingMs: number; ghost: { active: boolean; position: { x: number; y: number } } | null;
    lastDamageAt: Map<string,number>;
  }> }).runtimes.p1;
}
const facts = (session: SessionEngine) => session.getSnapshot().presentationEvents!;

describe('cosmetic authority facts', () => {
  it('records capped travel without changing dice or destination', () => {
    const session = engine();
    enter(session, 100);
    const roll = facts(session).find(e => e.kind === 'roll')!;
    expect(roll).toMatchObject({ playerId: 'p1', fromFloor: 99, toFloor: 100, floor: 100, floorType: 'final-boss' });
    expect(roll.roll).toBe(session.state.lastRoll);
    expect(facts(session).some(e => e.kind === 'victory')).toBe(false);
  });
  it('retains fatal damage, death position, and next turn after the heart reset', () => {
    const session = engine();
    enter(session, normalFloor(session));
    const fromFloor = session.state.players.p1.floor;
    (session as unknown as { damagePlayer(id: string, amount: number): void }).damagePlayer('p1', 3);
    const death = facts(session).find(e => e.kind === 'death')!;
    expect(death.fromFloor).toBe(fromFloor);
    expect(death.toFloor).toBe(Math.max(1, fromFloor - 3));
    expect(death.position).toBeDefined();
    expect(session.state.players.p1.hearts).toBe(3);
    expect(facts(session).slice(-3).map(e => e.kind)).toEqual(['player-hit', 'death', 'turn']);
    expect(facts(session).at(-1)?.playerId).toBe('p2');
  });
  it('preserves the last real hit before an immediate scene handoff', () => {
    const session = engine();
    enter(session, normalFloor(session));
    const r = runtime(session);
    r.blueprint.obstacles = [];
    r.monsters.forEach(m => { m.alive = false; });
    const last = r.monsters[0];
    last.alive = true; last.hp = 1;
    last.position = { x: r.playerPosition.x + 21, y: r.playerPosition.y };
    session.handle('p1', { type: 'combat', command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, attack: true } });
    session.tick(50);
    expect(session.state.phase).toBe('roll');
    expect(facts(session).filter(e => ['enemy-hit', 'enemy-defeated', 'clear', 'turn'].includes(e.kind)).slice(-4).map(e => e.kind))
      .toEqual(['enemy-hit', 'enemy-defeated', 'clear', 'turn']);
    expect(facts(session).find(e => e.kind === 'enemy-defeated')?.position).toBeDefined();
  });
  it('records accepted attacks and dashes only at their existing cooldowns', () => {
    const session = engine();
    enter(session, normalFloor(session));
    const r = runtime(session); r.blueprint.obstacles = [];
    r.monsters.forEach(m => { m.position = { x: 800, y: 400 }; });
    session.handle('p1', { type: 'combat', command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, attack: true, dash: true } });
    for (let i = 0; i < 3; i++) session.tick(50);
    expect(facts(session).filter(e => e.kind === 'attack')).toHaveLength(1);
    expect(facts(session).filter(e => e.kind === 'dash')).toHaveLength(1);
  });
  it('records a victory once and never announces a next turn for it', () => {
    const session = engine(); enter(session, 100);
    runtime(session).monsters.forEach(m => { m.alive = false; m.hp = 0; });
    session.tick(1); session.tick(1);
    expect(facts(session).filter(e => e.kind === 'victory')).toHaveLength(1);
    expect(facts(session).at(-1)?.kind).toBe('victory');
    expect(session.state.winner).toBe('p1');
  });
  it('records an accepted blocked dash without bypassing obstacle damage throttling',()=> {
    const session=engine();enter(session,normalFloor(session));const r=runtime(session);
    r.monsters.forEach(m=>{m.position={x:800,y:400};});
    r.blueprint.obstacles=[{x:170,y:250,width:20,height:40}];r.lastDamageAt.set('obstacle:170:250',Date.now());
    session.handle('p1',{type:'combat',command:{moveX:0,moveY:0,aim:{x:1,y:0},dash:true}});
    session.tick(1);session.tick(1);
    const dashes=facts(session).filter(e=>e.kind==='dash');
    expect(dashes).toHaveLength(1);expect(dashes[0].position).toEqual(dashes[0].from);
    expect(session.state.players.p1.hearts).toBe(3);
  });
  it('emits no acquisition for rejected purchases', () => {
    const session = engine();
    const floor = Array.from({ length: 99 }, (_, i) => i + 1).find(f => isShopFloor(session.state.seed, f))!;
    enter(session, floor);
    const offer = session.getSnapshot().sharedShop.offers[0];
    const before = facts(session).at(-1)!.id;
    expect(session.handle('p1', { type: 'buy', slotId: offer.slotId }).ok).toBe(false);
    expect(facts(session).at(-1)!.id).toBe(before);
    session.state.players.p1.coins = 200;
    expect(session.handle('p1', { type: 'buy', slotId: offer.slotId }).ok).toBe(true);
    expect(facts(session).slice(-2).map(e => e.kind)).toEqual(['item', 'purchase']);
    expect(facts(session).at(-1)?.coins).toBe(-offer.price);
  });
  it('bounds history, preserves ordering, and returns independent snapshots', () => {
    const session = engine(); enter(session, normalFloor(session));
    session.state.players.p1.potions = 100;
    for (let i = 0; i < 60; i++) {
      session.state.players.p1.hearts = 1;
      session.handle('p1', { type: 'use-potion' });
    }
    const snapshot = facts(session);
    expect(snapshot).toHaveLength(PRESENTATION_EVENT_LIMIT);
    expect(snapshot.map(e => e.id)).toEqual([...snapshot.map(e => e.id)].sort((a,b) => a-b));
    snapshot[0].amount = 999;
    expect(facts(session)[0].amount).toBe(1);
  });
});
