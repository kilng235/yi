# Split storage: .md for content, data.json for metadata

Kanban cards and column definitions are stored in a human-readable .md file (YAML frontmatter + markdown body). Layout positions, reading statistics, heatmap weights, and banner config are stored in data.json.

## Considered Options

1. **Single .md file** — All data in one markdown file (like Apex Dashboard). Human-readable but mixes user content with machine data (reading timestamps, grid coordinates).
2. **Single data.json** — All data in JSON. Clean for machine use but kills Dataview integration and manual editing.
3. **Split storage** (chosen) — Content in .md, metadata in data.json.

## Consequences

- Users can hand-write kanban cards in markdown and Nexus picks them up
- Dataview can query kanban data directly without plugin API
- Reading stats and layout coordinates don't pollute the user's notes
- Two files to manage instead of one (acceptable trade-off)
