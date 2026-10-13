/** Development-only fixtures using the actual domain engine. Removed by Vite's DEV branch. */
import { SessionEngine, deriveSeed, generateFloorBlueprint, type ClientMessage, type CombatSnapshot, type ServerMessage, type SessionState } from '@tower/shared';

export function startPreview(name: string, receive: (message: ServerMessage)=>void): (message: ClientMessage)=>void {
  const engine=new SessionEngine({sessionId:`preview-${name}`,roomCode:'ARTQA',mode:'cpu',seed:'art-preview'});
  const publish=()=> {
    const snapshot=engine.getSnapshot();
    if(name==='legacy') {const legacy=snapshot as Partial<SessionState>;delete legacy.presentationEvents;delete legacy.lastRoll;delete legacy.readyPlayers;}
    receive({type:'state',state:snapshot});
  };
  receive({type:'welcome',sessionId:engine.state.sessionId,roomCode:'ARTQA',playerId:'p1'});
  publish(); engine.markReady('p1'); publish();
  if(name!=='roll' && name!=='delayed') {
    const wanted=name==='mini'?10:name==='final'||name==='victory'?100:Array.from({length:60},(_,i)=>i+4).find(f=>generateFloorBlueprint(engine.state.seed,f).type===(name==='shop'?'shop':'normal'))!;
    for(let turn=1;turn<100;turn++) {
      const roll=deriveSeed(engine.state.seed,'roll',turn,'p1')%6+1;
      if(wanted<roll&&wanted!==100)continue;
      if(wanted===100&&roll!==6)continue;
      engine.state.turnNumber=turn;engine.state.players.p1.floor=wanted===100?99:wanted-roll;break;
    }
    engine.state.players.p1.coins=120;engine.state.players.p1.potions=3;
    if(name==='hazards'||name==='ghost'||name==='safe-trail')engine.state.players.p1.buffs=[{itemId:'thorn-trail',stacks:1},{itemId:'flame-dash',stacks:1}];
    publish();engine.roll('p1');publish();
    const internal=engine as unknown as {runtimes:Record<string,Pick<CombatSnapshot,'monsters'|'playerPosition'|'chests'|'timeRemainingMs'>>;damagePlayer(player:string,amount:number):void};
    if(name==='safe-trail') {
      const runtime=internal.runtimes.p1 as typeof internal.runtimes.p1 & {blueprint:{obstacles:unknown[]}};
      runtime.blueprint.obstacles=[];runtime.monsters.forEach(m=>{m.position={x:900,y:480};m.hp=99999;});
      publish();
    }
    if(name==='feedback') {
      const runtime=internal.runtimes.p1;
      runtime.monsters.forEach((monster,index)=>{monster.alive=index===0;monster.hp=index===0?6:0;});
      runtime.monsters[0].position={x:180,y:270};
      runtime.chests[0].position={x:80,y:260};
      runtime.chests[0].reward={coins:8,itemId:'ranged-edge'};
      engine.state.players.p1.hearts=2;
      engine.state.players.p1.weapon={itemId:'iron-sword',remainingCombatFloors:1,stacks:1};
      publish();
    }
    if(name==='ghost'){internal.runtimes.p1.timeRemainingMs=0;engine.tick(1);publish();}
    if(name==='death'){internal.damagePlayer('p1',3);publish();}
    if(name==='victory'){internal.runtimes.p1.monsters.forEach(m=>{m.alive=false;m.hp=0;});engine.tick(1);publish();}
  }
  const timer=window.setInterval(()=> {
    // A frozen fixture stays readable for screenshot review. Gameplay fixtures remain interactive.
    if(!['victory','death'].includes(name))engine.tick(50);
    publish();
  },50);
  window.addEventListener('pagehide',()=>window.clearInterval(timer),{once:true});
  return message=> {
    if(message.type==='roll'&&name==='delayed') {window.setTimeout(()=>{engine.handle('p1',message);publish();},2500);return;}
    const result=engine.handle('p1',message);
    if(!result.ok)receive({type:'error',message:result.error??'Rejected'});
    publish();
  };
}
