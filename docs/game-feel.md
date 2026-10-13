# Tower Race presentation

## Authority and events

`SessionState.presentationEvents` is optional. Each small fact contains a session-scoped monotonic `id`, participant, turn, floor, kind, and only the payload needed by the presentation. The latest 32 facts are copied into snapshots; retrieving a snapshot does not consume or mutate facts. Enemy damage to the same target within a tick is aggregated for presentation only. The existing dice, cooldowns, contact damage, reward timing, timers, shop stock, CPU rules, and victory remain authoritative.

Kinds: `roll`, `turn`, `clear`, `death`, `victory`, `attack`, `dash`, `enemy-hit`, `enemy-defeated`, `player-hit`, `heal`, `ghost`, `chest`, `item`, `purchase`, `weapon-expired`, `restock`. `coins` is a conservative legacy-client cue for an observed balance increase. Fatal hits and final enemy defeats retain their source coordinates before the runtime or turn is cleared. An initial snapshot establishes the client's cursor; repeated history and unknown future kinds do not replay effects. A hidden/resuming page resets its baseline and drops stale animations.

If a server omits expression events, `lastRoll`, or `readyPlayers`, the client keeps the game usable and uses only observable state changes. It does not infer a six from a capped 99→100 move, identify an invisible final kill from missing history, or treat a death's heart reset as healing. Both clients receive identical server events; observers render `activePlayer` while the personal resource card stays local.

## Motion and sound budget

| Cue | Duration/limit |
| --- | --- |
| Accepted die settling | 160ms reveal; 340ms landing emphasis |
| Tower marker ascent | 150ms offset + 450ms ease-out |
| Arrival banner | 900ms, outside the live canvas |
| No roll response | After 2s stop tumbling; keep a waiting label, no automatic retry |
| Final scene residue | At most 220ms; superseded immediately by a new encounter |
| Slash / dash afterimage | 210 / 260ms |
| Enemy hit | 100–120ms |
| Cosmetic screen shake | 2.5×1.8 pixels, 120ms; inverse transform preserves aiming |
| Floating labels | 700ms, maximum 16 |
| Decorative particles | 320–570ms, maximum 128 |
| Effect audio | One context, maximum 8 voices; repeated hit/danger sounds rate-limited |

`효과음` and `연출 줄이기` are persisted in `tower-race.presentation.v1`. Browser reduced-motion OR the local reduction setting removes die tumbling, camera shake, travel interpolation, afterimages and decorative particles. Static labels, actual results, heart changes, hazards and victory stay readable. Audio permission and preference-storage failures are optional presentation failures, never gameplay gates.

## Runtime art

The original personal PNG sheets remain untouched and untracked. Only `apps/client/public/assets/runtime/` derivatives are imported; Vite's `publicDir` is disabled so unused originals do not get copied into deployment artifacts. URLs are explicitly imported so GitHub Pages base paths work. Actor sheets have 16 frames in one horizontal strip, 96px per frame, a shared scale across the original 4×4 sheet and a bottom-center ground anchor. Actor rows correspond to idle/walk, attack, hurt, death (0–3, 4–7, 8–11, 12–15). Short missing direction variants use mirroring; the physical ground position remains unchanged.

| Runtime | Source | Bytes |
| --- | --- | ---: |
| hero | `characters/animations/player-hero-animations.png` | 68,286 |
| goblin | `characters/animations/monster-goblin-animations.png` | 59,874 |
| slime | `characters/animations/monster-slime-animations.png` | 68,810 |
| bat | `characters/animations/monster-bat-animations.png` | 50,120 |
| ghost | `characters/animations/hazard-ghost-animations.png` | 103,766 |
| mini / final bosses | matching `boss-*-animations.png` | 78,050 / 108,376 |
| dice | `ui/dice-faces.png`, original 3×2 → 6×160px | 40,342 |
| items | `items/item-icons.png`, 4×2 → 8×96px | 40,766 |
| chest | `props/chest-states.png`, closed/open → 2×96px | 11,754 |
| tower | `environment/backgrounds/tower-progression-background.png` | 101,452 |
| room / shop | matching normal-room / shop-interior backgrounds | 62,862 / 102,020 |

