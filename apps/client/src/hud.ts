import { ITEM_DEFINITIONS, nearestShopPedestal, type ClientMessage, type PlayerId, type PresentationEvent, type SessionState } from '@tower/shared';
import { Assets, assetUrls, ITEM_FRAMES, ITEM_SYMBOLS } from './assets';
import { diceResultLabel, Journey } from './presentation/journey';
import { PresentationPreferences } from './presentation/preferences';

const itemById = new Map(ITEM_DEFINITIONS.map(item => [item.id, item]));
export const itemName = (id: string | undefined) => id ? itemById.get(id)?.name ?? id : '기본 검';
const rarity = { common: '일반', rare: '희귀', legendary: '전설' };
const descriptions: Record<string, string> = {
  'iron-sword': '단단한 기본기. 공격력을 높여 줍니다.', 'arc-blade': '푸른 마력의 칼날로 적을 돌파합니다.',
  'thunder-greatsword': '한 층에 모든 힘을 쏟는 강력한 대검.', 'ranged-edge': '공격할 때 원거리 검기가 추가로 나갑니다.',
  'thorn-trail': '지나온 길에 가시 생성 · 본인도 피해를 받습니다.', 'flame-dash': '대시 시작점에 화염 장판 · 본인도 피해를 받습니다.',
  'heart-potion': '하트 1개 회복. 최대 3하트.', 'coin-magnet': '몬스터 처치 코인 보너스.'
};
function text(element: HTMLElement, value: string) { if (element.textContent !== value) element.textContent = value; }
function show(element: HTMLElement, visible: boolean) { element.hidden = !visible; }

export class HUD {
  readonly canvas: HTMLCanvasElement;
  readonly root: HTMLElement;
  private state: SessionState | null = null;
  private player: PlayerId | null = null;
  private readySent = false;
  private connected = false;
  private menuPending = false;
  private heartReaction: { kind: string; until: number } | null = null;
  private resourceReaction: { label: string; until: number } | null = null;
  private nearbyShopSlot: string | null = null;
  private art = new Assets();
  private refs: Record<string, HTMLElement> = {};
  private send: (message: ClientMessage) => void;
  onInteraction = () => {};

