"use server";

import { revalidatePath } from "next/cache";
import { recordStatus, type TaskStatus } from "@/lib/digest";

/**
 * Records a Done / In Progress click from the task board. Writes to the same
 * "Task Status" tab the digest email buttons use, so board and email stay in
 * sync. Returns { ok } and revalidates the board.
 */
export async function setTaskStatus(input: {
  person: string;
  day: string;
  label: string;
  status: TaskStatus;
}): Promise<{ ok: boolean }> {
  const ok = await recordStatus({
    person: input.person,
    day: input.day,
    status: input.status,
    label: input.label,
  });
  revalidatePath("/tasks");
  return { ok };
}
