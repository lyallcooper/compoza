import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ operation: vi.fn(), stream: vi.fn(), output: vi.fn(), fetch: vi.fn() }));
vi.mock("react", () => ({ useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory() }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.fetch }));
vi.mock("../use-background-operation", () => ({
  useBackgroundOperation: mocks.operation, consumeSSEStream: mocks.stream, consumeOutputStream: mocks.output,
}));
import { useBackgroundProjectUpdate } from "../use-background-project-update";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.operation.mockReturnValue({ execute: vi.fn() });
  mocks.fetch.mockResolvedValue({ status: "running", services: [{ image: "nginx:latest" }] });
});
const callbacks = () => ({ setProgress: vi.fn(), appendOutput: vi.fn(), signal: new AbortController().signal });
const config = () => {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React hooks are mocked to inspect the operation configuration.
  useBackgroundProjectUpdate();
  return mocks.operation.mock.calls[0][0];
};

it("uses the server-enforced selection endpoint for dashboard updates", async () => {
  mocks.stream.mockImplementation(async (_url, options) => {
    expect(options.body).toEqual({ images: ["nginx:latest"] });
    options.onEvent({ type: "done", result: { projectName: "app", images: ["nginx:latest"], services: ["web"], restarted: true } });
  });
  await config().execute({ projectName: "app", images: ["nginx:latest"] }, callbacks());
  expect(mocks.stream.mock.calls[0][0]).toBe("/api/projects/app/update");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.output).not.toHaveBeenCalled();
});

it("never falls back to a manual whole-project update on selection failure", async () => {
  mocks.stream.mockImplementation(async (_url, options) => options.onEvent({ type: "error", message: "Selection rejected" }));
  await expect(config().execute({ projectName: "app", images: [] }, callbacks())).rejects.toThrow("Selection rejected");
  expect(mocks.output).not.toHaveBeenCalled();
});

it("preserves the explicit manual project update path", async () => {
  await config().execute({ projectName: "app" }, callbacks());
  expect(mocks.output.mock.calls.map((call) => call[0])).toEqual(["/api/projects/app/pull", "/api/projects/app/up"]);
  expect(mocks.stream).not.toHaveBeenCalled();
});
