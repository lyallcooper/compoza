import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";
import { GET, POST as checkSelected, DELETE } from "../../check-updates/route";
import { clearCachedUpdates, setCachedUpdate } from "@/lib/updates/cache";
import { getProjectsWithUpdates } from "@/hooks/use-image-updates";
import type { Project } from "@/types";

vi.mock("@/lib/updates/refresh", () => ({
  shouldRefreshUpdates: () => false,
  refreshImageUpdates: vi.fn(),
  buildImageTrackingMap: vi.fn(),
}));

const image = "nginx:latest";
const digest = `sha256:${"a".repeat(64)}`;
const newerDigest = `sha256:${"b".repeat(64)}`;
const request = (body: unknown) => new NextRequest("http://localhost/api/images/ignore-update", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const update = (latestDigest = digest) => setCachedUpdate(image, {
  image, latestDigest, updateAvailable: true, status: "checked",
});

beforeEach(() => {
  clearCachedUpdates();
  (globalThis as typeof globalThis & { __ignoredImageUpdates?: Map<string, Set<string>> }).__ignoredImageUpdates?.clear();
});

it("removes a skipped release from every project's update list and exposes a newer release", async () => {
  const projects = ["web", "proxy"].map((name) => ({ name, status: "running", services: [{ name: "app", image }] })) as Project[];
  update();
  const response = await POST(request({ image, latestDigest: digest }));
  expect(response.status).toBe(200);
  const getRequest = new NextRequest("http://localhost/api/images/check-updates");
  const hidden = await (await GET(getRequest)).json();
  expect(getProjectsWithUpdates(projects, hidden.data)).toEqual([]);
  const selected = await (await checkSelected(request({ images: [image] }))).json();
  expect(selected.data[0].updateAvailable).toBe(false);
  const refreshed = await (await GET(new NextRequest(`${getRequest.url}?refresh`))).json();
  expect(refreshed.data[0].updateAvailable).toBe(false);
  const rechecked = await (await DELETE(request({ images: [image] }))).json();
  expect(rechecked.data[0].updateAvailable).toBe(false);
  update(newerDigest);
  const visible = await (await GET(getRequest)).json();
  expect(getProjectsWithUpdates(projects, visible.data).map((project) => project.name)).toEqual(["web", "proxy"]);
});

it("does not skip a new release that arrived while the user was viewing the previous release", async () => {
  update(newerDigest);
  await POST(request({ image, latestDigest: digest }));
  const result = await (await GET(new NextRequest("http://localhost/api/images/check-updates"))).json();
  expect(result.data[0].updateAvailable).toBe(true);
});

it.each([null, [], {}, { image }, { image: "", latestDigest: digest },
  { image, latestDigest: "latest" }, { image: 1, latestDigest: digest }])("rejects invalid release input %j", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
});

it("rejects malformed JSON and unsupported content types", async () => {
  expect((await POST(new NextRequest("http://localhost", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  }))).status).toBe(400);
  expect((await POST(new NextRequest("http://localhost", { method: "POST", body: "{}" }))).status).toBe(415);
});
