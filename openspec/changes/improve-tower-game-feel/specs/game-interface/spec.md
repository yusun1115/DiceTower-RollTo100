# Spec Delta

## Purpose

게임 인터페이스는 메뉴·던전·HUD를 석조 탑의 테마로 통일하고 중요한 정보와 조작을 일관되게 전달한다. 작은 화면, 효과음 제한, reduced-motion, 리소스 실패 상황에서도 현재 경기와 다음 행동을 읽을 수 있게 한다.

## ADDED Requirements

### Requirement: Coherent tower visual identity

The menu, dice, HUD, and arena SHALL share a dark stone-and-gold fantasy identity with distinguishable participant markers and recognizable player, enemy, boss, chest, and hazard appearances. Text and actionable controls MUST remain legible over themed backgrounds.

#### Scenario: Player enters a dungeon from the menu
- **WHEN** a participant starts a match and enters a floor
- **THEN** the menu and play view share the same visual language, and the player, monsters, obstacles, and chests are identifiable without reading debug IDs

### Requirement: Stable interactive controls

Legal controls SHALL remain focusable and activatable during continuous state updates. A press and release spanning an ordinary state refresh MUST still activate the intended control once when that action remains legal.

#### Scenario: Ready is pressed during frequent updates
- **WHEN** a participant presses and releases the ready control while lobby snapshots continue arriving
- **THEN** the ready action is submitted once and the focused control is not lost because an equivalent snapshot arrived

#### Scenario: Shop updates while a control has focus
- **WHEN** a legal shop control remains available across a stock update
- **THEN** it retains keyboard usability and does not redirect activation to a different item

### Requirement: Playfield-first information hierarchy

The play view SHALL prioritize the arena, active turn, hearts, confirmed floor, coins, weapon duration, and race progress. Logs and full instructions MUST be secondary or collapsible, and transient announcements MUST keep the center of live combat clear.

#### Scenario: Active combat with an announcement
- **WHEN** a combat floor is running and a boss or turn cue is visible
- **THEN** the active player, nearby enemies, hazards, and timer remain readable and no full-screen interstitial blocks the playfield

### Requirement: Explicit mode and turn status

The interface SHALL clearly identify CPU or online mode, readiness, the active participant, and the next legal action. It MUST distinguish waiting for an opponent from waiting for a server response.

#### Scenario: Only one online participant is ready
- **WHEN** 1P is ready but the online opponent is not ready
- **THEN** the interface shows readiness and opponent waiting, and explains why rolling is unavailable

#### Scenario: Opponent can roll
- **WHEN** the other participant owns the roll phase
- **THEN** the observer sees whose turn it is and a disabled roll control rather than an instruction to roll themselves

### Requirement: Human-readable item information

Items SHALL be presented by localized names with recognizable icons or fallback symbols, visible rarity, and concise effects. Temporary weapons MUST show remaining combat floors, and owner-harming items MUST disclose their risk before purchase and while equipped.

#### Scenario: Player inspects a one-floor weapon
- **WHEN** the shop offers a powerful weapon with one combat floor of duration
- **THEN** its localized name, cost, rarity, and one-floor duration are visible before purchase

#### Scenario: Owner-harming passive is equipped
- **WHEN** the participant owns the thorn-trail passive
- **THEN** the HUD identifies its self-damage risk and the item description does not imply a purely beneficial movement effect

### Requirement: Sound preferences and activation

Players SHALL be able to mute effect sounds independently of gameplay. Sounds MUST start only when browser audio permission allows them, persist the mute preference when local storage is available, and have visual equivalents when audio cannot play.

#### Scenario: Sound is muted
- **WHEN** a player disables effect sounds and then rolls, attacks, or obtains a reward
- **THEN** visual feedback remains available, no effect sound plays, and the preference survives a page refresh when storage is available

#### Scenario: Browser suspends audio
- **WHEN** the browser has not allowed the audio context to play
- **THEN** the game remains usable without errors and a later deliberate interaction can enable allowed sound

### Requirement: Reduced motion preserves information

The client SHALL honor browser reduced-motion preferences and a local reduced-effects control. Reduced mode MUST remove tumbling, camera shake, large travel motion, and decorative particles while retaining readable dice results, destinations, danger, rewards, and outcomes.

#### Scenario: Browser requests reduced motion
- **WHEN** reduced motion is requested before loading the page
- **THEN** dice and travel use static or short opacity feedback, no camera shake occurs, and results and next legal actions remain clear

#### Scenario: Preference changes during a cue
- **WHEN** the player enables reduced effects while a journey cue is active
- **THEN** strong motion stops promptly and the confirmed result remains visible without repeating the action

### Requirement: Responsive and keyboard-readable layout

The interface SHALL keep the arena and essential controls usable at desktop viewports of 1024 by 768 and 1280 by 720, adapt without horizontal overflow on narrower screens, and expose visible focus and accessible names for its controls. This capability does not add touch combat controls.

#### Scenario: Compact desktop viewport
- **WHEN** the player uses a 1024 by 768 viewport
- **THEN** the dice action and essential HUD remain reachable without unrelated large panels pushing the entire arena out of view

#### Scenario: Narrow viewport or keyboard navigation
- **WHEN** the layout narrows or the player moves focus with the keyboard
- **THEN** controls remain named, focus remains visible, and the layout does not create horizontal page overflow

### Requirement: Assets and preferences fail gracefully

Missing images, unavailable local storage, or unsupported cosmetic information SHALL NOT prevent joining, readiness, rolling, combat, or shopping. The client MUST provide readable replacement visuals and usable default preferences.

#### Scenario: Sprite or icon fails to load
- **WHEN** a decorative image, die sheet, or character image cannot load
- **THEN** a recognizable fallback appears and gameplay controls remain active without waiting indefinitely for that asset

#### Scenario: Local storage is unavailable
- **WHEN** preference storage throws or is disabled
- **THEN** sound and reduced-effects controls still work for the current page session without blocking gameplay
