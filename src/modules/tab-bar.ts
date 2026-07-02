export type TabId = "dashboard" | "notes";

interface TabDef {
  id: TabId;
  label: string;
  svg: string;
}

const TABS: TabDef[] = [
  {
    id: "dashboard",
    label: "仪表盘",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>`,
  },
  {
    id: "notes",
    label: "小记",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M14 4v6h6"/></svg>`,
  },
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
      attr: {
        type: "button",
        title: tab.label,
        "aria-label": tab.label,
      },
    });
    btn.innerHTML = tab.svg;
    btn.addEventListener("click", () => {
      if (tab.id !== activeTab) onSwitch(tab.id);
    });
  }
}
