import { describe, expect, it } from 'vitest';
import { SessionEngine } from './session.js';
import { deriveSeed } from './rng.js';
import { generateFloorBlueprint } from './content.js';
import type { CombatSnapshot, PlayerId, Vec2 } from './domain.js';
import { isShopFloor } from './content.js';
import { nearestShopPedestal } from './world.js';

type TestRuntime=CombatSnapshot&{blueprint:{obstacles:unknown[]};hazards:Array<{id:string;position:Vec2;radius:number;damage:number;owner:PlayerId;ttlMs:number;ageMs:number}>};

function startCombat() {
  const engine=new SessionEngine({sessionId:'risk-repro',roomCode:'RISK',mode:'cpu',seed:'risk-repro'});
  engine.markReady('p1');
  const floor=Array.from({length:95},(_,i)=>i+4).find(f=>generateFloorBlueprint(engine.state.seed,f).type==='normal')!;
  for(let turn=1;turn<100;turn++) {
    const roll=deriveSeed(engine.state.seed,'roll',turn,'p1')%6+1;if(roll>floor)continue;
    engine.state.turnNumber=turn;engine.state.players.p1.floor=floor-roll;break;
  }
  engine.roll('p1');
  const runtime=(engine as unknown as {runtimes:{p1:TestRuntime}}).runtimes.p1;
  runtime.blueprint.obstacles=[];runtime.chests=[];
  runtime.monsters.forEach(m=>{m.position={x:900,y:480};m.hp=99999;});
  return {engine,runtime};
}

describe('floor-entry damage regressions',()=> {
  it('does not kill a thorn-trail owner simply for walking into a fresh floor',()=> {
    const {engine}=startCombat();engine.state.players.p1.buffs=[{itemId:'thorn-trail',stacks:1}];
    engine.handle('p1',{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0}}});
    for(let i=0;i<20;i++)engine.tick(50);
    expect(engine.state.phase).toBe('combat');expect(engine.state.players.p1.hearts).toBe(3);
  });
  it('removes one heart, not all three, when several monsters touch in the same tick',()=> {
    const {engine,runtime}=startCombat();runtime.monsters.forEach(m=>{m.position={...runtime.playerPosition};});
    engine.tick(50);
    expect(engine.state.phase).toBe('combat');expect(engine.state.players.p1.hearts).toBe(2);
    for(let i=0;i<17;i++)engine.tick(50);expect(engine.state.players.p1.hearts).toBe(2);
    engine.tick(50);expect(engine.state.players.p1.hearts).toBe(1);
  });
  it('keeps old trails dangerous on return, while overlapping trails cost only one heart',()=> {
    const {engine,runtime}=startCombat();engine.state.players.p1.buffs=[{itemId:'thorn-trail',stacks:1}];
    engine.handle('p1',{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0}}});
    for(let i=0;i<20;i++)engine.tick(50);
    const trail=runtime.hazards[0];expect(trail.ageMs).toBeGreaterThan(400);
    runtime.playerPosition={...trail.position};engine.handle('p1',{type:'combat',command:{moveX:0,moveY:0,aim:{x:1,y:0}}});
    engine.tick(50);expect(engine.state.players.p1.hearts).toBe(2);engine.tick(50);expect(engine.state.players.p1.hearts).toBe(2);
  });
  it('shares hit protection across many different live trail ids',()=> {
    const {engine,runtime}=startCombat();
    runtime.hazards=Array.from({length:12},(_,i)=>({id:`thorn-${i}`,position:{...runtime.playerPosition},radius:20,damage:12,owner:'p1',ttlMs:3500,ageMs:500}));
    engine.tick(50);expect(engine.state.players.p1.hearts).toBe(2);expect(engine.state.phase).toBe('combat');
    expect(engine.getSnapshot().presentationEvents!.filter(e=>e.kind==='player-hit')).toHaveLength(1);
  });
  it('does not apply expired trail damage',()=> {
    const {engine,runtime}=startCombat();runtime.hazards=[{id:'thorn-expired',position:{...runtime.playerPosition},radius:20,damage:12,owner:'p1',ttlMs:1,ageMs:500}];
    engine.tick(50);expect(engine.state.players.p1.hearts).toBe(3);expect(runtime.hazards).toHaveLength(0);
  });
  it('does not make movement or ordinary fire dashes fatal with both risk buffs',()=> {
    const {engine}=startCombat();engine.state.players.p1.buffs=[{itemId:'thorn-trail',stacks:1},{itemId:'flame-dash',stacks:1}];
    engine.handle('p1',{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0},dash:true}});
    for(let i=0;i<24;i++)engine.tick(50);
    expect(engine.state.phase).toBe('combat');expect(engine.state.players.p1.hearts).toBe(3);
  });
  it('lets ghost contact kill through normal hit protection',()=> {
    const {engine,runtime}=startCombat();runtime.monsters[0].position={...runtime.playerPosition};engine.tick(50);
    expect(engine.getSnapshot().combat.p1!.protectionMs).toBeGreaterThan(0);
    runtime.timeRemainingMs=0;runtime.ghost={active:true,position:{...runtime.playerPosition}};engine.tick(50);
    expect(engine.state.activePlayer).toBe('p2');expect(engine.state.phase).toBe('roll');
    expect(engine.getSnapshot().presentationEvents!.find(e=>e.kind==='death')?.cause).toBe('ghost');
  });
  it('stops a dead encounter before old projectiles grant coins or trigger another outcome',()=> {
    const {engine,runtime}=startCombat();engine.state.players.p1.hearts=1;runtime.monsters[0].position={...runtime.playerPosition};runtime.monsters[0].hp=1;
    engine.handle('p1',{type:'combat',command:{moveX:0,moveY:0,aim:{x:1,y:0},attack:true}});engine.tick(50);
    expect(engine.state.activePlayer).toBe('p2');expect(engine.state.players.p1.coins).toBe(0);
    const facts=engine.getSnapshot().presentationEvents!;expect(facts.filter(e=>e.kind==='death')).toHaveLength(1);expect(facts.some(e=>e.kind==='enemy-defeated'||e.kind==='clear')).toBe(false);
  });
});

