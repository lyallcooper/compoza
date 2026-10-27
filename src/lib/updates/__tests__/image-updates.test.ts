import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), distribution: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/docker", () => ({
  getDocker: () => ({ getImage: (id: string) => ({ inspect: () => mocks.inspect(id) }) }),
  getImageDistribution: mocks.distribution,
}));
vi.mock("@/lib/registries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/registries")>(),
  queryRegistry: mocks.query,
  resolveVersions: async () => ({}),
}));
import { checkImageUpdates } from "../image-updates";
import { clearCachedUpdates, getCachedUpdate, setCachedUpdate } from "../cache";
const image = "registry.example.com:5000/app:latest";
beforeEach(() => {
  clearCachedUpdates();
  mocks.inspect.mockImplementation(async (id: string) => ({ RepoDigests: [`registry.example.com:5000/app@sha256:${id}`] }));
  mocks.distribution.mockResolvedValue({ Descriptor: { digest: "sha256:new" } });
});
afterEach(() => { clearCachedUpdates(); vi.clearAllMocks(); });

it("keeps updates available until every tracked image matches", async () => {
  const [mixed] = await checkImageUpdates(new Map([[image, ["old", "new"]]]));
  expect(mixed.updateAvailable).toBe(true);
  const [updated] = await checkImageUpdates(new Map([[image, ["new"]]]), { force: true });
  expect(updated.updateAvailable).toBe(false);
});

it("also compares every image in the consolidated registry path", async () => {
  mocks.query.mockResolvedValue({ latestDigest: "sha256:new", updateAvailable: true });
  const [result] = await checkImageUpdates(new Map([["nginx:latest", ["old", "new"]]]));
  expect(result.updateAvailable).toBe(true);
});

it("preserves a known update when the registry check fails", async () => {
  setCachedUpdate(image, { image, updateAvailable: true, status: "checked" });
  mocks.distribution.mockRejectedValue(new Error("Registry unavailable"));
  const [result] = await checkImageUpdates(new Map([[image, ["old"]]]), { force: true });
  expect(result.updateAvailable).toBe(true);
  expect(result.status).toBe("unknown");
});

it("does not substitute a downloaded tag for an unresolved container image", async () => {
  mocks.inspect.mockRejectedValue(new Error("Image unavailable"));
  const [result] = await checkImageUpdates(new Map([[image, ["old"]]]));
  expect(result.updateAvailable).toBe(true);
  expect(result.status).toBe("unknown");
});

it("waits for a pre-update check before committing fresh container state", async () => {
  let release!: () => void;
  mocks.distribution.mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve({ Descriptor: { digest: "sha256:new" } });
  }));
  const oldCheck = checkImageUpdates(new Map([[image, ["old"]]]));
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const freshCheck = checkImageUpdates(new Map([[image, ["new"]]]), { force: true });
  release();
  await Promise.all([oldCheck, freshCheck]);
  expect(getCachedUpdate(image)?.updateAvailable).toBe(false);
});
