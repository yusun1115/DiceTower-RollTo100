import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { deriveSeed, isShopFloor, SHOP_INTERACT_RADIUS, type ServerMessage } from '@tower/shared';
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
  it('synchronizes world-shop movement and E purchases between two clients', async () => {
    const server = createTowerServer();
    const clients: WebSocket[] = [];
    try {
      const port = await server.start(0);
      const first = new WebSocket(`ws://127.0.0.1:${port}`);
      const second = new WebSocket(`ws://127.0.0.1:${port}`);
      clients.push(first, second);
      await Promise.all([waitForOpen(first), waitForOpen(second)]);
      const welcomePromise = nextMessage(first, message => message.type === 'welcome');
      send(first, { type: 'create', mode: 'pvp' });
      const welcome = await welcomePromise;
      if (welcome.type !== 'welcome') throw new Error('Expected shop room welcome');
      const joinPromise = nextMessage(second, message => message.type === 'welcome');
      send(second, { type: 'join', roomCode: welcome.roomCode });
      await joinPromise;
      const readyPromise = nextMessage(first, message => message.type === 'state' && message.state.phase === 'roll');
      send(first, { type: 'ready' }); send(second, { type: 'ready' });
      await readyPromise;

      // Deterministic test arrangement, never a public/admin protocol command.
      const engine = server.host.getSession(welcome.roomCode)!.engine;
      const floor = Array.from({ length: 90 }, (_, index) => index + 7).find(candidate => isShopFloor(engine.state.seed, candidate))!;
      const roll = deriveSeed(engine.state.seed, 'roll', engine.state.turnNumber, 'p1') % 6 + 1;
      engine.state.players.p1.floor = floor - roll;
      engine.state.players.p1.coins = 100;
      const shopPromise = nextMessage(first, message => message.type === 'state' && message.state.phase === 'shop');
      send(first, { type: 'roll' });
      const shop = await shopPromise;
      if (shop.type !== 'state' || !shop.state.shop) throw new Error('Expected world shop');
      const offer = shop.state.sharedShop.offers[0];
      const pedestal = shop.state.shop.pedestals.find(display => display.slotId === offer.slotId)!;
      const rejected = nextMessage(first, message => message.type === 'error');
      send(first, { type: 'buy', slotId: offer.slotId });
      expect(await rejected).toEqual({ type: 'error', message: 'Move closer to this item.' });
      expect(engine.state.players.p1.coins).toBe(100);

      const dx = pedestal.position.x - shop.state.shop.playerPosition.x;
      const dy = pedestal.position.y - shop.state.shop.playerPosition.y;
      const length = Math.hypot(dx, dy);
      const nearby = nextMessage(first, message => message.type === 'state' && message.state.phase === 'shop' && Boolean(message.state.shop && Math.hypot(message.state.shop.playerPosition.x - pedestal.position.x, message.state.shop.playerPosition.y - pedestal.position.y) <= SHOP_INTERACT_RADIUS));
      send(first, { type: 'combat', command: { moveX: dx / length, moveY: dy / length, aim: { x: dx, y: dy } } });
      await nearby;
      const purchased = nextMessage(first, message => message.type === 'state' && message.state.sharedShop.offers.length === 3);
      const observed = nextMessage(second, message => message.type === 'state' && message.state.sharedShop.offers.length === 3);
      send(first, { type: 'combat', command: { moveX: 0, moveY: 0, aim: { x: dx, y: dy }, interact: true } });
      const [owner, spectator] = await Promise.all([purchased, observed]);
      if (owner.type !== 'state' || spectator.type !== 'state') throw new Error('Expected shared purchase');
      expect(owner.state.players.p1.coins).toBe(100 - offer.price);
      expect(spectator.state.sharedShop).toEqual(owner.state.sharedShop);
      expect(spectator.state.shop).toEqual(owner.state.shop);
      expect(owner.state.sharedShop.restockAfterTurns).toBe(3);
    } finally {
      clients.forEach(client => client.terminate());
      await server.close();
    }
  }, 15_000);

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
      const otherFloorPromise = nextMessage(second, (message) => message.type === 'state' && (message.state.phase === 'combat' || message.state.phase === 'shop'));
      send(first, { type: 'roll' });
      const pvpFloor = await pvpFloorPromise;
      const otherFloor = await otherFloorPromise;
      if (pvpFloor.type !== 'state') throw new Error('Expected PvP floor state');
      if (otherFloor.type !== 'state') throw new Error('Expected other client floor state');
      expect(otherFloor.state.presentationEvents).toEqual(pvpFloor.state.presentationEvents);
      expect(pvpFloor.state.presentationEvents?.at(-1)?.kind).toBe('roll');
      if(pvpFloor.state.phase==='combat'||pvpFloor.state.phase==='shop') {
        const rejected=nextMessage(second,message=>message.type==='error');
        send(second,{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0},attack:true,dash:true}});
        expect((await rejected).type).toBe('error');
      }
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