All 13 runtime images total **896,478 bytes** (about 876KiB). The initially used room/hero/dice/goblin/slime/bat/chest/items/tower set totals **504,266 bytes** (about 492KiB); bosses, ghost and shop are loaded on demand. Name, size, frame count, pivot and source mapping are recorded in `runtime/manifest.json`. Display sizes are hero 74, normal enemies 52–62, bosses 104, ghost 84, chest 48 canvas pixels; normalized actor frames are 96px. Missing sprites fall back to colored, labeled shapes; a missing die uses a readable die face and item icons retain a symbol. The game's item names/rarity/duration derive from `ITEM_DEFINITIONS`, not filenames. The icon frame mapping follows the eight existing items in catalog order. Both thorn and flame trails warn of owner damage because both currently apply that damage in the domain engine.

To regenerate on an authoring machine with the original sheets, Pillow, and the game-studio sprite-pipeline normalizer:

```powershell
python scripts/prepare-assets.py --normalizer <path-to-game-studio/scripts/normalize_sprite_strip.py>
```

The packer uses the provided normalizer's shared-scale/bottom-center functions. It does not generate art. Runtime derivatives are committed, so CI and other players do not need Python, Pillow, original working sheets, or the plugin.

## Verification and visual fixtures

The domain and pure presentation tests cover event history limits, copied snapshots, final-hit/turn handoff, fatal heart reset, capped travel, accepted cooldowns, shared client facts, rejected purchases, deduplication, legacy responses, journey timing, interpolation discontinuities, inverse pointer coordinates, effect bounds, and storage failures.

Local Vite development URLs can use `?preview=normal`, `mini`, `final`, `shop`, `ghost`, `hazards`, `death`, `victory`, `roll`, `delayed`, `legacy`, or `feedback`. These use the actual domain engine for deterministic rendering/input checks; death/victory fixtures deliberately arrange that outcome for screenshot review. The feedback fixture places one low-health enemy and a nearby chest so real E/click/potion input can verify rewards, healing, expiry and handoff. They are development-only and removed from the production build. Normal CPU and two-browser online sessions are tested separately through the WebSocket server.

Append `&assets=off` to a development fixture to exercise missing-image fallbacks without modifying the original or runtime art. A 100ms action buffer retains a short mouse/Space/E tap across server ticks; scene, focus and visibility changes clear it. Held actions still use the original server cooldowns and outbound interval.

Development render profiling is available in `#app`'s `data-render-p95` (CPU draw milliseconds) and `data-fps` attributes, refreshed every 120 frames. These are diagnostic DOM data, not player UI or server telemetry.

### Local verification — 2026-10-13

`pnpm typecheck`, all **45 tests in 7 files**, `pnpm build` with the production Pages base and WebSocket URL, and strict OpenSpec validation passed. The production client emits JS **52.26kB / 18.71kB gzip**, CSS **16.14kB / 4.60kB gzip**, and the 13 WebP images. DEV fixtures are not part of that client. Original working PNGs are not shipped. Tumbling preview faces are announced as unconfirmed, never as a confirmed die result. A blocked, accepted dash still receives a zero-distance cue without bypassing damage throttling.

