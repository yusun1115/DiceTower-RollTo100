# Spec Delta

## Purpose

아이템 경제는 전투와 탐험을 코인·상자·공유 상점으로 연결하고, 지속 버프와 층수 기반 임시무기를 조합해 위험과 보상이 공존하는 빌드를 제공한다.

## ADDED Requirements

### Requirement: Monsters and chests reward personal coins

The system SHALL award coins from defeated monsters and opened chests to the participant who earned them, and SHALL keep chest locations and reward candidates identical across personal floor instances.

#### Scenario: Monster drops coins
- **WHEN** a participant defeats a monster with a coin reward
- **THEN** the participant's personal coin balance increases by the deterministic reward amount

#### Scenario: Participants open the same chest
- **WHEN** both participants open the matching chest in their respective instances
- **THEN** both receive the same reward candidate and amount independently

### Requirement: Shop stock is shared and restocked

The system SHALL expose one shared inventory for each shop floor, remove a purchased item for both participants, and regenerate the full inventory after three player turns following a purchase.

#### Scenario: First participant buys an item
- **WHEN** 1P buys the first item from the shared shop
- **THEN** that item is unavailable to 2P until the shop inventory is regenerated

#### Scenario: Second participant visits before restock
- **WHEN** 2P enters the same shop before three player turns have elapsed
- **THEN** 2P sees the remaining shared inventory and cannot buy an item already purchased by 1P

#### Scenario: Restock deadline is reached
- **WHEN** three player turns have elapsed after the purchase that started the restock timer
- **THEN** the shop replaces its entire inventory with a new deterministic set visible to both participants

### Requirement: Participants can buy multiple available items

The system SHALL allow a participant to buy multiple available shop items during one shop visit while they have sufficient coins, and SHALL reject only the individual purchase that lacks coins or stock.

#### Scenario: Multiple purchases succeed
- **WHEN** a participant has enough coins for two available items and confirms both purchases
- **THEN** both items are removed from the shared inventory and the participant's balance is reduced by both prices

#### Scenario: Insufficient coins
- **WHEN** a participant tries to buy an item whose price exceeds their current balance
- **THEN** that item remains in stock and the purchase does not change the participant's balance

### Requirement: Consumables and temporary weapons have bounded effects

The system SHALL provide healing potions and temporary weapons as purchasable item types; a healing potion SHALL not raise health above three hearts, and a weapon SHALL expire after its configured number of combat floors.

#### Scenario: Potion heals
- **WHEN** a participant uses a healing potion while below three hearts
- **THEN** their health increases according to the potion effect but never exceeds three hearts

#### Scenario: Weapon expires
- **WHEN** a participant completes the configured number of combat floors for a temporary weapon
- **THEN** that weapon can no longer provide its weapon effect

#### Scenario: Shop floor does not consume weapon duration
- **WHEN** a participant completes a shop visit
- **THEN** no temporary weapon combat-floor duration is consumed

### Requirement: Passive buffs persist and compose

The system SHALL keep purchased passive buffs for the remainder of the match and SHALL resolve their effects through composable triggers, targets, tags, and durations rather than requiring each pair of items to be a separate item type.

#### Scenario: Buff persists across floors
- **WHEN** a participant obtains a passive buff and later changes floors or dies
- **THEN** the buff remains active after the 3-floor death penalty is resolved

#### Scenario: Compatible effects combine
- **WHEN** a participant owns a sword effect and a ranged-projectile effect
- **THEN** their attacks can produce the combined ranged sword-wave behavior defined by those effects

### Requirement: Risk effects can affect their owner

The system SHALL support item effects that can damage or otherwise endanger the owning participant as part of a higher-risk reward, and SHALL apply those effects to the owner when their trigger conditions occur.

#### Scenario: Trail hazard harms its owner
- **WHEN** a participant owns a movement-triggered thorn trail and later crosses their own trail
- **THEN** the trail can damage the participant using the same hazard rules as it uses against monsters
