import * as Utils from "lib/utils/utils";
import { PoolBlock, ParsedPoolBlock, UnresolvedPoolBlock } from "lib/types";
import { parse } from "yaml";
import { normalizeResetConfig } from "lib/domains/events";

export interface PoolState {
  current: number;
}

export function parsePoolBlock(yamlString: string): UnresolvedPoolBlock {
  const def: PoolBlock = {
    label: "Pool Consumable",
    // @ts-expect-error - no viable default for state_key
    state_key: undefined,
    points: 6,
    reset_on: "long-rest", 
  };

  const parsed = parse(yamlString);
  const merged = Utils.mergeWithDefaults(parsed, def);

  // Normalize reset_on to always be an array of ResetConfig objects
  const normalized: UnresolvedPoolBlock = {
    ...merged,
    reset_on: normalizeResetConfig(merged.reset_on),
  };

  return normalized;
}

export function getDefaultPoolState(block: ParsedPoolBlock): PoolState {
  const points = typeof block.points === "string" ? 6 : block.points; // Default fallback if health is still a string

  return {
    current: points,
  };
}