  constructor(root: HTMLElement, send: (message: ClientMessage) => void, private journey: Journey, readonly preferences: PresentationPreferences) {
    this.root = root; this.send = send;
    root.style.setProperty('--tower-art', `url("${assetUrls.tower}")`);
    root.style.setProperty('--item-art', `url("${assetUrls.items}")`);
    root.innerHTML = `
      <main class="app-shell">
        <header class="brand"><a class="brand-mark" href="./" aria-label="Tower Race 시작 화면"><span class="brand-rune">◇</span> DICE TOWER <span class="brand-sub">ROLL TO 100</span></a>
          <div class="header-tools"><span id="connection-status" class="connection">연결 중</span><details id="settings" class="settings"><summary>설정</summary><div class="settings-panel">
            <label><input id="sound-setting" type="checkbox" /> 효과음</label><label><input id="motion-setting" type="checkbox" /> 연출 줄이기</label><p>전투는 계속 진행됩니다.</p></div></details></div>
        </header>
        <section id="menu-panel" class="menu-panel">
          <div class="menu-art" aria-hidden="true"></div><div class="menu-copy"><p class="eyebrow">A DUNGEON BEHIND EVERY DOOR</p><h1>ROLL TO <em>100</em></h1>
            <p class="menu-tagline">주사위 하나, 100층의 운명.</p><p class="menu-description">던전을 돌파하고, 나만의 조합을 만들고,<br/>탑의 마지막 보스를 먼저 쓰러뜨리세요.</p>
            <div class="rule-chips"><span>⚔ 실시간 전투</span><span>◇ 1대1 레이스</span><span>♥ 3개의 하트</span></div>
            <div class="start-card"><div class="start-heading"><span>혼자서도 모험은 시작됩니다</span><select id="difficulty-select" aria-label="CPU 난이도"><option value="easy">쉬움</option><option value="normal" selected>보통</option><option value="hard">어려움</option></select></div>
              <button id="cpu-button" class="primary start-button" aria-label="CPU 대전">CPU 대전 <span>모험 시작 →</span></button>
              <details class="online-menu"><summary>친구와 온라인 대전</summary><div class="online-controls"><button id="create-button">방 만들기</button><input id="room-input" maxlength="5" aria-label="방 코드" placeholder="방 코드" /><button id="join-button">참가</button></div><p>방 코드를 공유하고 두 사람 모두 준비하세요.</p></details>
            </div><p id="menu-message" class="message" role="status"></p>
          </div><div class="menu-die" aria-hidden="true"><span>THE NEXT FLOOR AWAITS</span><div id="hero-die"></div><small>운명은 굴리고, 승리는 쟁취하세요.</small></div>
        </section>
        <section id="game-panel" class="game-layout" hidden>
          <div class="game-main"><div class="game-toolbar"><span id="room-label"></span><strong id="phase-label"></strong><span id="mode-label"></span></div>
            <div class="arena-frame"><div class="arena-caption"><div><span class="eyebrow">DUNGEON</span><strong id="arena-floor">입구</strong><small id="view-label"></small></div><span id="timer-label">—</span></div>
              <div id="announcement" class="announcement" aria-live="polite"><strong id="announcement-title">탑의 문이 열립니다</strong><span id="announcement-detail">준비를 마치면 첫 번째 주사위를 굴릴 수 있습니다.</span></div>
              <div class="canvas-wrap"><canvas id="game-canvas" width="960" height="540" aria-label="Tower Race 던전"></canvas>
                <div id="shop-panel" class="world-shop-ui" hidden><div class="shop-world-guide"><strong>여행자의 공유 상점</strong><span id="shop-stock"></span><p id="shop-guidance">WASD 이동 · 상품 가까이에서 E 구매 · 출구에서 E 나가기</p></div>
                  <div id="shop-context" class="shop-context" hidden aria-live="polite"><span id="shop-icon" class="item-icon"></span><div class="shop-context-copy"><strong id="shop-name"></strong><small id="shop-meta"></small><span id="shop-description"></span><p id="shop-affordance"></p></div><button id="shop-buy-button" class="primary">E · 구매</button></div></div>
                <div id="result-overlay" class="result-overlay" hidden><p class="eyebrow">THE TOWER HAS A CHAMPION</p><h2 id="result-title"></h2><p id="result-detail"></p><button id="restart-button" class="primary">다시 도전</button></div></div>
              <div id="warning-banner" class="warning-banner" role="status" hidden></div>
            </div><details class="help"><summary>조작법 & 기록</summary><p><kbd>WASD</kbd> 이동 · 마우스 조준/클릭 공격 · <kbd>Space</kbd> 대시 · <kbd>E</kbd> 상자/상점 구매/출구</p><div id="event-log" class="event-log"></div></details>
          </div>
          <aside class="sidebar">
            <section class="resources"><div class="resource-top"><span id="player-label">1P</span><strong id="floor-value">0층</strong></div><div class="resource-line"><span id="hearts-value" class="hearts" aria-label="하트 3개">♥♥♥</span><span class="coin"><i>●</i> <strong id="coins-value">0</strong></span></div>
              <div class="weapon-line"><span id="weapon-icon" class="item-icon"></span><div><strong id="weapon-value">기본 검</strong><small id="weapon-duration">제한 없음</small></div></div><div id="buffs" class="buffs"></div><div id="resource-gain" class="resource-gain" aria-live="polite"></div></section>
            <section class="dice-panel"><div class="dice-heading"><span class="eyebrow">YOUR NEXT MOVE</span><span id="turn-value"></span></div><div id="dice-display" class="dice-display"><canvas id="dice-face" width="160" height="160" aria-label="최근 주사위 결과"></canvas><span id="dice-result">?</span></div>
              <button id="dice-button" class="primary" disabled>주사위 굴리기</button><p id="dice-status">준비 완료 후 시작</p></section>
            <section class="tower-panel"><div class="tower-heading"><span class="eyebrow">RACE TO THE CROWN</span><strong>100층 ◇</strong></div><div class="tower-track" aria-label="두 참가자의 탑 진행"><div class="tower-spine"></div>
              ${Array.from({length:11},(_,i)=>`<span class="tower-tick" style="bottom:${8+i*8.2}%">${i*10}</span>`).join('')}
              <div id="marker-p1" class="tower-marker p1"><span>1P</span><strong id="marker-floor-p1">0</strong></div><div id="marker-p2" class="tower-marker p2"><span>2P</span><strong id="marker-floor-p2">0</strong></div></div></section>
            <section id="action-panel" class="action-panel"><p id="action-status"></p><button id="ready-button" class="primary">준비 완료</button><button id="potion-button" hidden>회복 물약 사용</button><button id="finish-button" hidden>쇼핑 끝내기</button></section>
          </aside>
        </section><div id="toast" class="toast" role="status" hidden></div>
      </main>`;
    for (const element of root.querySelectorAll<HTMLElement>('[id]')) this.refs[element.id] = element;
    this.canvas = this.refs['game-canvas'] as HTMLCanvasElement;
    this.refs['hero-die'].style.backgroundImage = `url("${assetUrls.dice}")`;
    const sound = this.refs['sound-setting'] as HTMLInputElement; const motion = this.refs['motion-setting'] as HTMLInputElement;
    sound.checked = preferences.values.sound; motion.checked = preferences.values.reduced;
    sound.onchange = () => preferences.set('sound', sound.checked);
    motion.onchange = () => preferences.set('reduced', motion.checked);
    this.refs['cpu-button'].onclick = () => this.enter({ type: 'create', mode: 'cpu', difficulty: (this.refs['difficulty-select'] as HTMLSelectElement).value as 'easy'|'normal'|'hard' });
    this.refs['create-button'].onclick = () => this.enter({ type: 'create', mode: 'pvp' });
    this.refs['join-button'].onclick = () => this.enter({ type: 'join', roomCode: (this.refs['room-input'] as HTMLInputElement).value.trim().toUpperCase() });
    this.refs['room-input'].onkeydown = e => { if (e.key === 'Enter') this.refs['join-button'].click(); };
    this.refs['ready-button'].onclick = () => { if (!this.state || this.state.phase !== 'lobby' || this.readySent) return; this.readySent = true; this.act({ type: 'ready' }); this.update(this.state); };
    this.refs['dice-button'].onclick = () => { if (this.state && this.player && this.journey.request(this.state, this.player, performance.now())) { this.act({ type: 'roll' }); this.update(this.state); } };
    this.refs['potion-button'].onclick = () => this.act({ type: 'use-potion' });
    this.refs['finish-button'].onclick = () => this.act({ type: 'finish-shop' });
    this.refs['shop-buy-button'].onclick = () => {if(this.nearbyShopSlot)this.act({type:'buy',slotId:this.nearbyShopSlot});};
    this.refs['restart-button'].onclick = () => window.location.reload();
  }

