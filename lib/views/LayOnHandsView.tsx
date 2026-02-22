import { App, MarkdownPostProcessorContext } from "obsidian";
import { BaseView } from "./BaseView";
import { LayOnHandsCard } from "lib/components/lay-on-hands";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { KeyValueStore } from "lib/services/kv/kv";
import { useFileContext, FileContext } from "./filecontext";
import { ReactMarkdown } from "./ReactMarkdown";
import { createTemplateContext, hasTemplateVariables, processTemplate } from "lib/utils/template";
import { ParsedLayOnHandsBlock } from "lib/types";
import * as LayOnHandsService from "lib/domains/layonhands";
import { LayOnHandsState } from "lib/domains/layonhands";
import { msgbus } from "lib/services/event-bus";
import { shouldResetOnEvent } from "lib/domains/events";

export class LayOnHandsView extends BaseView {
  public codeblock = "layonhands";
  private kv: KeyValueStore;
  
  constructor(app: App, kv: KeyValueStore) {
    super(app);
    this.kv = kv;
  }
  
  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const layOnHandsMarkdown = new LayOnHandsMarkdown(el, source, this.kv, ctx.sourcePath, ctx, this);
    ctx.addChild(layOnHandsMarkdown);
  }
}

class LayOnHandsMarkdown extends ReactMarkdown {
  private source: string;
  private kv: KeyValueStore;
  private filePath: string;
  private fileContext: FileContext;
  private currentLayOnHandsBlock: ParsedLayOnHandsBlock | null = null;
  private originalPointsValue: number | string;

  constructor(
    el: HTMLElement,
    source: string,
    kv: KeyValueStore,
    filePath: string,
    ctx: MarkdownPostProcessorContext,
    baseView: BaseView
  ) {
    super(el);
    this.source = source;
    this.kv = kv;
    this.filePath = filePath;
    this.fileContext = useFileContext(baseView.app, ctx);
    this.originalPointsValue = LayOnHandsService.parseLayOnHandsBlock(this.source).points;
  }

  async onload() {
    this.setupFrontmatterChangeListener();

    await this.processAndRender();
  }

  private async processAndRender() {
    let layOnHandsBlock = LayOnHandsService.parseLayOnHandsBlock(this.source);

    layOnHandsBlock = this.processTemplateInLayOnHandsBlock(layOnHandsBlock);
    this.currentLayOnHandsBlock = layOnHandsBlock;

    const stateKey = layOnHandsBlock.state_key;
    if (!stateKey) {
      throw new Error("Lay on Hands block must contain a 'state_key' property.");
    }

    const defaultState = LayOnHandsService.getDefaultLayOnHandsState(layOnHandsBlock);

    try {
      const savedState = await this.kv.get<LayOnHandsState>(stateKey);
      const layOnHandsState = savedState || defaultState;

      if (!savedState) {
        try {
          await this.kv.set(stateKey, defaultState);
        } catch (error) {
          console.error("Error saving initial lay on hands state: ", error);
        }
      }

      this.setupEventSubscription(layOnHandsBlock);

      this.renderComponent(layOnHandsBlock, layOnHandsState);
    } catch (error) {
      console.error("Error loading lay on hands state: ", error);

      this.setupEventSubscription(layOnHandsBlock);

      this.renderComponent(layOnHandsBlock, defaultState);
    }
  }

  private setupEventSubscription(layOnHandsBlock: ParsedLayOnHandsBlock) {
    const resetOn = layOnHandsBlock.reset_on || LayOnHandsService.DEFAULT_RESET_ON;

    this.addUnloadFn(
      msgbus.subscribe(this.filePath, "reset", (resetEvent) => {
        if (shouldResetOnEvent(resetOn, resetEvent.eventType)) {
          console.debug(`Resetting lay on hands ${layOnHandsBlock.state_key} due to ${resetEvent.eventType} event`);
          this.handleResetEvent(layOnHandsBlock);
        }
      })
    )
  }

