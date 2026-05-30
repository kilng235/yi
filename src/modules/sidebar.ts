import { App, TFile } from "obsidian";
import NexusPlugin from "../main";
import { InputModal } from "./input-modal";

export function renderSidebar(
  el: HTMLElement,
  app: App,
  plugin: NexusPlugin,
  cleanupFns: Array<() => void>
) {
  el.empty();
  el.addClass("nexus-sidebar");

  // === Quick Links ===
  const linksSection = el.createDiv({ cls: "nexus-sidebar-section" });
  linksSection.createEl("h3", { text: "快捷链接", cls: "nexus-sidebar-title" });

  const linksList = linksSection.createDiv({ cls: "nexus-quick-links" });
  renderQuickLinks(linksList, plugin);

  const addLinkBtn = linksSection.createDiv({ cls: "nexus-sidebar-add-btn" });
  addLinkBtn.setText("+ 添加链接");
  addLinkBtn.addEventListener("click", () => {
    new InputModal(app, "添加快捷链接", "名称", async (name) => {
      new InputModal(app, "添加快捷链接", "URL", async (url) => {
        plugin.settings.quickLinks.push({ name, url, icon: "🔗" });
        await plugin.saveSettings();
        renderQuickLinks(linksList, plugin);
      }).open();
    }).open();
  });

  // === Recently Edited ===
  const recentSection = el.createDiv({ cls: "nexus-sidebar-section" });
  recentSection.createEl("h3", { text: "最近编辑", cls: "nexus-sidebar-title" });

  const recentList = recentSection.createDiv({ cls: "nexus-recent-list" });
  renderRecentFiles(recentList, app, plugin);

  const refreshRecent = () => renderRecentFiles(recentList, app, plugin);
  plugin.registerEvent(app.vault.on("modify", (f) => {
    if (f instanceof TFile && f.extension === "md") refreshRecent();
  }));
  plugin.registerEvent(app.vault.on("create", (f) => {
    if (f instanceof TFile && f.extension === "md") refreshRecent();
  }));

  // === DeepSeek Balance ===
  const balanceSection = el.createDiv({ cls: "nexus-sidebar-section" });
  renderSidebarBalance(balanceSection, plugin);
}

function renderQuickLinks(el: HTMLElement, plugin: NexusPlugin) {
  el.empty();
  const links = plugin.settings.quickLinks || [];

  if (links.length === 0) {
    el.createDiv({ cls: "nexus-sidebar-empty", text: "暂无快捷链接" });
    return;
  }

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const item = el.createDiv({ cls: "nexus-quick-link-item" });

    const left = item.createDiv({ cls: "nexus-quick-link-left" });
    left.createSpan({ text: link.icon || "🔗", cls: "nexus-quick-link-icon" });

    // If URL is an obsidian wikilink ([[...]]), open internally
    const isInternal = link.url.startsWith("[[");
    if (isInternal) {
      const linkEl = left.createEl("span", {
        text: link.name,
        cls: "nexus-quick-link-name",
      });
      linkEl.addEventListener("click", () => {
        const filePath = link.url.replace(/\[\[|\]\]/g, "");
        const file = plugin.app.vault.getFileByPath(filePath);
        if (file) plugin.app.workspace.getLeaf(false).openFile(file);
      });
    } else {
      left.createEl("a", {
        text: link.name,
        cls: "nexus-quick-link-name",
        href: link.url,
      });
    }

    // Delete button
    const delBtn = item.createEl("button", {
      cls: "nexus-quick-link-delete",
      text: "×",
    });
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      plugin.settings.quickLinks.splice(i, 1);
      await plugin.saveSettings();
      renderQuickLinks(el, plugin);
    });
  }
}

function renderRecentFiles(el: HTMLElement, app: App, plugin: NexusPlugin) {
  el.empty();

  // Get recently modified .md files (excluding plugin internals)
  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => !f.path.includes(".obsidian/"))
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 8);

  if (files.length === 0) {
    el.createDiv({ cls: "nexus-sidebar-empty", text: "暂无编辑记录" });
    return;
  }

  for (const file of files) {
    const item = el.createDiv({ cls: "nexus-recent-item" });

    const nameEl = item.createEl("span", {
      text: file.basename,
      cls: "nexus-recent-name",
    });
    nameEl.addEventListener("click", () => {
      app.workspace.getLeaf(false).openFile(file);
    });

    const timeEl = item.createEl("span", {
      text: formatRelativeTime(file.stat.mtime),
      cls: "nexus-recent-time",
    });
  }
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

function renderSidebarBalance(el: HTMLElement, plugin: NexusPlugin) {
  const title = el.createEl("h3", { cls: "nexus-sidebar-title" });
  title.createSpan({ text: "DeepSeek 余额" });
  title.addClass("nexus-sidebar-title--balance");

  const body = el.createDiv({ cls: "nexus-sidebar-balance" });

  const apiKey = plugin.settings.deepseekApiKey;
  if (!apiKey) {
    body.createDiv({ cls: "nexus-sidebar-balance-empty", text: "未配置 API Key" });
    return;
  }

  body.createDiv({ cls: "nexus-sidebar-balance-loading", text: "加载中..." });

  fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
    .then((r) => r.json())
    .then((data) => {
      body.empty();
      const info = data.balance_infos?.[0];
      if (!info) {
        body.createDiv({ cls: "nexus-sidebar-balance-empty", text: "无数据" });
        return;
      }

      const total = parseFloat(info.total_balance);

      const row = body.createDiv({ cls: "nexus-sidebar-balance-row" });
      row.createSpan({
        cls: "nexus-sidebar-balance-amount",
        text: `¥${total.toFixed(2)}`,
      });
      row.createSpan({
        cls: data.is_available ? "nexus-sidebar-balance-ok" : "nexus-sidebar-balance-off",
        text: data.is_available ? "可用" : "不可用",
      });
    })
    .catch(() => {
      body.empty();
      body.createDiv({ cls: "nexus-sidebar-balance-empty", text: "查询失败" });
    });
}
