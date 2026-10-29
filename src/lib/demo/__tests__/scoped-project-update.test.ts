import { expect, it, vi } from "vitest";
import { DemoState } from "../state";
import { DEMO_UPDATES } from "../fixtures";
import { projectUpdate, projectPull } from "../handlers/compose-ops";

it("leaves skipped releases untouched while other selected images are updated", async () => {
  const state = new DemoState();
  const skipped = "nginx:1.25-alpine";
  const selected = "grafana/grafana:10.2.3";
  state.ignoredImageUpdates.set(skipped, new Set([DEMO_UPDATES[skipped].latestDigest]));
  vi.spyOn(state, "getProject").mockReturnValue({
    name: "mixed", path: "/projects/mixed", composeFile: "/projects/mixed/compose.yaml", status: "running",
    services: [{ name: "web", image: skipped, status: "running" }, { name: "metrics", image: selected, status: "running" }],
  });
  const body = await projectUpdate(state, "mixed", { images: [skipped, selected] }).text();
  expect(body).toContain('"services":["metrics"]');
  expect(body).not.toContain("Pulling web");
  expect(state.clearedImageUpdates.has(skipped)).toBe(false);
  expect(state.clearedImageUpdates.has(selected)).toBe(true);
  // An explicit manual project pull still permits installing the skipped release.
  await projectPull(state, "mixed").text();
  expect(state.clearedImageUpdates.has(skipped)).toBe(true);
});
