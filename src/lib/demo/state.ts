import type {
  Container,
  DiskUsage,
  DockerImage,
  DockerNetwork,
  DockerVolume,
  DockerSystemInfo,
  Project,
  SystemPruneResult,
} from "@/types";
import {
  createContainers,
  createImages,
  createNetworks,
  createVolumes,
  createSystemInfo,
  COMPOSE_FILES,
  ENV_FILES,
  DEMO_UPDATES,
  buildProject,
  extractServices,
} from "./fixtures";

export class DemoState {
  containers: Map<string, Container>;
  images: Map<string, DockerImage>;
  networks: Map<string, DockerNetwork>;
  volumes: Map<string, DockerVolume>;
  systemInfo: DockerSystemInfo;
  composeFiles: Record<string, string>;
  envFiles: Record<string, string>;
  /** Image names (e.g. "nginx:1.25-alpine") whose updates have been consumed */
  clearedImageUpdates: Set<string>;

  constructor() {
    this.containers = createContainers();
    this.images = createImages();
    this.networks = createNetworks();
    this.volumes = createVolumes();
    this.systemInfo = createSystemInfo();
    this.composeFiles = { ...COMPOSE_FILES };
    this.envFiles = { ...ENV_FILES };
    this.clearedImageUpdates = new Set();
  }

  // --- Container mutations ---

  startContainer(id: string): boolean {
    const c = this.containers.get(id);
    if (!c || c.state === "running") return false;
    c.state = "running";
    c.status = "Up Less than a second";
    c.startedAt = Math.floor(Date.now() / 1000);
    c.exitCode = undefined;
    c.actions = { canStart: false, canStop: true, canRestart: true, canUpdate: true, canViewLogs: true, canExec: true };
    return true;
  }

  stopContainer(id: string): boolean {
    const c = this.containers.get(id);
    if (!c || c.state === "exited") return false;
    c.state = "exited";
    c.status = "Exited (0) Less than a second ago";
    c.exitCode = 0;
    c.actions = { canStart: true, canStop: false, canRestart: false, canUpdate: true, canViewLogs: true, canExec: false };
    return true;
  }

  restartContainer(id: string): boolean {
    const c = this.containers.get(id);
    if (!c) return false;
    c.state = "running";
    c.status = "Up Less than a second";
    c.startedAt = Math.floor(Date.now() / 1000);
    c.exitCode = undefined;
    c.restartCount = (c.restartCount ?? 0) + 1;
    c.actions = { canStart: false, canStop: true, canRestart: true, canUpdate: true, canViewLogs: true, canExec: true };
    return true;
  }

  removeContainer(id: string, force?: boolean): boolean | "running" {
    const c = this.containers.get(id);
    if (!c) return false;
    if ((c.state === "running" || c.state === "restarting") && !force) return "running";
    return this.containers.delete(id);
  }

  pruneContainers(): string[] {
    const pruned: string[] = [];
    for (const [id, c] of this.containers) {
      if (c.state === "exited") {
        pruned.push(id);
      }
    }
    for (const id of pruned) this.containers.delete(id);
    return pruned;
  }

  // --- Project operations ---

