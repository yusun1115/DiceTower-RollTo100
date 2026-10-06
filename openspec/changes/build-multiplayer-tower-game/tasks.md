# Tasks

## 1. Project Foundation and Shared Contracts

- [x] 1.1 Select and document the concrete browser renderer, server runtime, real-time transport, and test runner; verify a clean checkout can install dependencies and run the documented build and test commands.
- [x] 1.2 Bootstrap the client, authoritative session service, shared domain package, and test fixtures without adding mobile or public-matchmaking scope; verify the expected package boundaries and development scripts exist.
- [x] 1.3 Define validated shared contracts for lobby, turn, floor, player state, item, shop, combat event, and match event data; verify malformed client payloads are rejected by contract tests.
- [x] 1.4 Implement deterministic seed derivation for floor blueprints, encounter composition, chest candidates, and shop offers; verify identical match seed and floor number produce identical blueprints while player runtime state remains separate.

## 2. Match Lobby and Authoritative Turn State

- [x] 2.1 Implement room creation, room-code joining, ready state, and two-human lobby start; verify a second valid participant can join and a third participant or unready start is rejected.
- [x] 2.2 Implement solo-mode session creation with easy, normal, and hard CPU selections; verify a human can start without a second network connection and the selected difficulty is stored in session state.
- [x] 2.3 Implement the authoritative session state machine for lobby, roll, floor setup, combat or shop, resolution, next turn, and victory; verify every legal transition and an invalid-phase transition with state-machine tests.
- [x] 2.4 Enforce one active participant and broadcast turn phase, floor, timer, and outcome events to both clients; verify inactive roll, movement, attack, and purchase requests do not mutate state.
- [x] 2.5 Add session-level event ordering and atomic state updates for dice, damage, purchases, timers, and victory; verify conflicting requests resolve in one deterministic order and clients receive the accepted result.

## 3. Tower Progression and Floor Resolution

- [x] 3.1 Implement starting position, server-side d1-to-d6 roll, destination calculation, and the floor-100 cap; verify a floor-99 roll of 6 enters floor 100 and never creates a floor above 100.
- [x] 3.2 Implement deterministic floor classification with multiple-of-ten boss precedence, reserved floor 100 final-boss behavior, normal single-room floors, and random non-boss shop floors; verify classification fixtures for normal, shop, mini-boss, and final-boss floors.
- [x] 3.3 Implement combat-clear, shop-complete, and death-based turn resolution; verify the next participant cannot act before resolution and each resolution passes control exactly once.
- [x] 3.4 Implement the three-floor death penalty with the lowest playable-floor clamp while preserving the participant's items; verify ordinary heart death and ghost death produce the same floor and inventory outcome.
- [x] 3.5 Implement final-boss victory and completed-match locking; verify the first participant who defeats the floor-100 boss is announced as winner and later actions are rejected.
- [x] 3.6 Add progression tests covering repeated turns, floor caps, boss precedence, shop visits, death recovery, and final victory; verify the complete progression fixture passes without a browser client.

## 4. Deterministic Top-Down Dungeon Combat

- [x] 4.1 Build the PC top-down playfield with keyboard movement, mouse aiming, attack input, dash input, camera framing, and basic combat HUD; verify a human can control only the active participant in a local combat fixture.
- [x] 4.2 Implement shared floor blueprints and per-participant combat instances for rooms, walls, obstacles, required monsters, and bosses; verify two participants receive identical floor composition while health, enemy state, and opened-chest state stay independent.
- [x] 4.3 Implement authoritative movement, attack, dash, collision, monster damage, obstacle damage, and three-heart state; verify each valid hit removes one heart and the last-heart transition triggers tower death resolution.
- [x] 4.4 Implement normal single-room encounters, multi-room mini-boss encounters, and the multi-room final-boss encounter with required-monster gating; verify a floor cannot resolve while any required monster or boss remains.
- [x] 4.5 Implement authoritative normal, mini-boss, and final-boss timers; verify the timers use 90, 180, and 300 seconds respectively and stop when the floor resolves.
- [x] 4.6 Implement the invulnerable ghost with obstacle-ignoring pursuit, contact instant death, warning presentation, and reuse of normal death resolution; verify the ghost cannot be damaged and a pre-contact clear cancels its effect.
- [x] 4.7 Add combat simulation tests for movement, damage, clear gating, boss gating, timer expiry, ghost collision, and independent instances; verify deterministic replay from a seed reproduces the same encounter setup.

## 5. Coins, Chests, Shops, and Item Effects

- [x] 5.1 Define data-driven item, trigger, target, effect, duration, tag, risk, price, rarity, and reward schemas; verify invalid combinations and missing required fields fail content validation.
- [x] 5.2 Implement deterministic monster coin drops and personal chest rewards using shared chest locations, candidates, and amounts; verify both participants can independently collect matching rewards without changing the other participant's balance.
- [x] 5.3 Implement session-shared shop inventory, atomic purchases, multi-item visits, insufficient-coin handling, and the three-player-turn restock timer; verify a purchased item disappears for both participants and a full deterministic restock occurs on schedule.
- [x] 5.4 Implement healing potions with a three-heart cap and personal coin/item balances; verify potion use cannot exceed three hearts and an invalid purchase or use leaves state unchanged.
- [x] 5.5 Implement temporary weapon durability measured in combat floors, including one-floor high-power and five-floor ordinary fixtures; verify shop floors do not consume durability and expiration removes the weapon effect.
- [x] 5.6 Implement match-persistent passive buffs and composable trigger/tag effects for projectile sword waves, movement trails, and owner-harming hazards; verify compatible effects combine and risk effects can damage their owner.
- [x] 5.7 Add item economy tests for deterministic rewards, shared-stock conflicts, restock timing, multi-purchase transactions, durability, persistence through death, and synergy examples; verify all tests run against both a human and CPU participant state.

## 6. CPU Behavior and Difficulty Policies

- [x] 6.1 Implement the normal CPU policy using the same legal roll, movement, attack, dash, clear, purchase, and death commands as a human; verify CPU actions pass the same authoritative validation path.
- [x] 6.2 Implement easy and hard policies by changing decision quality, reaction timing, dodge behavior, purchase priorities, and synergy use without changing health, dice, rewards, or hidden information; verify difficulty comparison fixtures show behavior differences with identical rules.
- [x] 6.3 Add CPU combat and economy tests for target selection, obstacle avoidance, shop purchases, temporary weapon use, persistent buffs, and ghost avoidance; verify CPU turns resolve and pass control like human turns.

## 7. Client Flow, Presentation, and Integration Verification

- [x] 7.1 Build lobby, room-code, ready, CPU difficulty, turn, tower, heart, coin, item, shop, timer, ghost, boss, and victory UI states; verify each authoritative event produces the corresponding visible state.
- [x] 7.2 Add clear visual and audio warnings for boss floors, low hearts, timer expiry, ghost arrival, death penalty, shop restock, and final victory; verify warnings appear and clear in the correct state transitions.
- [x] 7.3 Connect two browser clients to one online session and connect one client to a CPU session; verify shared floor composition, independent dungeon outcomes, shared shop stock, alternating turns, and winner declaration in a scripted end-to-end match.
- [x] 7.4 Add developer documentation for local client/server startup, deterministic seed fixtures, test commands, room-code playtest flow, and known non-goals; verify a fresh developer can follow the documented commands successfully.
- [x] 7.5 Run the full validation, unit, simulation, and end-to-end suites; verify OpenSpec requirements are covered and no client-only action can bypass authoritative turn, damage, shop, or victory checks.
