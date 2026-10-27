import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ list: vi.fn(), check: vi.fn() }));
vi.mock("@/lib/docker", () => ({ listContainers: mocks.list }));
vi.mock("../image-updates", () => ({ checkImageUpdates: mocks.check }));
import { DELETE, GET } from "@/app/api/images/check-updates/route";
import { clearCachedUpdates, setCachedUpdate, getCachedUpdate } from "../cache";
import { refreshImageUpdates } from "../refresh";
const image = "nginx:latest";
beforeEach(() => {
  clearCachedUpdates();
  mocks.list.mockResolvedValue([{ image, imageId: "old", created: 1 }]);
  mocks.check.mockResolvedValue([]);
});
afterEach(() => { clearCachedUpdates(); vi.clearAllMocks(); });
it("keeps the existing badge until the forced check verifies containers", async () => {
  setCachedUpdate(image, { image, updateAvailable: true, status: "checked" });
  mocks.check.mockImplementation(async (images, options) => {
    expect(images.get(image)).toEqual(["old"]);
    expect(options).toEqual({ force: true });
    expect(getCachedUpdate(image)?.updateAvailable).toBe(true);
    setCachedUpdate(image, { image, updateAvailable: false, status: "checked" });
  });
  const response = await DELETE(new NextRequest("http://localhost/api/images/check-updates", { method: "DELETE", body: JSON.stringify({ images: [image] }) }));
  expect(response.status).toBe(200);
  expect(getCachedUpdate(image)?.updateAvailable).toBe(false);
});
it("retains badges if Docker cannot be inspected", async () => {
  setCachedUpdate(image, { image, updateAvailable: true, status: "checked" });
  mocks.list.mockRejectedValueOnce(new Error("Docker unavailable"));
  const response = await DELETE(new NextRequest("http://localhost/api/images/check-updates", { method: "DELETE" }));
  expect(response.status).toBe(500);
  expect(getCachedUpdate(image)?.updateAvailable).toBe(true);
});
it("gets a fresh container snapshot after an older refresh finishes", async () => {
  let release!: () => void;
  mocks.check.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const first = refreshImageUpdates();
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  const second = refreshImageUpdates(true);
  mocks.list.mockResolvedValue([{ image, imageId: "new", created: 2 }]);
  release();
  await Promise.all([first, second]);
  expect(mocks.check.mock.calls[1][0].get(image)).toEqual(["new"]);
});
it("serves cached results during an ordinary poll", async () => {
  setCachedUpdate(image, { image, updateAvailable: true, status: "checked" });
  const response = await GET(new NextRequest("http://localhost/api/images/check-updates"));
  expect((await response.json()).data[0].updateAvailable).toBe(true);
});
