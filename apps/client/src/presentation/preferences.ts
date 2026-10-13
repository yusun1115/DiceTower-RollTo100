export interface Preferences { sound: boolean; reduced: boolean }
export const PREFERENCES_KEY = 'tower-race.presentation.v1';

export function readPreferences(storage?: Pick<Storage, 'getItem'>): Preferences {
  try {
    const saved = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? '{}');
    return { sound: saved?.sound !== false, reduced: saved?.reduced === true };
  } catch { return { sound: true, reduced: false }; }
}

export class PresentationPreferences {
  values: Preferences;
  private media: MediaQueryList;
  onChange = () => {};
  constructor() {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* session defaults */ }
    this.values = readPreferences(storage);
    this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.media.addEventListener('change', () => this.onChange());
  }
  get reduced(): boolean { return this.values.reduced || this.media.matches; }
  set(name: keyof Preferences, value: boolean): void {
    this.values[name] = value;
    try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.values)); } catch { /* keep working in memory */ }
    this.onChange();
  }
}
