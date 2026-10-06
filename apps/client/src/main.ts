import './styles.css';
import type { Difficulty, PlayerId, ServerMessage, SessionState } from '@tower/shared';

const configuredWsUrl = import.meta.env.VITE_WS_URL;
const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = configuredWsUrl || `${defaultWsProtocol}//${window.location.hostname}:8787`;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app root');

root.innerHTML = `
  <main class="app-shell">
    <header class="brand">
      <div>
        <p class="eyebrow">100 FLOOR TOWER RACE</p>
        <h1>Tower Race</h1>
      </div>
      <div id="connection-status" class="pill">연결 중...</div>
    </header>
    <section id="menu-panel" class="panel menu-panel">
      <h2>게임 시작</h2>
      <p class="muted">주사위를 굴리고 던전을 돌파해 100층 보스를 먼저 처치하세요.</p>
      <div class="menu-grid">
        <button id="cpu-button" class="primary">CPU 대전</button>
        <select id="difficulty-select" aria-label="CPU 난이도">
          <option value="easy">쉬움</option>
          <option value="normal" selected>보통</option>
          <option value="hard">어려움</option>
        </select>
      </div>
      <div class="divider"><span>온라인 방</span></div>
      <div class="menu-grid">
        <button id="create-button">방 만들기</button>
        <input id="room-input" maxlength="5" placeholder="방 코드" aria-label="방 코드" />
        <button id="join-button">참가</button>
      </div>
      <p id="menu-message" class="message"></p>
    </section>
    <section id="game-panel" class="game-layout hidden">
      <div class="game-main">
        <div class="game-toolbar">
          <div><span class="label">방</span> <strong id="room-code">-</strong></div>
          <div><span class="label">내 ID</span> <strong id="player-id">-</strong></div>
          <div><span class="label">모드</span> <strong id="mode-label">-</strong></div>
          <div id="phase-label" class="phase-label">대기</div>
        </div>
        <div id="warning-banner" class="warning-banner hidden" role="status" aria-live="assertive"></div>
        <canvas id="game-canvas" width="960" height="540" aria-label="Tower Race 던전"></canvas>
        <div class="controls-hint">WASD 이동 · 마우스 조준/클릭 공격 · Space 대시 · E 상자 열기</div>
      </div>
      <aside class="sidebar">
        <div class="panel stats-panel">
          <div class="stat-row"><span>현재 층</span><strong id="floor-value">0</strong></div>
          <div class="stat-row"><span>내 하트</span><strong id="hearts-value">♥♥♥</strong></div>
          <div class="stat-row"><span>내 코인</span><strong id="coins-value">0</strong></div>
          <div class="stat-row"><span>내 무기</span><strong id="weapon-value">기본 공격</strong></div>
          <div class="stat-row"><span>턴</span><strong id="turn-value">-</strong></div>
        </div>
        <div class="panel dice-panel">
          <div class="dice-heading"><h3>다음 이동</h3><span id="dice-status" class="muted">준비 대기</span></div>
          <div id="dice-face" class="dice-face" aria-label="최근 주사위 결과">⚀</div>
          <button id="dice-button" class="primary dice-button" disabled>주사위 굴리기</button>
        </div>
        <div id="action-panel" class="panel action-panel"></div>
        <div id="shop-panel" class="panel shop-panel hidden"></div>
        <div id="event-log" class="event-log" aria-live="polite"></div>
      </aside>
    </section>
  </main>
`;