  private async handleResetEvent(layOnHandsBlock: ParsedLayOnHandsBlock) {
    const stateKey = layOnHandsBlock.state_key;
    if (!stateKey) return;

    try {
      const maxPoints = typeof layOnHandsBlock.points === "number" ? layOnHandsBlock.points : LayOnHandsService.DEFAULT_POINTS;

      const resetState: LayOnHandsState = {
        current: maxPoints,
      };

      await this.kv.set(stateKey, resetState);

      this.renderComponent(layOnHandsBlock, resetState);
    } catch (error) {
      console.error(`Error resetting health state for ${stateKey}: `, error);
    }
  }

  private setupFrontmatterChangeListener() {
    this.addUnloadFn(
      this.fileContext.onFrontmatterChange(() => {
        // Only re-process if we have template variables in the original health value
        if (typeof this.originalPointsValue === "string" && hasTemplateVariables(this.originalPointsValue)) {
          console.debug(`Frontmatter changed for ${this.filePath}, re-processing health template`);
          this.handleFrontmatterChange();
        }
      })
    );
  }

  private async handleFrontmatterChange() {
    if (!this.currentLayOnHandsBlock) return;

    try {
      const updatedLayOnHandsBlock = this.processTemplateInLayOnHandsBlock({
        ...this.currentLayOnHandsBlock,
        points: this.originalPointsValue
      });

      const oldPoints = typeof this.currentLayOnHandsBlock.points === "number" ? this.currentLayOnHandsBlock.points : LayOnHandsService.DEFAULT_POINTS;
      const newPoints = typeof updatedLayOnHandsBlock.points === "number" ? updatedLayOnHandsBlock.points : LayOnHandsService.DEFAULT_POINTS;

      if (oldPoints === newPoints) return;

      console.debug(`Points value changed from ${oldPoints} to ${newPoints}, updating max health`);

      this.currentLayOnHandsBlock = updatedLayOnHandsBlock;

      // Get current state and re-render with new max health
      const stateKey = updatedLayOnHandsBlock.state_key;
      if (stateKey) {
        try {
          const currentState = await this.kv.get<LayOnHandsState>(stateKey);
          if (currentState) {
            this.renderComponent(updatedLayOnHandsBlock, currentState);
          }
        } catch (error) {
          console.error("Error loading state during frontmatter update:", error);
        }
      }
    } catch (error) {
      console.error("Error handling frontmatter change: ", error);
    }
  }

  private renderComponent(layOnHandsBlock: ParsedLayOnHandsBlock, state: LayOnHandsState) {
    const stateKey = layOnHandsBlock.state_key;
    if (!stateKey) return;

    const data = {
      static: layOnHandsBlock,
      state: state,
      onStateChange: (newState: LayOnHandsState) => {
        this.handleStateChange(layOnHandsBlock, newState);
        this.renderComponent(layOnHandsBlock, newState);
      },
    };

    if (!this.reactRoot) {
      this.reactRoot = ReactDOM.createRoot(this.containerEl);
    }

    this.reactRoot.render(React.createElement(LayOnHandsCard, data));
  }

  private async handleStateChange(layOnHandsBlock: ParsedLayOnHandsBlock, newState: LayOnHandsState) {
    const stateKey = layOnHandsBlock.state_key;
    if (!stateKey) return;

    try {
      await this.kv.set(stateKey, newState);
    } catch (error) {
      console.error(`Error saving lay on hands state for ${stateKey}: `, error);
    }
  }

  private processTemplateInLayOnHandsBlock(layOnHandsBlock: ParsedLayOnHandsBlock): ParsedLayOnHandsBlock {
    if (typeof layOnHandsBlock.points === "string" && hasTemplateVariables(layOnHandsBlock.points)) {
      const templateContext = createTemplateContext(this.containerEl, this.fileContext);
      const processedPoints = processTemplate(layOnHandsBlock.points, templateContext);
      const pointsValue = parseInt(processedPoints);

      if (!isNaN(pointsValue)) {
        return { ...layOnHandsBlock, points: pointsValue };
      } else {
        console.warn(
          `Template processed points value "${pointsValue}" is not a valid number, using original value`
        );
      }
    }
    return layOnHandsBlock;
  }
}