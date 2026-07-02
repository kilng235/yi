# Hubstack Plugin

## 构建

```bash
npm run build   # 生产构建
npm run dev     # 开发模式（热更新）
```

## 部署

- 主安装路径：`E:\笔记\笔记\.obsidian\plugins\hubstack\`
- 测试路径：`E:\笔记\测试\.obsidian\plugins\hubstack\`（独立测试 vault 用）

构建后把 `main.js`、`styles.css`、`manifest.json` 复制到目标目录即可生效，`data.json` 是用户设置不要覆盖。

## 代码约定

- TypeScript，esbuild 构建
- 源文件在 `src/` 下，模块在 `src/modules/`
- 类型定义集中在 `src/types.ts`
- 使用原生 DOM 操作（无框架）
