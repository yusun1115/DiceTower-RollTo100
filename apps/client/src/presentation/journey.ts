import type { PlayerId, PresentationEvent, SessionState } from '@tower/shared';

export interface Travel { playerId: PlayerId; turnNumber: number; from: number; to: number; roll?: number; at: number; type?: string }
export interface Announcement { title: string; detail: string; tone: string; until: number }
export const JOURNEY_MS = 900;
export function diceResultLabel(value: number | null, unresolved = false): string {
  return unresolved ? '주사위를 굴리는 중 · 결과 미확정' : value === null ? '아직 확정된 주사위 결과 없음' : `주사위 결과 ${value}`;
}

export class Journey {
  pending: { at: number; turn: number } | null = null;
  travel: Travel | null = null;
  announcement: Announcement | null = null;

  request(state: SessionState, player: PlayerId, now: number): boolean {
    if (this.pending || state.phase !== 'roll' || state.activePlayer !== player) return false;
    this.pending = { at: now, turn: state.turnNumber };
    return true;
  }

  cancel(): void { this.pending = null; }
  reset(): void { this.pending = null; this.travel = null; this.announcement = null; }

  synchronize(state: SessionState): void {
    if (this.pending && (state.turnNumber !== this.pending.turn || state.phase !== 'roll')) this.pending = null;
    if (this.travel && (this.travel.turnNumber !== state.turnNumber || state.winner)) this.travel = null;
  }

  show(title: string, detail: string, tone: string, now: number, duration = 900): void {
    this.announcement = { title, detail, tone, until: now + duration };
  }

  accept(event: PresentationEvent, now: number, local: PlayerId, actor = event.playerId === 'p1' ? '1P' : '2P'): void {
    switch (event.kind) {
      case 'roll': {
        this.pending = null;
        this.travel = { playerId: event.playerId, turnNumber: event.turnNumber, from: event.fromFloor ?? event.floor, to: Math.min(100, event.toFloor ?? event.floor), roll: event.roll, type: event.floorType, at: now };
        const label = event.floorType === 'shop' ? '상점 발견' : event.floorType === 'mini-boss' ? '미니보스' : event.floorType === 'final-boss' ? '최종보스' : '던전 진입';
        this.show(`${event.toFloor ?? event.floor}층 · ${label}`, `${actor} · ${event.fromFloor ?? '?'} → ${event.toFloor ?? event.floor}층`, event.floorType?.includes('boss') ? 'danger' : event.floorType === 'shop' ? 'gold' : 'teal', now);
        break;
      }
      case 'clear': this.show('DUNGEON CLEAR', `${actor} · ${event.floor}층 돌파`, 'gold', now); break;
      case 'death':
        this.pending = null; this.travel = null;
        this.show(event.cause === 'ghost' ? '유령에게 붙잡혔습니다' : '쓰러졌습니다', `${actor} · ${event.fromFloor} → ${event.toFloor}층`, 'danger', now, 1100); break;
      case 'turn':
        this.pending = null; this.travel = null;
        // Keep a fresh clear/death result readable; the permanent turn chip updates immediately.
        if (!this.announcement || this.announcement.until <= now) this.show(event.playerId === local ? '당신의 턴' : '상대의 턴', `${actor} · 주사위를 굴릴 차례`, event.playerId === 'p1' ? 'teal' : 'amber', now, 650);
        break;
      case 'victory':
        this.pending = null; this.travel = null;
        this.show(event.playerId === local ? 'VICTORY' : 'DEFEAT', `${actor} · 100층 최종보스 격파`, 'gold', now, 2200); break;
    }
  }

  face(state: SessionState, now: number): number | null {
    if (this.pending && now - this.pending.at < 2000) return 1 + Math.floor((now - this.pending.at) / 80) % 6;
    if (this.travel && now - this.travel.at < 160) return 1 + Math.floor((now - this.travel.at) / 40) % 6;
    return this.travel?.roll ?? state.lastRoll ?? null;
  }

  marker(player: PlayerId, confirmed: number, now: number, reduced: boolean): number {
    if (!this.travel || this.travel.playerId !== player || reduced) return confirmed;
    const t = Math.max(0, Math.min(1, (now - this.travel.at - 150) / 450));
    return this.travel.from + (this.travel.to - this.travel.from) * (1 - Math.pow(1 - t, 3));
  }
}
