import { describe, expect, it } from 'vitest';
import { generateFloorBlueprint, validateContentCatalog, validateItemDefinitions } from './content.js';
import { parseClientMessage } from './validation.js';

describe('shared deterministic content', () => {
  it('recreates the same floor blueprint from the same seed', () => {
    const first = generateFloorBlueprint('test-match', 3);
    const second = generateFloorBlueprint('test-match', 3);
    expect(second).toEqual(first);
  });

  it('keeps different floors independent while preserving the same match seed', () => {
    const first = generateFloorBlueprint('test-match', 3);
    const second = generateFloorBlueprint('test-match', 4);
    expect(second.seed).not.toBe(first.seed);
    expect(second.floor).toBe(4);
  });

  it('validates the built-in content catalog', () => {
    expect(validateContentCatalog()).toEqual([]);
  });

  it('rejects malformed item schemas and incompatible trigger effects', () => {
    expect(validateItemDefinitions([
      {
        id: 'broken',
        name: 'broken',
        kind: 'weapon',
        price: 0,
        rarity: 'common',
        combatFloors: 9,
        tags: [],
        effects: [{ trigger: 'move', target: 'enemy', effect: 'damage', magnitude: 0, tags: [] }]
      }
    ])).toEqual(expect.arrayContaining([
      'non-positive price: broken',
      'weapon duration must be 1..5: broken',
      'item tags are required: broken',
      'invalid effect magnitude: broken',
      'move effects must create a thorn trail: broken'
    ]));
  });
});

describe('client protocol validation', () => {
  it('accepts a valid combat command', () => {
    expect(parseClientMessage({
      type: 'combat',
      command: { moveX: 1, moveY: 0, aim: { x: 1, y: 0 }, attack: true }
    }).type).toBe('combat');
  });

  it('rejects malformed movement outside the accepted range', () => {
    expect(() => parseClientMessage({
      type: 'combat',
      command: { moveX: 4, moveY: 0, aim: { x: 1, y: 0 } }
    })).toThrow();
  });
});
