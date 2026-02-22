import type { ParsedLayOnHandsBlock } from "lib/types";
import { LayOnHandsState } from "lib/domains/layonhands";
import * as LayOnHandsService from "lib/domains/layonhands";
import { useState } from "react";

export type LayOnHandsProps = {
  static: ParsedLayOnHandsBlock;
  state: LayOnHandsState;
  onStateChange: (newState: LayOnHandsState) => void;
};

export function LayOnHandsCard(props: LayOnHandsProps) {
  const [inputValue, setInputValue] = useState("1");

  const maxPoints = typeof props.static.points === "number" ? props.static.points : LayOnHandsService.DEFAULT_POINTS;

  const pointPercentage = Math.max(0, Math.min(100, (props.state.current / maxPoints) * 100));

  const handleHeal = () => {
    const value = parseInt(inputValue) || 0;
    if (value <= 0) return;

    const newCurrent = Math.max(props.state.current - value, 0);
    const newState = {
      ...props.state, current: newCurrent,
    };

    props.onStateChange(newState);
    setInputValue("1");
  }
  
  const handleCure = () => {
    const pointsToHeal = 5;

    const newCurrent = props.state.current - pointsToHeal;
    if (newCurrent < 0) return;

    const newState = {...props.state, current: newCurrent};

    props.onStateChange(newState);
  }

  return (
    <div className="lay-on-hands-card generic-card">
      <div className="lay-on-hands-card-header">
        <div className="generic-card-label">Lay on Hands</div>
        <div className="lay-on-hands-count">
          {props.state.current}
          <span className="lay-on-hands-max">/ {maxPoints}</span>
        </div>
      </div>

      <div className="lay-on-hands-progress-container">
        <div className="lay-on-hands-progress-bar" style={{ width: `${pointPercentage}%` }} />
      </div>

      <div className="lay-on-hands-controls">
        <input
          type="number"
          className="lay-on-hands-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="0"
          aria-label="Healing Points"
        />
        <button type="button" className="lay-on-hands-button lay-on-hands-heal" onClick={handleHeal}>Heal</button>
        <button type="button" className="lay-on-hands-button lay-on-hands-cure" onClick={handleCure}>Cure</button>
      </div>
    </div>  
  );
}