const menuPanel = document.querySelector<HTMLElement>('#menu-panel')!;
const gamePanel = document.querySelector<HTMLElement>('#game-panel')!;
const menuMessage = document.querySelector<HTMLElement>('#menu-message')!;
const connectionStatus = document.querySelector<HTMLElement>('#connection-status')!;
const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const context = canvas.getContext('2d')!;
const actionPanel = document.querySelector<HTMLElement>('#action-panel')!;
const shopPanel = document.querySelector<HTMLElement>('#shop-panel')!;
const eventLog = document.querySelector<HTMLElement>('#event-log')!;
const diceFace = document.querySelector<HTMLElement>('#dice-face')!;
const diceStatus = document.querySelector<HTMLElement>('#dice-status')!;
const diceButton = document.querySelector<HTMLButtonElement>('#dice-button')!;
const keys = new Set<string>();
const pointer = { x: canvas.width / 2, y: canvas.height / 2, down: false };
let socket: WebSocket | null = null;
let playerId: PlayerId | null = null;
let sessionState: SessionState | null = null;
let lastState: SessionState | null = null;
let lastCommandAt = 0;
let lastWarningKey = '';
let audioContext: AudioContext | null = null;

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  socket = new WebSocket(WS_URL);
  socket.addEventListener('open', () => {
    connectionStatus.textContent = '연결됨';
    connectionStatus.classList.add('connected');
  });
  socket.addEventListener('close', () => {
    connectionStatus.textContent = '연결 끊김';
    connectionStatus.classList.remove('connected');
  });
  socket.addEventListener('error', () => {
    connectionStatus.textContent = '서버 확인 필요';
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    handleServerMessage(message);
  });
}

function send(message: object): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showMessage('서버에 연결되지 않았습니다. pnpm dev를 실행했는지 확인하세요.');
    return;
  }
  socket.send(JSON.stringify(message));
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'welcome') {
    playerId = message.playerId;
    document.querySelector('#room-code')!.textContent = message.roomCode;
    document.querySelector('#player-id')!.textContent = message.playerId;
    menuPanel.classList.add('hidden');
    gamePanel.classList.remove('hidden');
    appendLog(`${message.roomCode} 방에 입장했습니다.`);
    return;
  }
  if (message.type === 'error') {
    showMessage(message.message);
    appendLog(`오류: ${message.message}`);
    return;
  }
  if (message.type === 'notice') {
    appendLog(message.message);
    return;
  }
  lastState = sessionState;
  sessionState = message.state;
  renderState();
}

function renderState(): void {
  if (!sessionState || !playerId) return;
  const player = sessionState.players[playerId];
  document.querySelector('#floor-value')!.textContent = String(player.floor);
  document.querySelector('#hearts-value')!.textContent = `${'♥'.repeat(player.hearts)}${'♡'.repeat(player.maxHearts - player.hearts)}`;
  document.querySelector('#coins-value')!.textContent = String(player.coins);
  document.querySelector('#weapon-value')!.textContent = player.weapon ? `${player.weapon.itemId} (${player.weapon.remainingCombatFloors ?? '∞'})` : '기본 공격';
  document.querySelector('#turn-value')!.textContent = `${sessionState.turnNumber} · ${sessionState.activePlayer === playerId ? '내 턴' : '상대 턴'}`;
  document.querySelector('#mode-label')!.textContent = sessionState.mode === 'cpu' ? 'CPU 대전' : '1대1 온라인';
  const phaseText: Record<SessionState['phase'], string> = {
    lobby: '준비 대기',
    roll: '주사위를 굴리세요',
    'floor-setup': '층 준비',
    combat: '던전 전투',
    shop: '상점',
    resolved: '턴 정리',
    victory: sessionState.winner === playerId ? '승리!' : '패배'
  };
  document.querySelector('#phase-label')!.textContent = phaseText[sessionState.phase];
  if (lastState && lastState.phase !== sessionState.phase) {
    appendLog(phaseText[sessionState.phase]);
    beep(sessionState.phase === 'victory' ? 740 : sessionState.phase === 'shop' ? 520 : 320);
  }
  renderActions();
  renderDice();
  renderShop();
  renderWarnings();
  draw();
}

