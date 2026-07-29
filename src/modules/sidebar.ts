import { App, TFile } from "obsidian";
import HubstackPlugin from "../main";
import { getCountdownStatus, normalizeDateStr } from "../utils";
import { InputModal } from "./input-modal";

export function renderSidebar(
  el: HTMLElement,
  app: App,
  plugin: HubstackPlugin,
  cleanupFns: Array<() => void>
) {
  el.empty();
  el.addClass("hubstack-sidebar");

  // === Quick Links ===
  const linksSection = el.createDiv({ cls: "hubstack-sidebar-section" });
  linksSection.createEl("h3", { text: "快捷链接", cls: "hubstack-sidebar-title" });

  const linksList = linksSection.createDiv({ cls: "hubstack-quick-links" });
  renderQuickLinks(linksList, plugin);

  const addLinkBtn = linksSection.createDiv({ cls: "hubstack-sidebar-add-btn" });
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
  const recentSection = el.createDiv({ cls: "hubstack-sidebar-section" });
  recentSection.createEl("h3", { text: "最近编辑", cls: "hubstack-sidebar-title" });

  const recentList = recentSection.createDiv({ cls: "hubstack-recent-list" });
  renderRecentFiles(recentList, app, plugin);

  const refreshRecent = () => renderRecentFiles(recentList, app, plugin);
  const modifyRef = app.vault.on("modify", (f) => {
    if (f instanceof TFile && f.extension === "md") refreshRecent();
  });
  const createRef = app.vault.on("create", (f) => {
    if (f instanceof TFile && f.extension === "md") refreshRecent();
  });
  cleanupFns.push(() => {
    app.vault.offref(modifyRef);
    app.vault.offref(createRef);
  });

  // === DeepSeek Balance ===
  const balanceSection = el.createDiv({ cls: "hubstack-sidebar-section" });
  renderSidebarBalance(balanceSection, plugin);

  // === Countdown ===
  const countdownSection = el.createDiv({ cls: "hubstack-sidebar-section" });
  renderSidebarCountdown(countdownSection, app, plugin, cleanupFns);
}

