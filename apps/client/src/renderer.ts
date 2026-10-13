import type { CombatSnapshot, PlayerId, PresentationEvent, SessionState, Vec2 } from '@tower/shared';
import { Assets, type AssetName } from './assets';
import { Effects } from './presentation/effects';
import { SceneView } from './presentation/scene';

const monsterArt: Record<string, AssetName> = { goblin:'goblin', slime:'slime', bat:'bat', 'mini-boss':'mini', 'final-boss':'final' };
const monsterNames: Record<string, string> = { goblin:'고블린', slime:'슬라임', bat:'박쥐', 'mini-boss':'탑의 파수꾼', 'final-boss':'왕관의 수호자' };

export class Renderer {
  readonly effects = new Effects();
  readonly view = new SceneView();
  private ctx: CanvasRenderingContext2D;
  private ending: { state: SessionState; until: number } | null = null;
  private face = -1;
  private maxEnemyHp = new Map<string, number>();
  readonly assets = new Assets();
  shakeOffset: Vec2 = {x:0,y:0};

  constructor(readonly canvas: HTMLCanvasElement, readonly dice: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.assets.preload('room','hero','dice','goblin','slime','bat','chest','items');
  }

  accept(state: SessionState, events: PresentationEvent[], now: number, reduced: boolean): void {
    const before = this.view.state;
    const changed = this.view.accept(state, now);
    if (changed) {
      this.effects.clear(); this.maxEnemyHp.clear(); this.ending=null;
      if (before?.phase==='combat' && state.phase==='roll' && events.some(e=>e.kind==='clear'||e.kind==='death')) {
        const saved=structuredClone(before);
        for (const event of events) if(event.kind==='enemy-defeated') {
          const enemy=saved.combat[before.activePlayer]?.monsters.find(m=>m.id===event.targetId);if(enemy){enemy.alive=false;enemy.hp=0;}
        }
        this.ending={state:saved,until:now+220};
      }
    }
    for (const event of events) {
      const scene = this.ending?.state ?? state;
      if(event.playerId===scene.activePlayer && event.turnNumber===scene.turnNumber && event.floor===scene.floor?.floor) this.effects.accept(event,now,reduced);
    }
    const combat=state.combat[state.activePlayer];
    for(const monster of combat?.monsters ?? []) this.maxEnemyHp.set(monster.id,Math.max(this.maxEnemyHp.get(monster.id)??0,monster.hp));
  }

  private sprite(asset: AssetName, frame: number, position: Vec2, size: number, mirror=false, reaction=0): boolean {
    const image=this.assets.get(asset);if(!image)return false;
    const ctx=this.ctx;ctx.save();ctx.translate(position.x,position.y+9);if(mirror)ctx.scale(-1,1);
    if(reaction>0)ctx.filter=`brightness(${1+reaction*1.8})`;
    ctx.imageSmoothingEnabled=false;ctx.drawImage(image,(frame%16)*96,0,96,96,-size/2,-size,size,size);ctx.restore();return true;
  }
  private shadow(pos: Vec2, size: number, color='#000000'): void {const ctx=this.ctx;ctx.save();ctx.globalAlpha=.36;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(pos.x,pos.y+5,size,size*.32,0,0,Math.PI*2);ctx.fill();ctx.restore();}

