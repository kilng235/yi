# Nexus

Nexus is an Obsidian plugin that provides a unified homepage combining project management, reading, and activity tracking into a single draggable grid dashboard.

## Language

**Nexus**:
The plugin itself. A homepage dashboard with four modules and a banner.
_Avoid_: Dashboard, Homepage, Workspace

**Module**:
One of the four functional blocks on the Nexus page: Kanban, Todo, Heatmap, Bookshelf. Each module occupies one cell in the grid.
_Avoid_: Panel, Widget, Section, Card (card is used for kanban items)

**Banner**:
The image displayed at the top of the Nexus page. Supports local vault paths and external URLs.
_Avoid_: Header, Cover, Hero

**Kanban**:
The project management module. Contains columns, each column contains cards. Comes with three preset columns: To Do, In Progress, Done. Users can add/remove/rename columns.
_Avoid_: Board, Task Board

**Column**:
A vertical group within the Kanban. Has a name and an ordered list of cards.
_Avoid_: Lane, List, Stack

**Card**:
An item inside a Kanban column. Has a title, type (task/note/project), and optional metadata (tags, due date).
_Avoid_: Item, Entry, Record

**Todo**:
A filtered list view of all cards with type=task across all Kanban columns. Checking a todo moves the corresponding card to the "Done" column. Not a separate data store — it is a view onto Kanban data.
_Avoid_: Task List, Checklist (checklist is used for card subtasks)

**Heatmap**:
A GitHub-style contribution graph that visualizes activity from three sources: card completions, todo checkoffs, and reading time. Uses weighted scoring, not raw counts.
_Avoid_: Activity Graph, Calendar

**Bookshelf**:
The epub library module. Scans the vault for .epub files, displays covers, and tracks reading status (unread/reading/done).
_Avoid_: Library, Bookcase, Reader

**Reading Session**:
A continuous period of epub reading tracked by the plugin. Records start time, end time, duration, and the epub file path. Fed into the Heatmap.
_Avoid_: Reading Time, Reading Record (ambiguous — could mean note or session)

**Homepage Data**:
Plugin-owned data stored in data.json: layout positions, banner config, reading stats, heatmap weights.
_Avoid_: Config (config is the user-facing settings), Settings

**Kanban Data**:
User-facing content stored in a .md file: columns, cards, card content. Human-readable, editable by hand, queryable by Dataview.
_Avoid_: Content, Notes (ambiguous in Obsidian context)

**Grid**:
The layout container below the Banner. A 2×2 (or user-customized) arrangement of four Modules. Positions and sizes are draggable.
_Avoid_: Layout, Canvas (Canvas is an Obsidian feature), Dashboard (overloaded)

## Relationships

- **Nexus** contains exactly one **Banner** and one **Grid**
- **Grid** contains exactly four **Modules**, each draggable/resizable
- **Kanban** contains N **Columns**, each column contains N **Cards**
- **Todo** is a read-view of **Cards** where type=task; checking a todo mutates the source card
- **Bookshelf** scans vault for .epub files; opening one starts a **Reading Session**
- **Heatmap** aggregates data from **Card** completions + **Todo** checkoffs + **Reading Sessions**
- **Kanban Data** lives in .md; **Homepage Data** lives in data.json
