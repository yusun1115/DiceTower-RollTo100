import { describe, expect, it } from 'vitest';
import { SessionEngine, type PresentationEvent, type SessionState } from '@tower/shared';
import { EventRouter } from './event-router';
import { diceResultLabel, Journey } from './journey';
import { canvasPoint, interpolate, SceneView } from './scene';
import { Effects, LABEL_LIMIT, PARTICLE_LIMIT } from './effects';
import { readPreferences } from './preferences';
import { ActionBuffer, obsoleteInputRejection } from './input';

const snapshot=()=>new SessionEngine({sessionId:'test',roomCode:'TEST',mode:'cpu',seed:'test'}).getSnapshot();
const event=(id:number, kind:PresentationEvent['kind']='roll'):PresentationEvent=>({id,kind,sessionId:'test',playerId:'p1',turnNumber:1,floor:6,roll:6,fromFloor:0,toFloor:6});

describe('expression event synchronization',()=> {
  it('baselines history and consumes repeated or reordered facts once',()=> {
    const router=new EventRouter();const state=snapshot();state.presentationEvents=[event(1)];
    expect(router.consume(state)).toEqual([]);
    expect(router.consume({...state,presentationEvents:[event(3),event(1),event(2)]}).map(e=>e.id)).toEqual([2,3]);
    expect(router.consume({...state,presentationEvents:[event(3)]})).toEqual([]);
    router.reset({...state,presentationEvents:[event(9)]});
    expect(router.consume({...state,presentationEvents:[event(9)]})).toEqual([]);
  });
  it('ignores unknown kinds and clears old history when a session changes',()=> {
    const router=new EventRouter();router.consume(snapshot());
    expect(router.consume({...snapshot(),presentationEvents:[{...event(2),kind:'future' as never}]})).toEqual([]);
    expect(router.consume({...snapshot(),sessionId:'other',presentationEvents:[]})).toEqual([]);
  });
  it('accepts a legacy state without guessing the capped die value or healing a death',()=> {
    const router=new EventRouter();const old=snapshot();delete old.presentationEvents;old.phase='roll';old.turnNumber=1;old.players.p1.floor=99;
    router.consume(old);
    const next=structuredClone(old);next.phase='combat';next.players.p1.floor=100;next.floor={floor:100,type:'final-boss'} as SessionState['floor'];
    delete (next as Partial<SessionState>).lastRoll;
    const roll=router.consume(next).find(e=>e.kind==='roll');expect(roll?.roll).toBeUndefined();expect(roll?.toFloor).toBe(100);
    const dead=structuredClone(next);dead.phase='roll';dead.activePlayer='p2';dead.turnNumber=2;dead.players.p1.floor=97;dead.players.p1.hearts=3;
    expect(router.consume(dead).map(e=>e.kind)).toEqual(['death','turn']);
  });
});

