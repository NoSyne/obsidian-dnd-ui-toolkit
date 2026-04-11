---
level: 7
proficiency_bonus: 3
---

# Pool

Tests the `pool-consumable` code block which tracks consumables which work with a pool, like the Lay On Hands feature. Each component needs a unique `state_key`.

## Lay on Hands

Lay on Hands with default settings.

```pool-consumable
state_key: test_health_basic
points: '{{ multiply 5 frontmatter.level }}'
hitdice:
  dice: d10
  value: 5
```

## Event Buttons for Reset

Use these buttons to test rest-based HP reset.

```event-btns
items:
  - name: Short Rest
    value: short-rest
  - name: Long Rest
    value: long-rest
```
