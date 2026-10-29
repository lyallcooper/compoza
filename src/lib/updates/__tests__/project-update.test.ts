import { beforeEach, expect, it, vi } from "vitest";
import type { Project } from "@/types";
const mocks = vi.hoisted(() => ({ project: vi.fn(), pull: vi.fn(), up: vi.fn(), refresh: vi.fn(), inspect: vi.fn() }));
vi.mock("@/lib/projects/scanner", () => ({ getProject: mocks.project, invalidateProjectScanCache: vi.fn() }));
vi.mock("@/lib/projects/compose", () => ({ composePull: mocks.pull, composeUp: mocks.up }));
vi.mock("../refresh", () => ({ refreshImageUpdates: mocks.refresh }));
vi.mock("@/lib/docker", () => ({ getDocker: () => ({ getImage: (image: string) => ({ inspect: () => mocks.inspect(image) }) }) }));
import { updateProjectImages } from "../project-update";
import { clearCachedUpdates, ignoreImageUpdate, setCachedUpdate } from "../cache";

const web = "nginx:latest";
const db = "postgres:latest";
const project: Project = {
  name: "app", path: "/projects/app", composeFile: "/projects/app/compose.yaml", status: "partial",
  services: [
    { name: "web", image: web, imageId: "old", status: "running" },
    { name: "worker", image: web, imageId: "old", status: "restarting" },
    { name: "updated", image: web, imageId: "new", status: "running" },
    { name: "stopped", image: web, imageId: "old", status: "exited" },
    { name: "db", image: db, imageId: "old", status: "running" },
  ],
};
const output = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  clearCachedUpdates();
  (globalThis as typeof globalThis & { __ignoredImageUpdates?: Map<string, Set<string>> }).__ignoredImageUpdates?.clear();
  mocks.project.mockResolvedValue(project);
  mocks.pull.mockResolvedValue({ success: true });
  mocks.up.mockResolvedValue({ success: true });
  mocks.inspect.mockResolvedValue({ RepoDigests: ["nginx@sha256:release"] });
  for (const image of [web, db]) setCachedUpdate(image, {
    image, updateAvailable: true, status: "checked", latestDigest: "sha256:release",
    checkedImageIds: ["old", "new"], outdatedImageIds: ["old"],
  });
  ignoreImageUpdate(db, "sha256:release");
});

it("rejects skipped images even when explicitly included in a dashboard request", async () => {
  const result = await updateProjectImages("app", [web, db], output);
  expect(mocks.refresh).toHaveBeenCalledWith(true, [web, db]);
  expect(mocks.pull.mock.calls[0][1].services).toEqual(["web", "worker", "stopped"]);
  expect(mocks.up.mock.calls[0][1].services).toEqual(["web", "worker"]);
  expect(result.images).toEqual([web]);
  expect(result.services).not.toContain("db");
});

it("never falls back to a whole-project operation when all selected updates are skipped", async () => {
  expect(await updateProjectImages("app", [db], output)).toMatchObject({ images: [], restarted: false });
  expect(mocks.pull).not.toHaveBeenCalled();
  expect(mocks.up).not.toHaveBeenCalled();
});

it("treats normalized shared image references consistently", async () => {
  ignoreImageUpdate(`docker.io/library/${web}`, "sha256:release");
  expect(await updateProjectImages("app", [web, db], output)).toMatchObject({ images: [] });
  expect(mocks.pull).not.toHaveBeenCalled();
});

it("keeps stopped services stopped", async () => {
  mocks.project.mockResolvedValue({ ...project, services: [project.services[3]] });
  expect(await updateProjectImages("app", [web], output)).toMatchObject({ restarted: false });
  expect(mocks.pull).toHaveBeenCalled();
  expect(mocks.up).not.toHaveBeenCalled();
});

it("does not recreate a release skipped while its pull was running", async () => {
  mocks.pull.mockImplementation(async () => {
    ignoreImageUpdate(web, "sha256:release");
    return { success: true };
  });
  await updateProjectImages("app", [web], output);
  expect(mocks.up).not.toHaveBeenCalled();
});

it("permits a newer release of a previously skipped image", async () => {
  setCachedUpdate(db, { image: db, updateAvailable: true, status: "checked", latestDigest: "sha256:newer" });
  mocks.inspect.mockResolvedValue({ RepoDigests: ["postgres@sha256:newer"] });
  expect(await updateProjectImages("app", [db], output)).toMatchObject({ images: [db], services: ["db"] });
});

it("does not recreate services if a tag advanced to a different release during pull", async () => {
  mocks.inspect.mockResolvedValue({ RepoDigests: ["nginx@sha256:different"] });
  await expect(updateProjectImages("app", [web], output)).rejects.toThrow("changed while updating");
  expect(mocks.up).not.toHaveBeenCalled();
});

it("stops before recreation when pulling fails", async () => {
  mocks.pull.mockResolvedValue({ success: false, error: "Pull failed" });
  await expect(updateProjectImages("app", [web], output)).rejects.toThrow("Pull failed");
  expect(mocks.up).not.toHaveBeenCalled();
});

it("reports recreation failure", async () => {
  mocks.up.mockResolvedValue({ success: false, error: "Up failed" });
  await expect(updateProjectImages("app", [web], output)).rejects.toThrow("Up failed");
});

it("rejects an empty selection instead of updating every image", async () => {
  await expect(updateProjectImages("app", [], output)).rejects.toThrow("Select at least one");
  expect(mocks.pull).not.toHaveBeenCalled();
});
