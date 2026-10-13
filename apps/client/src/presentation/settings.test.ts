import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from './audio';
import { PresentationPreferences } from './preferences';

afterEach(()=>vi.unstubAllGlobals());

describe('optional presentation settings',()=> {
  it('keeps sound failures out of gameplay',()=> {
    vi.stubGlobal('AudioContext',class { constructor(){throw new Error('blocked');} });
    const audio=new GameAudio();expect(()=>{audio.unlock();audio.play('roll',100);audio.stop();}).not.toThrow();
  });
  it('uses one context, bounds voices, and stops immediately when muted',()=> {
    let contexts=0;let created=0;let stopped=0;
    const parameter={setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}};
    vi.stubGlobal('AudioContext',class {
      state='running';currentTime=0;destination={};constructor(){contexts++;}
      createOscillator(){created++;return {frequency:parameter,connect(){},disconnect(){},start(){},stop(){stopped++;},onended:null};}
      createGain(){return {gain:parameter,connect(){},disconnect(){}};}
    });
    const audio=new GameAudio();audio.unlock();audio.unlock();audio.play('enemy-hit',0);audio.play('enemy-hit',50);
    for(let i=0;i<20;i++)audio.play('attack',200+i*100);
    expect(contexts).toBe(1);expect(created).toBe(8);
    audio.enabled=false;audio.stop();expect(stopped).toBe(16);audio.play('roll',5000);expect(created).toBe(8);
  });
  it('keeps in-memory preferences when saving is blocked and honors OS reduction',()=> {
    let changed:()=>void=()=>{};const media={matches:true,addEventListener(_event:string,callback:()=>void){changed=callback;}};
    vi.stubGlobal('window',{localStorage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}},matchMedia(){return media;}});
    const preferences=new PresentationPreferences();const callback=vi.fn();preferences.onChange=callback;
    expect(preferences.reduced).toBe(true);preferences.set('sound',false);preferences.set('reduced',false);
    expect(preferences.values.sound).toBe(false);expect(preferences.reduced).toBe(true);
    media.matches=false;changed();expect(preferences.reduced).toBe(false);expect(callback).toHaveBeenCalledTimes(3);
  });
});
