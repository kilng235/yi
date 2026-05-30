import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { NexusView, NEXUS_VIEW_TYPE } from "./view";
import { EpubReaderView, NEXUS_EPUB_VIEW_TYPE } from "./modules/epub-reader";
import { NexusSettings, DEFAULT_SETTINGS } from "./types";

export default class NexusPlugin extends Plugin {
  settings: NexusSettings;

  async onload() {
    await this.loadSettings();
    this.backfillActivityFromVault();

    this.registerView(NEXUS_VIEW_TYPE, (leaf) => new NexusView(leaf, this));
    this.registerView(NEXUS_EPUB_VIEW_TYPE, (leaf) => new EpubReaderView(leaf));

    this.addRibbonIcon("home", "打开 Nexus", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-nexus",
      name: "打开 Nexus 首页",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new NexusSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (loaded?.heatmapWeights) {
      this.settings.heatmapWeights = Object.assign({}, DEFAULT_SETTINGS.heatmapWeights, loaded.heatmapWeights);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private backfillActivityFromVault() {
    const log = this.settings.activityLog;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const dailyCounts: Record<string, number> = {};
    const files = this.app.vault.getFiles();
    for (const file of files) {
      if (file.extension !== "md") continue;
      if (file.stat.mtime < thirtyDaysAgo) continue;
      if (file.path.includes(".obsidian/")) continue;

      const date = new Date(file.stat.mtime);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }

    let changed = false;
    for (const [dateKey, count] of Object.entries(dailyCounts)) {
      if (!log[dateKey]) {
        log[dateKey] = {
          cardComplete: 0,
          todoCheck: 0,
          cardCreate: 0,
          noteEdit: count,
          noteCreate: 0,
        };
        changed = true;
      }
    }

    if (changed) {
      this.saveSettings();
    }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(NEXUS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: NEXUS_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

class NexusSettingTab extends PluginSettingTab {
  plugin: NexusPlugin;

  constructor(app: App, plugin: NexusPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Nexus 设置" });

    new Setting(containerEl)
      .setName("看板文件")
      .setDesc("看板数据文件路径（不含 .md 扩展名）")
      .addText((text) =>
        text
          .setPlaceholder("nexus-kanban")
          .setValue(this.plugin.settings.kanbanFile)
          .onChange(async (value) => {
            this.plugin.settings.kanbanFile = value || "nexus-kanban";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("横幅图片")
      .setDesc("本地 vault 路径或 URL")
      .addText((text) =>
        text
          .setPlaceholder("assets/banner.jpg")
          .setValue(this.plugin.settings.bannerImage)
          .onChange(async (value) => {
            this.plugin.settings.bannerImage = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("横幅文字")
      .setDesc("横幅上显示的文字")
      .addText((text) =>
        text
          .setPlaceholder("Your daily command center")
          .setValue(this.plugin.settings.bannerQuote)
          .onChange(async (value) => {
            this.plugin.settings.bannerQuote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("DeepSeek API Key")
      .setDesc("用于余额查询，不会上传到任何地方")
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.deepseekApiKey)
          .onChange(async (value) => {
            this.plugin.settings.deepseekApiKey = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
