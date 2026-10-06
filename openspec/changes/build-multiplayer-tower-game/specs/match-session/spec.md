# Spec Delta

## Purpose

경기 세션은 온라인 1대1과 CPU 대전을 동일한 규칙으로 운영하고, 공통 경기 정보와 각 플레이어의 독립적인 진행 상태를 안전하게 조정한다.

## ADDED Requirements

### Requirement: Match modes and lobby

The system SHALL support an online room-code match with two human participants and a solo match with one human participant and one CPU opponent.

#### Scenario: Human player joins a room
- **WHEN** a player creates a room and another player submits its room code
- **THEN** both players are placed in the same lobby and the match can start after both are ready

#### Scenario: Player starts a CPU match
- **WHEN** a player selects solo mode and a CPU difficulty
- **THEN** the system creates the opposing participant and starts the same match flow without requiring a second human connection

### Requirement: Alternating active turns

The system SHALL allow only one participant to perform a roll or dungeon action at a time, and SHALL announce the active participant and turn phase to both clients.

#### Scenario: Turn passes after a resolved floor
- **WHEN** the active participant clears a combat floor, finishes shopping, or receives a death resolution
- **THEN** the system makes the other participant active and prevents further actions from the previous turn

#### Scenario: Inactive participant attempts an action
- **WHEN** the inactive participant submits a roll, attack, movement, purchase, or other turn action
- **THEN** the system rejects the action without changing match state

### Requirement: Shared deterministic match seed

The system SHALL assign one match seed that determines shared floor blueprints, encounter composition, chest reward candidates, and initial shop offers while keeping each participant's combat and reward state independent.

#### Scenario: Participants reach the same floor
- **WHEN** both participants enter the same floor at different times
- **THEN** they receive the same map structure, enemy composition, obstacle layout, chest locations, and reward candidates

#### Scenario: One participant clears a floor
- **WHEN** the first participant defeats the floor's monsters
- **THEN** the second participant still receives a fresh instance of that same floor composition when they enter it

### Requirement: Authoritative match state

The session authority SHALL validate turn ownership, dice results, floor transitions, damage, purchases, timers, and victory before broadcasting state changes to clients.

#### Scenario: Client submits an invalid transition
- **WHEN** a client submits a result that does not match the active turn or current phase
- **THEN** the authority rejects it and retains the last valid state

#### Scenario: Valid state transition occurs
- **WHEN** the active participant performs a legal action
- **THEN** the authority records the resulting state and broadcasts the update to both participants

### Requirement: CPU uses the same rules

The CPU participant SHALL use the same legal roll, movement, combat, purchase, damage, and death rules as a human participant, with behavior differences limited to decision quality and reaction difficulty.

#### Scenario: CPU takes a turn
- **WHEN** the CPU becomes the active participant
- **THEN** it rolls, enters its personal dungeon instance, resolves the floor, and passes the turn using the same state transitions as a human

#### Scenario: CPU difficulty changes
- **WHEN** the player selects easy, normal, or hard difficulty
- **THEN** the CPU changes its targeting, dodging, purchase, and item-combination priorities without receiving extra health, dice results, or hidden rewards