describe('bounded journey and scene presentation',()=> {
  it('drops only obsolete input rejections after a handoff, preserving real errors',()=> {
    const error='Combat is not active.';
    expect(obsoleteInputRejection(error,{phase:'roll',activePlayer:'p1'},'p1')).toBe(true);
    expect(obsoleteInputRejection(error,{phase:'combat',activePlayer:'p2'},'p1')).toBe(true);
    expect(obsoleteInputRejection(error,{phase:'combat',activePlayer:'p1'},'p1')).toBe(false);
    expect(obsoleteInputRejection(error,{phase:'shop',activePlayer:'p1'},'p1')).toBe(false);
    expect(obsoleteInputRejection(error,null,'p1')).toBe(false);
    expect(obsoleteInputRejection('Not enough coins.',{phase:'shop',activePlayer:'p1'},'p1')).toBe(false);
    expect(obsoleteInputRejection('Move closer to this item.',{phase:'roll',activePlayer:'p1'},'p1')).toBe(false);
  });
  it('does not announce tumbling preview faces as confirmed dice results',()=> {
    expect(diceResultLabel(6,true)).toContain('결과 미확정');expect(diceResultLabel(6,false)).toBe('주사위 결과 6');
    expect(diceResultLabel(null,false)).toBe('아직 확정된 주사위 결과 없음');
  });
  it('buffers short action taps across ticks and clears them on focus/scene changes',()=> {
    const actions=new ActionBuffer();actions.pulse('attack',10);actions.pulse('dash',20);
    expect(actions.active('attack',false,60)).toBe(true);expect(actions.active('attack',false,111)).toBe(false);
    expect(actions.active('attack',true,200)).toBe(true);actions.clear();
    expect(actions.active('dash',false,21)).toBe(false);expect(actions.active('interact',false,21)).toBe(false);
  });
  it('locks one pending request, stops waiting motion, and cancels on a newer turn',()=> {
    const state=snapshot();state.phase='roll';state.turnNumber=1;
    const journey=new Journey();expect(journey.request(state,'p1',0)).toBe(true);expect(journey.request(state,'p1',10)).toBe(false);
    expect(journey.request(state,'p2',10)).toBe(false);expect(journey.face(state,2200)).toBeNull();
    journey.synchronize({...state,turnNumber:2,activePlayer:'p2'});expect(journey.pending).toBeNull();
  });
  it('separates a six from travel to 100 and never delays legal combat',()=> {
    const journey=new Journey();const state=snapshot();state.phase='combat';state.lastRoll=6;
    journey.accept({...event(2),fromFloor:99,toFloor:100,floor:100,floorType:'final-boss'},100,'p1');
    expect(journey.face(state,300)).toBe(6);expect(journey.marker('p1',100,1100,false)).toBe(100);
    expect(journey.marker('p2',12,300,false)).toBe(12);expect(journey.marker('p1',100,100,true)).toBe(100);
    expect(journey.announcement!.until).toBeLessThanOrEqual(1100);expect(state.phase).toBe('combat');
  });
  it('gives victory priority over a normal clear and keeps current turn authoritative',()=> {
    const journey=new Journey();journey.accept(event(1,'clear'),100,'p1');journey.accept({...event(2,'turn'),playerId:'p2'},110,'p1');
    expect(journey.announcement?.title).toBe('DUNGEON CLEAR');journey.accept(event(3,'victory'),120,'p1');
    expect(journey.announcement?.title).toBe('VICTORY');expect(journey.travel).toBeNull();
  });
  it('does not interpolate across dash, turn, floor, or actor boundaries',()=> {
    expect(interpolate({x:80,y:100},{x:90,y:100},.5)).toEqual({x:85,y:100});
    expect(interpolate({x:80,y:100},{x:180,y:100},.5)).toEqual({x:180,y:100});
    const scene=new SceneView();const state=snapshot();scene.accept(state,0);
    expect(scene.accept({...state,turnNumber:1,activePlayer:'p2'},50)).toBe(true);expect(scene.previous).toBeNull();
    expect(canvasPoint({x:110,y:80},{left:10,top:20,width:480,height:270},{x:2,y:-2})).toEqual({x:198,y:122});
  });
  it('expires effects and limits particles/text without changing the state',()=> {
    const effects=new Effects();for(let i=0;i<100;i++){effects.burst({x:1,y:1},'#fff',20,0);effects.label({x:1,y:1},'1','#fff',0);}
    expect(effects.particles).toHaveLength(PARTICLE_LIMIT);expect(effects.labels).toHaveLength(LABEL_LIMIT);
    effects.prune(2000);expect(effects.particles).toHaveLength(0);expect(effects.labels).toHaveLength(0);
    effects.accept({...event(3,'enemy-hit'),position:{x:2,y:3},amount:22},2100,true);
    expect(effects.particles).toHaveLength(0);expect(effects.labels[0].value).toBe('22');expect(effects.shake(2100,true)).toEqual({x:0,y:0});
  });
  it('keeps preferences usable when storage is unavailable or malformed',()=> {
    expect(readPreferences({getItem(){throw new Error('disabled');}})).toEqual({sound:true,reduced:false});
    expect(readPreferences({getItem(){return '{bad';}})).toEqual({sound:true,reduced:false});
    expect(readPreferences({getItem(){return '{"sound":false,"reduced":true}';}})).toEqual({sound:false,reduced:true});
  });
});
