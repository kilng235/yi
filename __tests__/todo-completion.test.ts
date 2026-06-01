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