function renderDice(): void {
  if (!sessionState || !playerId) return;
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const isMine = sessionState.activePlayer === playerId;
  const canRoll = sessionState.phase === 'roll' && isMine;
  const readyByMe = sessionState.readyPlayers.includes(playerId);
  diceFace.textContent = sessionState.lastRoll ? faces[sessionState.lastRoll - 1] : '⚀';
  diceStatus.textContent = sessionState.phase === 'lobby'
    ? readyByMe
      ? sessionState.mode === 'cpu' ? '게임 시작 중' : '내 준비 완료 · 상대 대기'
      : sessionState.mode === 'cpu' ? '준비 완료 후 시작' : '두 플레이어 준비 필요'
    : canRoll
      ? '내 턴 · 굴릴 수 있음'
      : sessionState.phase === 'roll'
        ? '상대 턴'
        : `최근 결과 ${sessionState.lastRoll ?? '-'}칸`;
  diceButton.disabled = !canRoll;
  diceButton.textContent = canRoll ? '주사위 굴리기' : '주사위 대기 중';
  diceButton.onclick = () => {
    if (canRoll) send({ type: 'roll' });
  };
}

function renderWarnings(): void {
  if (!sessionState || !playerId) return;
  const banner = document.querySelector<HTMLElement>('#warning-banner')!;
  const warnings: string[] = [];
  const player = sessionState.players[playerId];
  const combat = sessionState.combat[playerId];
  if (sessionState.phase === 'victory') {
    warnings.push(sessionState.winner === playerId ? '최종보스를 처치했습니다! 승리!' : '상대가 최종보스를 먼저 처치했습니다.');
  } else if (sessionState.phase === 'combat') {
    if (sessionState.floor?.type === 'final-boss') warnings.push('최종보스 층 · 모든 필수 적을 처치하세요');
    else if (sessionState.floor?.type === 'mini-boss') warnings.push('미니보스 층 · 보스가 살아 있으면 턴이 끝나지 않습니다');
    if (player.hearts <= 1) warnings.push('하트가 1개입니다 · 다음 피격은 사망합니다');
    if (combat?.ghost?.active) warnings.push('무적 유령 출현 · 닿으면 즉사합니다');
    else if (combat && combat.timeRemainingMs <= 10_000) warnings.push(`시간 임박 · ${Math.ceil(combat.timeRemainingMs / 1000)}초`);
  } else if (sessionState.phase === 'shop') {
    if (sessionState.sharedShop.restockAfterTurns === 1) warnings.push('다음 플레이어 턴 종료 후 상점 재입고');
    else warnings.push('공유 상점 · 구매한 상품은 상대에게도 사라집니다');
  }
  if (lastState) {
    const death = (['p1', 'p2'] as PlayerId[]).some((id) => sessionState!.players[id].floor < lastState!.players[id].floor);
    if (death) warnings.push('사망 처리 · 현재 층에서 3층 내려갑니다');
    if (lastState.sharedShop.restockAfterTurns !== null && sessionState.sharedShop.restockAfterTurns === null) {
      warnings.push('상점 재고가 새로 채워졌습니다');
    }
  }
  const key = warnings.join('|');
  banner.textContent = warnings.join('  ·  ');
  banner.classList.toggle('hidden', warnings.length === 0);
  if (key && key !== lastWarningKey) beep(sessionState.phase === 'victory' ? 740 : 220);
  lastWarningKey = key;
}

