# Spec Delta

## Purpose

탑 진행은 주사위와 턴 규칙으로 두 플레이어의 층 위치를 관리하고, 일반층·보스층·상점층을 거쳐 100층 최종 승자를 결정한다.

## ADDED Requirements

### Requirement: Dice-driven floor advancement

The system SHALL roll a value from 1 through 6 for the active participant and set the destination floor to the current floor plus that value, capped at floor 100.

#### Scenario: Normal dice movement
- **WHEN** a participant on floor 12 rolls a 4
- **THEN** the participant enters floor 16 and the floor encounter begins

#### Scenario: Roll would exceed the tower
- **WHEN** a participant on floor 99 rolls a 6
- **THEN** the participant enters floor 100 rather than a floor above 100

### Requirement: Floor type selection

The system SHALL classify each destination floor as a normal floor, a shop floor, a mini-boss floor, or the final-boss floor, with boss classifications taking precedence over random shop selection.

#### Scenario: Normal floor
- **WHEN** a destination is not a multiple of 10 and is not selected as a shop floor
- **THEN** the participant enters a single-screen combat dungeon

#### Scenario: Mini-boss floor
- **WHEN** a destination is 10, 20, 30, or another multiple of 10 below 100
- **THEN** the participant enters a multi-room mini-boss dungeon

#### Scenario: Final-boss floor
- **WHEN** a participant reaches floor 100
- **THEN** the participant enters the multi-room final-boss dungeon

#### Scenario: Shop floor
- **WHEN** a non-boss destination is selected as a shop floor
- **THEN** the participant enters a non-combat shop and does not need to defeat monsters to resolve the floor

### Requirement: Floor resolution controls the next turn

The system SHALL keep the active participant's turn open until the destination floor is cleared, shopping is finished, or a death resolution is applied.

#### Scenario: Combat floor is cleared
- **WHEN** every required monster on the active participant's floor is defeated
- **THEN** the floor is resolved and the other participant becomes active

#### Scenario: Shop visit is finished
- **WHEN** the active participant exits the shop or confirms that shopping is complete
- **THEN** the shop floor is resolved and the other participant becomes active

#### Scenario: Participant dies on a floor
- **WHEN** the active participant reaches a death condition
- **THEN** their floor becomes the current floor minus 3, clamped to the lowest playable floor, and the other participant becomes active

### Requirement: First final-boss defeat wins

The system SHALL end the match when a participant defeats the floor-100 final boss and SHALL declare that participant the winner.

#### Scenario: Participant defeats the final boss
- **WHEN** a participant defeats the final boss on floor 100
- **THEN** the match enters a completed state and that participant is announced as the winner

#### Scenario: Final boss remains alive
- **WHEN** a participant reaches floor 100 but has not defeated its final boss
- **THEN** the match remains active and the participant cannot claim victory