  draw(now: number, reduced: boolean, local: PlayerId | null, aim: Vec2): void {
    const ctx=this.ctx;const latest=this.view.state;this.effects.prune(now);
    this.shakeOffset=this.effects.shake(now,reduced);
    ctx.save();ctx.clearRect(0,0,960,540);ctx.fillStyle='#131d20';ctx.fillRect(0,0,960,540);ctx.translate(this.shakeOffset.x,this.shakeOffset.y);
    const retained=this.ending && now<this.ending.until && latest?.phase==='roll' ? this.ending.state : null;
    const state=retained??latest;const combat=state?.combat[state.activePlayer];
    const room=this.assets.get(state?.phase==='shop'?'shop':'room');
    if(room)ctx.drawImage(room,0,0,960,540);
    else {ctx.strokeStyle='#26373a';ctx.lineWidth=1;for(let x=24;x<960;x+=48){ctx.beginPath();ctx.moveTo(x,24);ctx.lineTo(x,516);ctx.stroke();}for(let y=24;y<540;y+=48){ctx.beginPath();ctx.moveTo(24,y);ctx.lineTo(936,y);ctx.stroke();}}
    ctx.fillStyle=state?.phase==='shop'?'rgba(23,16,9,.16)':'rgba(7,14,17,.12)';ctx.fillRect(0,0,960,540);
    if (!state || !combat || !state.floor || state.phase==='lobby' || (state.phase==='roll'&&!retained)) {
      ctx.fillStyle='rgba(5,12,15,.42)';ctx.fillRect(0,0,960,540);
      const pos={x:480,y:335};this.shadow(pos,25);
      if(!this.sprite('hero',reduced?0:Math.floor(now/240)%4,pos,96)){ctx.fillStyle='#76d3c1';ctx.beginPath();ctx.arc(pos.x,pos.y,18,0,Math.PI*2);ctx.fill();}
      ctx.textAlign='center';ctx.fillStyle='#efd7a3';ctx.font='bold 26px system-ui';ctx.fillText(state?.phase==='shop'?'여행자의 상점':state?.phase==='lobby'?'탑의 입구':'다음 문은 어디로 열릴까요?',480,180);
      ctx.font='14px system-ui';ctx.fillStyle='#b6c4c1';ctx.fillText(state?.phase==='shop'?'코인을 사용해 모험을 준비하세요.':'주사위를 굴려 다음 던전으로 향하세요.',480,212);
    } else {
      const old=retained?null:this.view.previous;
      const position=(p:Vec2, previous:Vec2|undefined)=>retained?p:this.view.position(p,previous,now);
      const world=state.floor;
      const boss=world.type.includes('boss');
      ctx.strokeStyle=boss?'#b56a3d':'#54867d';ctx.lineWidth=3;ctx.strokeRect(18,18,924,504);
      for(const obstacle of world.obstacles) {
        ctx.fillStyle='#111c20';ctx.fillRect(obstacle.x,obstacle.y,obstacle.width,obstacle.height);
        ctx.fillStyle='#324448';ctx.fillRect(obstacle.x+3,obstacle.y+3,obstacle.width-6,obstacle.height-6);
        ctx.strokeStyle='#99736d';ctx.lineWidth=1;ctx.strokeRect(obstacle.x+2,obstacle.y+2,obstacle.width-4,obstacle.height-4);
        // Spikes occupy the authoritative damaging rectangle, not a decorative fake collider.
        ctx.fillStyle='#bfc4bc';for(let x=obstacle.x+7;x<obstacle.x+obstacle.width-6;x+=13){ctx.beginPath();ctx.moveTo(x,obstacle.y+obstacle.height-5);ctx.lineTo(x+5,obstacle.y+9);ctx.lineTo(x+10,obstacle.y+obstacle.height-5);ctx.fill();}
      }
      this.drawHazards(combat,now,reduced);
      const chestImage=this.assets.get('chest');
      for(const chest of combat.chests) {
        this.shadow(chest.position,17);ctx.save();if(chest.opened)ctx.globalAlpha=.65;
        if(chestImage)ctx.drawImage(chestImage,chest.opened?96:0,0,96,96,chest.position.x-24,chest.position.y-36,48,48);
        else{ctx.fillStyle=chest.opened?'#8d7547':'#d6a74b';ctx.fillRect(chest.position.x-15,chest.position.y-13,30,24);}ctx.restore();
        if(!chest.opened&&local===state.activePlayer&&Math.hypot(chest.position.x-combat.playerPosition.x,chest.position.y-combat.playerPosition.y)<52){ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff0b7';ctx.fillText('E · 열기',chest.position.x,chest.position.y-40);}
      }
      const actor=state.players[state.activePlayer];
      const people=combat.monsters.map(enemy=>({enemy,y:enemy.position.y})).sort((a,b)=>a.y-b.y);
      for(const {enemy} of people) {
        const reaction=this.effects.reactions.get(enemy.id);const age=reaction?now-reaction.at:Infinity;
        if(!enemy.alive&&!(reaction?.kind==='death'&&age<260))continue;
        const pos=position(enemy.position,old?.monsters.find(m=>m.id===enemy.id)?.position);
        const isBoss=enemy.type.includes('boss');const size=isBoss?104:enemy.type==='slime'?52:enemy.type==='bat'?60:62;
        this.shadow(pos,isBoss?29:17);
        let frame=reduced?0:Math.floor(now/170+(enemy.id.length%4))%4;
        if(reaction?.kind==='hit'&&age<120)frame=8+Math.min(2,Math.floor(age/40));
        if(!enemy.alive)frame=12+Math.min(3,Math.floor(age/65));
        if(!this.sprite(monsterArt[enemy.type]??'goblin',frame,pos,size,pos.x<combat.playerPosition.x,reaction?.kind==='hit'&&age<100?(1-age/100):0)) {
          ctx.fillStyle=isBoss?'#cc654d':enemy.type==='goblin'?'#9aaf61':enemy.type==='slime'?'#5cb9d4':'#a08ac4';ctx.beginPath();ctx.arc(pos.x,pos.y,isBoss?26:16,0,Math.PI*2);ctx.fill();
          ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#112124';ctx.fillText(isBoss?'☠':enemy.type==='goblin'?'고':enemy.type==='slime'?'슬':'박',pos.x,pos.y+4);
        }
        if(enemy.alive){
          const max=Math.max(this.maxEnemyHp.get(enemy.id)??enemy.hp,enemy.hp,1);const barWidth=isBoss?94:34;
          ctx.fillStyle='#0b1418';ctx.fillRect(pos.x-barWidth/2,pos.y-size+2,barWidth,4);ctx.fillStyle=isBoss?'#e2aa55':'#ba775f';ctx.fillRect(pos.x-barWidth/2,pos.y-size+2,barWidth*Math.max(0,enemy.hp)/max,4);
          if(isBoss){ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#ffddab';ctx.fillText(monsterNames[enemy.type],pos.x,pos.y-size-5);}
        }
      }
      for(const projectile of combat.projectiles) {
        const pos=position(projectile.position,old?.projectiles.find(p=>p.id===projectile.id)?.position);const angle=Math.atan2(projectile.velocity.y,projectile.velocity.x);
        ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(angle);ctx.strokeStyle=projectile.id.startsWith('wave-')?'#8ef0e3':'#f3d991';ctx.lineWidth=projectile.id.startsWith('wave-')?4:2;
        ctx.globalAlpha=.4;ctx.beginPath();ctx.moveTo(-20,0);ctx.lineTo(0,0);ctx.stroke();ctx.globalAlpha=1;
        ctx.beginPath();if(projectile.id.startsWith('wave-'))ctx.arc(0,0,12,-.95,.95);else{ctx.moveTo(-7,-2);ctx.lineTo(8,0);ctx.lineTo(-7,2);}ctx.stroke();ctx.restore();
      }
      const playerPos=position(combat.playerPosition,old?.playerPosition);
      const playerReaction=this.effects.reactions.get('player');const age=playerReaction?now-playerReaction.at:Infinity;
      const localAim=state.activePlayer===local?aim:this.effects.aim;
      let frame=reduced?0:Math.floor(now/145)%4;
      if(!old||Math.hypot(combat.playerPosition.x-old.playerPosition.x,combat.playerPosition.y-old.playerPosition.y)<.1)frame=0;
      if(playerReaction?.kind==='attack'&&age<220)frame=4+Math.min(3,Math.floor(age/55));
      if(playerReaction?.kind==='hit'&&age<150)frame=8+Math.min(2,Math.floor(age/50));
      if(playerReaction?.kind==='death')frame=12+Math.min(3,Math.floor(age/65));
      this.shadow(playerPos,18);ctx.strokeStyle=state.activePlayer==='p1'?'#84d5c8':'#f0b471';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(playerPos.x,playerPos.y+7,16,7,0,0,Math.PI*2);ctx.stroke();
      if(!this.sprite('hero',frame,playerPos,74,localAim.x<0,playerReaction?.kind==='hit'&&age<120?1-age/120:0)){ctx.fillStyle=state.activePlayer==='p1'?'#76d3c1':'#efa360';ctx.beginPath();ctx.arc(playerPos.x,playerPos.y,14,0,Math.PI*2);ctx.fill();}
      ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillStyle=state.activePlayer==='p1'?'#a6ede0':'#ffd1a4';ctx.fillText(`${actor.name} · ${'♥'.repeat(actor.hearts)}`,playerPos.x,playerPos.y+26);
      if(combat.ghost?.active) {
        const pos=position(combat.ghost.position,old?.ghost?.position);const f=reduced?0:Math.floor(now/180)%4;
        ctx.save();ctx.globalAlpha=.9;this.sprite('ghost',f,pos,84,false);ctx.restore();
        if(!this.assets.get('ghost')){ctx.fillStyle='#d3b4e8';ctx.beginPath();ctx.arc(pos.x,pos.y,24,0,Math.PI*2);ctx.fill();}
        ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillStyle='#ebd8fb';ctx.fillText('☠ 무적 · 접촉 즉사',pos.x,pos.y+27);
      }
      this.effects.draw(ctx,now,reduced);
      const vignette=ctx.createRadialGradient(480,270,170,480,270,560);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.28)');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);
    }
    ctx.restore();
  }

  private drawHazards(combat: CombatSnapshot, now: number, reduced: boolean): void {
    const ctx=this.ctx;
    for(const hazard of combat.hazards) {
      const fire=hazard.id.startsWith('fire-');ctx.fillStyle=fire?'rgba(189,87,36,.32)':'rgba(139,41,55,.22)';ctx.strokeStyle=fire?'#e69f55':'#c9586d';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(hazard.position.x,hazard.position.y,hazard.radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=fire?'#e9b56d':'#91c5a7';
      const phase=reduced?0:Math.floor(now/180)%2;
      for(let i=0;i<4;i++){const a=i*Math.PI/2;const x=hazard.position.x+Math.cos(a)*hazard.radius*.45,y=hazard.position.y+Math.sin(a)*hazard.radius*.45;ctx.beginPath();ctx.moveTo(x-3,y+4);ctx.lineTo(x,y-6-phase*2);ctx.lineTo(x+3,y+4);ctx.fill();}
    }
  }

  drawDice(value: number | null): void {
    const image=this.assets.get('dice');const token=(image?100:0)+(value??0);if(this.face===token)return;this.face=token;
    const ctx=this.dice.getContext('2d')!;ctx.clearRect(0,0,160,160);
    if(image&&value)ctx.drawImage(image,(value-1)*160,0,160,160,0,0,160,160);
    else{ctx.fillStyle='#e3d6b5';ctx.strokeStyle='#af8d44';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(32,30,96,96,18);ctx.fill();ctx.stroke();ctx.fillStyle='#19353a';ctx.font='bold 45px Georgia';ctx.textAlign='center';ctx.fillText(value===null?'?':String(value),80,95);}
  }
}
