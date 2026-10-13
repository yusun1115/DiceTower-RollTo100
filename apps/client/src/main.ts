import './styles.css';
import type { ClientMessage, PlayerId, ServerMessage, SessionState, Vec2 } from '@tower/shared';
import { HUD, itemName } from './hud';
import { Renderer } from './renderer';
import { EventRouter } from './presentation/event-router';
import { Journey } from './presentation/journey';
import { PresentationPreferences } from './presentation/preferences';
import { GameAudio } from './presentation/audio';
import { canvasPoint } from './presentation/scene';
import { ActionBuffer, obsoleteInputRejection } from './presentation/input';

const WS_URL = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:8787`;
const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root');
const journey = new Journey(); const router = new EventRouter();
const preferences = new PresentationPreferences(); const audio = new GameAudio();
const hud = new HUD(root, send, journey, preferences);
const renderer = new Renderer(hud.canvas, hud.diceCanvas);
const keys = new Set<string>();
const actions = new ActionBuffer();
let pointer: Vec2 = { x: 480, y: 270 };
let aim: Vec2 = { x: 1, y: 0 };
let down = false; let socket: WebSocket | null = null;
let shopWalkTarget: Vec2 | null = null;
let entrance: ClientMessage | null = null;
let playerId: PlayerId | null = null; let state: SessionState | null = null;
let lastCommandAt = 0; let dangerKey = '';
let previewSend: ((message: ClientMessage) => void) | null = null;

function applyPreferences() {
  audio.enabled = preferences.values.sound;
  if (!audio.enabled) audio.stop();
  document.documentElement.classList.toggle('reduced-motion', preferences.reduced);
  if (preferences.reduced) { renderer.effects.particles=[]; renderer.effects.slashes=[]; renderer.effects.dashes=[]; renderer.effects.shakeUntil=0; }
}
preferences.onChange = applyPreferences; applyPreferences();
hud.onInteraction = () => audio.unlock();

const errorLabels: Record<string, string> = {
  'It is not your roll.': '지금은 주사위를 굴릴 차례가 아닙니다.', 'Room not found.': '방을 찾을 수 없습니다. 코드를 확인하세요.',
  'Room is full.': '이미 두 사람이 들어온 방입니다.', 'Not enough coins.': '코인이 부족합니다.',
  'Combat is not active.': '현재 조작할 수 있는 턴이 아닙니다.',
  'Item is out of stock.': '이미 판매된 상품입니다.', 'Match is already started.': '이미 모험이 시작되었습니다.',
  'This connection already belongs to a room.': '이미 방에 입장했습니다.', 'Potion cannot be used.': '지금은 물약을 사용할 수 없습니다.',
  'Move closer to this item.':'상품 가까이 이동한 뒤 E키로 구매하세요.', 'Move closer to a shop display.':'진열대 또는 출구 가까이 이동한 뒤 E키를 누르세요.'
};

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  hud.connection(false, '연결 중'); socket = new WebSocket(WS_URL);
  socket.addEventListener('open', () => { hud.connection(true, '연결됨'); if (entrance) { socket!.send(JSON.stringify(entrance)); entrance=null; } });
  socket.addEventListener('message', event => {
    try { handle(JSON.parse(event.data) as ServerMessage); }
    catch { hud.error('서버 상태를 읽지 못했습니다. 페이지를 새로고침해 주세요.'); }
  });
  socket.addEventListener('close', () => {
    entrance=null; journey.cancel(); clearInput(false); audio.stop(); hud.connection(false, '연결 끊김');
    if (playerId) hud.error('서버 연결이 끊겼습니다. 다시 시작하려면 페이지를 새로고침하세요.');
  });
  socket.addEventListener('error', () => { hud.connection(false,'서버 연결 대기'); });
}

function send(message: ClientMessage): void {
  if (message.type === 'roll') audio.play('pending', performance.now());
  if (previewSend) { previewSend(message); return; }
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify(message)); return; }
  if (message.type === 'create' || message.type === 'join') { entrance=message; connect(); return; }
  hud.error('서버에 연결되지 않았습니다. 연결 상태를 확인하세요.');
}

function handle(message: ServerMessage): void {
  if (message.type === 'welcome') { playerId=message.playerId; hud.welcome(playerId,message.roomCode); return; }
  if (message.type === 'error') { if(!obsoleteInputRejection(message.message,state,playerId))hud.error(errorLabels[message.message] ?? message.message); return; }
  if (message.type === 'notice') { hud.log(message.message === 'Connected to Tower Race.' ? '탑의 문이 열렸습니다.' : message.message); return; }
  const now=performance.now();
  if (state && (state.sessionId!==message.state.sessionId || state.turnNumber!==message.state.turnNumber || state.activePlayer!==message.state.activePlayer || state.phase!==message.state.phase)) clearInput(false);
  state=message.state;
  if (document.hidden) { router.reset(state); journey.reset(); renderer.accept(state,[],now,preferences.reduced); return; }
  const events=router.consume(state); journey.synchronize(state); renderer.accept(state,events,now,preferences.reduced);
  for (const event of events) {
    journey.accept(event,now,playerId ?? 'p1',state.players[event.playerId].name); audio.play(event.kind,now); hud.react(event,now);
    if (['clear','death','victory','item','restock'].includes(event.kind)) {
      const name=state.players[event.playerId].name;
      const detail=event.kind==='item'?`${name} · ${itemName(event.itemId)} 획득`:event.kind==='death'?`${name} · ${event.fromFloor} → ${event.toFloor}층`:event.kind==='clear'?`${name} · ${event.floor}층 클리어`:event.kind==='victory'?`${name} · 최종보스 격파`:`${event.floor}층 상점 재입고`;
      hud.log(detail);
    }
  }
  const combat=state.combat[state.activePlayer];
  const warning=state.phase==='combat' && combat ? combat.ghost?.active?'ghost':combat.timeRemainingMs<=10000?'timer':state.players[state.activePlayer].hearts<=1?'heart':'' : '';
  const key=warning ? `${state.turnNumber}:${warning}` : '';
  if(key&&key!==dangerKey)audio.play('ghost',now);dangerKey=key;
  hud.update(state);
}

function interactive(target: EventTarget | null): boolean { return target instanceof Element && Boolean(target.closest('input,select,textarea,button,summary,a,[contenteditable="true"]')); }
window.addEventListener('keydown',event=> {
  if(interactive(event.target))return;
  if(event.code==='Space'&&(state?.phase==='combat'||state?.phase==='shop'))event.preventDefault();
  keys.add(event.key.toLowerCase());if(event.isTrusted)audio.unlock();
  if(['w','a','s','d'].includes(event.key.toLowerCase()))shopWalkTarget=null;
  if (!event.repeat && (state?.phase==='combat'||state?.phase==='shop') && state.activePlayer===playerId) {
    if (event.code==='Space'&&state.phase==='combat') actions.pulse('dash',performance.now());
    if (event.key.toLowerCase()==='e') actions.pulse('interact',performance.now());
  }
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
function clearInput(notify=true): void {
  keys.clear();down=false;actions.clear();shopWalkTarget=null;
  if(notify&&(state?.phase==='combat'||state?.phase==='shop')&&state.activePlayer===playerId&&(previewSend||socket?.readyState===WebSocket.OPEN))send({type:'combat',command:{moveX:0,moveY:0,aim}});
}
window.addEventListener('blur',()=>clearInput());
document.addEventListener('visibilitychange',()=> {
  clearInput();router.reset(state);journey.reset();renderer.effects.clear();renderer.view.previous=null;renderer.view.previousShop=null;audio.stop();
  if(state&&!document.hidden)hud.update(state);
});
document.addEventListener('focusin',event=> { if(interactive(event.target))clearInput(); });
hud.canvas.tabIndex=0;
hud.canvas.addEventListener('pointermove',event=> { pointer=canvasPoint({x:event.clientX,y:event.clientY},hud.canvas.getBoundingClientRect(),renderer.shakeOffset); });
hud.canvas.addEventListener('pointerdown',event=> {
  if(event.button!==0)return;
  pointer=canvasPoint({x:event.clientX,y:event.clientY},hud.canvas.getBoundingClientRect(),renderer.shakeOffset);down=true;hud.canvas.focus({preventScroll:true});audio.unlock();
  if(state?.phase==='shop'&&state.shop&&state.activePlayer===playerId) {
    const pedestal=state.shop.pedestals.find(p=>Math.hypot(p.position.x-pointer.x,p.position.y-pointer.y)<86);
    shopWalkTarget=pedestal?{x:pedestal.position.x,y:pedestal.position.y+48}:{...pointer};down=false;
  }
  if (state?.phase==='combat' && state.activePlayer===playerId) actions.pulse('attack',performance.now());
});
window.addEventListener('pointerup',()=> { down=false; });window.addEventListener('pointercancel',()=>clearInput());

const renderCosts:number[]=[];const frameIntervals:number[]=[];let previousFrame=0;let frames=0;
function frame(now:number):void {
  if(!document.hidden) {
    const combat=state&&playerId?state.combat[playerId]:null;
    const position=state?.phase==='shop'?state.shop?.playerPosition:combat?.playerPosition;
    if(position)aim={x:pointer.x-position.x,y:pointer.y-position.y};
    if(state&&playerId&&(state.phase==='combat'||(state.phase==='shop'&&state.shop))&&state.activePlayer===playerId&&now-lastCommandAt>45) {
      let moveX=Number(keys.has('d'))-Number(keys.has('a')),moveY=Number(keys.has('s'))-Number(keys.has('w'));
      if(state.phase==='shop'&&shopWalkTarget&&position&&!moveX&&!moveY) {
        const dx=shopWalkTarget.x-position.x,dy=shopWalkTarget.y-position.y,length=Math.hypot(dx,dy);
        if(length<6)shopWalkTarget=null;else{moveX=dx/length;moveY=dy/length;}
      }
      send({type:'combat',command:{moveX,moveY,aim,attack:state.phase==='combat'&&actions.active('attack',down,now),dash:state.phase==='combat'&&actions.active('dash',keys.has(' '),now),interact:actions.active('interact',keys.has('e'),now)}});lastCommandAt=now;
    }
    const started=performance.now();renderer.draw(now,preferences.reduced,playerId,aim);hud.frame(now);
    if(state) { const face=preferences.reduced?journey.pending?null:journey.travel?.roll??state.lastRoll??null:journey.face(state,now);renderer.drawDice(face);hud.setDiceLabel(face,Boolean(journey.pending)||Boolean(!preferences.reduced&&journey.travel&&now-journey.travel.at<160)); }
    if(import.meta.env.DEV){
      renderCosts.push(performance.now()-started);frameIntervals.push(previousFrame?now-previousFrame:16.7);
      if(renderCosts.length>120){renderCosts.shift();frameIntervals.shift();}
      if(++frames%120===0){root!.dataset.renderP95=[...renderCosts].sort((a,b)=>a-b)[Math.floor(renderCosts.length*.95)].toFixed(2);root!.dataset.fps=(1000/(frameIntervals.reduce((a,b)=>a+b,0)/frameIntervals.length)).toFixed(1);}
    }
  }
  previousFrame=now;requestAnimationFrame(frame);
}

// Deterministic visual fixtures only exist in development builds, never on Pages.
const preview=import.meta.env.DEV?new URLSearchParams(location.search).get('preview'):null;
if(preview) { void import('./preview').then(({startPreview})=> { hud.connection(true,'개발 미리보기');previewSend=startPreview(preview,handle); }); }
else connect();
requestAnimationFrame(frame);
