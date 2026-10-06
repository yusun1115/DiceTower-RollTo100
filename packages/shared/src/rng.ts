export function hashSeed(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const value = String(part);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export function deriveSeed(matchSeed: string, ...parts: Array<string | number>): number {
  return hashSeed(matchSeed, ...parts);
}

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty collection');
    }
    return items[this.int(0, items.length - 1)];
  }

  fork(...parts: Array<string | number>): SeededRng {
    return new SeededRng(hashSeed(this.state, ...parts));
  }
}
