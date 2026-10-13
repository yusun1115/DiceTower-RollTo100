import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Creates its own disposable CPU room; never joins an existing player's room.
const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const WebSocket = require('ws');
const origin = process.argv[2] ?? 'https://dicetower-rollto100-server.onrender.com';
const health = await fetch(new URL('/health', origin), { signal: AbortSignal.timeout(15000) }).then(r => r.json());
assert.equal(health.presentationVersion, 1);
assert.equal(health.gameplayVersion, 2);
if (process.argv[3]) assert.equal(health.commit, process.argv[3]);
const url = new URL(origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(url);
const report = await new Promise((resolve, reject) => {
  let roomCode; let rolled = false; let attacked = false; let shopStart = null;
  const timer = setTimeout(() => reject(new Error('Public session timed out')), 15000);
  const send = message => socket.send(JSON.stringify(message));
  socket.once('open', () => send({ type: 'create', mode: 'cpu', difficulty: 'normal' }));
  socket.once('error', reject);
  socket.on('message', payload => {
    try {
      const message = JSON.parse(payload.toString());
      if (message.type === 'error') throw new Error(message.message);
      if (message.type === 'welcome') { roomCode = message.roomCode; send({ type: 'ready' }); }
      if (message.type !== 'state') return;
      const state = message.state;
      if (state.phase === 'roll' && state.activePlayer === 'p1' && !rolled) { rolled = true; send({ type: 'roll' }); return; }
      if (!rolled || !['combat','shop'].includes(state.phase)) return;
      const facts = state.presentationEvents;
      assert.ok(Array.isArray(facts) && facts.length <= 32);
      const rolls = facts.filter(event => event.kind === 'roll'); assert.equal(rolls.length, 1);
      assert.equal(rolls[0].roll, state.lastRoll); assert.equal(rolls[0].toFloor, state.players.p1.floor);
      if (state.phase === 'combat') {
        assert.equal(state.shop, null);
        assert.equal(typeof state.combat.p1.protectionMs, 'number');
        for (const hazard of state.combat.p1.hazards) assert.equal(typeof hazard.armingMs, 'number');
      } else {
        assert.equal(state.shop.floor, state.players.p1.floor);
        assert.equal(state.shop.pedestals.length, 4);
        assert.ok(state.sharedShop.offers.every(offer => state.shop.pedestals.some(pedestal => pedestal.slotId === offer.slotId)));
        if (!shopStart) {
          shopStart = { ...state.shop.playerPosition };
          send({ type: 'combat', command: { moveX: 0, moveY: -1, aim: { x: 1, y: 0 } } });
          return;
        }
        if (state.shop.playerPosition.y === shopStart.y) return;
        assert.equal(state.players.p1.hearts, 3);
        assert.equal(state.players.p1.coins, 0);
      }
      if (state.phase === 'combat' && !facts.some(event => event.kind === 'attack')) {
        if (!attacked) { attacked = true; send({ type: 'combat', command: { moveX: 0, moveY: 0, aim: { x: 1, y: 0 }, attack: true } }); }
        return;
      }
      clearTimeout(timer); resolve({ health, roomCode, phase: state.phase, die: state.lastRoll, floor: state.players.p1.floor, shopMovement: Boolean(shopStart), events: facts.map(event => event.kind) });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}).finally(() => socket.close());
console.log(JSON.stringify(report));
