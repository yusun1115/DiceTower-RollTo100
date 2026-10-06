import type { Vec2 } from './domain.js';

export interface CombatCommand {
  moveX: number;
  moveY: number;
  aim: Vec2;
  attack?: boolean;
  dash?: boolean;
  interact?: boolean;
}
