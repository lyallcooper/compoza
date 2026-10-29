import { getProject, invalidateProjectScanCache } from "@/lib/projects/scanner";
import { composePull, composeUp } from "@/lib/projects/compose";
import { getDocker } from "@/lib/docker";
import { normalizeImageName } from "@/lib/format";
import { getCachedUpdate, isImageUpdateIgnored } from "./cache";
import { refreshImageUpdates } from "./refresh";
import type { ProjectService } from "@/types";

export interface ProjectUpdateResult {
  projectName: string;
  images: string[];
  services: string[];
  restarted: boolean;
}

function eligible(service: ProjectService): boolean {
  if (!service.image) return false;
  const image = normalizeImageName(service.image);
  const update = getCachedUpdate(image);
  return !!update?.updateAvailable && !isImageUpdateIgnored(image, update.latestDigest) && (
    !service.imageId || update.status !== "checked" || !update.outdatedImageIds
    || !update.checkedImageIds?.includes(service.imageId) || update.outdatedImageIds.includes(service.imageId)
  );
}

/** Dashboard updates always enforce the current skip policy on the server. */
export async function updateProjectImages(
  projectName: string,
  requestedImages: string[],
  onOutput: (data: string) => void,
  signal?: AbortSignal
): Promise<ProjectUpdateResult> {
  if (requestedImages.length === 0) throw new Error("Select at least one image to update");
  const requested = new Set(requestedImages.map(normalizeImageName));
  await refreshImageUpdates(true, [...requested]);
  invalidateProjectScanCache();
  const project = await getProject(projectName);
  if (!project) throw new Error("Project not found");

  const selected = project.services.filter((service) =>
    service.image && requested.has(normalizeImageName(service.image)) && eligible(service)
  );
  if (selected.length === 0) {
    onOutput("No non-skipped image updates remain.\n");
    return { projectName, images: [], services: [], restarted: false };
  }

  const images = [...new Set(selected.map((service) => normalizeImageName(service.image!)))];
  const expectedDigests = new Map(images.map((image) => [image, getCachedUpdate(image)?.latestDigest]));
  onOutput("Pulling selected images...\n");
  const pull = await composePull(projectName, { services: selected.map((service) => service.name), signal }, onOutput);
  if (!pull.success) throw new Error(pull.error || "Failed to pull selected images");

  // A mutable tag can advance during a pull. Never install an unreviewed release.
  for (const [image, digest] of expectedDigests) {
    if (!digest) continue;
    const inspection = await getDocker().getImage(image).inspect();
    if (!inspection.RepoDigests?.some((ref) => ref.endsWith(`@${digest}`))) {
      throw new Error(`The release for ${image} changed while updating. Refresh and try again.`);
    }
  }

  // Recheck skips after pulling, including changes from another browser.
  const running = selected.filter((service) => eligible(service)
    && (service.status === "running" || service.status === "restarting"));
  if (running.length > 0) {
    onOutput("Recreating selected services...\n");
    const up = await composeUp(projectName, { services: running.map((service) => service.name), signal }, onOutput);
    if (!up.success) throw new Error(up.error || "Failed to recreate selected services");
  }

  return { projectName, images, services: selected.map((service) => service.name), restarted: running.length > 0 };
}
