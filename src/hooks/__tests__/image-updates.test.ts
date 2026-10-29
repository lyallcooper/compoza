import { expect, it } from "vitest";
import { getProjectsWithUpdates, hasImageUpdate, type ImageUpdateStatus } from "../use-image-updates";
import type { Project } from "@/types";
const update: ImageUpdateStatus = { image: "nginx:latest", updateAvailable: true, status: "checked", checkedAt: 1, outdatedImageIds: ["old"], checkedImageIds: ["old", "new"] };
it("shows a shared image update only for projects still using the old image", () => {
  const projects = ["old", "new"].map((id) => ({ name: id, status: "running", services: [{ name: "web", image: update.image, imageId: id }] })) as Project[];
  expect(getProjectsWithUpdates(projects, [update]).map((project) => project.name)).toEqual(["old"]);
});
it("preserves a known update when verification becomes unavailable", () => {
  expect(hasImageUpdate({ ...update, status: "unknown" }, "new-id")).toBe(true);
});

it("keeps badges for newly observed image IDs until they are verified", () => {
  expect(hasImageUpdate(update, "unverified")).toBe(true);
});

it("keeps skipped releases out of notifications but includes them in manual dialogs", () => {
  const skipped = { ...update, updateAvailable: false, ignored: true, latestDigest: "sha256:skipped" };
  const projects = [{ name: "web", status: "running", services: [{ name: "app", image: update.image, imageId: "old" }] }] as Project[];
  expect(hasImageUpdate(skipped, "old")).toBe(false);
  expect(hasImageUpdate(skipped, "old", true)).toBe(true);
  expect(getProjectsWithUpdates(projects, [skipped])).toEqual([]);
  const [dialog] = getProjectsWithUpdates(projects, [skipped], { includeIgnored: true });
  expect(dialog.images[0]).toMatchObject({ image: update.image, ignored: true, latestDigest: "sha256:skipped" });
});

it("does not show a skipped release in a manual dialog for containers already using it", () => {
  const skipped = { ...update, updateAvailable: false, ignored: true };
  expect(hasImageUpdate(skipped, "new", true)).toBe(false);
  const projects = [{ name: "web", status: "running", services: [{ name: "app", image: update.image, imageId: "new" }] }] as Project[];
  expect(getProjectsWithUpdates(projects, [skipped], { includeIgnored: true })).toEqual([]);
});

it("does not treat an up-to-date image as a skipped release", () => {
  expect(hasImageUpdate({ ...update, updateAvailable: false }, "old", true)).toBe(false);
});
