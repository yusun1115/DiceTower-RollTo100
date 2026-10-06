import type { Difficulty, MatchMode, PlayerId, SessionState } from './domain.js';
import type { CombatCommand } from './protocol-types.js';

export type { CombatCommand } from './protocol-types.js';

export type ClientMessage =
  | { type: 'create'; mode: MatchMode; difficulty?: Difficulty }
  | { type: 'join'; roomCode: string }
  | { type: 'ready' }
  | { type: 'roll' }
  | { type: 'combat'; command: CombatCommand }
  | { type: 'buy'; slotId: string }
  | { type: 'use-potion' }
  | { type: 'finish-shop' };

export type ServerMessage =
  | { type: 'welcome'; sessionId: string; roomCode: string; playerId: PlayerId }
  | { type: 'state'; state: SessionState }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string };