  private act(message: ClientMessage) { this.onInteraction(); this.send(message); }
  private enter(message: ClientMessage) {
    if (this.menuPending) return;
    this.menuPending = true;
    this.refs['cpu-button'].setAttribute('disabled',''); this.refs['create-button'].setAttribute('disabled',''); this.refs['join-button'].setAttribute('disabled','');
    text(this.refs['menu-message'], this.connected ? '모험을 준비하는 중…' : '서버를 연결하는 중…');
    this.act(message);
  }

  connection(connected: boolean, label: string): void {
    this.connected = connected; text(this.refs['connection-status'], label);
    this.refs['connection-status'].classList.toggle('connected', connected);
    if (!connected && label !== '연결 중') this.unlockMenu();
    if (this.state) this.update(this.state);
  }
  private unlockMenu() { this.menuPending = false; for (const name of ['cpu-button','create-button','join-button']) this.refs[name].removeAttribute('disabled'); }
  welcome(player: PlayerId, room: string): void {
    this.clearError();
    this.player = player; this.readySent = false; this.unlockMenu(); this.root.classList.add('in-match');
    show(this.refs['menu-panel'], false); show(this.refs['game-panel'], true);
    text(this.refs['room-label'], `방 ${room} · ${player === 'p1' ? '1P' : '2P'}`);
    this.log(`${room} 방에 입장했습니다.`);
  }
  error(message: string): void {
    this.unlockMenu(); this.readySent = false; this.journey.cancel();
    text(this.refs['menu-message'], message); text(this.refs['toast'], message); show(this.refs['toast'], true);
    this.log(message); if (this.state) this.update(this.state);
  }
  clearError() { show(this.refs['toast'], false); }
  log(message: string): void { const line = document.createElement('p'); line.textContent = message; this.refs['event-log'].prepend(line); while (this.refs['event-log'].children.length > 8) this.refs['event-log'].lastElementChild?.remove(); }

