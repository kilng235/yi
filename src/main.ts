import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { HubstackView, HUBSTACK_VIEW_TYPE } from "./view";
import { EpubReaderView, HUBSTACK_EPUB_VIEW_TYPE } from "./modules/epub-reader";
import { HubstackSettings } from "./types";
import { loadExternalConfig, saveExternalConfig, mergeSettings } from "./config-sync";
import { loadActivityLog, saveActivityLog } from "./activity-log";
import { ExamStats, migrateLegacyExamData } from "./modules/exam-stats";
import { ExamQuestion, parseVaultQuestions } from "./modules/exam-parser";

const LEGACY_PLUGIN_DATA_PATH = ".obsidian/plugins/nexus/data.json";
const LEGACY_NOTE_TEMPLATE = `## {{date}}

### 今日要点
- 

### 心情


### 想法
- 

### 待办
- [ ] 
`;
const MINIMAL_NOTE_TEMPLATE = "## {{date}}";

export default class HubstackPlugin extends Plugin {
  settings: HubstackSettings;
  examStats: ExamStats = new ExamStats();

  async onload() {
    await this.loadSettings();
    await this.migrateCountdownSettings();
    await this.migrateLegacyNoteTemplate();
    await this.backfillActivityFromVault();
    await this.examStats.load(this.app);
    await migrateLegacyExamData(this.app, this.examStats);

    this.addCommand({
      id: "open-exam-tab",
      name: "打开备考页签",
      callback: async () => {
        await this.activateView();
        const leaf = this.app.workspace.getLeavesOfType(HUBSTACK_VIEW_TYPE)[0];
        if (leaf && leaf.view instanceof HubstackView) {
          await (leaf.view as HubstackView).setActiveTab("exam");
        }
      },
    });

    this.addCommand({
      id: "exam-rescan-bank",
      name: "备考：重新扫描题库",
      callback: () => this.loadExamBank(),
    });

    this.registerView(HUBSTACK_VIEW_TYPE, (leaf) => new HubstackView(leaf, this));
    this.registerView(HUBSTACK_EPUB_VIEW_TYPE, (leaf) => new EpubReaderView(leaf));

    this.addRibbonIcon("home", "打开 Hubstack", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-hubstack",
      name: "打开 Hubstack 首页",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new HubstackSettingTab(this.app, this));
  }

  onunload() {}

  private async migrateCountdownSettings() {
    const raw = this.settings as any;
    if (raw.countdownName || raw.countdownTargetDate) {
      this.settings.countdowns.push({
        name: raw.countdownName || "",
        targetDate: raw.countdownTargetDate || "",
      });
      delete raw.countdownName;
      delete raw.countdownTargetDate;
      await this.saveSettings();
    }
  }

  private async migrateLegacyNoteTemplate() {
    if (this.settings.noteTemplate !== LEGACY_NOTE_TEMPLATE) return;
    this.settings.noteTemplate = MINIMAL_NOTE_TEMPLATE;
    await this.saveSettings();
  }

  async loadSettings() {
    const localData = (await this.loadData()) || (await this.loadLegacyLocalData()) || {};
    const externalData = await loadExternalConfig(this.app);
    this.settings = mergeSettings(externalData, localData);
    // API key is stored in plugin-local data (not synced with vault)
    if ((localData as any).deepseekApiKey) {
      this.settings.deepseekApiKey = (localData as any).deepseekApiKey;
    }
  }

  async saveSettings() {
    // Exclude sensitive fields from vault-synced config
    const { deepseekApiKey, ...safeSettings } = this.settings;
    await saveExternalConfig(this.app, safeSettings as HubstackSettings);
    // Store API key in plugin-local data (.obsidian/plugins/hubstack/data.json)
    await this.saveData({ deepseekApiKey });
  }

