import { z } from 'zod';
import type { ClientMessage } from './protocol.js';

const vectorSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
const combatCommandSchema = z.object({
  moveX: z.number().min(-1).max(1),
  moveY: z.number().min(-1).max(1),
  aim: vectorSchema,
  attack: z.boolean().optional(),
  dash: z.boolean().optional(),
  interact: z.boolean().optional()
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), mode: z.enum(['pvp', 'cpu']), difficulty: z.enum(['easy', 'normal', 'hard']).optional() }),
  z.object({ type: z.literal('join'), roomCode: z.string().regex(/^[A-Z0-9]{4,8}$/) }),
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('combat'), command: combatCommandSchema }),
  z.object({ type: z.literal('buy'), slotId: z.string().min(1).max(32) }),
  z.object({ type: z.literal('use-potion') }),
  z.object({ type: z.literal('finish-shop') })
]);

export function parseClientMessage(payload: unknown): ClientMessage {
  return clientMessageSchema.parse(payload);
}
