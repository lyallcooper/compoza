import { expect, it } from "vitest";
import { DemoState } from "../state";
import { DEMO_UPDATES } from "../fixtures";
import { checkUpdatesGet, checkUpdatesPost, ignoreUpdate } from "../handlers/images";

it("hides only a skipped demo release and shows a different digest", async () => {
  const state = new DemoState();
  const image = "nginx:1.25-alpine";
  const release = DEMO_UPDATES[image];
  expect(ignoreUpdate(state, { image, latestDigest: release.latestDigest }).status).toBe(200);
  const hidden = await checkUpdatesGet(state).json();
  expect(hidden.data.find((update: { image: string }) => update.image === image).updateAvailable).toBe(false);
  expect(hidden.data.find((update: { image: string }) => update.image !== image).updateAvailable).toBe(true);
  const selected = await checkUpdatesPost(state, { images: [image] }).json();
  expect(selected.data[0].updateAvailable).toBe(false);
  try {
    DEMO_UPDATES[image] = { ...release, latestDigest: `sha256:${"c".repeat(64)}` };
    const newer = await checkUpdatesGet(state).json();
    expect(newer.data.find((update: { image: string }) => update.image === image).updateAvailable).toBe(true);
  } finally {
    DEMO_UPDATES[image] = release;
  }
});
