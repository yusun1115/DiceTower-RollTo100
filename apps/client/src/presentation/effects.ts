import type { PresentationEvent, Vec2 } from '@tower/shared';

export const PARTICLE_LIMIT = 128;
export const LABEL_LIMIT = 16;
export interface Particle { position: Vec2; velocity: Vec2; at: number; life: number; size: number; color: string }
export interface FloatLabel { position: Vec2; at: number; life: number; value: string; color: string }
export interface Reaction { kind: string; at: number; direction?: Vec2 }

export class Effects {
  particles: Particle[] = [];
  labels: FloatLabel[] = [];
  slashes: Array<{ position: Vec2; direction: Vec2; at: number }> = [];
  dashes: Array<{ from: Vec2; to: Vec2; at: number }> = [];
  reactions = new Map<string, Reaction>();
  shakeUntil = 0;
  aim: Vec2 = { x: 1, y: 0 };

  clear(): void { this.particles = []; this.labels = []; this.slashes = []; this.dashes = []; this.reactions.clear(); this.shakeUntil = 0; }

  burst(position: Vec2, color: string, count: number, now: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random()*Math.PI*2; const speed = 35+Math.random()*70;
      this.particles.push({ position: { ...position }, velocity: { x: Math.cos(angle)*speed, y: Math.sin(angle)*speed-20 }, at: now, life: 320+Math.random()*250, size: 1+Math.random()*2.4, color });
    }
    this.particles = this.particles.slice(-PARTICLE_LIMIT);
  }
  label(position: Vec2, value: string, color: string, now: number): void {
    this.labels.push({ position: { ...position }, at: now, life: 700, value, color });
    this.labels = this.labels.slice(-LABEL_LIMIT);
  }

  accept(event: PresentationEvent, now: number, reduced: boolean): void {
    const pos = event.position; const gold = '#f2ce78'; const danger = '#ff817c'; const teal = '#8de3d4';
    if (event.kind === 'attack' && pos) {
      this.aim = event.direction ?? this.aim;
      this.reactions.set('player', { kind: 'attack', at: now, direction: this.aim });
      if (!reduced) this.slashes.push({ position: pos, direction: this.aim, at: now });
    }
    if (event.kind === 'dash' && pos) {
      if (!reduced) { this.dashes.push({ from: event.from ?? pos, to: pos, at: now }); this.burst(event.from ?? pos, teal, 6, now); }
    }
    if (event.kind === 'enemy-hit' && pos) {
      this.reactions.set(event.targetId ?? 'enemy', { kind: 'hit', at: now });
      this.label({ x: pos.x, y: pos.y-35 }, `${Math.ceil(event.amount ?? 0)}`, '#fff1c7', now);
      if (!reduced) this.burst(pos, gold, 5, now);
    }
    if (event.kind === 'enemy-defeated' && pos) {
      this.reactions.set(event.targetId ?? 'enemy', { kind: 'death', at: now });
      if (!reduced) this.burst(pos, gold, 12, now);
      if (event.coins) this.label({ x: pos.x+12, y: pos.y-18 }, `+${event.coins} ●`, gold, now);
    }
    if (event.kind === 'player-hit' || event.kind === 'death') {
      this.reactions.set('player', { kind: event.kind === 'death' ? 'death' : 'hit', at: now });
      if (!reduced) this.shakeUntil = now+120;
      if (pos && event.kind === 'player-hit') this.label({ x: pos.x, y: pos.y-50 }, '−1 ♥', danger, now);
    }
    if (event.kind === 'heal' && pos) { this.label({x:pos.x,y:pos.y-50}, '+1 ♥', teal, now); if (!reduced) this.burst(pos, teal, 10, now); }
    if (event.kind === 'chest' && pos) { this.reactions.set(event.targetId ?? 'chest', { kind: 'open', at: now }); if (!reduced) this.burst(pos, gold, 14, now); if (event.coins) this.label({x:pos.x,y:pos.y-32}, `+${event.coins} ●`, gold, now); }
    if (event.kind === 'coins' && pos) this.label(pos, `+${event.coins} ●`, gold, now);
    if (event.kind === 'ghost' && pos && !reduced) this.burst(pos, '#c4b8f8', 12, now);
    this.slashes = this.slashes.slice(-12); this.dashes = this.dashes.slice(-8);
  }

  prune(now: number): void {
    this.particles = this.particles.filter(p=> now-p.at<p.life);
    this.labels = this.labels.filter(p=> now-p.at<p.life);
    this.slashes = this.slashes.filter(p=>now-p.at<210);
    this.dashes = this.dashes.filter(p=>now-p.at<260);
    for (const [id,r] of this.reactions) if (now-r.at>800) this.reactions.delete(id);
  }
  shake(now: number, reduced: boolean): Vec2 {
    const t = Math.max(0,(this.shakeUntil-now)/120);
    return reduced ? {x:0,y:0} : { x: Math.sin(now*.13)*2.5*t, y: Math.cos(now*.17)*1.8*t };
  }
  draw(ctx: CanvasRenderingContext2D, now: number, reduced: boolean): void {
    ctx.save();
    if (!reduced) {
      for (const dash of this.dashes) {
        const life=1-(now-dash.at)/260;
        for (let i=0;i<4;i++) {
          const t=i/4; ctx.fillStyle=`rgba(104,210,199,${life*(.06+.04*i)})`;
          ctx.beginPath(); ctx.ellipse(dash.from.x+(dash.to.x-dash.from.x)*t, dash.from.y+(dash.to.y-dash.from.y)*t, 12, 19, 0, 0, Math.PI*2); ctx.fill();
        }
      }
      for (const slash of this.slashes) {
        const t=(now-slash.at)/210; const angle=Math.atan2(slash.direction.y,slash.direction.x);
        ctx.strokeStyle=`rgba(185,238,233,${(1-t)*.85})`; ctx.lineWidth=5*(1-t)+1;
        ctx.beginPath();ctx.arc(slash.position.x,slash.position.y,24+16*t,angle-.75+t*.6,angle+.7+t*.6);ctx.stroke();
      }
      for (const p of this.particles) {
        const t=(now-p.at)/1000;ctx.globalAlpha=1-(now-p.at)/p.life;ctx.fillStyle=p.color;
        ctx.fillRect(p.position.x+p.velocity.x*t,p.position.y+p.velocity.y*t+45*t*t,p.size,p.size);
      }
    }
    ctx.globalAlpha=1;ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.lineWidth=3;
    for (const label of this.labels) {
      const t=(now-label.at)/label.life; const y=label.position.y-(reduced?0:22*t);
      ctx.globalAlpha=Math.min(1,(1-t)*3);ctx.strokeStyle='#111618';ctx.strokeText(label.value,label.position.x,y);ctx.fillStyle=label.color;ctx.fillText(label.value,label.position.x,y);
    }
    ctx.restore();
  }
}
