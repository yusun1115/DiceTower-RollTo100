import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerMessage } from '@tower/shared';
import { createTowerServer } from './server.js';

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
}

function nextMessage(socket: WebSocket, predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, 3000);
    const onMessage = (payload: WebSocket.RawData) => {
      const message = JSON.parse(payload.toString()) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

function send(socket: WebSocket, message: object): void {
  socket.send(JSON.stringify(message));
}

describe('WebSocket client integration', () => {
  it('runs two clients and a CPU client through the authoritative server', async () => {
    const server = createTowerServer();
    const clients: WebSocket[] = [];
    try {
      const port = await server.start(0);
      const url = `ws://127.0.0.1:${port}`;
      const first = new WebSocket(url);
      const second = new WebSocket(url);
      clients.push(first, second);
      await Promise.all([waitForOpen(first), waitForOpen(second)]);

      const firstWelcomePromise = nextMessage(first, (message) => message.type === 'welcome');
      send(first, { type: 'create', mode: 'pvp' });
      const firstWelcome = await firstWelcomePromise;
      if (firstWelcome.type !== 'welcome') throw new Error('Expected first welcome');

      const secondWelcomePromise = nextMessage(second, (message) => message.type === 'welcome');
      send(second, { type: 'join', roomCode: firstWelcome.roomCode });
      await secondWelcomePromise;

      const pvpRollPromise = nextMessage(first, (message) => message.type === 'state' && message.state.phase === 'roll');
      send(first, { type: 'ready' });
      send(second, { type: 'ready' });
      const pvpRoll = await pvpRollPromise;
      if (pvpRoll.type !== 'state') throw new Error('Expected PvP roll state');
      expect(pvpRoll.state.mode).toBe('pvp');
      expect(pvpRoll.state.activePlayer).toBe('p1');

      const pvpFloorPromise = nextMessage(first, (message) => message.type === 'state' && (message.state.phase === 'combat' || message.state.phase === 'shop'));
      send(first, { type: 'roll' });
      const pvpFloor = await pvpFloorPromise;
      if (pvpFloor.type !== 'state') throw new Error('Expected PvP floor state');
      const hostedPvp = server.host.getSession(firstWelcome.roomCode);
      if (!hostedPvp) throw new Error('Expected hosted PvP session');
      if (pvpFloor.state.phase === 'combat') {
        const internal = hostedPvp.engine as unknown as {
          runtimes: Record<'p1' | 'p2', { monsters: Array<{ alive: boolean; hp: number }> } | null>;
        };
        internal.runtimes.p1?.monsters.forEach((monster) => { monster.alive = false; monster.hp = 0; });
        const nextTurnPromise = nextMessage(first, (message) => message.type === 'state' && message.state.phase === 'roll' && message.state.activePlayer === 'p2');
        server.host.tick(1, Date.now() + 1000);
        const nextTurn = await nextTurnPromise;
        if (nextTurn.type !== 'state') throw new Error('Expected second turn state');
        expect(nextTurn.state.activePlayer).toBe('p2');
      } else {
        const nextTurnPromise = nextMessage(first, (message) => message.type === 'state' && message.state.phase === 'roll' && message.state.activePlayer === 'p2');
        send(first, { type: 'finish-shop' });
        await nextTurnPromise;
      }

      const cpu = new WebSocket(url);
      clients.push(cpu);
      await waitForOpen(cpu);
      const cpuWelcomePromise = nextMessage(cpu, (message) => message.type === 'welcome');
      send(cpu, { type: 'create', mode: 'cpu', difficulty: 'normal' });
      const cpuWelcome = await cpuWelcomePromise;
      if (cpuWelcome.type !== 'welcome') throw new Error('Expected CPU welcome');
      const cpuRollPromise = nextMessage(cpu, (message) => message.type === 'state' && message.state.phase === 'roll');
      send(cpu, { type: 'ready' });
      await cpuRollPromise;
      const hostedCpu = server.host.getSession(cpuWelcome.roomCode);
      if (!hostedCpu) throw new Error('Expected hosted CPU session');
      hostedCpu.engine.state.players.p1.floor = 99;
      hostedCpu.engine.state.activePlayer = 'p1';
      hostedCpu.engine.state.phase = 'roll';
      const finalBossPromise = nextMessage(cpu, (message) => message.type === 'state' && message.state.phase === 'combat' && message.state.floor?.floor === 100);
      send(cpu, { type: 'roll' });
      await finalBossPromise;
      const finalInternal = hostedCpu.engine as unknown as {
        runtimes: Record<'p1' | 'p2', { monsters: Array<{ alive: boolean; hp: number }> } | null>;
      };
      finalInternal.runtimes.p1?.monsters.forEach((monster) => { monster.alive = false; monster.hp = 0; });
      const victoryPromise = nextMessage(cpu, (message) => message.type === 'state' && message.state.phase === 'victory');
      server.host.tick(1, Date.now() + 2000);
      const victory = await victoryPromise;
      if (victory.type !== 'state') throw new Error('Expected victory state');
      expect(victory.state.winner).toBe('p1');
    } finally {
      clients.forEach((client) => client.terminate());
      await server.close();
    }
  }, 15_000);
});
