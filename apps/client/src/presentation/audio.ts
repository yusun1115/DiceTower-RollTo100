import type { PresentationEventKind } from '@tower/shared';

const tones: Partial<Record<PresentationEventKind | 'pending', [number, number, OscillatorType, number]>> = {
  pending: [170, 330, 'triangle', .12], roll: [460, 940, 'triangle', .2], turn: [420, 580, 'sine', .12],
  attack: [220, 65, 'sawtooth', .075], dash: [390, 100, 'triangle', .11], 'enemy-hit': [160, 60, 'square', .055],
  'enemy-defeated': [280, 130, 'triangle', .12], 'player-hit': [140, 55, 'sawtooth', .13], heal: [480, 880, 'sine', .24],
  chest: [540, 980, 'triangle', .22], coins: [740, 1120, 'sine', .12], item: [620, 1000, 'triangle', .18],
  purchase: [730, 880, 'sine', .1], clear: [520, 1040, 'triangle', .3], death: [250, 65, 'triangle', .42],
  victory: [520, 1560, 'triangle', .55], ghost: [160, 360, 'sawtooth', .4], restock: [560, 820, 'sine', .14]
};

export class GameAudio {
  private context: AudioContext | null = null;
  private voices = new Set<OscillatorNode>();
  private last = new Map<string, number>();
  enabled = true;

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* visual feedback never depends on audio permission */ }
  }

  stop(): void { for (const voice of this.voices) { try { voice.stop(); } catch { /* already ended */ } } this.voices.clear(); }

  play(kind: PresentationEventKind | 'pending', now: number): void {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.voices.size >= 8) return;
    const tone = tones[kind];
    if (!tone || now - (this.last.get(kind) ?? -Infinity) < (kind === 'enemy-hit' ? 100 : kind === 'ghost' ? 1500 : 70)) return;
    this.last.set(kind, now);
    try {
      const ctx = this.context; const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      oscillator.type = tone[2]; oscillator.frequency.setValueAtTime(tone[0], ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(tone[1], ctx.currentTime + tone[3]);
      gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(.026, ctx.currentTime + .008);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + tone[3]);
      oscillator.connect(gain); gain.connect(ctx.destination); this.voices.add(oscillator);
      oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(); oscillator.stop(ctx.currentTime + tone[3]);
    } catch { /* optional sound */ }
  }
}
