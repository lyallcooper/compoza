import { readdir, readFile, stat } from "fs/promises";
import { isAbsolute, join, relative, resolve } from "path";
import { parse as parseYaml } from "yaml";
import type { Project, ProjectStatus, ProjectService, ComposeConfig, Container } from "@/types";
import { listContainers } from "@/lib/docker";
import { log } from "@/lib/logger";
import { normalizeImageName } from "@/lib/format";

const COMPOSE_FILENAMES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];
const PROJECT_SCAN_CACHE_TTL_MS = 2000;

const globalProjectScanCache = globalThis as typeof globalThis & {
  __projectScanCache?: { projects: Project[]; expiresAt: number; projectsDir: string } | null;
  __projectScanInFlight?: Promise<Project[]> | null;
};

if (globalProjectScanCache.__projectScanCache === undefined) {
  globalProjectScanCache.__projectScanCache = null;
  globalProjectScanCache.__projectScanInFlight = null;
}

/**
 * Valid project name pattern: alphanumeric, hyphens, underscores only.
 * Prevents path traversal attacks (e.g., "../../../etc/passwd").
 */
const VALID_PROJECT_NAME = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a project name to prevent path traversal.
 * Returns true if the name is safe to use in file paths.
 */
export function isValidProjectName(name: string): boolean {
  return VALID_PROJECT_NAME.test(name) && name.length > 0 && name.length <= 255;
}

export function getProjectsDir(): string {
  return process.env.PROJECTS_DIR || "/home/user/docker";
}

/**
 * Get the projects directory as seen by the Docker host.
 * Used for path translation when Compoza's path differs from the host's.
 * Defaults to PROJECTS_DIR if not set.
 */
export function getHostProjectsDir(): string {
  return process.env.HOST_PROJECTS_DIR || getProjectsDir();
}

/**
 * Check whether a path is equal to or nested under a base directory.
 */
export function isPathWithinBase(pathToCheck: string, basePath: string): boolean {
  const resolvedPath = resolve(pathToCheck);
  const resolvedBase = resolve(basePath);
  const rel = relative(resolvedBase, resolvedPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function invalidateProjectScanCache(): void {
  globalProjectScanCache.__projectScanCache = null;
  globalProjectScanCache.__projectScanInFlight = null;
}

/**
 * Translate a local project path to the path as seen by the Docker host.
 */
export function toHostPath(localPath: string): string {
  const localBase = getProjectsDir();
  const hostBase = getHostProjectsDir();

  if (localBase === hostBase) {
    return localPath;
  }

  if (isPathWithinBase(localPath, localBase)) {
    const rel = relative(resolve(localBase), resolve(localPath));
    return rel ? join(hostBase, rel) : hostBase;
  }

  return localPath;
}

export async function scanProjects(): Promise<Project[]> {
  const projectsDir = getProjectsDir();

  if (process.env.NODE_ENV !== "test") {
    const cached = globalProjectScanCache.__projectScanCache;
    if (cached && cached.projectsDir === projectsDir && cached.expiresAt > Date.now()) {
      return cached.projects;
    }

    if (globalProjectScanCache.__projectScanInFlight) {
      return globalProjectScanCache.__projectScanInFlight;
    }
  }

  const scanPromise = scanProjectsUncached(projectsDir);

  if (process.env.NODE_ENV !== "test") {
    globalProjectScanCache.__projectScanInFlight = scanPromise;
  }

  try {
    const projects = await scanPromise;
    if (
      process.env.NODE_ENV !== "test"
      && globalProjectScanCache.__projectScanInFlight === scanPromise
    ) {
      globalProjectScanCache.__projectScanCache = {
        projects,
        expiresAt: Date.now() + PROJECT_SCAN_CACHE_TTL_MS,
        projectsDir,
      };
    }
    return projects;
  } finally {
    if (
      process.env.NODE_ENV !== "test"
      && globalProjectScanCache.__projectScanInFlight === scanPromise
    ) {
      globalProjectScanCache.__projectScanInFlight = null;
    }
  }
}

async function scanProjectsUncached(projectsDir: string): Promise<Project[]> {
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const containers = await listContainers({ all: true });

    // Filter to valid project directories
    const projectDirs = entries.filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith(".")
    );

    // Process projects in parallel with concurrency limit
    const CONCURRENCY = 10;
    const projects: Project[] = [];

    for (let i = 0; i < projectDirs.length; i += CONCURRENCY) {
      const batch = projectDirs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (entry) => {
          const projectPath = join(projectsDir, entry.name);
          const composeFile = await findComposeFile(projectPath);
          if (composeFile) {
            return buildProject(entry.name, projectPath, composeFile, containers);
          }
          return null;
        })
      );
      projects.push(...batchResults.filter((p): p is Project => p !== null));
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    log.projects.error("Failed to scan projects", error);
    return [];
  }
}

