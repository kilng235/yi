import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { NexusView, NEXUS_VIEW_TYPE } from "./view";
import { NEXUS_EPUB_VIEW_TYPE } from "./modules/epub-reader";
import { NexusSettings, DEFAULT_SETTINGS } from "./types";

export default class NexusPlugin extends Plugin {
  settings: NexusSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(NEXUS_VIEW_TYPE, (leaf) => new NexusView(leaf, this));

    // EPUB reader is opened programmatically via bookshelf click,
    // NOT via registerExtensions (would conflict with existing epub plugin)

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
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
  }
}