  react(event: PresentationEvent, now: number): void {
    if (event.playerId !== this.player) return;
    if (event.kind === 'player-hit' || event.kind === 'heal') this.heartReaction = { kind: event.kind, until: now+220 };
    const hitCause=event.cause==='trail'?'가시/화염 장판':event.cause==='obstacle'?'장애물':event.cause==='monster'?'몬스터':'위험';
    const label = event.kind==='player-hit'?`${hitCause} 피해 · -${event.amount??1} ♥`:event.kind === 'item' ? `${itemName(event.itemId)} 획득` : event.kind === 'weapon-expired' ? `${itemName(event.itemId)} 사용 종료` : event.kind === 'purchase' ? `${event.coins} ● · 구매 완료` : event.coins && event.coins>0 ? `+${event.coins} ● 획득` : '';
    if (label) this.resourceReaction = { label, until: now+1000 };
  }

  update(state: SessionState): void {
    this.state = state; if (!this.player) return;
    const player = state.players[this.player]; const mine = state.activePlayer === this.player;
    const actor = state.players[state.activePlayer]; const combat = state.combat[state.activePlayer];
    if (state.phase !== 'lobby') this.readySent = false;
    else if ((state.readyPlayers ?? []).includes(this.player)) this.readySent = true;
    text(this.refs['mode-label'], state.mode === 'cpu' ? 'CPU 대전' : '1대1 온라인');
    text(this.refs['player-label'], `${this.player === 'p1' ? '1P' : '2P'} · 내 모험`);
    text(this.refs['floor-value'], `${player.floor}층`); text(this.refs['coins-value'], `${player.coins}`);
    text(this.refs['hearts-value'], '♥'.repeat(player.hearts) + '♡'.repeat(player.maxHearts-player.hearts));
    this.refs['hearts-value'].setAttribute('aria-label', `하트 ${player.hearts}개`);
    const weapon = player.weapon;
    text(this.refs['weapon-value'], itemName(weapon?.itemId)); text(this.refs['weapon-duration'], weapon ? `${weapon.remainingCombatFloors ?? '∞'}개 전투층 남음` : '제한 없음');
    this.icon(this.refs['weapon-icon'], weapon?.itemId ?? 'iron-sword');
    const buffs = player.buffs.map(b => `${itemName(b.itemId)}${b.stacks > 1 ? ` ×${b.stacks}` : ''}${b.itemId === 'thorn-trail' || b.itemId === 'flame-dash' ? ' ⚠ 자해 주의' : ''}`).join(' · ');
    text(this.refs['buffs'], buffs || '버프를 모아 나만의 조합을 만드세요.');
    const phases: Record<string, string> = { lobby: '준비 대기', roll: mine ? '당신의 턴' : `${actor.name}의 턴`, combat: mine ? '던전 전투' : `${actor.name} 관전`, shop: mine ? '상점 탐색' : `${actor.name} 쇼핑 중`, victory: state.winner === this.player ? '승리' : '패배' };
    text(this.refs['phase-label'], phases[state.phase] ?? '층 준비');
    text(this.refs['arena-floor'], state.floor ? `${state.floor.floor.toString().padStart(2,'0')}층` : '탑의 입구');
    text(this.refs['view-label'], state.phase === 'combat'||state.phase==='shop' ? mine ? '직접 조작 중' : `${actor.name} 관전 · 내 자원은 오른쪽` : 'ROLL · FIGHT · CLIMB');
    text(this.refs['timer-label'], combat && state.phase === 'combat' ? `${Math.ceil(combat.timeRemainingMs/1000)}s` : '◇');
    text(this.refs['turn-value'], `TURN ${state.turnNumber}`);
    (this.refs['dice-button'] as HTMLButtonElement).disabled = !this.connected || !mine || state.phase !== 'roll' || Boolean(this.journey.pending);
    text(this.refs['dice-button'], this.journey.pending ? '굴리는 중…' : state.phase === 'roll' && mine ? '주사위 굴리기' : '주사위 대기 중');
    const lobby = state.phase === 'lobby';
    const ready = this.refs['ready-button'] as HTMLButtonElement; show(ready, lobby); ready.disabled = !this.connected || this.readySent; text(ready, this.readySent ? '준비 완료됨' : '준비 완료');
    const potion = this.refs['potion-button'] as HTMLButtonElement;
    show(potion, mine && (state.phase === 'combat' || state.phase === 'shop')); potion.disabled = !this.connected || player.potions <= 0 || player.hearts === 3; text(potion, `물약 사용 · ${player.potions}개`);
    const finish = this.refs['finish-button'] as HTMLButtonElement; show(finish, mine && state.phase === 'shop'); finish.disabled = !this.connected;
    text(this.refs['action-status'], state.winner ? '모험이 끝났습니다. 다시 도전해 보세요.' : lobby ? state.mode === 'cpu' ? '준비 완료를 누르면 모험이 시작됩니다.' : this.readySent ? '내 준비 완료 · 상대의 입장과 준비를 기다립니다.' : '방 코드를 공유하고 두 사람 모두 준비하세요.' : state.phase === 'combat' ? mine ? '적을 모두 쓰러뜨리세요.' : '상대가 돌파하는 던전을 지켜보세요.' : state.phase === 'shop' ? mine ? '원하는 상품을 여러 개 구매할 수 있습니다.' : '공유 재고가 바뀔 수 있습니다.' : mine ? '다음 층의 운명을 굴려보세요.' : `${actor.name}의 진행을 기다립니다.`);
    const warning = state.phase === 'combat' && combat ? combat.ghost?.active ? '☠ 무적 유령 · 장애물을 통과합니다. 닿으면 즉사!' : actor.hearts <= 1 ? '♥ 마지막 하트 · 다음 피격은 사망' : combat.timeRemainingMs <= 10000 ? '시간 임박 · 곧 무적 유령이 나타납니다' : actor.buffs.some(b => b.itemId === 'thorn-trail' || b.itemId === 'flame-dash') ? '⚠ 가시·화염 장판은 생성 0.4초 뒤 본인도 피해 · 되돌아갈 때 주의' : '' : '';
    text(this.refs['warning-banner'], warning && !mine ? `${actor.name} · ${warning}` : warning); show(this.refs['warning-banner'], Boolean(warning));
    for (const id of ['p1','p2'] as PlayerId[]) text(this.refs[`marker-floor-${id}`], `${state.players[id].floor}`);
    show(this.refs['result-overlay'], Boolean(state.winner));
    if (state.winner) { text(this.refs['result-title'], state.winner === this.player ? 'VICTORY' : 'DEFEAT'); text(this.refs['result-detail'], `${state.players[state.winner].name} · 100층 최종보스 격파`); }
    this.shop(state, mine);
  }

