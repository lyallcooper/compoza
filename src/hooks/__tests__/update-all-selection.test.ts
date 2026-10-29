import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(true) }));
vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("../use-background-project-update", () => ({ useBackgroundProjectUpdate: () => ({ updateProject: mocks.update }) }));
import { useUpdateAllProjects } from "../use-update-all-projects";
afterEach(() => { vi.unstubAllGlobals(); mocks.update.mockClear(); });

it("passes an explicit image selection for every project, including the self-project", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "self" }))));
  useUpdateAllProjects().start([
    { name: "self", images: [{ image: "compoza:latest" }] },
    { name: "app", images: [{ image: "nginx:latest" }] },
  ]);
  await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  expect(mocks.update.mock.calls).toEqual([
    ["app", { images: ["nginx:latest"] }],
    ["self", { images: ["compoza:latest"] }],
  ]);
});
