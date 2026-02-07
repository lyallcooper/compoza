import { spawn } from "child_process";
import { writeFile, mkdir, access, rm } from "fs/promises";
import { join } from "path";
import { getProjectsDir, getProject, toHostPath, isValidProjectName } from "./scanner";
import { isPathMappingActive, preprocessComposeFile } from "./preprocess";
import { log } from "@/lib/logger";
import { getDocker, getSelfProjectName } from "@/lib/docker";
import { spawnUpdaterContainer } from "@/lib/updates";
import type { ProjectService } from "@/types";

/**
 * Check if the given project name matches our own container's project.
 */
async function isSelfProject(projectName: string): Promise<boolean> {
  const selfProject = await getSelfProjectName();
  return selfProject !== null && selfProject === projectName;
}

/**
 * Handle self-update via updater container.
 * Returns null if not a self-update, or the result if it is.
 */
async function handleSelfUpdate(
  projectName: string,
  composeFile: string
): Promise<ComposeResult | null> {
  if (!(await isSelfProject(projectName))) {
    return null;
  }

  try {
    const result = await spawnUpdaterContainer(projectName, composeFile);
    if (!result.success) {
      return {
        success: false,
        output: result.output,
        error: result.output,
      };
    }
    return { success: true, output: result.output || "Update complete. Restarting..." };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Failed to spawn updater",
    };
  }
}

/**
 * Build a filtered environment for Docker Compose subprocesses.
 * Only passes through variables that Docker Compose needs, avoiding
 * exposure of sensitive credentials to child processes.
 */
function getComposeEnvironment(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};

  // Essential system variables
  const systemVars = ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL"];
  for (const key of systemVars) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // Docker-specific variables
  const dockerVars = [
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
    "DOCKER_CONFIG",
    "DOCKER_BUILDKIT",
  ];
  for (const key of dockerVars) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // Docker Compose specific variables (COMPOSE_*)
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("COMPOSE_")) {
      env[key] = process.env[key];
    }
  }

  return env as NodeJS.ProcessEnv;
}

interface ComposeResult {
  success: boolean;
  output: string;
  error?: string;
}

const COMPOSE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

interface RunComposeOptions {
  onOutput?: (data: string) => void;
  composeFile?: string;
}

interface PreparedComposeCommand {
  args: string[];
  cleanup: (() => Promise<void>) | null;
}

async function prepareComposeCommand(
  projectPath: string,
  composeFile?: string
): Promise<PreparedComposeCommand> {
  const hostPath = toHostPath(projectPath);
  const needsPreprocessing = isPathMappingActive() && composeFile;

  let effectiveComposeFile = composeFile;
  let cleanup: (() => Promise<void>) | null = null;

  if (needsPreprocessing && composeFile) {
    const result = await preprocessComposeFile(composeFile, projectPath);
    effectiveComposeFile = result.tempFile;
    cleanup = result.cleanup;
  }

  const args = ["compose"];

  if (hostPath !== projectPath) {
    if (effectiveComposeFile) {
      args.push("-f", effectiveComposeFile);
    }
    const envFile = join(projectPath, ".env");
    try {
      await access(envFile);
      args.push("--env-file", envFile);
    } catch {
      // No .env file, that's fine
    }
    args.push("--project-directory", hostPath);
  }

  return { args, cleanup };
}