async function findComposeFile(projectPath: string): Promise<string | null> {
  for (const filename of COMPOSE_FILENAMES) {
    const filePath = join(projectPath, filename);
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        return filePath;
      }
    } catch {
      // File doesn't exist, continue
    }
  }
  return null;
}

/**
 * Build service list and determine project status from a parsed compose config
 * and matching containers. Shared between the real scanner and mock project builder.
 */
export function buildServicesFromConfig(
  config: ComposeConfig,
  projectContainers: Container[],
): { services: ProjectService[]; status: ProjectStatus } {
  const services: ProjectService[] = [];
  let runningCount = 0;

  if (config.services) {
    for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
      const container = projectContainers.find((c) => c.serviceName === serviceName);

      const service: ProjectService = {
        name: serviceName,
        image: container?.image || (serviceConfig.image ? normalizeImageName(serviceConfig.image) : undefined),
        imageId: container?.imageId,
        containerId: container?.id,
        containerName: container?.name,
        status: container?.state === "running" ? "running"
          : container?.state === "restarting" ? "restarting"
          : container ? "exited" : "unknown",
        ports: container?.ports,
        hasBuild: !!serviceConfig.build,
      };

      if (container?.state === "running" || container?.state === "restarting") runningCount++;
      services.push(service);
    }
  }

  let status: ProjectStatus = "unknown";
  if (services.length > 0) {
    if (runningCount === services.length) {
      status = "running";
    } else if (runningCount > 0) {
      status = "partial";
    } else {
      status = "stopped";
    }
  }

  return { services, status };
}

async function buildProject(
  name: string,
  path: string,
  composeFile: string,
  containers: Container[]
): Promise<Project> {
  let services: ProjectService[] = [];
  let status: ProjectStatus = "unknown";

  try {
    const content = await readFile(composeFile, "utf-8");
    const config = parseYaml(content) as ComposeConfig;
    const projectContainers = containers.filter((c) => c.projectName === name);
    ({ services, status } = buildServicesFromConfig(config, projectContainers));
  } catch (error) {
    log.projects.error(`Failed to parse compose file for ${name}`, error);
  }

  return { name, path, composeFile, status, services };
}

export async function getProject(name: string): Promise<Project | null> {
  if (!isValidProjectName(name)) {
    log.projects.warn(`Invalid project name rejected: ${name}`);
    return null;
  }

  const projectsDir = getProjectsDir();
  const projectPath = join(projectsDir, name);

  try {
    const stats = await stat(projectPath);
    if (!stats.isDirectory()) return null;

    const composeFile = await findComposeFile(projectPath);
    if (!composeFile) return null;

    const containers = await listContainers({ all: true });
    return buildProject(name, projectPath, composeFile, containers);
  } catch (error) {
    log.projects.error(`Failed to get project ${name}`, error);
    return null;
  }
}

export async function readComposeFile(projectName: string): Promise<string | null> {
  const project = await getProject(projectName);
  if (!project) return null;

  try {
    return await readFile(project.composeFile, "utf-8");
  } catch (error) {
    log.projects.error(`Failed to read compose file for ${projectName}`, error);
    return null;
  }
}

export async function readEnvFile(projectName: string): Promise<string | null> {
  if (!isValidProjectName(projectName)) {
    log.projects.warn(`Invalid project name rejected: ${projectName}`);
    return null;
  }

  const projectsDir = getProjectsDir();
  const envPath = join(projectsDir, projectName, ".env");

  try {
    return await readFile(envPath, "utf-8");
  } catch {
    return null;
  }
}
