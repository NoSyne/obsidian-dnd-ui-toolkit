<script setup lang="ts">
import { ref, computed } from "vue";
import type { ParsedPoolBlock } from "lib/types";
import { PoolState } from "lib/domains/pool-consumables";

const props = defineProps<{
  static: ParsedPoolBlock;
  state: PoolState;
}>();
 
const emit = defineEmits<{
  "update:state": [newState: PoolState];
}>();

const inputValue = ref("1");

const maxPool = computed(() => (typeof props.static.points === "number" ? props.static.points : 6));

const pointPercentage = computed(() => Math.max(0, Math.min(100, (props.state.current / maxPool.value) * 100)));

function handleHeal() {
  const value = parseInt(inputValue.value) || 0;
  if (value <= 0) return;

  const newPoints = props.state.current - value;
  if (newPoints < 0) {
    return;
  }

  const newState: PoolState = {
    ...props.state,
    current: newPoints,
  };
  emit("update:state", newState);
}

function handleCure() {
  const newPoints = props.state.current - 5;
  if (newPoints < 0) {
    return;
  }

  const newState: PoolState = {
    ...props.state,
    current: newPoints,
  };
  emit("update:state", newState);
}
</script>

<template>
  <div class="dnd-ui-health-card dnd-ui-generic-card">
    <div class="dnd-ui-health-card-header">
      <div class="dnd-ui-generic-card-label">{{ props.static.label || "Consumable Pool" }}</div>
      <div class="dnd-ui-health-value">
        {{ props.state.current }}
        <span class="dnd-ui-health-max">/ {{ maxPool }}</span>
      </div>
    </div>

    <div class="dnd-ui-health-progress-container">
      <div class="dnd-ui-health-progress-bar" :style="{ width: `${pointPercentage}%` }" />
    </div>

    <div class="dnd-ui-health-controls">
      <input
        type="number"
        class="dnd-ui-health-input"
        :value="inputValue"
        placeholder="0"
        aria-label="Pool points"
        @input="inputValue = ($event.target as HTMLInputElement).value"
      />
      <button type="button" class="dnd-ui-health-button dnd-ui-health-heal" @click="handleHeal">Heal</button>
      <button type="button" class="dnd-ui-health-button dnd-ui-health-heal" @click="handleCure">Cure</button>
    </div>
  </div>
</template>