  listProjects(): Project[] {
    const names = Object.keys(this.composeFiles);
    const projects: Project[] = [];
    for (const name of names) {
      const p = buildProject(name, this.containers);
      if (p) projects.push(p);
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  getProject(name: string): Project | null {
    return buildProject(name, this.containers);
  }

  createProject(name: string, composeContent: string, envContent?: string): void {
    this.composeFiles[name] = composeContent;
    if (envContent) this.envFiles[name] = envContent;
  }

  deleteProject(name: string): boolean {
    if (!this.composeFiles[name]) return false;
    // Remove containers for this project
    for (const [id, c] of this.containers) {
      if (c.projectName === name) this.containers.delete(id);
    }
    // Remove network
    for (const [id, n] of this.networks) {
      if (n.labels["com.docker.compose.project"] === name) this.networks.delete(id);
    }
    delete this.composeFiles[name];
    delete this.envFiles[name];
    return true;
  }

  /** Simulate "docker compose up" — start existing containers, or create + start from YAML */
  projectUp(name: string): void {
    const yaml = this.composeFiles[name];
    if (!yaml) return;

    // If containers already exist for this project, just start them
    const existing = [...this.containers.values()].filter((c) => c.projectName === name);
    if (existing.length > 0) {
      for (const c of existing) this.startContainer(c.id);
      return;
    }

    // No containers — create them from the compose YAML
    const services = extractServices(yaml);
    const networkName = `${name}_default`;
    const now = Math.floor(Date.now() / 1000);

    // Ensure project network exists
    const hasNetwork = [...this.networks.values()].some((n) => n.name === networkName);
    if (!hasNetwork) {
      this.createNetwork(networkName);
      const net = [...this.networks.values()].find((n) => n.name === networkName);
      if (net) {
        net.labels = {
          "com.docker.compose.project": name,
          "com.docker.compose.network": "default",
        };
        net.actions = { canDelete: false };
      }
    }

    // Create and start a container for each service
    let ipSuffix = 2;
    for (const svc of services) {
      const id = crypto.randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
      const image = svc.image ?? "unknown";

      // Resolve imageId from existing images, or use a placeholder
      const existingImg = [...this.images.values()].find(
        (i) => i.name === image || i.tags.includes(image)
      );
      const imageId = existingImg?.id ?? `sha256:${id}`;

      this.containers.set(id, {
        id,
        name: `${name}-${svc.name}-1`,
        image,
        imageId,
        state: "running",
        status: "Up Less than a second",
        created: now,
        startedAt: now,
        ports: [],
        labels: {
          "com.docker.compose.project": name,
          "com.docker.compose.service": svc.name,
          "com.docker.compose.oneoff": "False",
          "com.docker.compose.project.working_dir": `/home/user/docker/${name}`,
          "com.docker.compose.project.config_files": `/home/user/docker/${name}/compose.yaml`,
        },
        projectName: name,
        serviceName: svc.name,
        updateStrategy: "compose",
        actions: { canStart: false, canStop: true, canRestart: true, canUpdate: true, canViewLogs: true, canExec: true },
        env: {},
        mounts: [],
        networks: [{ name: networkName, ipAddress: `172.22.0.${ipSuffix++}`, gateway: "172.22.0.1", macAddress: "" }],
      });
    }
  }

  /** Simulate "docker compose down" — remove project containers and network */
  projectDown(name: string): void {
    for (const [id, c] of this.containers) {
      if (c.projectName === name) this.containers.delete(id);
    }
    for (const [id, n] of this.networks) {
      if (n.labels["com.docker.compose.project"] === name) this.networks.delete(id);
    }
  }

  // --- Image mutations ---

  /** Mark an image as updated — clears updateAvailable and records it so check-updates reflects the change */
  clearImageUpdate(imageName: string): void {
    this.clearedImageUpdates.add(imageName);
    for (const img of this.images.values()) {
      if (img.name === imageName) {
        img.updateAvailable = false;
      }
    }
  }

  clearAllImageUpdates(): void {
    for (const img of this.images.values()) {
      img.updateAvailable = false;
    }
    this.clearedImageUpdates = new Set(
      [...this.clearedImageUpdates, ...Object.keys(DEMO_UPDATES)]
    );
  }

  deleteImage(id: string): boolean {
    return this.images.delete(id);
  }

  pruneImages(): { deleted: number; spaceReclaimed: number } {
    // Find which image IDs are in use by containers
    const usedIds = new Set<string>();
    for (const c of this.containers.values()) {
      usedIds.add(c.imageId);
    }
    const toDelete: string[] = [];
    let spaceReclaimed = 0;
    for (const [id, img] of this.images) {
      if (!usedIds.has(id)) {
        toDelete.push(id);
        spaceReclaimed += img.size ?? 0;
      }
    }
    for (const id of toDelete) this.images.delete(id);
    return { deleted: toDelete.length, spaceReclaimed };
  }

  // --- Volume mutations ---

  createVolume(name: string, driver?: string, labels?: Record<string, string>): void {
    this.volumes.set(name, {
      name,
      driver: driver ?? "local",
      mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      scope: "local",
      labels: labels ?? {},
      options: null,
      created: new Date().toISOString(),
      size: 0,
      containerCount: 0,
      containers: [],
      actions: { canDelete: true },
    });
  }

  deleteVolume(name: string): boolean {
    return this.volumes.delete(name);
  }

  pruneVolumes(): { deleted: number; spaceReclaimed: number } {
    // Find which volume names are in use by container mounts
    const usedNames = new Set<string>();
    for (const c of this.containers.values()) {
      for (const m of c.mounts) {
        if (m.name) usedNames.add(m.name);
      }
    }
    const toDelete: string[] = [];
    let spaceReclaimed = 0;
    for (const [name, v] of this.volumes) {
      if (v.actions.canDelete && !usedNames.has(name)) {
        toDelete.push(name);
        spaceReclaimed += v.size ?? 0;
      }
    }
    for (const name of toDelete) this.volumes.delete(name);
    return { deleted: toDelete.length, spaceReclaimed };
  }

  // --- Network mutations ---

  createNetwork(name: string, driver?: string, subnet?: string, gateway?: string): void {
    const id = "net" + Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64);
    this.networks.set(id, {
      id,
      name,
      driver: driver ?? "bridge",
      scope: "local",
      internal: false,
      attachable: false,
      ipam: subnet ? { subnet, gateway } : null,
      containerCount: 0,
      containers: [],
      options: {},
      labels: {},
      created: new Date().toISOString(),
      actions: { canDelete: true },
    });
  }

  deleteNetwork(id: string): boolean {
    return this.networks.delete(id);
  }

  pruneNetworks(): { deleted: number } {
    // Find which network names are in use by containers
    const usedNames = new Set<string>();
    for (const c of this.containers.values()) {
      for (const n of c.networks) usedNames.add(n.name);
    }
    const toDelete: string[] = [];
    for (const [id, n] of this.networks) {
      if (n.actions.canDelete && !usedNames.has(n.name)) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) this.networks.delete(id);
    return { deleted: toDelete.length };
  }

  // --- System ---

  systemPrune(options: {
    containers?: boolean;
    networks?: boolean;
    images?: boolean;
    volumes?: boolean;
    buildCache?: boolean;
  }): SystemPruneResult {
    let spaceReclaimed = 0;
    let containersDeleted = 0;
    let networksDeleted = 0;
    let imagesDeleted = 0;
    let volumesDeleted = 0;
    let buildCacheSpaceReclaimed = 0;

    if (options.containers) {
      const pruned = this.pruneContainers();
      containersDeleted = pruned.length;
      spaceReclaimed += containersDeleted * 500_000;
    }
    if (options.networks) {
      const result = this.pruneNetworks();
      networksDeleted = result.deleted;
    }
    if (options.images) {
      const result = this.pruneImages();
      imagesDeleted = result.deleted;
      spaceReclaimed += result.spaceReclaimed;
    }
    if (options.volumes) {
      const result = this.pruneVolumes();
      volumesDeleted = result.deleted;
      spaceReclaimed += result.spaceReclaimed;
    }
    if (options.buildCache) {
      buildCacheSpaceReclaimed = 80_000_000;
      spaceReclaimed += buildCacheSpaceReclaimed;
    }

    return {
      containersDeleted,
      networksDeleted,
      imagesDeleted,
      volumesDeleted,
      buildCacheSpaceReclaimed,
      spaceReclaimed,
    };
  }

  getDiskUsage(): DiskUsage {
    // Images: unused images are reclaimable
    const usedImageIds = new Set<string>();
    for (const c of this.containers.values()) usedImageIds.add(c.imageId);
    let imageSize = 0;
    let imageReclaimable = 0;
    for (const img of this.images.values()) {
      const s = img.size ?? 0;
      imageSize += s;
      if (!usedImageIds.has(img.id)) imageReclaimable += s;
    }

    // Containers: stopped containers are reclaimable (small log/diff layer)
    const containerCount = this.containers.size;
    const stoppedCount = [...this.containers.values()].filter((c) => c.state === "exited").length;
    const containerSize = containerCount * 2_750_000; // ~2.75MB avg log/diff per container
    const containerReclaimable = stoppedCount * 2_750_000;

    // Volumes: unused volumes are reclaimable
    const usedVolumeNames = new Set<string>();
    for (const c of this.containers.values()) {
      for (const m of c.mounts) {
        if (m.name) usedVolumeNames.add(m.name);
      }
    }
    let volumeSize = 0;
    let volumeReclaimable = 0;
    for (const v of this.volumes.values()) {
      const s = v.size ?? 0;
      volumeSize += s;
      if (v.actions.canDelete && !usedVolumeNames.has(v.name)) volumeReclaimable += s;
    }

    // Build cache: static (not tracked in demo state)
    const buildCacheSize = 230_000_000;
    const buildCacheReclaimable = 80_000_000;

    const totalSize = imageSize + containerSize + volumeSize + buildCacheSize;
    const totalReclaimable = imageReclaimable + containerReclaimable + volumeReclaimable + buildCacheReclaimable;

    return {
      images: { total: this.images.size, size: imageSize, reclaimable: imageReclaimable },
      containers: { total: containerCount, size: containerSize, reclaimable: containerReclaimable },
      volumes: { total: this.volumes.size, size: volumeSize, reclaimable: volumeReclaimable },
      buildCache: { total: 2, size: buildCacheSize, reclaimable: buildCacheReclaimable },
      totalSize,
      totalReclaimable,
    };
  }
}