function renderActions(): void {
  if (!sessionState || !playerId) return;
  actionPanel.innerHTML = '';
  const isMine = sessionState.activePlayer === playerId;
  if (sessionState.phase === 'lobby') {
    const readyByMe = sessionState.readyPlayers.includes(playerId);
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = sessionState.mode === 'cpu'
      ? readyByMe
        ? '준비 완료 처리됨. 게임을 시작하는 중입니다.'
        : 'CPU가 준비되어 있습니다. 준비 완료를 누르면 1P 턴이 시작됩니다.'
      : readyByMe
        ? '준비 완료 처리됨. 상대가 입장하고 준비 완료할 때까지 기다리세요.'
        : '온라인 방은 1P와 2P가 모두 준비 완료해야 시작합니다. 방 코드를 상대에게 공유하세요.';
    actionPanel.append(status);
    const ready = document.createElement('button');
    ready.textContent = readyByMe ? '준비 완료됨' : '준비 완료';
    ready.className = 'primary';
    ready.disabled = readyByMe;
    ready.onclick = () => send({ type: 'ready' });
    actionPanel.append(ready);
    return;
  }
  if (sessionState.phase === 'roll' && isMine) {
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = '위 주사위 카드에서 이동할 층을 결정하세요.';
    actionPanel.append(status);
    return;
  }
  if (sessionState.phase === 'combat') {
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = isMine ? '던전을 클리어하세요.' : '상대 플레이어의 전투를 관전 중입니다.';
    actionPanel.append(status);
    if (isMine) {
      const potion = document.createElement('button');
      potion.textContent = `회복 물약 사용 (${sessionState.players[playerId].potions})`;
      potion.disabled = sessionState.players[playerId].potions === 0;
      potion.onclick = () => send({ type: 'use-potion' });
      actionPanel.append(potion);
    }
    return;
  }
  if (sessionState.phase === 'shop') {
    const status = document.createElement('p');
    status.className = 'muted';
    status.textContent = isMine ? '원하는 상품을 여러 개 구매하세요.' : '상대가 공유 상점을 이용 중입니다.';
    actionPanel.append(status);
  }
}

function renderShop(): void {
  if (!sessionState || sessionState.phase !== 'shop') {
    shopPanel.classList.add('hidden');
    return;
  }
  shopPanel.classList.remove('hidden');
  shopPanel.innerHTML = '<h3>공유 상점</h3>';
  const offers = sessionState.sharedShop.offers;
  const player = playerId ? sessionState.players[playerId] : null;
  for (const offer of offers) {
    const button = document.createElement('button');
    button.className = 'shop-item';
    button.disabled = sessionState.activePlayer !== playerId || !player || player.coins < offer.price;
    button.innerHTML = `<span>${offer.itemId}</span><strong>${offer.price} 코인</strong>`;
    button.onclick = () => send({ type: 'buy', slotId: offer.slotId });
    shopPanel.append(button);
  }
  const footer = document.createElement('div');
  footer.className = 'shop-footer';
  footer.innerHTML = `<span>재고 ${offers.length}개 · ${sessionState.sharedShop.restockAfterTurns === null ? '재입고 대기 없음' : `${sessionState.sharedShop.restockAfterTurns}턴 후 재입고`}</span>`;
  const finish = document.createElement('button');
  finish.textContent = '쇼핑 끝내기';
  finish.disabled = sessionState.activePlayer !== playerId;
  finish.onclick = () => send({ type: 'finish-shop' });
  footer.append(finish);
  shopPanel.append(footer);
}

