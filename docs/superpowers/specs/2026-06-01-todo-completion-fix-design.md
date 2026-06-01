# Nexus todo completion persistence fix design

## Scope
Fix the Nexus todo bug where a completed task reverts to pending after reopening the homepage, while keeping the right-hand statistic as a monthly completion counter.

## Confirmed root causes

1. Card completion state is not reliably reconstructed for cards without subtasks. On reload, `checked` is derived from `tasks.every(...)`, so cards with `tasks: []` fall back to `false` even if they were previously completed.
2. The todo header statistic currently displays `activityLog.todoCheck` as a monthly accumulated completion count, but its label reads like a current-state count.
3. The completion counter only increments on check and does not reverse when a task completed today is unchecked again.

## Approved behavior

1. Preserve the right-hand statistic as a monthly accumulated completion count.
2. Rename the label from `已完成` to `本月完成`.
3. If a task was completed today and then unchecked the same day, decrement the monthly completion count by 1.
4. If a task was completed on a previous day and is unchecked later, do not retroactively change the historical monthly count.
5. Preserve existing markdown format; do not add a new persisted `checked:` field.

## Recommended approach

Use existing `completed:` metadata as the persistent source of truth for card-level completion when present.

- During markdown parse:
  - if `completedAt` exists, treat the card as completed
  - otherwise, fall back to subtask-derived completion
- During toggle:
  - detect transition from unchecked -> checked and increment `todoCheck`
  - detect transition from checked -> unchecked on the same day and decrement `todoCheck`
- In the todo header:
  - rename the metric label to `本月完成`

## Non-goals
- No redesign of kanban semantics
- No schema migration
- No change to the meaning of monthly completion totals beyond same-day reversal consistency
