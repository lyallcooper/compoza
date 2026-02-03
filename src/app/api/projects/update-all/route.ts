import { NextRequest } from "next/server";
import { scanProjects, composePull, composeUp } from "@/lib/projects";
import { clearCachedUpdates } from "@/lib/updates";
import { isProjectRunning } from "@/types";

export type UpdateAllEvent =
  | { type: "start"; project: string; total: number; current: number }
  | { type: "progress"; project: string; step: "checking" | "pulling" | "restarting" }
  | { type: "complete"; project: string; restarted: boolean }
  | { type: "error"; project: string; message: string }
  | { type: "done"; summary: { updated: number; failed: number } };

export async function POST(request: NextRequest) {
  // Get project names from request body
  const body = await request.json().catch(() => ({}));
  const projectNames: string[] = body.projects || [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: UpdateAllEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (projectNames.length === 0) {
          send({ type: "done", summary: { updated: 0, failed: 0 } });
          controller.close();
          return;
        }

        // Get all projects and filter to requested ones
        const allProjects = await scanProjects();
        const projectNameSet = new Set(projectNames);
        const projectsWithUpdates = allProjects.filter((project) =>
          projectNameSet.has(project.name)
        );

        let updated = 0;
        let failed = 0;
        const total = projectsWithUpdates.length;

        // Process each project sequentially
        for (let i = 0; i < projectsWithUpdates.length; i++) {
          const project = projectsWithUpdates[i];
          const current = i + 1;

          send({ type: "start", project: project.name, total, current });

          try {
            // Check if running
            send({ type: "progress", project: project.name, step: "checking" });
            const wasRunning = isProjectRunning(project);

            // Pull images
            send({ type: "progress", project: project.name, step: "pulling" });
            const pullResult = await composePull(project.name);

            if (!pullResult.success) {
              send({ type: "error", project: project.name, message: pullResult.error || "Failed to pull images" });
              failed++;
              continue;
            }

            // Restart if was running
            let restarted = false;
            if (wasRunning) {
              send({ type: "progress", project: project.name, step: "restarting" });
              const upResult = await composeUp(project.name);

              if (!upResult.success) {
                send({ type: "error", project: project.name, message: upResult.error || "Failed to restart project" });
                failed++;
                continue;
              }
              restarted = true;
            }

            send({ type: "complete", project: project.name, restarted });
            updated++;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            send({ type: "error", project: project.name, message });
            failed++;
          }
        }

        // Clear update cache so images get rechecked
        clearCachedUpdates();

        send({ type: "done", summary: { updated, failed } });
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        send({ type: "error", project: "", message: `Failed to start update: ${message}` });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