  private icon(element: HTMLElement, id: string): void {
    const frame = ITEM_FRAMES[id]; const ready = this.art.get('items');
    element.dataset.itemId = id; element.setAttribute('aria-hidden','true');
    element.style.backgroundPosition = frame === undefined ? '0 0' : `${-(frame*40)}px 0`;
    element.style.backgroundImage = ready ? `url("${assetUrls.items}")` : 'none';
    text(element,ready ? '' : ITEM_SYMBOLS[id] ?? '◇');
  }

  private shop(state: SessionState, mine: boolean) {
    show(this.refs['shop-panel'], state.phase === 'shop'); if (state.phase !== 'shop') return;
    const offers=state.sharedShop.offers;const nearest=state.shop?nearestShopPedestal(state.shop):undefined;
    const offer=offers.find(o=>o.slotId===nearest?.slotId);
    this.nearbyShopSlot=mine&&offer?offer.slotId:null;
    text(this.refs['shop-guidance'],!state.shop?'상점 서버 업데이트 중 · 새로고침 후 새 경기로 입장하세요.':mine?'WASD/클릭 이동 · 가까이에서 E 구매 · 출구에서 E 나가기':`${state.players[state.activePlayer].name} 쇼핑 관전 · 재고는 두 사람이 공유합니다`);
    show(this.refs['shop-context'],Boolean(nearest));
    if(nearest) {
      const item=offer?itemById.get(offer.itemId):undefined;
      text(this.refs['shop-name'],offer?itemName(offer.itemId):'판매 완료');
      text(this.refs['shop-meta'],item?`${rarity[item.rarity]} · ${item.kind==='weapon'?`${item.combatFloors}개 전투층`:item.kind==='passive'?'경기 내내':'소모품'}`:'공유 재고에서 이미 판매된 상품입니다.');
      text(this.refs['shop-description'],offer?descriptions[offer.itemId]??'':'다른 진열대를 확인하거나 재입고를 기다리세요.');
      text(this.refs['shop-affordance'],offer?`${offer.price} ●${state.players[state.activePlayer].coins<offer.price?' · 코인이 부족합니다':''}`:'');
      if(offer)this.icon(this.refs['shop-icon'],offer.itemId);show(this.refs['shop-icon'],Boolean(offer));
      const button=this.refs['shop-buy-button'] as HTMLButtonElement;show(button,Boolean(offer)&&mine);button.disabled=!this.connected||!offer||state.players[state.activePlayer].coins<offer.price;
    }
    text(this.refs['shop-stock'], `재고 ${offers.length}개 · ${state.sharedShop.restockAfterTurns === null ? '한정 공유 재고' : `${state.sharedShop.restockAfterTurns}턴 뒤 재입고`}`);
  }