async function runComposeCommand(
  projectPath: string,
  args: string[],
  options: RunComposeOptions = {}
): Promise<ComposeResult> {
  const { onOutput, composeFile } = options;
  const { args: composeArgs, cleanup } = await prepareComposeCommand(projectPath, composeFile);
  composeArgs.push(...args);

  log.compose.debug("Running command", {
    command: `docker ${composeArgs.join(" ")}`,
    cwd: projectPath,
  });

  return new Promise((resolve) => {
    const proc = spawn("docker", composeArgs, {
      cwd: projectPath,
      env: getComposeEnvironment(),
    });

    let output = "";
    let resolved = false;
    let timedOut = false;
    let killTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const resolveOnce = (result: ComposeResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      clearTimeout(killTimeoutId);
      resolve(result);
    };

    // Timeout to prevent hanging forever
    const timeoutId = setTimeout(() => {
      timedOut = true;
      log.compose.warn("Command timed out, killing process", {
        command: `docker ${composeArgs.join(" ")}`,
      });
      proc.kill("SIGTERM");
      // Force kill after 5 seconds if still running
      killTimeoutId = setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, COMPOSE_TIMEOUT);

    proc.stdout.on("data", (data) => {
      const str = data.toString();
      if (output.length < MAX_OUTPUT_SIZE) {
        output += str;
      }
      onOutput?.(str);
    });

    proc.stderr.on("data", (data) => {
      const str = data.toString();
      // docker compose often writes progress to stderr
      if (output.length < MAX_OUTPUT_SIZE) {
        output += str;
      }
      onOutput?.(str);
    });

    proc.on("close", async (code) => {
      if (timedOut) {
        log.compose.warn("Command killed after timeout", { exitCode: code, output: output.slice(0, 500) });
      } else if (code !== 0) {
        log.compose.warn("Command failed", { exitCode: code, output: output.slice(0, 500) });
      } else {
        log.compose.debug("Command completed", { exitCode: code });
      }
      if (cleanup) {
        await cleanup();
      }
      const error = timedOut
        ? `Command timed out after ${COMPOSE_TIMEOUT / 1000}s`
        : code !== 0 ? output : undefined;
      resolveOnce({
        success: code === 0 && !timedOut,
        output,
        error,
      });
    });

    proc.on("error", async (err) => {
      log.compose.error("Spawn error", err);
      if (cleanup) {
        await cleanup();
      }
      resolveOnce({
        success: false,
        output,
        error: err.message,
      });
    });
  });
}

export async function composeUp(
  projectName: string,
  options: { detach?: boolean; build?: boolean; pull?: boolean } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  // If updating ourselves, use the updater container approach
  const selfUpdateResult = await handleSelfUpdate(projectName, project.composeFile);
  if (selfUpdateResult) {
    return selfUpdateResult;
  }

  const args = ["up"];
  if (options.detach !== false) args.push("-d");
  if (options.build) args.push("--build");
  if (options.pull) args.push("--pull", "always");

  return runComposeCommand(project.path, args, {
    onOutput,
    composeFile: project.composeFile,
  });
}

export async function composeDown(
  projectName: string,
  options: { volumes?: boolean; removeOrphans?: boolean } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  const args = ["down"];
  if (options.volumes) args.push("-v");
  if (options.removeOrphans) args.push("--remove-orphans");

  return runComposeCommand(project.path, args, { onOutput, composeFile: project.composeFile });
}

export async function composePull(
  projectName: string,
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  return runComposeCommand(project.path, ["pull"], { onOutput, composeFile: project.composeFile });
}

export async function composePullService(
  projectName: string,
  serviceName: string,
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  return runComposeCommand(project.path, ["pull", serviceName], { onOutput, composeFile: project.composeFile });
}

export async function composeUpService(
  projectName: string,
  serviceName: string,
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  // If updating ourselves, use the updater container approach
  const selfUpdateResult = await handleSelfUpdate(projectName, project.composeFile);
  if (selfUpdateResult) {
    return selfUpdateResult;
  }

  return runComposeCommand(project.path, ["up", "-d", serviceName], {
    onOutput,
    composeFile: project.composeFile,
  });
}

export async function composeLogs(
  projectName: string,
  options: { follow?: boolean; tail?: number; service?: string } = {}
): Promise<AsyncGenerator<string, void, unknown>> {
  const project = await getProject(projectName);
  if (!project) {
    throw new Error("Project not found");
  }

  // Filter services - either specific service or all with containers
  const services = project.services.filter((s) => {
    if (!s.containerId) return false;
    if (options.service && s.name !== options.service) return false;
    return true;
  });

  if (services.length === 0) {
    throw new Error("No containers found for project");
  }

  // Use Docker API to stream logs from containers
  return streamProjectLogs(services, options);
}

async function* streamProjectLogs(
  services: ProjectService[],
  options: { follow?: boolean; tail?: number } = {}
): AsyncGenerator<string, void, unknown> {
  const docker = getDocker();
  const streams: { name: string; stream: NodeJS.ReadableStream; buffer: Buffer }[] = [];

  // Start log streams for each container
  for (const service of services) {
    if (!service.containerId) continue;

    const container = docker.getContainer(service.containerId);
    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: options.tail ?? 100,
      timestamps: true,
    } as const);

    streams.push({
      name: service.name,
      stream: stream as unknown as NodeJS.ReadableStream,
      buffer: Buffer.alloc(0),
    });
  }

  if (streams.length === 0) {
    return;
  }

  // Merge streams into a single async generator
  const lines: string[] = [];
  let resolveNext: ((value: IteratorResult<string, void>) => void) | null = null;
  let activeStreams = streams.length;

  const pushLine = (line: string) => {
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ value: line, done: false });
    } else {
      lines.push(line);
    }
  };

  // Process Docker multiplexed log format (8-byte header)
  const processChunk = (entry: typeof streams[0], chunk: Buffer) => {
    entry.buffer = Buffer.concat([entry.buffer, chunk]);

    while (entry.buffer.length >= 8) {
      const size = entry.buffer.readUInt32BE(4);
      if (entry.buffer.length < 8 + size) break;

      const content = entry.buffer.subarray(8, 8 + size).toString("utf8").trimEnd();
      entry.buffer = entry.buffer.subarray(8 + size);

      if (content) {
        // Prefix with service name like docker compose logs does
        pushLine(`${entry.name}  | ${content}`);
      }
    }
  };

  for (const entry of streams) {
    entry.stream.on("data", (chunk: Buffer) => {
      processChunk(entry, chunk);
    });

    entry.stream.on("end", () => {
      activeStreams--;
      if (activeStreams === 0 && resolveNext) {
        resolveNext({ value: undefined, done: true });
      }
    });

    entry.stream.on("error", (err: Error) => {
      log.compose.error("Log stream error", { service: entry.name, error: err.message });
      activeStreams--;
      if (activeStreams === 0 && resolveNext) {
        resolveNext({ value: undefined, done: true });
      }
    });
  }

  try {
    while (activeStreams > 0 || lines.length > 0) {
      if (lines.length > 0) {
        yield lines.shift()!;
      } else if (activeStreams > 0) {
        const result = await new Promise<IteratorResult<string, void>>((resolve) => {
          resolveNext = resolve;
        });
        if (result.done) break;
        yield result.value;
      }
    }
  } finally {
    // Clean up streams
    for (const entry of streams) {
      (entry.stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    }
  }
}

