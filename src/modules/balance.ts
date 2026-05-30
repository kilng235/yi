import { NexusSettings } from "../types";

interface DeepSeekBalance {
  is_available: boolean;
  balance_infos: {
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }[];
}

export function renderBalance(
  el: HTMLElement,
  settings: NexusSettings
) {
  el.empty();
  el.addClass("nexus-balance");

  const header = el.createDiv({ cls: "nexus-balance-header" });
  header.createDiv({ cls: "nexus-section-dot nexus-section-dot--green" });
  header.createEl("span", { text: "DeepSeek 余额", cls: "nexus-section-title" });

  const body = el.createDiv({ cls: "nexus-balance-body" });

  const apiKey = settings.deepseekApiKey;
  if (!apiKey) {
    body.createDiv({
      cls: "nexus-balance-empty",
      text: "未配置 API Key，请在设置中添加",
    });
    return;
  }

  // Loading state
  body.createDiv({ cls: "nexus-balance-loading", text: "加载中..." });

  // Fetch balance
  fetchBalance(apiKey).then((data) => {
    body.empty();
    if (!data || !data.is_available) {
      body.createDiv({
        cls: "nexus-balance-empty",
        text: "无法获取余额信息",
      });
      return;
    }

    const info = data.balance_infos?.[0];
    if (!info) {
      body.createDiv({ cls: "nexus-balance-empty", text: "无余额数据" });
      return;
    }

    const total = parseFloat(info.total_balance);
    const granted = parseFloat(info.granted_balance);
    const topped = parseFloat(info.topped_up_balance);

    // Main balance display
    const mainRow = body.createDiv({ cls: "nexus-balance-main" });
    mainRow.createDiv({
      cls: "nexus-balance-amount",
      text: `¥${total.toFixed(2)}`,
    });

    // Progress bar (assuming 100 CNY as reference, adjust as needed)
    const barContainer = body.createDiv({ cls: "nexus-balance-bar-bg" });
    const percentage = Math.min(100, (total / 100) * 100);
    const bar = barContainer.createDiv({ cls: "nexus-balance-bar" });
    bar.style.width = `${percentage}%`;
    // Color based on remaining
    if (total < 10) {
      bar.style.background = "#ef4444";
    } else if (total < 30) {
      bar.style.background = "#f59e0b";
    }

    // Detail row
    const detailRow = body.createDiv({ cls: "nexus-balance-detail" });
    detailRow.createSpan({
      text: `赠送: ¥${granted.toFixed(2)}`,
      cls: "nexus-balance-tag",
    });
    detailRow.createSpan({
      text: `充值: ¥${topped.toFixed(2)}`,
      cls: "nexus-balance-tag",
    });

    // Status
    const statusRow = body.createDiv({ cls: "nexus-balance-status" });
    statusRow.createSpan({
      text: data.is_available ? "● 可用" : "○ 不可用",
      cls: data.is_available ? "nexus-balance-ok" : "nexus-balance-off",
    });
  });
}

async function fetchBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
