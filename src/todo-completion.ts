import { todayStr } from "./utils";

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
  today: string = todayStr()
): number {
  if (!previousChecked && nextChecked) return 1;
  if (previousChecked && !nextChecked && completedAt === today) return -1;
  return 0;
}