function enterShop(engine:SessionEngine,player:PlayerId,floor:number) {
  engine.state.activePlayer=player;engine.state.phase='roll';
  for(let turn=1;turn<100;turn++) {
    const roll=deriveSeed(engine.state.seed,'roll',turn,player)%6+1;if(roll>floor)continue;
    engine.state.turnNumber=turn;engine.state.players[player].floor=floor-roll;break;
  }
  engine.roll(player);
}
function shopFixture() {
  const engine=new SessionEngine({sessionId:'shop-world',roomCode:'SHOP',mode:'pvp',seed:'shop-world'});engine.markReady('p1');engine.markReady('p2');
  const floor=Array.from({length:96},(_,i)=>i+3).find(f=>isShopFloor(engine.state.seed,f))!;enterShop(engine,'p1',floor);
  engine.state.players.p1.coins=120;return {engine,floor};
}
function walkTo(engine:SessionEngine,target:Vec2) {
  for(let i=0;i<100;i++) {
    const shop=engine.getSnapshot().shop!;const dx=target.x-shop.playerPosition.x,dy=target.y-shop.playerPosition.y,length=Math.hypot(dx,dy);
    const command={moveX:length<=55?0:dx/length,moveY:length<=55?0:dy/length,aim:{x:1,y:0},interact:false};
    expect(engine.handle(engine.state.activePlayer,{type:'combat',command}).ok).toBe(true);if(length<=55)return;engine.tick(50);
  }
  throw new Error('Could not walk to shop target');
}
const pressE=(engine:SessionEngine)=>engine.handle(engine.state.activePlayer,{type:'combat',command:{moveX:0,moveY:0,aim:{x:1,y:0},interact:true}});

