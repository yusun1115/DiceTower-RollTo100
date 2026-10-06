import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { CombatSnapshot, PlayerId, ServerMessage, ShopOffer } from '@tower/shared';
import { buildCpuCombatCommand, chooseCpuOffer, SessionHost } from './session-host.js';

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  readonly messages: ServerMessage[] = [];

  send(payload: string): void {
    this.messages.push(JSON.parse(payload) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

function emit(socket: FakeSocket, message: object): void {
  socket.emit('message', Buffer.from(JSON.stringify(message)));
}

function latestState(socket: FakeSocket): ServerMessage & { type: 'state' } {
  const state = [...socket.messages].reverse().find((message): message is ServerMessage & { type: 'state' } => message.type === 'state');
  if (!state) throw new Error('Expected a state message');
  return state;
}

function latestWelcome(socket: FakeSocket): Extract<ServerMessage, { type: 'welcome' }> {
  const welcome = [...socket.messages].reverse().find((message): message is Extract<ServerMessage, { type: 'welcome' }> => message.type === 'welcome');
  if (!welcome) throw new Error('Expected a welcome message');
  return welcome;
}

describe('authoritative WebSocket session host', () => {
  it('changes CPU decisions by difficulty without changing legal command bounds', () => {
    const offers: ShopOffer[] = [
      { slotId: 'cheap', itemId: 'heart-potion', price: 5 },
      { slotId: 'strong', itemId: 'thunder-greatsword', price: 30 }
    ];
    expect(chooseCpuOffer(offers, 40, 'easy')?.slotId).toBe('cheap');
    expect(chooseCpuOffer(offers, 40, 'hard')?.slotId).toBe('strong');
    expect(chooseCpuOffer(offers, 10, 'hard')?.slotId).toBe('cheap');

    const combat = {
      floor: 3,
      type: 'normal',
      obstacles: [{ x: 250, y: 80, width: 60, height: 60 }],
      playerPosition: { x: 100, y: 100 },
      monsters: [{ id: 'm', type: 'goblin', position: { x: 500, y: 100 }, hp: 10, required: true, coinReward: 1, alive: true }],
      chests: [],
      projectiles: [],
      hazards: [],
      ghost: null,
      timeRemainingMs: 10_000,
      complete: false
    } satisfies CombatSnapshot;
    const easy = buildCpuCombatCommand(combat, 'easy');
    const hard = buildCpuCombatCommand(combat, 'hard');
    expect(Math.abs(easy.moveY)).toBeGreaterThan(Math.abs(easy.moveX));
    expect(Math.abs(hard.moveY)).toBeGreaterThan(Math.abs(hard.moveX));
    expect(hard.dash).toBe(true);
    expect(easy.moveX).toBeGreaterThanOrEqual(-1);
    expect(easy.moveX).toBeLessThanOrEqual(1);

    const ghostCombat = { ...combat, ghost: { position: { x: 80, y: 100 }, active: true } };
    const ghostEscape = buildCpuCombatCommand(ghostCombat, 'hard');
    expect(ghostEscape.attack).toBe(false);
    expect(ghostEscape.moveX).toBeGreaterThan(0);
  });

  it('creates, joins, and caps a two-human room while keeping readiness authoritative', () => {
    const host = new SessionHost();
    const first = new FakeSocket();
    const second = new FakeSocket();
    const third = new FakeSocket();
    host.attach(first as never);
    host.attach(second as never);
    host.attach(third as never);

    emit(first, { type: 'create', mode: 'pvp' });
    const welcome = latestWelcome(first);
    expect(welcome.playerId).toBe('p1');
    emit(first, { type: 'roll' });
    expect(first.messages).toContainEqual({ type: 'error', message: 'It is not your roll.' });

    emit(second, { type: 'join', roomCode: welcome.roomCode });
    expect(latestWelcome(second).playerId).toBe('p2');
    emit(third, { type: 'join', roomCode: welcome.roomCode });
    expect(third.messages).toContainEqual({ type: 'error', message: 'Room is full.' });

    emit(first, { type: 'ready' });
    expect(latestState(first).state.phase).toBe('lobby');
    emit(second, { type: 'ready' });
    expect(latestState(first).state.phase).toBe('roll');
    expect(latestState(second).state.activePlayer as PlayerId).toBe('p1');
  });

  it('creates a CPU session with the selected difficulty and advances CPU with legal commands', () => {
    const host = new SessionHost();
    const socket = new FakeSocket();
    host.attach(socket as never);
    emit(socket, { type: 'create', mode: 'cpu', difficulty: 'easy' });
    const welcome = latestWelcome(socket);
    const hosted = host.getSession(welcome.roomCode);
    if (!hosted) throw new Error('Expected hosted CPU session');
    expect(hosted.engine.state.mode).toBe('cpu');
    expect(hosted.engine.state.difficulty).toBe('easy');
    emit(socket, { type: 'ready' });
    expect(latestState(socket).state.phase).toBe('roll');
    emit(socket, { type: 'roll' });

    const internal = hosted.engine as unknown as {
      runtimes: Record<'p1' | 'p2', { monsters: Array<{ alive: boolean; hp: number }> } | null>;
    };
    if (hosted.engine.state.phase === 'shop') {
      hosted.engine.handle('p1', { type: 'finish-shop' });
    } else {
      const runtime = internal.runtimes.p1;
      if (runtime) runtime.monsters.forEach((monster) => { monster.alive = false; monster.hp = 0; });
    }
    host.tick(1, Date.now() + 1000);
    expect(hosted.engine.state.activePlayer).toBe('p2');
    host.tick(50, Date.now() + 2000);
    expect(['combat', 'shop', 'roll', 'victory']).toContain(hosted.engine.state.phase);
  });
});