function renderQuickLinks(el: HTMLElement, plugin: HubstackPlugin) {
  el.empty();
  const links = plugin.settings.quickLinks || [];

  if (links.length === 0) {
    el.createDiv({ cls: "hubstack-sidebar-empty", text: "暂无快捷链接" });
    return;
  }

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const item = el.createDiv({ cls: "hubstack-quick-link-item" });

    const left = item.createDiv({ cls: "hubstack-quick-link-left" });
    left.createSpan({ text: link.icon || "🔗", cls: "hubstack-quick-link-icon" });

    // If URL is an obsidian wikilink ([[...]]), open internally
    const isInternal = link.url.startsWith("[[");
    if (isInternal) {
      const linkEl = left.createEl("span", {
        text: link.name,
        cls: "hubstack-quick-link-name",
      });
      linkEl.addEventListener("click", () => {
        const filePath = link.url.replace(/\[\[|\]\]/g, "");
        const file = plugin.app.vault.getFileByPath(filePath);
        if (file) plugin.app.workspace.getLeaf(false).openFile(file);
      });
    } else {
      left.createEl("a", {
        text: link.name,
        cls: "hubstack-quick-link-name",
        href: link.url,
      });
    }

    // Delete button
    const delBtn = item.createEl("button", {
      cls: "hubstack-quick-link-delete",
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

function renderRecentFiles(el: HTMLElement, app: App, plugin: HubstackPlugin) {
  el.empty();

  // Get recently modified .md files (excluding plugin internals)
  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => !f.path.includes(".obsidian/"))
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 8);

  if (files.length === 0) {
    el.createDiv({ cls: "hubstack-sidebar-empty", text: "暂无编辑记录" });
    return;
  }

  for (const file of files) {
    const item = el.createDiv({ cls: "hubstack-recent-item" });

    const nameEl = item.createEl("span", {
      text: file.basename,
      cls: "hubstack-recent-name",
    });
    nameEl.addEventListener("click", () => {
      app.workspace.getLeaf(false).openFile(file);
    });

    const timeEl = item.createEl("span", {
      text: formatRelativeTime(file.stat.mtime),
      cls: "hubstack-recent-time",
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

function renderSidebarBalance(el: HTMLElement, plugin: HubstackPlugin) {
  const title = el.createEl("h3", { cls: "hubstack-sidebar-title" });
  title.createSpan({ text: "DeepSeek 余额" });
  title.addClass("hubstack-sidebar-title--balance");

  const body = el.createDiv({ cls: "hubstack-sidebar-balance" });

  const apiKey = plugin.settings.deepseekApiKey;
  if (!apiKey) {
    body.createDiv({ cls: "hubstack-sidebar-balance-empty", text: "未配置 API Key" });
    return;
  }

  body.createDiv({ cls: "hubstack-sidebar-balance-loading", text: "加载中..." });

  fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
    .then((r) => r.json())
    .then((data) => {
      body.empty();
      const info = data.balance_infos?.[0];
      if (!info) {
        body.createDiv({ cls: "hubstack-sidebar-balance-empty", text: "无数据" });
        return;
      }

      const total = parseFloat(info.total_balance);

      const row = body.createDiv({ cls: "hubstack-sidebar-balance-row" });
      row.createSpan({
        cls: "hubstack-sidebar-balance-amount",
        text: `¥${total.toFixed(2)}`,
      });
      row.createSpan({
        cls: data.is_available ? "hubstack-sidebar-balance-ok" : "hubstack-sidebar-balance-off",
        text: data.is_available ? "可用" : "不可用",
      });
    })
    .catch(() => {
      body.empty();
      body.createDiv({ cls: "hubstack-sidebar-balance-empty", text: "查询失败" });
    });
}

function renderSidebarCountdown(
  el: HTMLElement,
  app: App,
  plugin: HubstackPlugin,
  cleanupFns: Array<() => void>
) {
  const title = el.createEl("h3", { cls: "hubstack-sidebar-title" });
  title.createSpan({ text: "倒计时" });
  title.addClass("hubstack-sidebar-title--countdown");

  const body = el.createDiv({ cls: "hubstack-sidebar-countdown" });

  const render = () => {
    body.empty();
    const items = plugin.settings.countdowns || [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const countdown = getCountdownStatus(item.name, item.targetDate);

      const card = body.createDiv({ cls: "hubstack-sidebar-countdown-card" });

      if (countdown.status === "invalid") {
        const left = card.createDiv({ cls: "hubstack-sidebar-countdown-left" });
        left.createDiv({ cls: "hubstack-sidebar-countdown-name", text: countdown.title });
        left.createDiv({ cls: "hubstack-sidebar-countdown-error", text: countdown.message });
      } else {
        const left = card.createDiv({ cls: "hubstack-sidebar-countdown-left" });
        left.createDiv({ cls: "hubstack-sidebar-countdown-name", text: countdown.title });
        left.createDiv({ cls: "hubstack-sidebar-countdown-label", text: item.targetDate });

        const daysCls = `hubstack-sidebar-countdown-days${
          countdown.status === "today" ? " hubstack-sidebar-countdown-days--today" :
          countdown.status === "past" ? " hubstack-sidebar-countdown-days--past" : ""
        }`;
        card.createDiv({ cls: daysCls, text: countdown.days != null ? `${countdown.days}` : "" });
      }

      const delBtn = card.createDiv({ cls: "hubstack-sidebar-countdown-del", text: "×" });
      delBtn.addEventListener("click", async () => {
        plugin.settings.countdowns.splice(i, 1);
        await plugin.saveSettings();
        render();
      });
    }

    const addBtn = body.createDiv({ cls: "hubstack-sidebar-countdown-add", text: "+ 添加项目" });
    addBtn.addEventListener("click", () => {
      new InputModal(app, "添加倒计时项目", "项目名称（如：考试）", async (name) => {
        new InputModal(app, "添加倒计时项目", "目标日期（如 2026-06-17 或 2026.6.17）", async (date) => {
          plugin.settings.countdowns.push({ name, targetDate: normalizeDateStr(date) });
          await plugin.saveSettings();
          render();
        }).open();
      }).open();
    });
  };

  render();

  let timeout: number | null = null;
  const scheduleNextMidnight = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timeout = window.setTimeout(() => {
      render();
      scheduleNextMidnight();
    }, nextMidnight.getTime() - now.getTime() + 1000);
  };

  scheduleNextMidnight();
  cleanupFns.push(() => {
    if (timeout !== null) window.clearTimeout(timeout);
  });
}
