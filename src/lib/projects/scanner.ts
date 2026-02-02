import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { Project, ProjectService, ComposeConfig } from "@/types";
import { listContainers } from "@/lib/docker";

const COMPOSE_FILENAMES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

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
  const projects: Project[] = [];

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const containers = await listContainers(true);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const projectPath = join(projectsDir, entry.name);
      const composeFile = await findComposeFile(projectPath);

      if (composeFile) {
        const project = await buildProject(entry.name, projectPath, composeFile, containers);
        projects.push(project);
      }
    }

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Failed to scan projects:", error);
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
          image: serviceConfig.image,
          containerId: container?.id,
          containerName: container?.name,
          status: container?.state === "running" ? "running" : container ? "exited" : "unknown",
          ports: container?.ports,
          hasBuild: !!serviceConfig.build,
        };

        if (container?.state === "running") runningCount++;
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
    console.error(`Failed to parse compose file for ${name}:`, error);
  }

  return { name, path, composeFile, status, services };
}

export async function getProject(name: string): Promise<Project | null> {
  const projectsDir = getProjectsDir();
  const projectPath = join(projectsDir, name);

  try {
    const stats = await stat(projectPath);
    if (!stats.isDirectory()) return null;

    const composeFile = await findComposeFile(projectPath);
    if (!composeFile) return null;

    const containers = await listContainers(true);
    return buildProject(name, projectPath, composeFile, containers);
  } catch (error) {
    console.error(`[Projects] Failed to get project ${name}:`, error);
    return null;
  }
}

export async function readComposeFile(projectName: string): Promise<string | null> {
  const project = await getProject(projectName);
  if (!project) return null;

  try {
    return await readFile(project.composeFile, "utf-8");
  } catch (error) {
    console.error(`[Projects] Failed to read compose file for ${projectName}:`, error);
    return null;
  }
}

export async function readEnvFile(projectName: string): Promise<string | null> {
  const projectsDir = getProjectsDir();
  const envPath = join(projectsDir, projectName, ".env");

  try {
    return await readFile(envPath, "utf-8");
  } catch {
    return null;
  }
}
