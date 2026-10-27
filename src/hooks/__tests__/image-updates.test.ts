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