| Check | Observed result |
| --- | --- |
| Fresh CPU rooms `272Z5`, `NKTVU` | Ready immediately unlocks the die; accepted roll enters a live dungeon; after death the CPU rolls and its moving actor/enemies are visible while the local card stays personal. |
| Separate two-client room `C935N` | Both readiness states, the same confirmed die result, 1P combat in 2P's view, death/turn handoff, and the shared shop were synchronized. Network tests reject spectator combat input. No existing user room was joined. |
| Mouse / Space / E | Short real taps attack, dash and open a nearby chest. The 100ms buffer covers tick gaps; focus, blur, visibility and scene changes clear held input. Pure tests verify inverse aim and discontinuity boundaries. |
| Shop | Consecutive purchases of 34 and 16 coins changed 120→86→70 and shared stock 4→3→2. A one-floor sword, a five-floor sword, consumables and owner-damaging buffs retain their correct descriptions. |
| Muted + reduced feedback fixture | E grants 8 coins and a ranged-edge item, potion restores 2→3 hearts, a real click defeats the last enemy, 2 more coins are granted, the one-floor sword expires, and the clear banner survives the immediate CPU turn handoff. |
| Arrivals / end states | Normal, shop, 10F mini boss, 99+6→100F final boss, ghost, death 4→1F and final victory rendered. Merely arriving at 100F does not show victory. |
| Delayed + double click | One die request; after 2s a static waiting label; after 2.5s exactly one five-floor shop arrival with no error or retry. |
| Legacy + missing art | With journal/lastRoll/readiness omitted, the result remains unknown rather than guessed; actual projectiles and input continue with character/chest/die/icon fallbacks. |
| Layout | Measured 1280×720 and 1024×768 desktop layouts keep arena and die in view. At 390×844 the document has no horizontal overflow and the two-lane tower preserves both markers. Touch controls are not added. |
| Preferences / audio | Mute and reduced-motion persist through reload and remain usable. Unit tests exercise denied audio, one context/eight-voice cap, blocked storage and OS preference changes. Automated browser capture does not evaluate subjective loudness or audio quality. |

Browser error/warning logs were empty during the checked gameplay. A fresh active normal encounter's 120-frame local sample reported CPU render p95 **0.30ms** (156.5 rAF callbacks/s in this test browser); idle/turn samples were 0.20ms. This is not a GPU, network or low-end-device benchmark. Decorative effects are stress-tested at their caps and expire without touching domain objects. If render p95 exceeds 6ms or sustained presentation misses a 16.7ms/60fps frame budget on a target device, reduce decorative particle count first, then profile sprite scaling and keep the reduced-motion option available. Never drop hazards, authoritative sprites or input to meet an effects budget.

Playtest fixes: retained controls during 50ms snapshots; buffered short action edges; compacted the short-desktop sidebar; replaced the ambiguous PvP `2P / CPU` label with the actual participant name; identified whose danger warning is shown; and added readable icon/enemy fallbacks. Test preferences were restored to sound on / local reduction off.

Screenshots: [normal dungeon](playtest/normal-dungeon.jpg), [CPU spectating](playtest/cpu-spectating.jpg), [mini boss](playtest/mini-boss.jpg), [final boss/capped die](playtest/final-boss.jpg), [ghost warning](playtest/ghost-warning.jpg), [death handoff](playtest/death-handoff.jpg), [reward/expiry handoff](playtest/reward-handoff.jpg), [victory](playtest/victory.jpg), [legacy fallbacks](playtest/fallbacks.jpg).

### Public rollout