describe('in-world shop authority',()=> {
  it('rejects distant and inactive purchases without touching stock or coins',()=> {
    const {engine}=shopFixture();const state=engine.getSnapshot();const offer=state.sharedShop.offers[0];
    expect(engine.handle('p1',{type:'buy',slotId:offer.slotId}).error).toBe('Move closer to this item.');
    expect(engine.handle('p2',{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0},interact:true}}).ok).toBe(false);
    expect(engine.handle('p2',{type:'buy',slotId:offer.slotId}).ok).toBe(false);
    expect(engine.getSnapshot().sharedShop.offers).toEqual(state.sharedShop.offers);expect(engine.state.players.p1.coins).toBe(120);
  });
  it('walks to displays, buys once per E press, and permits multiple nearby purchases',()=> {
    const {engine}=shopFixture();const state=engine.getSnapshot();const first=state.sharedShop.offers[0],second=state.sharedShop.offers[1];
    walkTo(engine,state.shop!.pedestals[0].position);expect(pressE(engine).ok).toBe(true);
    for(let i=0;i<10;i++){expect(pressE(engine).ok).toBe(true);engine.tick(50);}
    expect(engine.state.players.p1.coins).toBe(120-first.price);expect(engine.getSnapshot().sharedShop.offers).toHaveLength(3);
    walkTo(engine,state.shop!.pedestals[1].position);expect(pressE(engine).ok).toBe(true);
    expect(engine.state.players.p1.coins).toBe(120-first.price-second.price);expect(engine.getSnapshot().sharedShop.offers).toHaveLength(2);
  });
  it('uses the same displays and shared sold stock when the other player arrives',()=> {
    const {engine,floor}=shopFixture();const before=engine.getSnapshot();walkTo(engine,before.shop!.pedestals[0].position);pressE(engine);engine.handle('p1',{type:'finish-shop'});
    expect(engine.getSnapshot().shop).toBeNull();enterShop(engine,'p2',floor);const after=engine.getSnapshot();
    expect(after.shop!.pedestals).toEqual(before.shop!.pedestals);expect(after.sharedShop.offers).toHaveLength(3);
    expect(after.sharedShop.offers.some(o=>o.slotId===before.sharedShop.offers[0].slotId)).toBe(false);
    expect(after.shop!.playerPosition).toEqual({x:480,y:425});
  });
  it('allows safe movement with risk buffs and ignores attacks/dashes in a shop',()=> {
    const {engine}=shopFixture();engine.state.players.p1.buffs=[{itemId:'thorn-trail',stacks:1},{itemId:'flame-dash',stacks:1}];
    engine.handle('p1',{type:'combat',command:{moveX:1,moveY:0,aim:{x:1,y:0},attack:true,dash:true}});engine.tick(500);
    expect(engine.getSnapshot().shop!.playerPosition.x).toBe(570);expect(engine.state.players.p1.hearts).toBe(3);expect(engine.getSnapshot().combat.p1).toBeNull();
    expect(engine.getSnapshot().presentationEvents!.some(e=>e.kind==='attack'||e.kind==='dash'||e.kind==='player-hit')).toBe(false);
  });
  it('keeps an unaffordable nearby item and permits exit interaction',()=> {
    const {engine}=shopFixture();const shop=engine.getSnapshot().shop!;engine.state.players.p1.coins=0;
    walkTo(engine,shop.pedestals[0].position);expect(pressE(engine).error).toBe('Not enough coins.');expect(engine.getSnapshot().sharedShop.offers).toHaveLength(4);
    walkTo(engine,shop.exitPosition);expect(pressE(engine).ok).toBe(true);expect(engine.state.activePlayer).toBe('p2');expect(engine.getSnapshot().shop).toBeNull();
  });
  it('returns independent world snapshots and a stable nearest-display selection',()=> {
    const {engine}=shopFixture();const first=engine.getSnapshot().shop!;first.pedestals[0].position.x=999;
    expect(engine.getSnapshot().shop!.pedestals[0].position.x).toBe(210);expect(nearestShopPedestal(first)).toBeUndefined();
    walkTo(engine,engine.getSnapshot().shop!.pedestals[2].position);expect(nearestShopPedestal(engine.getSnapshot().shop!)?.slotId).toBe(first.pedestals[2].slotId);
  });
});
