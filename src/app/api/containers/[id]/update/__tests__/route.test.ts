import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ container: vi.fn(), pull: vi.fn(), up: vi.fn() }));
vi.mock("@/lib/docker", () => ({ getContainer: mocks.container }));
vi.mock("@/lib/projects", () => ({ composePullService: mocks.pull, composeUpService: mocks.up }));
import { POST } from "../route";
import { clearCachedUpdates, setCachedUpdate, getCachedUpdate } from "@/lib/updates/cache";
const image = "nginx:latest";
beforeEach(() => {
  clearCachedUpdates();
  setCachedUpdate(image, { image, updateAvailable: true, status: "checked" });
  mocks.container.mockResolvedValue({ image, projectName: "app", serviceName: "web", state: "running", actions: { canUpdate: true } });
  mocks.pull.mockResolvedValue({ success: true });
  mocks.up.mockResolvedValue({ success: true });
});
afterEach(() => { clearCachedUpdates(); vi.clearAllMocks(); });
async function update() {
  return (await POST(new NextRequest("http://localhost/api/containers/id/update", { method: "POST" }), { params: Promise.resolve({ id: "id" }) })).text();
}
it("retains the badge if recreation fails after pulling", async () => {
  mocks.up.mockResolvedValue({ success: false, error: "Recreation failed" });
  expect(await update()).toContain("Recreation failed");
  expect(getCachedUpdate(image)?.updateAvailable).toBe(true);
});
it("recreates actively restarting containers", async () => {
  mocks.container.mockResolvedValue({ image, projectName: "app", serviceName: "web", state: "restarting", actions: { canUpdate: true } });
  expect(await update()).toContain('"restarted":true');
  expect(mocks.up).toHaveBeenCalled();
});
it("keeps stopped containers stopped and preserves their update state", async () => {
  mocks.container.mockResolvedValue({ image, projectName: "app", serviceName: "web", state: "exited", actions: { canUpdate: true } });
  expect(await update()).toContain('"restarted":false');
  expect(mocks.up).not.toHaveBeenCalled();
  expect(getCachedUpdate(image)?.updateAvailable).toBe(true);
});
