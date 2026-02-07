import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { Project, ProjectService, ComposeConfig } from "@/types";
import { listContainers } from "@/lib/docker";
import { log } from "@/lib/logger";

const COMPOSE_FILENAMES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

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
 * Translate a local project path to the path as seen by the Docker host.
 */
export function toHostPath(localPath: string): string {
  const localBase = getProjectsDir();
  const hostBase = getHostProjectsDir();

  if (localBase === hostBase) {
    return localPath;
  }

  if (localPath.startsWith(localBase)) {
    return hostBase + localPath.slice(localBase.length);
  }

  return localPath;
}

export async function scanProjects(): Promise<Project[]> {
  const projectsDir = getProjectsDir();

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

async function buildProject(
  name: string,
  path: string,
  composeFile: string,
  containers: Awaited<ReturnType<typeof listContainers>>
): Promise<Project> {
  const services: ProjectService[] = [];
  let status: Project["status"] = "unknown";

  try {
    const content = await readFile(composeFile, "utf-8");
    const config = parseYaml(content) as ComposeConfig;

    if (config.services) {
      const projectContainers = containers.filter((c) => c.projectName === name);
      let runningCount = 0;

      for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
        const container = projectContainers.find((c) => c.serviceName === serviceName);

        const service: ProjectService = {
          name: serviceName,
          image: container?.image || serviceConfig.image,
          containerId: container?.id,
          containerName: container?.name,
          status: container?.state === "running" ? "running"
            : container?.state === "restarting" ? "restarting"
            : container ? "exited" : "unknown",
          ports: container?.ports,
          hasBuild: !!serviceConfig.build,
        };

        // Count running or restarting containers as "active" for project status
        if (container?.state === "running" || container?.state === "restarting") runningCount++;
        services.push(service);
      }

      // Determine project status
      if (services.length === 0) {
        status = "unknown";
      } else if (runningCount === services.length) {
        status = "running";
      } else if (runningCount > 0) {
        status = "partial";
      } else {
        status = "stopped";
      }
    }
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
