# Hubstack

Hubstack 是一个 Obsidian 首页仪表盘插件，把侧边栏、待办、活跃热力图、书架、EPUB 阅读器、横幅和倒计时整合到一个个人工作台里。

## 功能

### 侧边栏

- 快捷链接：支持外部 URL 和 Obsidian 内部文件链接，可增删。
- 最近编辑：自动显示最近编辑过的 Markdown 笔记，并展示相对时间。
- DeepSeek 余额：配置 API Key 后可查询余额。
- 倒计时卡片：用于记录纪念日、截止日期或重要事件。

### 待办与看板

- 从 Markdown 看板卡片中提取任务。
- 支持添加新任务、勾选完成、拖拽整理。
- 已完成卡片可按月份归档。

### 活跃热力图

- GitHub 风格活动日历，支持月份切换。
- 活跃度来自任务完成、笔记活动和阅读记录。
- 可用于快速回看自己的创作与阅读节奏。

### 书架与 EPUB 阅读

- 自动扫描 vault 中的 `.epub` 文件。
- 缓存书籍封面，生成可视化书架。
- 内置 EPUB 阅读器，支持阅读时长记录和阅读位置恢复。

### 横幅

- 支持自定义横幅图片、格言文字、高度、缩放和图片位置。
- 适合作为首页的视觉入口和每日提醒。

## 安装

1. 下载 `main.js`、`styles.css` 和 `manifest.json`。
2. 放入 `.obsidian/plugins/hubstack/`。
3. 在 Obsidian 设置中启用 `Hubstack`。

## 开发

```bash
npm install
npm run dev
npm run build
```

## 项目结构

```text
src/
|-- main.ts
|-- view.ts
|-- types.ts
|-- kanban-sync.ts
|-- kanban-parser.ts
|-- kanban-archive.ts
`-- modules/
    |-- sidebar.ts
    |-- banner.ts
    |-- todo.ts
    |-- heatmap.ts
    |-- bookshelf.ts
    |-- epub-reader.ts
    |-- balance.ts
    |-- kanban.ts
    |-- input-modal.ts
    `-- file-picker-modal.ts
```

## 数据

- 插件配置存储在 `hubstack/config.json`。
- 活跃记录存储在 `hubstack/activity-log.json`。
- 已归档卡片存储在 `hubstack/archive/`。
- EPUB 封面缓存存储在 `hubstack/covers/`。
- 旧版 `nexus/` 数据路径仍会被读取，用于兼容历史数据。

## License

MIT
