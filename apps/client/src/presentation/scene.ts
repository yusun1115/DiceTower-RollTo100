import type { CombatSnapshot, SessionState, ShopSnapshot, Vec2 } from '@tower/shared';

export function sceneKey(state: SessionState): string {
  return `${state.sessionId}:${state.turnNumber}:${state.activePlayer}:${state.floor?.floor ?? '-'}:${state.phase}`;
}

export function interpolate(from: Vec2 | undefined, to: Vec2, t: number): Vec2 {
  // Snap discontinuities (dash/teleport) rather than sliding through collision geometry.
  if (!from || Math.hypot(to.x - from.x, to.y - from.y) > 48) return to;
  const a = Math.max(0, Math.min(1, t));
  return { x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
}

export function canvasPoint(point: Vec2, rect: { left: number; top: number; width: number; height: number }, shake: Vec2 = { x: 0, y: 0 }): Vec2 {
  return { x: (point.x - rect.left) * 960 / rect.width - shake.x, y: (point.y - rect.top) * 540 / rect.height - shake.y };
}

export class SceneView {
  state: SessionState | null = null;
  previous: CombatSnapshot | null = null;
  previousShop: ShopSnapshot | null = null;
  receivedAt = 0;

  accept(state: SessionState, now: number): boolean {
    const changed = !this.state || sceneKey(this.state) !== sceneKey(state);
    this.previous = changed ? null : this.state!.combat[this.state!.activePlayer];
    this.previousShop = changed ? null : this.state!.shop ?? null;
    this.state = state;
    this.receivedAt = now;
    return changed;
  }

  position(to: Vec2, from: Vec2 | undefined, now: number): Vec2 {
    return interpolate(from, to, (now - this.receivedAt) / 50);
  }
}