The game/runtime feature commit is **`f4b37d632617921e525e505f5aff1dff68ce5c99`**. [GitHub Pages run 38332543540](https://github.com/yusun1115/DiceTower-RollTo100/actions/runs/38332543540) completed successfully. The live page loaded the new theme and runtime images without console errors. Fresh public CPU rooms `XXNF6` (before server rollout) and `ZWH72` (after rollout) passed create→ready→confirmed roll→dungeon entry; no existing player's room was joined. [Public screenshot](playtest/public-dungeon.jpg).

Render had still been serving `b48bc6c`. Using the existing service, repository and `main` branch, **Deploy latest commit** successfully deployed `f4b37d6` (`dep-db6olqd9fdbs73dntq9g`, Live). No hosting plan, credentials, permissions or auto-deploy settings were changed. `/health` returned `presentationVersion: 1` and the exact feature commit above.

The public protocol smoke check created its own CPU room `GRVHS`: confirmed die 1, destination 1, phase combat, and ordered server facts `turn`, `roll`, `attack`. The legacy path was exercised before server rollout; final-hit coordinates, precise death causes, accepted dash/attack facts and explicit reward events are available after rollout. Public normal play is now using the event-aware server, not only legacy fallbacks.

Reproduce the non-invasive smoke check after deployment (it creates, tests, and closes a new CPU room):

```powershell
node scripts/verify-public-session.mjs https://dicetower-rollto100-server.onrender.com <expected-feature-commit>
```

The follow-up verification/checklist commit changes documentation, a diagnostic script and a screenshot only; runtime code remains the feature version above. Deployment restarts disconnect in-memory sessions, so start a new match after refreshing the page. The free Render instance may take time to wake after inactivity; the UI keeps the start request pending until the connection opens.

## World shop and trail safety — 2026-10-13

The shop now shares the arena with the moving character. Four fixed displays show item icons, names, prices and sold slots. WASD or a ground/display click moves the active actor; clicking a display walks toward it but never buys automatically. Within 68 world pixels, E purchases once per distinct press using the same authoritative stock/cost operation. A contextual arena card shows rarity, weapon duration, buff risks, affordability and an optional purchase button. The distant bottom-of-page offer grid has been removed. E near the exit hands off the turn; the existing quick-finish button remains available. Spectators observe the active shop actor but cannot move or purchase. CPU buyers walk into range instead of spending from the entrance. Stock ownership, multiple purchases and three-turn restocking are unchanged.

`SessionState.shop` is an optional, independently copied world snapshot containing floor, actor position, four stable slot positions and the exit. Movement reuses the legal input command, without combat attacks, dashes, hazards or timers in shops. Servers lacking this snapshot receive no shop movement input; the client shows an update notice until a new match uses the updated server. `/health` adds `gameplayVersion: 2` while retaining `presentationVersion: 1`.

The reported immediate deaths were reproducible with thorn-trail/flame-dash buffs: freshly spawned owner hazards could deal damage immediately, and multiple hazard/enemy source IDs could each remove a heart in the same tick. New trails allow 400ms of owner escape time, with dimmed unarmed visuals; thorns are spaced rather than spawned every tick underfoot. Accepted ordinary hits apply one shared 900ms protection interval, shown with a ground ring. Damage intervals use simulation time, expired hazards cannot hit, and fatal ticks stop before stale runtimes can grant rewards or finish another encounter. Hit feedback identifies monster, obstacle or trail damage. Returning to an armed trail still hurts; ghost contact still kills immediately even during protection.

### Verification

All **61 tests in 8 files**, type checking, content validation and the production Pages build pass. Regression coverage includes fresh walking/dashing with both buffs, overlapped enemies/hazards, immunity expiry, expired hazards, returning to a trail, ghost bypass, fatal-tick rewards, distant/inactive/insufficient-funds purchase rejection, held-E debouncing, multiple purchases, shared sold slots, snapshot independence, safe shop movement and CPU approach. A real two-client WebSocket test verifies legal approach plus E purchase and identical shared stock/world snapshots.

Browser checks used only fresh local fixtures, never an existing player's room. At the first display, E bought a 7-coin potion: 120→113 coins, stock 4→3 and potions 3→4. Walking to a second display and pressing E bought flame dash: 113→97 coins and stock 3→2, retaining the three-turn timer. Walking to the exit and pressing E changed to CPU's turn. The isolated two-buff fixture's real Space dash retained all three hearts; ordinary walking, overlapping damage and old-trail return are also covered by the domain tests. Error/warning logs were empty during these checks.

Measured 1024×768 and 390×844 layouts show the shop inside the arena without horizontal overflow. The narrow contextual card retains item, duration/rarity, price and buy control; long descriptions stay on desktop. No mobile touch-control system was added. [World-shop screenshot](playtest/world-shop.jpg).

The production client emits JS **56.69kB / 20.12kB gzip**, CSS **17.84kB / 4.94kB gzip** and the unchanged 13 runtime WebP images. Development-only fixtures, including `?preview=safe-trail`, and original working PNG sheets are not shipped. `scripts/verify-public-session.mjs` checks the new health version and encounter contract; a random shop landing additionally verifies actual server movement, matching slot IDs and safe hearts.
