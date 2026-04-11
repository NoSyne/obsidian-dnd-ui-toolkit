import { ref } from "vue";
import { BaseView } from "./BaseView";
import { App, MarkdownPostProcessorContext } from "obsidian";
import * as PoolConsumableService from "lib/domains/pool-consumables";
import PoolConsumableCard from "lib/components/PoolConsumableCard.vue";
import { KeyValueStore } from "lib/services/kv/kv";
import { PoolState } from "lib/domains/pool-consumables";
import { ParsedPoolBlock, UnresolvedPoolBlock } from "lib/types";
import { msgbus } from "lib/services/event-bus";
import { hasTemplateVariables, processTemplate, createTemplateContext } from "lib/utils/template";
import { useFileContext, FileContext } from "./filecontext";
import { shouldResetOnEvent } from "lib/domains/events";
import { VueMarkdown } from "./VueMarkdown";

export class PoolConsumableView extends BaseView {
  public codeblock = "pool-consumable";

  private kv: KeyValueStore;

  constructor(app: App, kv: KeyValueStore) {
    super(app);
    this.kv = kv;
  }

  public render(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    const healthMarkdown = new PoolConsumableMarkdown(el, source, this.kv, ctx.sourcePath, ctx, this);
    ctx.addChild(healthMarkdown);
  }
}

class PoolConsumableMarkdown extends VueMarkdown {
  private source: string;
  private kv: KeyValueStore;
  private filePath: string;
  private fileContext: FileContext;
  private currentPoolBlock: ParsedPoolBlock | null = null;
  private originalPoolValue: number | string;
  private originalHitdiceValues: Map<string, number | string> = new Map();
  private propsRef = ref<Record<string, unknown>>({});
  private mounted = false;

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

    const parsed = PoolConsumableService.parsePoolBlock(this.source);
    this.originalPoolValue = parsed.points;
  }

  async onload() {
    this.setupFrontmatterChangeListener();
    await this.processAndRender();
  }

  private async processAndRender() {
    const unresolvedBlock = PoolConsumableService.parsePoolBlock(this.source);

    const poolBlock = this.processTemplates(unresolvedBlock);
    this.currentPoolBlock = poolBlock;

    const stateKey = poolBlock.state_key;
    if (!stateKey) {
      throw new Error("Pool block must contain a 'state_key' property.");
    }

    const defaultState = PoolConsumableService.getDefaultPoolState(poolBlock);

    try {
      const savedState = await this.kv.get<PoolState>(stateKey);
      const poolState = savedState || defaultState;

      if (savedState) {
        if (poolState !== savedState) {
          try {
            await this.kv.set(stateKey, poolState);
          } catch (error) {
            console.error("Error saving migrated pool state:", error);
          }
        }
      } else {
        try {
          await this.kv.set(stateKey, defaultState);
        } catch (error) {
          console.error("Error saving initial pool state:", error);
        }
      }

      this.setupEventSubscription(poolBlock);
      this.renderComponent(poolBlock, poolState);
    } catch (error) {
      console.error("Error loading pool state:", error);
      this.setupEventSubscription(poolBlock);
      this.renderComponent(poolBlock, defaultState);
    }
  }

  private processTemplates(poolBlock: UnresolvedPoolBlock): ParsedPoolBlock {
    let points: number | string = poolBlock.points;

    // Process health template
    if (typeof points === "string" && hasTemplateVariables(points)) {
      const templateContext = createTemplateContext(this.containerEl, this.fileContext);
      const processedPool = processTemplate(points, templateContext);
      const healthValue = parseInt(processedPool, 10);

      if (!isNaN(healthValue)) {
        points = healthValue;
      } else {
        console.warn(
          `Template processed health value "${processedPool}" is not a valid number, using original value`
        );
      }
    }

    return { ...poolBlock, points: points };
  }

  private hasTemplateValues(): boolean {
    if (typeof this.originalPoolValue === "string" && hasTemplateVariables(this.originalPoolValue)) {
      return true;
    }
    for (const v of this.originalHitdiceValues.values()) {
      if (typeof v === "string" && hasTemplateVariables(v)) {
        return true;
      }
    }
    return false;
  }

  private setupFrontmatterChangeListener() {
    this.addUnloadFn(
      this.fileContext.onFrontmatterChange(() => {
        if (this.hasTemplateValues()) {
          console.debug(`Frontmatter changed for ${this.filePath}, re-processing health templates`);
          this.handleFrontmatterChange();
        }
      })
    );
  }

  private setupEventSubscription(poolBlock: ParsedPoolBlock) {
    const resetOn = poolBlock.reset_on || [{ event: "long-rest" }];

    this.addUnloadFn(
      msgbus.subscribe(this.filePath, "reset", (resetEvent) => {
        if (shouldResetOnEvent(resetOn, resetEvent.eventType)) {
          console.debug(`Resetting pool ${poolBlock.state_key} due to ${resetEvent.eventType} event`);
          this.handleResetEvent(poolBlock);
        }
      })
    );
  }

  private async handleFrontmatterChange() {
    if (!this.currentPoolBlock) return;

    try {
      // Reconstruct unresolved block with original template values
      const updatedPoolBlock = this.processTemplates({
        ...this.currentPoolBlock,
        points: this.originalPoolValue,
      });

      const oldPool = typeof this.currentPoolBlock.points === "number" ? this.currentPoolBlock.points : 6;
      const newPool = typeof updatedPoolBlock.points === "number" ? updatedPoolBlock.points : 6;

      if (oldPool !== newPool) {
        console.debug(`Pool block changed, re-rendering`);

        this.currentPoolBlock = updatedPoolBlock;

        const stateKey = updatedPoolBlock.state_key;
        if (stateKey) {
          try {
            const currentState = await this.kv.get<PoolState>(stateKey);
            if (currentState) {
              this.renderComponent(updatedPoolBlock, currentState);
            }
          } catch (error) {
            console.error("Error loading state during frontmatter update:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error handling frontmatter change:", error);
    }
  }

  private renderComponent(poolBlock: ParsedPoolBlock, state: PoolState) {
    const stateKey = poolBlock.state_key;
    if (!stateKey) return;

    const newProps = {
      static: poolBlock,
      state: state,
      "onUpdate:state": (newState: PoolState) => {
        this.handleStateChange(poolBlock, newState);
        this.renderComponent(poolBlock, newState);
      },
    };

    if (!this.mounted) {
      this.propsRef.value = newProps;
      this.mountReactive(PoolConsumableCard, this.propsRef);
      this.mounted = true;
    } else {
      this.propsRef.value = newProps;
    }
  }

  private async handleStateChange(poolBlock: ParsedPoolBlock, newState: PoolState) {
    const stateKey = poolBlock.state_key;
    if (!stateKey) return;

    try {
      await this.kv.set(stateKey, newState);
    } catch (error) {
      console.error(`Error saving pool state for ${stateKey}:`, error);
    }
  }

  private async handleResetEvent(poolBlock: ParsedPoolBlock) {
    const stateKey = poolBlock.state_key;
    if (!stateKey) return;

    try {
      const maxPool = typeof poolBlock.points === "number" ? poolBlock.points : 6;

      const resetState: PoolState = {
        current: maxPool,
      };

      await this.kv.set(stateKey, resetState);
      this.renderComponent(poolBlock, resetState);
    } catch (error) {
      console.error(`Error resetting pool state for ${stateKey}:`, error);
    }
  }
}
