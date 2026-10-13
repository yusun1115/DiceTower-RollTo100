# Spec Delta

## Purpose

전투 피드백은 공격·대시·피격·처치·회복·보상의 결과를 짧은 시각·음향 반응으로 전달한다. 상대와 CPU의 활성 던전도 같은 기준으로 표현하며, 위험물과 게임 판정이 장식 효과에 가려지지 않도록 한다.

## ADDED Requirements

### Requirement: Accepted attacks and dashes are visible

The client SHALL show directional attack feedback, projectile trails, and dash afterimages for accepted actions in the active dungeon. Success feedback MUST reflect accepted actions rather than every held input or repeated snapshot.

#### Scenario: Attack is held during cooldown
- **WHEN** a participant holds attack while the authority accepts attacks only at its existing cooldown
- **THEN** each accepted attack produces one directional cue and repeated input during cooldown does not create additional accepted-hit feedback

#### Scenario: Dash is accepted
- **WHEN** the authority accepts a dash
- **THEN** a brief afterimage indicates the accepted path without extending the participant's movement distance or invulnerability

### Requirement: Hits and defeats have distinct feedback

The client SHALL mark confirmed enemy damage with a short hit response and damage indication, and mark confirmed defeats with a distinct disappearance or burst. The final hit MUST remain presentable even when the same update also ends the floor.

#### Scenario: Enemy survives a hit
- **WHEN** an enemy takes confirmed damage and remains alive
- **THEN** the enemy briefly reacts and the damage indication appears at its hit position without a defeat cue

#### Scenario: Last enemy dies and the scene resolves
- **WHEN** the last required enemy is defeated and the authority immediately hands off the turn
- **THEN** that final hit and defeat receive a bounded cue tied to the old encounter rather than silently vanishing or appearing on the new opponent's monsters

### Requirement: Player damage and healing are readable

The client SHALL distinguish confirmed player damage, healing, and death through heart changes and brief labeled feedback. Cosmetic hit reactions MUST NOT imply new invulnerability, physical knockback, or extra heart changes.

#### Scenario: Player loses one heart
- **WHEN** a participant drops from three hearts to two after confirmed contact damage
- **THEN** one heart changes, a brief damage response appears, and legal movement remains available

#### Scenario: Potion is used
- **WHEN** the authority consumes a potion and restores one heart
- **THEN** a healing cue accompanies the confirmed heart increase without displaying a damage response

#### Scenario: Fatal hit immediately restores floor-start hearts
- **WHEN** a fatal hit, descent, and heart reset occur in one authoritative update
- **THEN** the client communicates death and descent rather than misidentifying the reset as potion healing

### Requirement: Rewards and purchases are distinguishable

The client SHALL show confirmed chest opening, earned coin amounts, acquired items, purchases, and weapon expiration with concise feedback. Cosmetic coin movement MUST NOT require a new collection action or change when the authority grants rewards.

#### Scenario: Chest opens
- **WHEN** a participant opens a chest that grants coins and an item
- **THEN** the chest changes to its opened appearance and the confirmed coin amount and item are presented once

#### Scenario: Shared item is bought
- **WHEN** one participant buys an available shared item
- **THEN** both clients see its removal, the buyer sees an acquisition cue, and the spent coins are not presented as earned coins

#### Scenario: Temporary weapon expires
- **WHEN** the authority removes a weapon after its last configured combat floor
- **THEN** the HUD returns to the basic attack and briefly identifies the expiration without showing a newly acquired weapon

### Requirement: Spectators see the active dungeon

Both participants SHALL see the current active dungeon and its cosmetic feedback, with a visible distinction between the controlled participant and the observed participant. Inactive participants MUST retain no combat control over that scene.

#### Scenario: CPU is active
- **WHEN** the CPU's turn enters combat
- **THEN** the human sees the CPU's current position, monsters, and accepted attack effects rather than an old human encounter or an empty canvas

#### Scenario: Human opponent is active
- **WHEN** 2P is active and 1P is observing
- **THEN** 1P sees 2P's encounter while their own personal hearts and coins remain distinguishable from the observed participant's information

### Requirement: Hazards take visual priority

The client SHALL keep hostile entities, damaging obstacles, owner-harming trails, and the invulnerable ghost distinguishable from decorative effects. Danger cues MUST include readable labels or shapes rather than relying on color or sound alone.

#### Scenario: Trail damage is possible
- **WHEN** the active participant has an owner-harming thorn trail
- **THEN** visible thorns and a self-damage warning distinguish that trail from a harmless dash afterimage

#### Scenario: Ghost appears
- **WHEN** the timer expires and the authority spawns the invulnerable ghost
- **THEN** a one-time ghost-arrival cue and persistent visible pursuit identify its lethal contact danger without obscuring the escape route

### Requirement: Feedback is cosmetic and bounded

Combat feedback SHALL NOT change collisions, attack cooldowns, enemy health, rewards, timers, or CPU decisions. Transient visuals and sounds MUST expire or be limited so repeated combat does not create an ever-growing backlog.

#### Scenario: Long fight with many effects
- **WHEN** repeated attacks, kills, and trail effects occur throughout a long boss fight
- **THEN** old cosmetic particles and damage labels disappear and overlapping sounds remain bounded while authoritative combat continues unchanged

### Requirement: Confirmed feedback is deduplicated and compatible

The client SHALL consume each confirmed combat event once, ignore unknown optional event kinds safely, and show playable current state when expression events are absent. Initial synchronization MUST NOT replay previous encounters' combat effects.

#### Scenario: Defeat event is repeated
- **WHEN** repeated snapshots include the same defeat event
- **THEN** the defeat burst, reward cue, and sound do not repeat

#### Scenario: Older server has no expression events
- **WHEN** the server sends ordinary snapshots without the optional feedback information
- **THEN** the dungeon remains playable, safe visible state changes can receive conservative feedback, and the client does not fabricate missing attack or kill history
