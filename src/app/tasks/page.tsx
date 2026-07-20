import { addDays, buildBoard, todayInTeamTz } from "@/lib/digest";
import TaskBoard from "@/components/TaskBoard";

// Always re-read the sheet so the board mirrors it live.
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const today = todayInTeamTz();
  // Past 2 days of catch-up + the next two weeks of runway.
  const { board, error } = await buildBoard(addDays(today, -2), addDays(today, 14));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team Tasks</h2>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not load the schedule: {error}
        </p>
      )}

      {board && <TaskBoard board={board} />}
    </div>
  );
}
