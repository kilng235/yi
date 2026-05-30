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
        url = app.vault.getResourcePath(file);
      }
    }
    el.style.backgroundImage = `url(${url})`;
    el.addClass("nexus-banner--has-image");

    // Apply saved position
    const pos = settings.bannerPosition || { x: 50, y: 50 };
    el.style.backgroundPosition = `${pos.x}% ${pos.y}%`;

    // Drag to adjust image position
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startPosX = pos.x;
    let startPosY = pos.y;

    el.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startPosX = pos.x;
      startPosY = pos.y;
      el.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const rect = el.getBoundingClientRect();
      pos.x = Math.max(0, Math.min(100, startPosX + (dx / rect.width) * 100));
      pos.y = Math.max(0, Math.min(100, startPosY + (dy / rect.height) * 100));
      el.style.backgroundPosition = `${pos.x}% ${pos.y}%`;
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      el.style.cursor = "";
      settings.bannerPosition = { x: pos.x, y: pos.y };
      // Save settings via plugin
      if (settings.bannerPosition) {
        app.vault.adapter.write(
          app.vault.configDir + "/plugins/nexus/data.json",
          JSON.stringify(settings, null, 2)
        );
      }
    });
  }

  // Quote overlay
  if (settings.bannerQuote) {
    const overlay = el.createDiv({ cls: "nexus-banner-overlay" });
    overlay.createEl("p", {
      text: settings.bannerQuote,
      cls: "nexus-banner-quote",
    });
    // Prevent drag when clicking on quote
    overlay.addEventListener("mousedown", (e) => e.stopPropagation());
  }
}