function draw(): void {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111827';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!sessionState) return;
  const blueprint = sessionState.floor;
  const combat = playerId ? sessionState.combat[playerId] : null;
  if (blueprint) {
    context.fillStyle = blueprint.type === 'shop' ? '#193329' : '#1f2937';
    context.fillRect(16, 16, blueprint.width - 32, blueprint.height - 32);
    context.strokeStyle = blueprint.type === 'final-boss' ? '#f59e0b' : blueprint.type === 'mini-boss' ? '#ef4444' : '#475569';
    context.lineWidth = 4;
    context.strokeRect(16, 16, blueprint.width - 32, blueprint.height - 32);
    context.fillStyle = '#374151';
    for (const obstacle of blueprint.obstacles) context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  }
  if (!combat) {
    context.fillStyle = '#94a3b8';
    context.font = '20px system-ui';
    context.fillText(sessionState.phase === 'shop' ? '상점층' : '주사위를 굴리면 던전이 열립니다', 300, 280);
    return;
  }
  for (const chest of combat.chests) {
    if (!chest.opened) {
      context.fillStyle = '#f59e0b';
      context.fillRect(chest.position.x - 10, chest.position.y - 8, 20, 16);
    }
  }
  for (const hazard of combat.hazards) {
    context.fillStyle = 'rgba(239, 68, 68, 0.38)';
    context.beginPath();
    context.arc(hazard.position.x, hazard.position.y, hazard.radius, 0, Math.PI * 2);
    context.fill();
  }
  for (const monster of combat.monsters) {
    if (!monster.alive) continue;
    context.fillStyle = monster.type.includes('boss') ? '#dc2626' : '#a855f7';
    context.beginPath();
    context.arc(monster.position.x, monster.position.y, monster.type.includes('boss') ? 26 : 16, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8fafc';
    context.font = '10px system-ui';
    context.fillText(`${Math.max(0, Math.ceil(monster.hp))}`, monster.position.x - 8, monster.position.y - 22);
  }
  for (const projectile of combat.projectiles) {
    context.fillStyle = '#fbbf24';
    context.beginPath();
    context.arc(projectile.position.x, projectile.position.y, 5, 0, Math.PI * 2);
    context.fill();
  }
  if (combat.ghost?.active) {
    context.fillStyle = 'rgba(226, 232, 240, 0.72)';
    context.beginPath();
    context.arc(combat.ghost.position.x, combat.ghost.position.y, 24, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = '#38bdf8';
  context.beginPath();
  context.arc(combat.playerPosition.x, combat.playerPosition.y, 14, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f8fafc';
  context.font = '14px system-ui';
  context.fillText(`${Math.ceil(combat.timeRemainingMs / 1000)}s`, 32, 48);
}

function showMessage(message: string): void {
  menuMessage.textContent = message;
}

function appendLog(message: string): void {
  const line = document.createElement('div');
  line.textContent = message;
  eventLog.prepend(line);
  while (eventLog.children.length > 6) eventLog.lastElementChild?.remove();
}

function beep(frequency: number): void {
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.04;
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
  } catch {
    // Browser autoplay policy may block optional audio feedback.
  }
}

document.querySelector('#cpu-button')!.addEventListener('click', () => {
  const difficulty = (document.querySelector('#difficulty-select') as HTMLSelectElement).value as Difficulty;
  connect();
  send({ type: 'create', mode: 'cpu', difficulty });
});
document.querySelector('#create-button')!.addEventListener('click', () => {
  connect();
  send({ type: 'create', mode: 'pvp' });
});
document.querySelector('#join-button')!.addEventListener('click', () => {
  const roomCode = (document.querySelector('#room-input') as HTMLInputElement).value.trim().toUpperCase();
  connect();
  send({ type: 'join', roomCode });
});

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (event.code === 'Space') event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointermove', (event) => {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - bounds.left) * canvas.width / bounds.width;
  pointer.y = (event.clientY - bounds.top) * canvas.height / bounds.height;
});
canvas.addEventListener('pointerdown', () => { pointer.down = true; });
window.addEventListener('pointerup', () => { pointer.down = false; });

function commandLoop(now: number): void {
  if (sessionState && playerId && sessionState.phase === 'combat' && sessionState.activePlayer === playerId && now - lastCommandAt > 45) {
    const combat = sessionState.combat[playerId];
    if (combat) {
      send({
        type: 'combat',
        command: {
          moveX: Number(keys.has('d')) - Number(keys.has('a')),
          moveY: Number(keys.has('s')) - Number(keys.has('w')),
          aim: { x: pointer.x - combat.playerPosition.x, y: pointer.y - combat.playerPosition.y },
          attack: pointer.down,
          dash: keys.has(' '),
          interact: keys.has('e')
        }
      });
      lastCommandAt = now;
    }
  }
  requestAnimationFrame(commandLoop);
}

connect();
requestAnimationFrame(commandLoop);
