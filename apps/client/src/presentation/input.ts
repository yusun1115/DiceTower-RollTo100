/** Keep a short tap alive across the 50ms server tick, without changing cooldowns. */
export class ActionBuffer {
  private until = { attack: 0, dash: 0, interact: 0 };
  pulse(action: keyof ActionBuffer['until'], now: number): void { this.until[action] = now + 100; }
  active(action: keyof ActionBuffer['until'], held: boolean, now: number): boolean { return held || now < this.until[action]; }
  clear(): void { this.until = { attack: 0, dash: 0, interact: 0 }; }
}
