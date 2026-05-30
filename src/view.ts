import { ItemView, WorkspaceLeaf, App } from "obsidian";
import { NexusSettings } from "./types";
import { renderBanner } from "./modules/banner";
import { createGrid } from "./grid";
import { renderKanban } from "./modules/kanban";
import { renderTodo } from "./modules/todo";
import { renderHeatmap } from "./modules/heatmap";
import { renderBookshelf } from "./modules/bookshelf";

export const VIEW_TYPE_NEXUS = "nexus-view";

export class NexusView extends ItemView {
  private settings: NexusSettings;

  constructor(leaf: WorkspaceLeaf, settings: NexusSettings) {
    super(leaf);
    this.settings = settings;
  }

  getViewType() {
    return VIEW_TYPE_NEXUS;
  }

  getDisplayText() {
    return "Nexus";
  }

  getIcon() {
    return "layout-dashboard";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("nexus-container");

    // Banner
    const bannerEl = container.createDiv();
    renderBanner(bannerEl, this.settings, this.app);

    // Grid
    const gridEl = container.createDiv();
    createGrid({
      container: gridEl,
      cells: this.settings.gridLayout,
      renderCell: (cell, el) => {
        switch (cell.id) {
          case "kanban":
            renderKanban(el, this.settings, this.app);
            break;
          case "todo":
            renderTodo(el, this.settings, this.app);
            break;
          case "heatmap":
            renderHeatmap(el, this.settings, this.app);
            break;
          case "bookshelf":
            renderBookshelf(el, this.settings, this.app);
            break;
        }
      },
    });
  }

  async onClose() {
    // Cleanup
  }
}
