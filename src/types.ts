// ===== Settings (stored in data.json) =====

export interface QuickLink {
  name: string;
  url: string;
  icon: string;
}

export interface CountdownItem {
  name: string;
  targetDate: string;
}

export interface HubstackSettings {
  kanbanFile: string;
  bannerImage: string;
  bannerQuote: string;
  bannerPosition: { x: number; y: number };
  bannerHeight: number;
  bannerZoom: number;
  heatmapWeights: HeatmapWeights;
  readingStats: Record<string, ReadingStat>;
  readingSessions: Record<string, ReadingSession[]>;
  language: "en" | "zh";
  stylePreset: "aurora";
  quickLinks: QuickLink[];
  deepseekApiKey: string;
  countdowns: CountdownItem[];
  activeTab: "dashboard" | "notes";
  noteTemplate: string;
  noteAutoTitle: boolean;
}

export const DEFAULT_SETTINGS: HubstackSettings = {
  kanbanFile: "hubstack/hubstack-kanban",
  bannerImage: "",
  bannerQuote: "Your daily command center",
  bannerPosition: { x: 50, y: 50 },
  bannerHeight: 120,
  bannerZoom: 100,
  heatmapWeights: {
    cardComplete: 5,
    reading10min: 3,
    cardCreate: 2,
    noteEdit: 1,
    noteCreate: 3,
  },
  readingStats: {},
  readingSessions: {},
  language: "zh",
  stylePreset: "aurora",
  quickLinks: [
    { name: "GitHub", url: "https://github.com", icon: "🔗" },
  ],
  deepseekApiKey: "",
  countdowns: [],
  activeTab: "dashboard",
  noteTemplate: "## {{date}}",
  noteAutoTitle: true,
};

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
  lastLocationCfi?: string;
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

// ===== Notes (瀑布流小记) =====

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}