  frame(now: number): void {
    if (!this.state || !this.player) return;
    this.refs['hearts-value'].classList.toggle('hurt', Boolean(this.heartReaction && this.heartReaction.kind==='player-hit' && now<this.heartReaction.until));
    this.refs['hearts-value'].classList.toggle('healed', Boolean(this.heartReaction && this.heartReaction.kind==='heal' && now<this.heartReaction.until));
    text(this.refs['resource-gain'], this.resourceReaction && now<this.resourceReaction.until ? this.resourceReaction.label : '');
    const reduced = this.preferences.reduced; const state = this.state;
    const announcement = this.journey.announcement;
    const active = announcement && announcement.until > now;
    const title = active ? announcement.title : state.winner ? state.winner === this.player ? 'VICTORY' : 'DEFEAT' : state.phase === 'combat' ? `${state.floor?.floor}층 던전` : state.phase === 'shop' ? '여행자의 공유 상점' : state.phase === 'lobby' ? '모험을 준비하세요' : state.activePlayer === this.player ? '당신의 다음 이동' : '상대의 다음 이동';
    text(this.refs['announcement-title'], title);
    text(this.refs['announcement-detail'], active ? announcement.detail : state.phase === 'combat' ? '적을 모두 처치하면 다음 플레이어의 턴으로 넘어갑니다.' : state.phase === 'shop' ? 'WASD로 이동해 상품 가까이에서 E키로 구매하세요.' : state.phase === 'lobby' ? '준비 완료 후 주사위가 활성화됩니다.' : '100층에 먼저 도착하는 것만으로는 승리할 수 없습니다.');
    this.refs['announcement'].dataset.tone = active ? announcement.tone : '';
    this.refs['announcement'].classList.toggle('cue-active', Boolean(active) && !reduced);
    const travel = this.journey.travel; const pending = this.journey.pending;
    this.refs['dice-display'].classList.toggle('rolling', !reduced && (Boolean(pending && now-pending.at<2000) || Boolean(travel && now-travel.at<160)));
    this.refs['dice-display'].classList.toggle('landed', !reduced && Boolean(travel && now-travel.at>=160 && now-travel.at<500));
    const mine = state.activePlayer === this.player;
    text(this.refs['dice-status'], pending ? now-pending.at>=2000 ? '서버 응답 대기' : '운명을 굴리는 중' : travel && now-travel.at<900 ? `${state.players[travel.playerId].name} · ${travel.from} → ${travel.to}층` : state.phase === 'lobby' ? this.readySent ? '내 준비 완료 · 상대 대기' : '준비 완료 후 시작' : state.phase === 'roll' ? mine ? '당신의 턴 · 굴릴 수 있습니다' : `${state.players[state.activePlayer].name}의 턴` : '다음 주사위를 기다립니다');
    for (const id of ['p1','p2'] as PlayerId[]) this.refs[`marker-${id}`].style.bottom = `${8 + this.journey.marker(id, state.players[id].floor, now, reduced)*.82}%`;
  }
  get diceCanvas(): HTMLCanvasElement { return this.refs['dice-face'] as HTMLCanvasElement; }
  setDiceLabel(value: number | null, unresolved = false): void { text(this.refs['dice-result'], unresolved ? '…' : value === null ? '?' : `${value}`); this.diceCanvas.setAttribute('aria-label', diceResultLabel(value,unresolved)); }
}
