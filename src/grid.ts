import { NexusSettings, GridCell } from "./types";

export function setupDraggableGrid(
  gridEl: HTMLElement,
  settings: NexusSettings,
  onLayoutChange: (layout: GridCell[]) => void
) {
  applyGridLayout(gridEl, settings.gridLayout);

  const cells = Array.from(gridEl.querySelectorAll<HTMLElement>(".nexus-cell"));
  let dragSource: HTMLElement | null = null;

  for (const cell of cells) {
    cell.draggable = true;
    cell.setAttribute("role", "gridcell");

    cell.addEventListener("dragstart", (e: DragEvent) => {
      dragSource = cell;
      cell.addClass("nexus-cell--dragging");
      e.dataTransfer!.effectAllowed = "move";
      e.dataTransfer!.setData("text/plain", cell.dataset.moduleId || "");
    });

    cell.addEventListener("dragend", () => {
      cell.removeClass("nexus-cell--dragging");
      cells.forEach((c) => c.removeClass("nexus-cell--drag-over"));
      dragSource = null;
    });

    cell.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      if (dragSource && dragSource !== cell) {
        cell.addClass("nexus-cell--drag-over");
        e.dataTransfer!.dropEffect = "move";
      }
    });

    cell.addEventListener("dragleave", () => {
      cell.removeClass("nexus-cell--drag-over");
    });

    cell.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      cell.removeClass("nexus-cell--drag-over");
      if (!dragSource || dragSource === cell) return;

      const srcId = dragSource.dataset.moduleId;
      const tgtId = cell.dataset.moduleId;
      if (!srcId || !tgtId) return;

      const layout = settings.gridLayout.map((c) => ({ ...c }));
      const srcCell = layout.find((c) => c.id === srcId);
      const tgtCell = layout.find((c) => c.id === tgtId);
      if (!srcCell || !tgtCell) return;

      // Swap x, y
      const tmpX = srcCell.x;
      const tmpY = srcCell.y;
      srcCell.x = tgtCell.x;
      srcCell.y = tgtCell.y;
      tgtCell.x = tmpX;
      tgtCell.y = tmpY;

      // Apply immediately to DOM
      applyGridLayout(gridEl, layout);
      applyCellPositions(gridEl, layout);

      // Notify
      settings.gridLayout = layout;
      onLayoutChange(layout);
    });
  }
}

function applyGridLayout(gridEl: HTMLElement, layout: GridCell[]) {
  const maxX = Math.max(...layout.map((c) => c.x + c.w));
  const maxY = Math.max(...layout.map((c) => c.y + c.h));

  gridEl.style.display = "grid";
  gridEl.style.gridTemplateColumns = `repeat(${maxX}, 1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${maxY}, 1fr)`;
  gridEl.style.gap = "12px";
}

function applyCellPositions(gridEl: HTMLElement, layout: GridCell[]) {
  const cells = Array.from(gridEl.querySelectorAll<HTMLElement>(".nexus-cell"));
  for (const cell of cells) {
    const id = cell.dataset.moduleId;
    const pos = layout.find((c) => c.id === id);
    if (pos) {
      cell.style.gridColumn = `${pos.x + 1} / span ${pos.w}`;
      cell.style.gridRow = `${pos.y + 1} / span ${pos.h}`;
    }
  }
}
