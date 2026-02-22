import * as Utils from "lib/utils/utils";
import { LayOnHandsBlock, ParsedLayOnHandsBlock } from "lib/types";
import { parse } from "yaml";
import { normalizeResetConfig } from "lib/domains/events";

export interface LayOnHandsState {
  current: number;
}

export const DEFAULT_POINTS = 5;
export const DEFAULT_RESET_ON = [{ event: "long-rest" }];

export function parseLayOnHandsBlock(yamlString: string): ParsedLayOnHandsBlock {
  const def: LayOnHandsBlock = {
    // @ts-expect-error - no viable default for state_key
    state_key: undefined,
    points: DEFAULT_POINTS,
    reset_on: "long-rest",
  };

  const parsed = parse(yamlString);
  const merged = Utils.mergeWithDefaults(parsed, def);

  const normalized: ParsedLayOnHandsBlock = {
    ...merged,
    reset_on: normalizeResetConfig(merged.reset_on),
  };

  return normalized;
}

export function getDefaultLayOnHandsState(block: ParsedLayOnHandsBlock): LayOnHandsState {
  const points = typeof block.points === "string" ? DEFAULT_POINTS : block.points;

  return {
    current: points,
  };
}