import { App } from "obsidian";
import { NexusSettings } from "../types";

export function renderBanner(
  el: HTMLElement,
  settings: NexusSettings,
  app: App
) {
  el.empty();
  el.addClass("nexus-banner");

  // Background image
  if (settings.bannerImage) {
    let url = settings.bannerImage;
    if (!url.startsWith("http")) {
      const file = app.vault.getFileByPath(url);
      if (file) {
        // Use adapter.getResourcePath like Apex Dashboard for better quality
        const adapter = app.vault.adapter as any;
        url = typeof adapter.getResourcePath === "function"
          ? adapter.getResourcePath(url)
          : app.vault.getResourcePath(file);
      }
    }
    el.style.backgroundImage = `url("${url}")`;
    el.addClass("nexus-banner--has-image");

    // Apply saved position and zoom
    const pos = settings.bannerPosition || { x: 50, y: 50 };
    const zoom = settings.bannerZoom || 100;
    el.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
    el.style.backgroundSize = zoom === 100 ? "cover" : `${zoom}%`;

    // Drag to adjust image position
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPosX = pos.x;
    let startPosY = pos.y;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".nexus-banner-settings")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = pos.x;
      startPosY = pos.y;
      el.style.cursor = "grabbing";
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const rect = el.getBoundingClientRect();
      pos.x = Math.max(0, Math.min(100, startPosX + (dx / rect.width) * 100));
      pos.y = Math.max(0, Math.min(100, startPosY + (dy / rect.height) * 100));
      el.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
      updateSliderLabels(pos, zoom);
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.cursor = "";
    };

    el.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    const cleanup = () => {
      el.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    (el as any).__bannerCleanup = cleanup;
  }

  // Quote overlay
  if (settings.bannerQuote) {
    const overlay = el.createDiv({ cls: "nexus-banner-overlay" });
    overlay.createEl("p", {
      text: settings.bannerQuote,
      cls: "nexus-banner-quote",
    });
    overlay.addEventListener("mousedown", (e) => e.stopPropagation());
  }

  // Settings button
  const settingsBtn = el.createDiv({ cls: "nexus-banner-settings-btn" });
  settingsBtn.innerHTML = "⚙";
  settingsBtn.addEventListener("mousedown", (e) => e.stopPropagation());

  // Settings panel
  const panel = el.createDiv({ cls: "nexus-banner-settings" });
  panel.addEventListener("mousedown", (e) => e.stopPropagation());
  let panelOpen = false;

  // Pending changes (not saved until user clicks save)
  const pending = {
    height: getBannerHeight(settings),
    x: settings.bannerPosition?.x ?? 50,
    y: settings.bannerPosition?.y ?? 50,
    zoom: settings.bannerZoom || 100,
  };

  // Image info
  const infoRow = panel.createDiv({ cls: "nexus-banner-info" });
  if (settings.bannerImage) {
    const img = new Image();
    let imgUrl = settings.bannerImage;
    if (!imgUrl.startsWith("http")) {
      const file = app.vault.getFileByPath(imgUrl);
      if (file) imgUrl = app.vault.getResourcePath(file);
    }
    img.onload = () => {
      infoRow.createSpan({
        text: `原图: ${img.naturalWidth}×${img.naturalHeight}`,
        cls: "nexus-banner-info-text",
      });
    };
    img.src = imgUrl;
  }

  // Height slider
  const heightRow = panel.createDiv({ cls: "nexus-banner-ctrl" });
  heightRow.createEl("label", { text: "高度" });
  const heightSlider = heightRow.createEl("input", {
    type: "range",
    attr: { min: "80", max: "300", value: String(pending.height) },
  }) as HTMLInputElement;
  const heightLabel = heightRow.createEl("span", { text: `${pending.height}px` });

  heightSlider.addEventListener("input", () => {
    pending.height = parseInt(heightSlider.value);
    heightLabel.textContent = `${pending.height}px`;
    el.style.minHeight = `${pending.height}px`;
  });

  // Zoom slider
  const zoomRow = panel.createDiv({ cls: "nexus-banner-ctrl" });
  zoomRow.createEl("label", { text: "缩放" });
  const zoomSlider = zoomRow.createEl("input", {
    type: "range",
    attr: { min: "50", max: "300", value: String(pending.zoom) },
  }) as HTMLInputElement;
  const zoomLabel = zoomRow.createEl("span", { text: `${pending.zoom}%` });

  zoomSlider.addEventListener("input", () => {
    pending.zoom = parseInt(zoomSlider.value);
    zoomLabel.textContent = `${pending.zoom}%`;
    el.style.backgroundSize = pending.zoom === 100 ? "cover" : `${pending.zoom}%`;
  });

  // Position X
  const xRow = panel.createDiv({ cls: "nexus-banner-ctrl" });
  xRow.createEl("label", { text: "水平" });
  const xSlider = xRow.createEl("input", {
    type: "range",
    attr: { min: "0", max: "100", value: String(Math.round(pending.x)) },
  }) as HTMLInputElement;
  const xLabel = xRow.createEl("span", { text: `${Math.round(pending.x)}%` });

  xSlider.addEventListener("input", () => {
    pending.x = parseInt(xSlider.value);
    xLabel.textContent = `${pending.x}%`;
    el.style.backgroundPosition = `${pending.x}% ${pending.y}%`;
  });

  // Position Y
  const yRow = panel.createDiv({ cls: "nexus-banner-ctrl" });
  yRow.createEl("label", { text: "垂直" });
  const ySlider = yRow.createEl("input", {
    type: "range",
    attr: { min: "0", max: "100", value: String(Math.round(pending.y)) },
  }) as HTMLInputElement;
  const yLabel = yRow.createEl("span", { text: `${Math.round(pending.y)}%` });

  ySlider.addEventListener("input", () => {
    pending.y = parseInt(ySlider.value);
    yLabel.textContent = `${pending.y}%`;
    el.style.backgroundPosition = `${pending.x}% ${pending.y}%`;
  });

  // Reset + Save buttons
  const btnRow = panel.createDiv({ cls: "nexus-banner-btn-row" });
  const resetBtn = btnRow.createEl("button", {
    text: "重置",
    cls: "nexus-banner-reset-btn",
  });
  resetBtn.addEventListener("click", () => {
    pending.x = 50;
    pending.y = 50;
    pending.zoom = 100;
    el.style.backgroundPosition = "50% 50%";
    el.style.backgroundSize = "cover";
    xSlider.value = "50"; xLabel.textContent = "50%";
    ySlider.value = "50"; yLabel.textContent = "50%";
    zoomSlider.value = "100"; zoomLabel.textContent = "100%";
  });

  const saveBtn = btnRow.createEl("button", {
    text: "保存设置",
    cls: "nexus-banner-save-btn",
  });
  saveBtn.addEventListener("click", () => {
    settings.bannerPosition = { x: pending.x, y: pending.y };
    settings.bannerHeight = pending.height;
    settings.bannerZoom = pending.zoom;
    saveSettings(settings, app);
    saveBtn.textContent = "已保存 ✓";
    setTimeout(() => {
      saveBtn.textContent = "保存设置";
      // Auto-close panel
      panelOpen = false;
      panel.removeClass("nexus-banner-settings--open");
      settingsBtn.removeClass("nexus-banner-settings-btn--active");
    }, 800);
  });

  // Toggle panel
  settingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    panel.toggleClass("nexus-banner-settings--open", panelOpen);
    settingsBtn.toggleClass("nexus-banner-settings-btn--active", panelOpen);
  });

  // Update slider labels when dragging image
  const updateSliderLabels = (p: { x: number; y: number }, z: number) => {
    xSlider.value = String(Math.round(p.x));
    xLabel.textContent = `${Math.round(p.x)}%`;
    ySlider.value = String(Math.round(p.y));
    yLabel.textContent = `${Math.round(p.y)}%`;
  };
}

function getBannerHeight(settings: NexusSettings): number {
  return settings.bannerHeight || 120;
}

function saveSettings(settings: NexusSettings, app: App) {
  app.vault.adapter.write(
    app.vault.configDir + "/plugins/nexus/data.json",
    JSON.stringify(settings, null, 2)
  );
}

export function cleanupBanner(el: HTMLElement) {
  const cleanup = (el as any).__bannerCleanup;
  if (cleanup) {
    cleanup();
    delete (el as any).__bannerCleanup;
  }
}
