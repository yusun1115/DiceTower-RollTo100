import type { PlayerId, PresentationEvent, SessionState } from '@tower/shared';

const known = new Set(['roll', 'turn', 'clear', 'death', 'victory', 'attack', 'dash', 'enemy-hit', 'enemy-defeated', 'player-hit', 'heal', 'ghost', 'chest', 'item', 'purchase', 'weapon-expired', 'restock', 'coins']);

/** Repeated snapshots carry a short history; only new facts reach visuals/audio. */
export class EventRouter {
  private previous: SessionState | null = null;
  private cursor = 0;
  private legacyId = 0;

  reset(state: SessionState | null): void {
    this.previous = state;
    this.cursor = Math.max(0, ...(state?.presentationEvents ?? []).map(e => e.id));
  }

  consume(state: SessionState): PresentationEvent[] {
    if (!this.previous || this.previous.sessionId !== state.sessionId) { this.reset(state); return []; }
    const previous = this.previous;
    this.previous = state;
    if (state.presentationEvents) {
      if (!previous.presentationEvents) { this.reset(state); return []; }
      const incoming = [...state.presentationEvents].filter(e => Number.isFinite(e.id) && e.sessionId === state.sessionId && e.id > this.cursor).sort((a,b) => a.id - b.id);
      const fresh: PresentationEvent[] = [];
      for (const event of incoming) {
        if (event.id <= this.cursor) continue;
        this.cursor = event.id;
        if (known.has(event.kind)) fresh.push(event);
      }
      return fresh;
    }
    return this.fallback(previous, state);
  }

  private fallback(before: SessionState, after: SessionState): PresentationEvent[] {
    const result: PresentationEvent[] = [];
    const add = (id: PlayerId, fields: Partial<PresentationEvent> & Pick<PresentationEvent, 'kind'>) => result.push({
      id: ++this.legacyId, sessionId: after.sessionId, playerId: id, turnNumber: after.turnNumber,
      floor: after.players[id].floor, ...fields
    });
    const actor = before.activePlayer;
    const sameTurn = before.turnNumber === after.turnNumber && actor === after.activePlayer;
    const sameEncounter = sameTurn && before.phase === 'combat' && after.phase === 'combat' && before.floor?.floor === after.floor?.floor;
    if (before.phase === 'roll' && sameTurn && after.floor && (after.phase === 'combat' || after.phase === 'shop')) {
      add(actor, { kind: 'roll', roll: after.lastRoll ?? undefined, fromFloor: before.players[actor].floor, toFloor: after.players[actor].floor, floorType: after.floor.type });
    }
    for (const id of ['p1','p2'] as PlayerId[]) {
      if (after.players[id].floor < before.players[id].floor) add(id, { kind: 'death', floor: before.players[id].floor, fromFloor: before.players[id].floor, toFloor: after.players[id].floor, turnNumber: before.turnNumber });
    }
    if (sameEncounter) {
      const old = before.combat[actor]; const next = after.combat[actor];
      const heartDelta = after.players[actor].hearts - before.players[actor].hearts;
      if (heartDelta) add(actor, { kind: heartDelta < 0 ? 'player-hit' : 'heal', amount: Math.abs(heartDelta), position: next?.playerPosition });
      if (next?.ghost?.active && !old?.ghost?.active) add(actor, { kind: 'ghost', position: next.ghost.position });
      for (const enemy of next?.monsters ?? []) {
        const previous = old?.monsters.find(m => m.id === enemy.id);
        if (previous && enemy.hp < previous.hp) add(actor, { kind: 'enemy-hit', position: enemy.position, targetId: enemy.id, amount: previous.hp - enemy.hp });
        if (previous?.alive && !enemy.alive) add(actor, { kind: 'enemy-defeated', position: enemy.position, targetId: enemy.id });
      }
      for (const chest of next?.chests ?? []) if (chest.opened && old?.chests.some(c => c.id === chest.id && !c.opened)) add(actor, { kind: 'chest', position: chest.position });
      for (const p of next?.projectiles ?? []) if (p.id.startsWith('projectile-') && !old?.projectiles.some(previous => previous.id === p.id)) add(actor, { kind: 'attack', position: next!.playerPosition, direction: p.velocity });
    }
    if (sameTurn) {
      const coinDelta = after.players[actor].coins - before.players[actor].coins;
      if (coinDelta > 0) add(actor, { kind: 'coins', coins: coinDelta, position: after.combat[actor]?.playerPosition });
    }
    if (after.winner && !before.winner) add(after.winner, { kind: 'victory' });
    else if (!sameTurn || (before.phase === 'lobby' && after.phase === 'roll')) add(after.activePlayer, { kind: 'turn' });
    return result;
  }
}