  private async loadLegacyLocalData(): Promise<Partial<HubstackSettings> | null> {
    try {
      const exists = await this.app.vault.adapter.exists(LEGACY_PLUGIN_DATA_PATH);
      if (!exists) return null;
      const content = await this.app.vault.adapter.read(LEGACY_PLUGIN_DATA_PATH);
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async backfillActivityFromVault() {
    const log = await loadActivityLog(this.app);
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
      await saveActivityLog(this.app, log);
    }
  }

  async loadExamBank(): Promise<ExamQuestion[]> {
    try {
      return await parseVaultQuestions(this.app, this.settings.examQuizFolder);
    } catch (e) {
      console.error("[hubstack-exam] 题库扫描失败", e);
      return [];
    }
  }

  /**
   * 迁移：旧 career-exam-quiz 时代只有 recentWrong（按题干前缀记录），
   * 把能对上题库的错题反哺成每题历史，重做队列与薄弱考点立刻可用。
   */
  seedExamHistoryFromBank(bank: ExamQuestion[]): void {
    const hist = this.examStats.data.questionHistory;
    let seeded = 0;
    for (const q of bank) {
      if (hist[q.id]) continue;
      const wrong = this.examStats.data.recentWrong.find(
        (w) => w.stem === q.stem.slice(0, 50)
      );
      if (wrong) {
        hist[q.id] = {
          seen: 1,
          correct: 0,
          wrong: 1,
          lastCorrect: false,
          lastTs: wrong.ts,
        };
        seeded += 1;
      }
    }
    if (seeded > 0) {
      void this.examStats.save(this.app);
      console.info(`[hubstack-exam] 已从错题记录迁移 ${seeded} 题历史`);
    }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(HUBSTACK_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: HUBSTACK_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

class HubstackSettingTab extends PluginSettingTab {
  plugin: HubstackPlugin;

  constructor(app: App, plugin: HubstackPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Hubstack 设置" });

    new Setting(containerEl)
      .setName("看板文件")
      .setDesc("看板数据文件路径（不含 .md 扩展名）")
      .addText((text) =>
        text
          .setPlaceholder("hubstack-kanban")
          .setValue(this.plugin.settings.kanbanFile)
          .onChange(async (value) => {
            this.plugin.settings.kanbanFile = value || "hubstack-kanban";
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
      .setName("主题")
      .setDesc("当前仅保留 Aurora 紫雾主题")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("aurora", "Aurora 紫雾")
          .setValue(this.plugin.settings.stylePreset)
          .onChange(async (value: "aurora") => {
            this.plugin.settings.stylePreset = value;
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

    new Setting(containerEl)
      .setName("小记自动用日期做标题")
      .setDesc("新建小记时自动填入今天日期作为标题")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.noteAutoTitle)
          .onChange(async (value) => {
            this.plugin.settings.noteAutoTitle = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "备考刷题" });

    new Setting(containerEl)
      .setName("题库目录")
      .setDesc("扫描该目录下带 quiz 标签的 .md 题库")
      .addText((text) =>
        text
          .setPlaceholder("事业单位/05-闪点卡")
          .setValue(this.plugin.settings.examQuizFolder)
          .onChange(async (value) => {
            this.plugin.settings.examQuizFolder = value || "事业单位/05-闪点卡";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("错题本目录")
      .setDesc("「追加到错题本」写入的位置")
      .addText((text) =>
        text
          .setPlaceholder("事业单位/06-错题本")
          .setValue(this.plugin.settings.examWrongFolder)
          .onChange(async (value) => {
            this.plugin.settings.examWrongFolder = value || "事业单位/06-错题本";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("智能刷题每轮题数")
      .setDesc("智能出题模式每轮抽取的题目数量")
      .addText((text) =>
        text
          .setPlaceholder("10")
          .setValue(String(this.plugin.settings.examRoundSize))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.examRoundSize = Number.isFinite(n) && n > 0 ? n : 10;
            await this.plugin.saveSettings();
          })
      );

    const templateSetting = new Setting(containerEl)
      .setName("小记模板")
      .setDesc("新建小记时自动填入的正文内容，支持 {{date}} {{time}} {{title}} 变量");
    const templateArea = templateSetting.controlEl.createEl("textarea", {
      attr: { rows: "10", style: "width: 100%; font-family: var(--font-monospace); resize: vertical;" },
    });
    templateArea.value = this.plugin.settings.noteTemplate;
    templateArea.addEventListener("change", async () => {
      this.plugin.settings.noteTemplate = templateArea.value;
      await this.plugin.saveSettings();
    });
  }
}
