export type TabId = "dashboard" | "notes";

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "仪表盘", icon: "🏠" },
  { id: "notes", label: "小记", icon: "📝" },
];

export function renderTabBar(
  el: HTMLElement,
  activeTab: TabId,
  onSwitch: (tab: TabId) => void
) {
  el.empty();
  el.addClass("nexus-tab-bar");

  for (const tab of TABS) {
    const btn = el.createEl("button", {
      cls: `nexus-tab-btn${tab.id === activeTab ? " nexus-tab-btn--active" : ""}`,
    });
    btn.createSpan({ text: tab.icon, cls: "nexus-tab-btn-icon" });
    btn.createSpan({ text: tab.label, cls: "nexus-tab-btn-label" });
    btn.addEventListener("click", () => {
      if (tab.id !== activeTab) onSwitch(tab.id);
    });
  }
}
