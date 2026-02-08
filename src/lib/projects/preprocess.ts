import { readFile, writeFile, unlink, mkdtemp, rmdir } from "fs/promises";
import { tmpdir } from "os";
import { join, isAbsolute, resolve } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getProjectsDir, getHostProjectsDir, isPathWithinBase, toHostPath } from "./scanner";
import { log } from "@/lib/logger";

interface PreprocessResult {
  tempFile: string;
  cleanup: () => Promise<void>;
}

interface BuildConfig {
  context?: string;
  dockerfile?: string;
  [key: string]: unknown;
}

interface ExtendsConfig {
  file?: string;
  service: string;
}

interface ServiceConfig {
  build?: string | BuildConfig;
  env_file?: string | string[] | EnvFileEntry[];
  extends?: ExtendsConfig;
  volumes?: (string | VolumeConfig)[];
  [key: string]: unknown;
}

interface FileConfigEntry {
  file?: string;
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
  configs?: Record<string, FileConfigEntry>;
  secrets?: Record<string, FileConfigEntry>;
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
    if (isPathWithinBase(relativePath, localBase)) {
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
        if (isPathWithinBase(volume.source, localBase)) {
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
        if (isPathWithinBase(source, localBase)) {
          return toHostPath(source) + rest;
        }
        return volume;
      }

      return toAbsoluteHostPath(source, projectDir) + rest;
    }

    return volume;
  });
}

function rewriteBuild(
  build: string | BuildConfig | undefined,
  projectDir: string
): string | BuildConfig | undefined {
  if (!build) return build;

  // Short syntax: build: ./path
  if (typeof build === "string") {
    return toAbsoluteHostPath(build, projectDir);
  }

  // Long syntax: build: { context: ..., dockerfile: ... }
  const result = { ...build };
  if (result.context) {
    result.context = toAbsoluteHostPath(result.context, projectDir);
  }
  // dockerfile is relative to context, Docker handles this
  return result;
}

function rewriteExtends(
  ext: ExtendsConfig | undefined,
  projectDir: string
): ExtendsConfig | undefined {
  if (!ext || !ext.file) return ext;

  // extends.file is resolved by docker compose CLI relative to --project-directory
  // Since we set --project-directory to the host path, we need to rewrite this
  return {
    ...ext,
    file: toAbsoluteHostPath(ext.file, projectDir),
  };
}

function rewriteFileConfigs(
  configs: Record<string, FileConfigEntry> | undefined,
  projectDir: string
): Record<string, FileConfigEntry> | undefined {
  if (!configs) return configs;

  const result: Record<string, FileConfigEntry> = {};
  for (const [name, config] of Object.entries(configs)) {
    if (config.file) {
      result[name] = { ...config, file: toAbsoluteHostPath(config.file, projectDir) };
    } else {
      result[name] = config;
    }
  }
  return result;
}

export async function preprocessComposeFile(
  composeFilePath: string,
  projectDir: string
): Promise<PreprocessResult> {
  const content = await readFile(composeFilePath, "utf-8");
  const config = parseYaml(content) as ComposeConfig;

  if (config.services) {
    for (const service of Object.values(config.services)) {
      if (service.build) {
        service.build = rewriteBuild(service.build, projectDir);
      }
      if (service.env_file) {
        service.env_file = rewriteEnvFiles(service.env_file, projectDir);
      }
      if (service.extends) {
        service.extends = rewriteExtends(service.extends, projectDir);
      }
      if (service.volumes) {
        service.volumes = rewriteVolumes(service.volumes, projectDir);
      }
    }
  }

  // Top-level configs and secrets
  if (config.configs) {
    config.configs = rewriteFileConfigs(config.configs, projectDir);
  }
  if (config.secrets) {
    config.secrets = rewriteFileConfigs(config.secrets, projectDir);
  }

  const tempDir = await mkdtemp(join(tmpdir(), "compoza-"));
  const tempFile = join(tempDir, "compose.yaml");
  await writeFile(tempFile, stringifyYaml(config, { lineWidth: 0 }), "utf-8");

  const cleanup = async () => {
    try {
      await unlink(tempFile);
      await rmdir(tempDir);
    } catch (err) {
      // Log cleanup errors for debugging but don't fail the operation
      log.projects.warn(`Failed to clean up temp file ${tempFile}`, { error: String(err) });
    }
  };

  return { tempFile, cleanup };
}