export async function saveComposeFile(projectName: string, content: string): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  try {
    await writeFile(project.composeFile, content, "utf-8");
    return { success: true, output: "Compose file saved" };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}

export async function saveEnvFile(projectName: string, content: string): Promise<ComposeResult> {
  if (!isValidProjectName(projectName)) {
    return { success: false, output: "", error: "Invalid project name" };
  }

  const projectsDir = getProjectsDir();
  const envPath = join(projectsDir, projectName, ".env");

  try {
    await writeFile(envPath, content, "utf-8");
    return { success: true, output: "Env file saved" };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}

export async function createProject(
  name: string,
  composeContent: string,
  envContent?: string
): Promise<ComposeResult> {
  if (!isValidProjectName(name)) {
    return { success: false, output: "", error: "Invalid project name" };
  }

  const projectsDir = getProjectsDir();
  const projectPath = join(projectsDir, name);
  const composePath = join(projectPath, "compose.yaml");

  try {
    await mkdir(projectPath, { recursive: true });
    await writeFile(composePath, composeContent, "utf-8");

    if (envContent) {
      await writeFile(join(projectPath, ".env"), envContent, "utf-8");
    }

    return { success: true, output: `Project "${name}" created` };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}

export async function deleteProject(
  name: string,
  options: { removeVolumes?: boolean } = {}
): Promise<ComposeResult> {
  const project = await getProject(name);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  // First, bring down the project
  const downResult = await composeDown(name, {
    volumes: options.removeVolumes,
    removeOrphans: true,
  });

  if (!downResult.success) {
    return downResult;
  }

  // Then remove the directory
  try {
    await rm(project.path, { recursive: true });
    return { success: true, output: `Project "${name}" deleted` };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}
