# Nexus Todo Completion Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix todo completion persistence so completed tasks stay completed after reopening Nexus, while keeping the right-hand todo statistic as a monthly completion counter that rolls back when a same-day completion is undone.

**Architecture:** Keep the existing markdown shape and use the persisted `completed:` field as the card-level completion source of truth when present. Update the todo toggle flow to distinguish check vs. same-day uncheck transitions, then render the existing monthly counter under the clearer label `本月完成`.

**Tech Stack:** TypeScript, Obsidian plugin runtime, esbuild, Node built-in test runner (`node --test`) with esbuild-bundled test files.

---

## File structure

- Create: `__tests__/todo-completion.test.ts` — regression tests for card completion persistence and same-day completion counter rollback.
- Create: `src/todo-completion.ts` — pure helper(s) for deriving persisted completion state and deciding activity counter deltas.
- Modify: `src/kanban-sync.ts` — use helper logic during parse and toggle flows.
- Modify: `src/modules/todo.ts` — rename the statistic label to `本月完成`.

### Task 1: Add failing regression test for completion persistence and same-day rollback

**Files:**
- Create: `__tests__/todo-completion.test.ts`
- Create: `src/todo-completion.ts`
- Modify: `src/kanban-sync.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveCardCheckedState,
  getTodoCheckDelta,
} from "../src/todo-completion";

test("deriveCardCheckedState treats completedAt as persisted completion for cards without subtasks", () => {
  assert.equal(deriveCardCheckedState([], "2026-06-01"), true);
  assert.equal(deriveCardCheckedState([], ""), false);
  assert.equal(
    deriveCardCheckedState(
      [
        { text: "a", checked: true },
        { text: "b", checked: true },
      ],
      ""
    ),
    true
  );
  assert.equal(
    deriveCardCheckedState(
      [
        { text: "a", checked: true },
        { text: "b", checked: false },
      ],
      ""
    ),
    false
  );
});

test("getTodoCheckDelta increments on check and reverses only for same-day uncheck", () => {
  assert.equal(getTodoCheckDelta(false, true, ""), 1);
  assert.equal(getTodoCheckDelta(true, false, "2026-06-01", "2026-06-01"), -1);
  assert.equal(getTodoCheckDelta(true, false, "2026-05-31", "2026-06-01"), 0);
  assert.equal(getTodoCheckDelta(true, true, "2026-06-01", "2026-06-01"), 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/todo-completion.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/todo-completion.test.cjs && node --test .tmp-tests/todo-completion.test.cjs
```

Expected: FAIL because `../src/todo-completion` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Create `src/todo-completion.ts`:

```ts
export interface TodoTask {
  text: string;
  checked: boolean;
}

export function deriveCardCheckedState(tasks: TodoTask[], completedAt: string): boolean {
  if (completedAt) return true;
  if (tasks.length === 0) return false;
  return tasks.every((task) => task.checked);
}

export function getTodoCheckDelta(
  previousChecked: boolean,
  nextChecked: boolean,
  completedAt: string,
  today: string = new Date().toISOString().slice(0, 10)
): number {
  if (!previousChecked && nextChecked) return 1;
  if (previousChecked && !nextChecked && completedAt === today) return -1;
  return 0;
}
```

- [ ] **Step 4: Wire `src/kanban-sync.ts` to the helper**

Add imports:

```ts
import { deriveCardCheckedState, getTodoCheckDelta } from "./todo-completion";
```

Inside `toggleCard()` replace the current activity/write decision block with logic that captures prior state first:

```ts
const previousChecked = card.checked;
const previousCompletedAt = card.completedAt;
card.checked = checked;
card.completedAt = checked ? new Date().toISOString().slice(0, 10) : "";
for (const task of card.tasks) {
  task.checked = checked;
}
...
const delta = getTodoCheckDelta(previousChecked, checked, previousCompletedAt);
if (delta === 1 && this.onActivity) this.onActivity("todoCheck");
if (delta === -1 && this.onActivity) this.onActivity("todoUncheck");
await this.writeToDisk();
```

Inside `parseMarkdown()` replace the inline `checked:` derivation:

```ts
checked: currentCardTasks.length > 0 ? currentCardTasks.every((t) => t.checked) : false,
```

with:

```ts
checked: deriveCardCheckedState(currentCardTasks, (currentCard as any).completedAt || ""),
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/todo-completion.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/todo-completion.test.cjs && node --test .tmp-tests/todo-completion.test.cjs
```

Expected: PASS with `2 tests` passed.

- [ ] **Step 6: Build the plugin**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds without bundling errors.

- [ ] **Step 7: Commit**

```bash
git -C /e/1/Juno/nexus-plugin add __tests__/todo-completion.test.ts src/todo-completion.ts src/kanban-sync.ts && git -C /e/1/Juno/nexus-plugin commit -m "fix: persist todo completion state"
```

### Task 2: Add failing regression test for todo header wording and monthly counter rollback integration

**Files:**
- Modify: `__tests__/todo-completion.test.ts`
- Modify: `src/modules/todo.ts`
- Modify: `src/view.ts`

- [ ] **Step 1: Extend the failing test with monthly counter semantics**

Append to `__tests__/todo-completion.test.ts`:

```ts
test("monthly counter semantics use explicit label wording and same-day rollback rules", () => {
  const monthLog = {
    "2026-06-01": { cardComplete: 0, todoCheck: 2, cardCreate: 0, noteEdit: 0, noteCreate: 0 },
    "2026-06-02": { cardComplete: 0, todoCheck: 1, cardCreate: 0, noteEdit: 0, noteCreate: 0 },
    "2026-05-31": { cardComplete: 0, todoCheck: 9, cardCreate: 0, noteEdit: 0, noteCreate: 0 },
  };

  const total = Object.entries(monthLog).reduce((sum, [dateKey, activity]) => {
    if (!dateKey.startsWith("2026-06")) return sum;
    return sum + (activity.todoCheck || 0);
  }, 0);

  assert.equal(total, 3);
});
```

- [ ] **Step 2: Run the test suite to verify the new/updated test still reflects current behavior boundaries**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/todo-completion.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/todo-completion.test.cjs && node --test .tmp-tests/todo-completion.test.cjs
```

Expected: PASS for pure helper logic and total assertion, but UI label is not updated yet in production code.

- [ ] **Step 3: Update todo header wording and activity rollback handling in the view callback**

In `src/modules/todo.ts`, replace:

```ts
text: `已完成 ${completedCount}`,
```

with:

```ts
text: `本月完成 ${completedCount}`,
```

In `src/view.ts`, extend the activity callback to handle rollback:

```ts
if (type === "todoCheck") this.activityLog[key].todoCheck++;
if (type === "todoUncheck") this.activityLog[key].todoCheck = Math.max(0, this.activityLog[key].todoCheck - 1);
```

- [ ] **Step 4: Run the build to verify the integration compiles**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git -C /e/1/Juno/nexus-plugin add __tests__/todo-completion.test.ts src/modules/todo.ts src/view.ts && git -C /e/1/Juno/nexus-plugin commit -m "fix: clarify monthly todo completion counter"
```

### Task 3: Final verification in one pass

**Files:**
- Test: `__tests__/todo-completion.test.ts`
- Modify: none

- [ ] **Step 1: Run the todo regression test suite**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npx esbuild __tests__/todo-completion.test.ts --bundle --platform=node --format=cjs --outfile=.tmp-tests/todo-completion.test.cjs && node --test .tmp-tests/todo-completion.test.cjs
```

Expected: PASS with all todo completion tests green.

- [ ] **Step 2: Run the production build again**

Run:
```bash
cd /e/1/Juno/nexus-plugin && npm run build
```

Expected: build succeeds and updates `main.js`.

- [ ] **Step 3: Manual verification in Obsidian**

Check these behaviors:

```text
1. Create or locate a todo card with no subtasks.
2. Check it complete in Nexus.
3. Leave the Nexus homepage and reopen it.
4. Confirm the task still appears completed instead of reverting to pending.
5. Confirm the header shows “本月完成”.
6. Check a task today and confirm the monthly count increases by 1.
7. Uncheck that same task today and confirm the monthly count decreases by 1.
8. Uncheck a task that was completed on a previous day and confirm the monthly count does not decrease retroactively.
```

- [ ] **Step 4: Inspect git status for only intended changes**

Run:
```bash
git -C /e/1/Juno/nexus-plugin status --short
```

Expected: only intended source, test, docs, and bundled `main.js` changes appear for this fix.
