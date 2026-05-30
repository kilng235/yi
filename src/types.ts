// ===== Settings (stored in data.json) =====

export interface QuickLink {
  name: string;
  url: string;
  icon: string;
}

export interface NexusSettings {
  kanbanFile: string;
  bannerImage: string;
  bannerQuote: string;
  bannerPosition: { x: number; y: number };
  bannerHeight: number;
  bannerZoom: number;
  gridLayout: GridCell[];
  heatmapWeights: HeatmapWeights;
  readingStats: Record<string, ReadingStat>;
  readingSessions: Record<string, ReadingSession[]>;
  activityLog: Record<string, { cardComplete: number; todoCheck: number; cardCreate: number; noteEdit: number; noteCreate: number }>;
  language: "en" | "zh";
  stylePreset: string;
  quickLinks: QuickLink[];
  deepseekApiKey: string;
}

export const DEFAULT_SETTINGS: NexusSettings = {
  kanbanFile: "nexus-kanban",
  bannerImage: "",
  bannerQuote: "Your daily command center",
  bannerPosition: { x: 50, y: 50 },
  bannerHeight: 120,
  bannerZoom: 100,
  gridLayout: [
    { id: "sidebar", x: 0, y: 0, w: 1, h: 2 },
    { id: "todo", x: 1, y: 0, w: 1, h: 1 },
    { id: "heatmap", x: 2, y: 0, w: 1, h: 1 },
    { id: "bookshelf", x: 1, y: 1, w: 2, h: 1 },
  ],
  heatmapWeights: {
    cardComplete: 10,
    reading10min: 3,
    cardCreate: 2,
    noteEdit: 1,
    noteCreate: 3,
  },
  readingStats: {},
  readingSessions: {},
  activityLog: {},
  language: "zh",
  stylePreset: "nordic",
  quickLinks: [
    { name: "GitHub", url: "https://github.com", icon: "🔗" },
  ],
  deepseekApiKey: "",
};

// ===== Grid =====

export interface GridCell {
  id: string;
  x: number;
  y: number;
  w: number; // 1 = half width, 2 = full width
  h: number; // 1 = half height, 2 = full height
}

// ===== Heatmap =====

export interface HeatmapWeights {
  cardComplete: number;
  reading10min: number;
  cardCreate: number;
  noteEdit: number;
  noteCreate: number;
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
