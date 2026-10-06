import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  SessionEngine,
  parseClientMessage,
  type ClientMessage,
  type CombatCommand,
  type CombatSnapshot,
  type Difficulty,
  type PlayerId,
  type ShopOffer,
  type ServerMessage
} from '@tower/shared';

interface ClientContext {
  socket: WebSocket;
  session: SessionEngine | null;
  playerId: PlayerId | null;
}

interface HostedSession {
  engine: SessionEngine;
  clients: Map<PlayerId, WebSocket>;
  cpuNextActionAt: number;
}

function makeRoomCode(existing: Iterable<string>): string {
  const used = new Set(existing);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (used.has(code));
  return code;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function pointInsideRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pathBlocked(start: { x: number; y: number }, target: { x: number; y: number }, obstacles: CombatSnapshot['obstacles']): boolean {
  for (let step = 1; step <= 10; step += 1) {
    const ratio = step / 10;
    const point = { x: start.x + (target.x - start.x) * ratio, y: start.y + (target.y - start.y) * ratio };
    if (obstacles.some((obstacle) => pointInsideRect(point, obstacle))) return true;
  }
  return false;
}

export function chooseCpuOffer(offers: ShopOffer[], coins: number, difficulty: Difficulty): ShopOffer | undefined {
  const affordable = offers.filter((offer) => offer.price <= coins);
  if (affordable.length === 0) return undefined;
  if (difficulty === 'easy') return [...affordable].sort((left, right) => left.price - right.price)[0];
  if (difficulty === 'hard') return [...affordable].sort((left, right) => right.price - left.price)[0];
  return affordable[0];
}

export function buildCpuCombatCommand(combat: CombatSnapshot, difficulty: Difficulty): CombatCommand {
  const target = combat.monsters.find((monster) => monster.alive);
  const targetVector = target
    ? { x: target.position.x - combat.playerPosition.x, y: target.position.y - combat.playerPosition.y }
    : { x: 1, y: 0 };
  const ghostVector = combat.ghost?.active
    ? { x: combat.playerPosition.x - combat.ghost.position.x, y: combat.playerPosition.y - combat.ghost.position.y }
    : null;
  let vector = difficulty === 'hard' && ghostVector ? ghostVector : targetVector;
  if (!ghostVector && pathBlocked(combat.playerPosition, target?.position ?? { x: combat.playerPosition.x + 1, y: combat.playerPosition.y }, combat.obstacles)) {
    vector = { x: -targetVector.y, y: targetVector.x };
  }
  const magnitude = Math.max(1, Math.hypot(vector.x, vector.y));
  const precision = difficulty === 'easy' ? 0.55 : 1;
  return {
    moveX: clamp(vector.x / magnitude * precision),
    moveY: clamp(vector.y / magnitude * precision),
    aim: targetVector,
    attack: !ghostVector,
    dash: difficulty === 'hard' && (Boolean(ghostVector) || magnitude > 180)
  };
}

export class SessionHost {
  private readonly sessions = new Map<string, HostedSession>();
  private readonly contexts = new Set<ClientContext>();

  attach(socket: WebSocket): void {
    const context: ClientContext = { socket, session: null, playerId: null };
    this.contexts.add(context);
    socket.on('message', (payload) => this.receive(context, payload.toString()));
    socket.on('close', () => this.contexts.delete(context));
    send(socket, { type: 'notice', message: 'Connected to Tower Race.' });
  }

  tick(deltaMs: number, now = Date.now()): void {
    for (const hosted of this.sessions.values()) {
      this.runCpu(hosted, now);
      hosted.engine.tick(deltaMs);
      this.broadcast(hosted);
    }
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getSession(roomCode: string): HostedSession | undefined {
    return [...this.sessions.values()].find((host) => host.engine.state.roomCode === roomCode);
  }

  private receive(context: ClientContext, raw: string): void {
    let message: ClientMessage;
    try {
      message = parseClientMessage(JSON.parse(raw));
    } catch {
      send(context.socket, { type: 'error', message: 'Invalid message payload.' });
      return;
    }
    if (message.type === 'create') {
      this.create(context, message.mode, message.difficulty);
      return;
    }
    if (message.type === 'join') {
      this.join(context, message.roomCode);
      return;
    }
    if (!context.session || !context.playerId) {
      send(context.socket, { type: 'error', message: 'Create or join a room first.' });
      return;
    }
    const result = context.session.handle(context.playerId, message);
    if (!result.ok) send(context.socket, { type: 'error', message: result.error ?? 'Action rejected.' });
    const hosted = [...this.sessions.values()].find((candidate) => candidate.engine === context.session);
    if (hosted) this.broadcast(hosted);
  }

  private create(context: ClientContext, mode: 'pvp' | 'cpu', difficulty?: Difficulty): void {
    if (context.session) {
      send(context.socket, { type: 'error', message: 'This connection already belongs to a room.' });
      return;
    }
    const roomCode = makeRoomCode([...this.sessions.values()].map((host) => host.engine.state.roomCode));
    const engine = new SessionEngine({
      sessionId: randomUUID(),
      roomCode,
      mode,
      difficulty: mode === 'cpu' ? difficulty ?? 'normal' : undefined
    });
    const hosted: HostedSession = { engine, clients: new Map([['p1', context.socket]]), cpuNextActionAt: Date.now() + 500 };
    this.sessions.set(engine.state.sessionId, hosted);
    context.session = engine;
    context.playerId = 'p1';
    send(context.socket, { type: 'welcome', sessionId: engine.state.sessionId, roomCode, playerId: 'p1' });
    this.broadcast(hosted);
  }

  private join(context: ClientContext, roomCode: string): void {
    if (context.session) {
      send(context.socket, { type: 'error', message: 'This connection already belongs to a room.' });
      return;
    }
    const hosted = this.getSession(roomCode);
    if (!hosted || hosted.engine.state.mode !== 'pvp') {
      send(context.socket, { type: 'error', message: 'Room not found.' });
      return;
    }
    if (hosted.clients.has('p2')) {
      send(context.socket, { type: 'error', message: 'Room is full.' });
      return;
    }
    hosted.clients.set('p2', context.socket);
    context.session = hosted.engine;
    context.playerId = 'p2';
    send(context.socket, { type: 'welcome', sessionId: hosted.engine.state.sessionId, roomCode, playerId: 'p2' });
    this.broadcast(hosted);
  }

  private runCpu(hosted: HostedSession, now: number): void {
    const engine = hosted.engine;
    if (engine.state.mode !== 'cpu' || engine.state.activePlayer !== 'p2' || now < hosted.cpuNextActionAt) return;
    const difficulty = engine.state.difficulty ?? 'normal';
    if (engine.state.phase === 'roll') {
      engine.roll('p2');
      hosted.cpuNextActionAt = now + (difficulty === 'hard' ? 350 : difficulty === 'easy' ? 950 : 600);
      return;
    }
    if (engine.state.phase === 'shop') {
      const state = engine.getSnapshot();
      const affordable = chooseCpuOffer(state.sharedShop.offers, state.players.p2.coins, difficulty);
      if (affordable) engine.handle('p2', { type: 'buy', slotId: affordable.slotId });
      engine.handle('p2', { type: 'finish-shop' });
      hosted.cpuNextActionAt = now + 600;
      return;
    }
    if (engine.state.phase !== 'combat') return;
    const combat = engine.getSnapshot().combat.p2;
    if (!combat) return;
    if (engine.state.players.p2.potions > 0 && engine.state.players.p2.hearts <= 1) {
      engine.handle('p2', { type: 'use-potion' });
      hosted.cpuNextActionAt = now + (difficulty === 'hard' ? 350 : 600);
      return;
    }
    engine.handle('p2', {
      type: 'combat',
      command: buildCpuCombatCommand(combat, difficulty)
    });
    hosted.cpuNextActionAt = now + (difficulty === 'hard' ? 80 : difficulty === 'easy' ? 220 : 130);
  }

  private broadcast(hosted: HostedSession): void {
    const message: ServerMessage = { type: 'state', state: hosted.engine.getSnapshot() };
    for (const socket of hosted.clients.values()) send(socket, message);
  }
}
