import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/lib/updates/project-update", () => ({ updateProjectImages: mocks.update }));
import { POST } from "../route";
const context = { params: Promise.resolve({ name: "app" }) };
const request = (body: unknown) => new NextRequest("http://localhost/api/projects/app/update", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => { mocks.update.mockReset(); });

it.each([null, {}, { images: [] }, { images: [1] }, { images: [""] }])("rejects missing or malformed selection %j", async (body) => {
  expect((await POST(request(body), context)).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});

it("passes only the explicit image selection to the server update policy", async () => {
  mocks.update.mockResolvedValue({ projectName: "app", images: ["nginx:latest"], services: ["web"], restarted: true });
  const response = await POST(request({ images: ["nginx:latest"], services: ["db"], includeSkipped: true }), context);
  const body = await response.text();
  expect(mocks.update).toHaveBeenCalledWith("app", ["nginx:latest"], expect.any(Function), expect.any(AbortSignal));
  expect(body).toContain('"type":"done"');
  expect(body).toContain('"services":["web"]');
});

it("reports failure without sending a successful completion", async () => {
  mocks.update.mockRejectedValue(new Error("Pull failed"));
  const body = await (await POST(request({ images: ["nginx:latest"] }), context)).text();
  expect(body).toContain('"type":"error"');
  expect(body).not.toContain('"type":"done"');
});
