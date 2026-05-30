// ===== Settings (stored in data.json) =====

export interface NexusSettings {
  kanbanFile: string;
  bannerImage: string;
  bannerQuote: string;
  bannerPosition: { x: number; y: number };
  gridLayout: GridCell[];
  heatmapWeights: HeatmapWeights;
  readingStats: Record<string, ReadingStat>;
  readingSessions: Record<string, ReadingSession[]>;
  activityLog: Record<string, { cardComplete: number; todoCheck: number; cardCreate: number }>;
  language: "en" | "zh";
  stylePreset: string;
}

export const DEFAULT_SETTINGS: NexusSettings = {
  kanbanFile: "nexus-kanban",
  bannerImage: "",
  bannerQuote: "Your daily command center",
  bannerPosition: { x: 50, y: 50 },
  gridLayout: [
    { id: "kanban", x: 0, y: 0, w: 1, h: 1 },
    { id: "todo", x: 1, y: 0, w: 1, h: 1 },
    { id: "heatmap", x: 0, y: 1, w: 1, h: 1 },
    { id: "bookshelf", x: 1, y: 1, w: 1, h: 1 },
  ],
  heatmapWeights: {
    cardComplete: 10,
    todoCheck: 5,
    reading10min: 3,
    cardCreate: 2,
  },
  readingStats: {},
  readingSessions: {},
  activityLog: {},
  language: "zh",
  stylePreset: "nordic",
};

// ===== Grid =====

export interface GridCell {
  id: string; // "kanban" | "todo" | "heatmap" | "bookshelf"
  x: number;
  y: number;
  w: number; // 1 = half width, 2 = full width
  h: number; // 1 = half height, 2 = full height
}

// ===== Heatmap =====

export interface HeatmapWeights {
  cardComplete: number;
  todoCheck: number;
  reading10min: number;
  cardCreate: number;
}

// ===== Reading =====

export interface ReadingStat {
  filePath: string;
  title: string;
  totalDurationMs: number;
  sessionCount: number;
  lastReadAt: string;
}

export interface ReadingSession {
  filePath: string;
  title: string;
  startAt: string;
  endAt: string;
  durationMs: number;
}

// ===== Kanban (parsed from .md) =====

export interface KanbanData {
  columns: KanbanColumn[];
}

export interface KanbanColumn {
  name: string;
  color: string;
  cards: KanbanCard[];
}

export interface KanbanCard {
  id: string;
  title: string;
  type: "task" | "note" | "project";
  body: string;
  tags: string[];
  dueDate: string;
  checked: boolean;
  createdAt: string;
  completedAt: string;
  tasks: { text: string; checked: boolean }[];
}
