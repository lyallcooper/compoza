import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshUpdateCacheAndInvalidate, invalidateAllQueries } from "../invalidate";
import { queryKeys } from "../keys";
afterEach(() => vi.unstubAllGlobals());
it("preserves badges during rechecking and on refresh failure", async () => {
  const client = new QueryClient();
  const updates = [{ image: "nginx:latest", updateAvailable: true }];
  client.setQueryData(queryKeys.images.updates, updates);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
  await expect(refreshUpdateCacheAndInvalidate(client, ["nginx:latest"])).rejects.toThrow();
  expect(client.getQueryData(queryKeys.images.updates)).toEqual(updates);
  invalidateAllQueries(client);
  expect(client.getQueryData(queryKeys.images.updates)).toEqual(updates);
  client.clear();
});
