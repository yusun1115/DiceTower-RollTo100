import type { FloorType, PlayerId, Vec2 } from './domain.js';

export const PRESENTATION_EVENT_LIMIT = 32;
export const PRESENTATION_VERSION = 1;

export type PresentationEventKind =
  | 'roll' | 'turn' | 'clear' | 'death' | 'victory'
  | 'attack' | 'dash' | 'enemy-hit' | 'enemy-defeated'
  | 'player-hit' | 'heal' | 'ghost' | 'chest'
  | 'item' | 'purchase' | 'weapon-expired' | 'restock' | 'coins';

/** Cosmetic facts only: never a request to change game rules or timing. */
export interface PresentationEvent {
  id: number;
  sessionId: string;
  playerId: PlayerId;
  turnNumber: number;
  floor: number;
  kind: PresentationEventKind;
  position?: Vec2;
  from?: Vec2;
  direction?: Vec2;
  targetId?: string;
  amount?: number;
  coins?: number;
  itemId?: string;
  fromFloor?: number;
  toFloor?: number;
  roll?: number;
  floorType?: FloorType;
  cause?: string;
}

export type PresentationFact = Omit<PresentationEvent, 'id' | 'sessionId' | 'playerId' | 'turnNumber' | 'floor'> & { floor?: number };
