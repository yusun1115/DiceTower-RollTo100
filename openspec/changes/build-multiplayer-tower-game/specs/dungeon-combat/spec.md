# Spec Delta

## Purpose

던전 전투는 PC 브라우저에서 플레이어가 직접 조작하는 짧은 탑다운 실시간 전투를 제공하고, 층별 몬스터·장애물·보스·제한 시간으로 턴의 해결 조건을 만든다.

## ADDED Requirements

### Requirement: Active participant controls a real-time dungeon

The system SHALL let the active participant move with keyboard controls, aim with the mouse, attack, and dash inside a top-down dungeon while preventing the inactive participant from controlling that dungeon.

#### Scenario: Human controls a normal floor
- **WHEN** the participant's turn enters a normal floor
- **THEN** keyboard movement, mouse-directed attacks, and dash actions affect that participant's personal dungeon instance in real time

#### Scenario: Inactive participant observes
- **WHEN** the other participant is waiting for their turn
- **THEN** they can observe match status but cannot change the active dungeon's player, monsters, or objects

### Requirement: Shared blueprint with independent combat state

The system SHALL generate the same floor blueprint for both participants while keeping enemy health, defeated state, player health, item durability, and opened chest state independent per participant.

#### Scenario: Same encounter composition
- **WHEN** both participants enter floor 3
- **THEN** each personal instance contains the same map and three goblins even if the first participant already defeated their goblins

#### Scenario: Independent outcome
- **WHEN** one participant takes damage or opens a chest
- **THEN** only that participant's health and reward state changes

### Requirement: Hearts and contact damage

Each participant SHALL start a floor with their current three-heart health state, lose one heart when hit by a damaging monster or obstacle, and enter death resolution when no hearts remain.

#### Scenario: Player is hit
- **WHEN** a monster or obstacle damages a participant with at least one heart
- **THEN** exactly one heart is removed and the participant remains in the dungeon if a heart remains

#### Scenario: All hearts are lost
- **WHEN** a participant loses their last heart
- **THEN** the dungeon ends for that participant and the tower death penalty is applied

### Requirement: Required monsters gate floor completion

The system SHALL require every required monster in a combat floor to be defeated before that floor can resolve normally; optional exploration objects do not need to be collected.

#### Scenario: Monsters remain
- **WHEN** the participant reaches the exit condition while at least one required monster remains
- **THEN** the floor remains active and the next participant's turn does not begin

#### Scenario: All monsters are defeated
- **WHEN** every required monster is defeated
- **THEN** the floor becomes clear and the participant may resolve the turn

### Requirement: Timers summon an invulnerable ghost

The system SHALL use a 90-second timer for normal floors, a 180-second timer for mini-boss floors, and a 300-second timer for the final-boss floor; when the timer expires, an invulnerable ghost SHALL pursue the participant through all obstacles.

#### Scenario: Timer expires
- **WHEN** the floor timer reaches zero before the floor is cleared
- **THEN** an invulnerable ghost appears and begins moving toward the participant without being blocked by obstacles or walls

#### Scenario: Ghost contacts the participant
- **WHEN** the ghost touches the participant
- **THEN** the participant dies immediately regardless of remaining hearts and receives the same 3-floor death penalty as other deaths

#### Scenario: Participant clears before contact
- **WHEN** the participant defeats all required monsters before the ghost touches them
- **THEN** the floor resolves normally and the ghost no longer affects the completed floor

### Requirement: Boss floors provide multi-room encounters

Mini-boss floors and the final-boss floor SHALL use multi-room dungeons and SHALL remain unresolved until the required boss and its required monsters are defeated.

#### Scenario: Mini-boss is defeated
- **WHEN** the participant defeats the mini-boss and all required monsters in a multiple-of-ten floor
- **THEN** the floor resolves and the next turn can begin

#### Scenario: Boss remains alive
- **WHEN** the participant defeats regular monsters but the floor boss remains alive
- **THEN** the floor remains active
