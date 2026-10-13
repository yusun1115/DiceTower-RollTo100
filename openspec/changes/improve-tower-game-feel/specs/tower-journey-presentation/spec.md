# Spec Delta

## Purpose

탑 여정 연출은 주사위 결과와 실제 이동 층을 연결하고 두 플레이어의 진행을 비교할 수 있게 한다. 층 진입·턴 교대·클리어·사망·승패에 짧은 반응을 제공해 서버가 확정한 경기 흐름을 시각적으로 이해하게 한다.

## ADDED Requirements

### Requirement: Immediate dice request feedback

The client SHALL show a rolling cue immediately after a legal roll activation, expose a pending state, and allow at most one roll request per unresolved activation.

#### Scenario: Player activates the dice repeatedly
- **WHEN** the active participant activates the roll control several times before the authority responds
- **THEN** one request is submitted, the die visibly starts rolling, and subsequent activations do not submit additional requests

#### Scenario: Roll response is delayed
- **WHEN** no accepted or rejected result arrives within two seconds
- **THEN** the client replaces continuous tumbling with a readable waiting indication without inventing a result or automatically repeating the request

### Requirement: Dice settles on the authoritative result

The client SHALL settle the die on the accepted value from 1 through 6, label the rolling participant, and distinguish that value from the destination floor. A rejected action or lost connection MUST end the pending cue without displaying a successful landing.

#### Scenario: Accepted result arrives
- **WHEN** the authority confirms that 1P rolled a 4 and entered floor 16
- **THEN** both participants see a die showing 4 and a floor-16 destination associated with 1P

#### Scenario: Authority rejects the request
- **WHEN** the roll is rejected because the turn or phase changed
- **THEN** the rolling cue stops, the rejection is readable, and no travel or reward cue is played for that activation

### Requirement: Capped floor travel presentation

The client SHALL present travel from the confirmed source floor to the confirmed destination, capped at 100, and SHALL animate only the destination encounter rather than encounters on skipped floors.

#### Scenario: Roll exceeds the tower
- **WHEN** a participant on floor 99 rolls a 6
- **THEN** the die shows 6, the floor display and participant marker move from 99 to 100, and no floor above 100 is shown

#### Scenario: Travel passes a mini-boss floor
- **WHEN** a participant moves from floor 8 to floor 13
- **THEN** travel passes the floor-10 milestone without showing a mini-boss encounter announcement for floor 10

### Requirement: Visible race progress for both participants

The interface SHALL show both participants' confirmed floors on a compact tower progress display with visible ten-floor milestones and a distinct floor-100 goal. Participant identity MUST remain readable when both are on the same floor.

#### Scenario: Participants share a floor
- **WHEN** 1P and 2P are both on floor 20
- **THEN** two separately labeled markers remain visible at floor 20 rather than hiding one participant behind the other

### Requirement: Recognizable destination announcements

The client SHALL distinguish normal, shop, mini-boss, and final-boss destinations through labeled arrival cues. The normal post-confirmation dice-and-travel sequence MUST finish within one second and MUST preserve immediate access to a confirmed combat or shop phase.

#### Scenario: Shop destination is confirmed
- **WHEN** the authority enters a shop floor
- **THEN** a shop arrival cue appears and purchases remain accessible while the cue plays

#### Scenario: Boss destination is confirmed
- **WHEN** the authority enters floor 10 or floor 100
- **THEN** a mini-boss or final-boss label appears respectively without obscuring the active player or delaying legal movement

### Requirement: Clear and turn handoff feedback

The client SHALL distinguish a cleared floor from a new active turn, identify the incoming participant, and keep the next legal action available while nonmodal handoff feedback plays.

#### Scenario: Clear and handoff arrive together
- **WHEN** a single update confirms a floor clear and makes the other participant active
- **THEN** a clear cue identifies the outgoing participant and floor, and the incoming participant receives an unambiguous turn indication without waiting for the cue to end

### Requirement: Death and victory have distinct outcomes

The client SHALL show the authority's actual floor descent on death and an explicit winning participant on match completion. Reaching floor 100 alone MUST NOT produce a victory cue.

#### Scenario: Death near the bottom of the tower
- **WHEN** a participant dies on floor 2 and the authority places them on floor 1
- **THEN** the descent displays 2 to 1 rather than an invented negative floor or a completed dungeon

#### Scenario: Participant enters the final-boss floor
- **WHEN** a participant reaches floor 100 and the final boss remains alive
- **THEN** the client shows a final-boss arrival cue and an ongoing match rather than victory

#### Scenario: Final boss is defeated
- **WHEN** the authority declares a winner
- **THEN** the result view identifies that winner once and takes priority over an ordinary clear or next-turn announcement

### Requirement: Journey cues survive synchronization safely

The client SHALL replay each confirmed journey event at most once during continuous observation, show current state without replaying history on initial synchronization, and discard outdated travel cues when a newer turn or terminal outcome supersedes them.

#### Scenario: Duplicate state contains the same roll
- **WHEN** several updates contain the same accepted roll event
- **THEN** the die landing, travel cue, and landing sound occur once

#### Scenario: Page becomes visible after a later turn
- **WHEN** a hidden page resumes after the active participant or encounter changed
- **THEN** it shows the current turn and floor without replaying old travel sequences over the new encounter

### Requirement: Cosmetic timing preserves game authority

Presentation duration SHALL NOT alter dice values, health, combat timers, turn ownership, shop inventory, or victory. Arrival and handoff cues MUST keep the live playfield visible and MUST NOT block legal combat input.

#### Scenario: Participant moves during arrival
- **WHEN** a combat floor is already authoritative and its arrival cue is still playing
- **THEN** legal movement and aiming continue, the timer follows the authority, and the cue does not cover the player or nearest hazards
