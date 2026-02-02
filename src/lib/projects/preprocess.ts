import { readFile, writeFile, unlink, mkdtemp, rmdir } from "fs/promises";
import { tmpdir } from "os";
import { join, isAbsolute, resolve } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getProjectsDir, getHostProjectsDir, toHostPath } from "./scanner";

interface PreprocessResult {
  tempFile: string;
  cleanup: () => Promise<void>;
}

interface ServiceConfig {
  env_file?: string | string[] | EnvFileEntry[];
  volumes?: (string | VolumeConfig)[];
  [key: string]: unknown;
}

interface EnvFileEntry {
  path: string;
  required?: boolean;
}

interface VolumeConfig {
  type?: string;
  source?: string;
  target?: string;
  [key: string]: unknown;
}

interface ComposeConfig {
  services?: Record<string, ServiceConfig>;
  [key: string]: unknown;
}

export function isPathMappingActive(): boolean {
  return getProjectsDir() !== getHostProjectsDir();
}

function toAbsoluteLocalPath(relativePath: string, projectDir: string): string {
  if (isAbsolute(relativePath)) return relativePath;
  return resolve(projectDir, relativePath);
}

function toAbsoluteHostPath(relativePath: string, projectDir: string): string {
  if (isAbsolute(relativePath)) {
    // If absolute and within PROJECTS_DIR, translate it
    const localBase = getProjectsDir();
    if (relativePath.startsWith(localBase)) {
      return toHostPath(relativePath);
    }
    return relativePath;
  }
  const absoluteLocal = resolve(projectDir, relativePath);
  return toHostPath(absoluteLocal);
}

function rewriteEnvFiles(
  envFile: string | string[] | EnvFileEntry[] | undefined,
  projectDir: string
): string | string[] | EnvFileEntry[] | undefined {
  if (!envFile) return envFile;

  if (typeof envFile === "string") {
    return toAbsoluteLocalPath(envFile, projectDir);
  }

  // Check if it's an array of strings or EnvFileEntry objects
  if (envFile.length > 0 && typeof envFile[0] === "string") {
    return (envFile as string[]).map((entry) => toAbsoluteLocalPath(entry, projectDir));
  }

  // It's an array of EnvFileEntry objects
  return (envFile as EnvFileEntry[]).map((entry) => ({
    ...entry,
    path: toAbsoluteLocalPath(entry.path, projectDir),
  }));
}

function rewriteVolumes(
  volumes: (string | VolumeConfig)[] | undefined,
  projectDir: string
): (string | VolumeConfig)[] | undefined {
  if (!volumes) return volumes;

  return volumes.map((volume) => {
    // Long syntax (object with type: "bind")
    if (typeof volume === "object" && volume !== null) {
      if (volume.type === "bind" && volume.source && !isAbsolute(volume.source)) {
        return { ...volume, source: toAbsoluteHostPath(volume.source, projectDir) };
      }
      // If source is absolute and within PROJECTS_DIR, translate it
      if (volume.type === "bind" && volume.source && isAbsolute(volume.source)) {
        const localBase = getProjectsDir();
        if (volume.source.startsWith(localBase)) {
          return { ...volume, source: toHostPath(volume.source) };
        }
      }
      return volume;
    }

    // Short syntax: source:target[:options]
    if (typeof volume === "string") {
      const colonIndex = volume.indexOf(":");
      if (colonIndex === -1) return volume;

      const source = volume.slice(0, colonIndex);
      const rest = volume.slice(colonIndex);

      // Skip named volumes (no path separators)
      if (!source.includes("/") && !source.includes("\\")) return volume;

      // Skip absolute paths unless they're within PROJECTS_DIR
      if (isAbsolute(source)) {
        const localBase = getProjectsDir();
        if (source.startsWith(localBase)) {
          return toHostPath(source) + rest;
        }
        return volume;
      }

      return toAbsoluteHostPath(source, projectDir) + rest;
    }

    return volume;
  });
}

export async function preprocessComposeFile(
  composeFilePath: string,
  projectDir: string
): Promise<PreprocessResult> {
  const content = await readFile(composeFilePath, "utf-8");
  const config = parseYaml(content) as ComposeConfig;

  if (config.services) {
    for (const service of Object.values(config.services)) {
      if (service.env_file) {
        service.env_file = rewriteEnvFiles(service.env_file, projectDir);
      }
      if (service.volumes) {
        service.volumes = rewriteVolumes(service.volumes, projectDir);
      }
    }
  }

  const tempDir = await mkdtemp(join(tmpdir(), "compoza-"));
  const tempFile = join(tempDir, "compose.yaml");
  await writeFile(tempFile, stringifyYaml(config, { lineWidth: 0 }), "utf-8");

  const cleanup = async () => {
    try {
      await unlink(tempFile);
      await rmdir(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  };

  return { tempFile, cleanup };
}
