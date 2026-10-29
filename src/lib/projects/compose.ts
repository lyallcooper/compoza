import { spawn } from "child_process";
import { writeFile, mkdir, access, rm } from "fs/promises";
import { join } from "path";
import { getProjectsDir, getProject, toHostPath, isValidProjectName, invalidateProjectScanCache } from "./scanner";
import { isPathMappingActive, preprocessComposeFile } from "./preprocess";
import { log } from "@/lib/logger";
import { streamContainerLogs, getSelfProjectName } from "@/lib/docker";
import { spawnUpdaterContainer } from "@/lib/updates";
import type { ProjectService } from "@/types";

/**
 * Check if the given project name matches our own container's project.
 */
async function isSelfProject(projectName: string): Promise<boolean> {
  const selfProject = await getSelfProjectName();
  const project = await getProject(projectName);
  return selfProject !== null && selfProject === (project?.composeName || projectName);
}

/**
 * Handle self-update via updater container.
 * Returns null if not a self-update, or the result if it is.
 */
async function handleSelfUpdate(
  projectName: string,
  composeFile: string,
  services?: string[]
): Promise<ComposeResult | null> {
  if (!(await isSelfProject(projectName))) {
    return null;
  }

  try {
    const result = await spawnUpdaterContainer(projectName, composeFile, services);
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
  status?: number;
}

const COMPOSE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB

interface RunComposeOptions {
  onOutput?: (data: string) => void;
  composeFile?: string;
  signal?: AbortSignal;
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
  const { onOutput, composeFile, signal } = options;
  const { args: composeArgs, cleanup } = await prepareComposeCommand(projectPath, composeFile);
  composeArgs.push(...args);

  const runCleanup = async () => {
    if (!cleanup) return;
    try {
      await cleanup();
    } catch (error) {
      log.compose.warn("Compose cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (signal?.aborted) {
    await runCleanup();
    return { success: false, output: "", error: "Command aborted" };
  }

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
    let cancelled = false;
    let killTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const abortProcess = (reason: string) => {
      if (cancelled || timedOut || proc.killed) return;
      cancelled = true;
      log.compose.info("Command cancelled", {
        reason,
        command: `docker ${composeArgs.join(" ")}`,
      });
      proc.kill("SIGTERM");
      killTimeoutId = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    };

    const onAbort = () => {
      abortProcess("request aborted");
    };

    const resolveOnce = (result: ComposeResult) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      clearTimeout(killTimeoutId);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // Timeout to prevent hanging forever
    const timeoutId = setTimeout(() => {
      timedOut = true;
      log.compose.warn("Command timed out, killing process", {
        command: `docker ${composeArgs.join(" ")}`,
      });
      proc.kill("SIGTERM");
      // Force kill after 5 seconds if still running
      killTimeoutId = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, COMPOSE_TIMEOUT);

    const handleOutput = (data: Buffer) => {
      const str = data.toString();
      if (output.length < MAX_OUTPUT_SIZE) {
        output += str;
      }
      if (!onOutput) return;
      try {
        onOutput(str);
      } catch (error) {
        log.compose.warn("Output callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        abortProcess("output callback failed");
      }
    };

    proc.stdout.on("data", handleOutput);

    proc.stderr.on("data", (data) => {
      // docker compose often writes progress to stderr
      handleOutput(data);
    });

    proc.on("close", async (code) => {
      if (timedOut) {
        log.compose.warn("Command killed after timeout", { exitCode: code, output: output.slice(0, 500) });
      } else if (code !== 0) {
        log.compose.warn("Command failed", { exitCode: code, output: output.slice(0, 500) });
      } else {
        log.compose.debug("Command completed", { exitCode: code });
      }
      await runCleanup();
      const error = timedOut
        ? `Command timed out after ${COMPOSE_TIMEOUT / 1000}s`
        : cancelled
          ? "Command aborted"
          : code !== 0 ? output : undefined;
      resolveOnce({
        success: code === 0 && !timedOut && !cancelled,
        output,
        error,
      });
    });

    proc.on("error", async (err) => {
      log.compose.error("Spawn error", err);
      await runCleanup();
      resolveOnce({
        success: false,
        output,
        error: err.message,
      });
    });
  });
}

function validSelectedServices(projectServices: ProjectService[], selected: string[]): boolean {
  return selected.length > 0 && selected.every((name) =>
    projectServices.some((service) => service.name === name)
  );
}

export async function composeUp(
  projectName: string,
  options: { detach?: boolean; build?: boolean; pull?: boolean; signal?: AbortSignal; services?: string[] } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  if (options.services && !validSelectedServices(project.services, options.services)) {
    return { success: false, output: "", error: "A nonempty list of valid services is required" };
  }

  // If updating ourselves, use the updater container approach
  const selfUpdateResult = await handleSelfUpdate(projectName, project.composeFile, options.services);
  if (selfUpdateResult) {
    if (selfUpdateResult.success) {
      invalidateProjectScanCache();
    }
    return selfUpdateResult;
  }

  const args = ["up"];
  if (options.detach !== false) args.push("-d");
  if (options.services) {
    args.push("--no-deps", "--no-build", "--pull", "never", "--", ...options.services);
  } else {
    if (options.build) args.push("--build");
    if (options.pull) args.push("--pull", "always");
  }

  const result = await runComposeCommand(project.path, args, {
    onOutput,
    composeFile: project.composeFile,
    signal: options.signal,
  });
  if (result.success) {
    invalidateProjectScanCache();
  }
  return result;
}

export async function composeDown(
  projectName: string,
  options: { volumes?: boolean; removeOrphans?: boolean; signal?: AbortSignal } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  const args = ["down"];
  if (options.volumes) args.push("-v");
  if (options.removeOrphans) args.push("--remove-orphans");

  const result = await runComposeCommand(project.path, args, {
    onOutput,
    composeFile: project.composeFile,
    signal: options.signal,
  });
  if (result.success) {
    invalidateProjectScanCache();
  }
  return result;
}

export async function composePull(
  projectName: string,
  options: { signal?: AbortSignal; services?: string[] } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  if (options.services && !validSelectedServices(project.services, options.services)) {
    return { success: false, output: "", error: "A nonempty list of valid services is required" };
  }
  const args = options.services ? ["pull", "--policy", "always", "--", ...options.services] : ["pull"];
  return runComposeCommand(project.path, args, {
    onOutput,
    composeFile: project.composeFile,
    signal: options.signal,
  });
}

export async function composePullService(
  projectName: string,
  serviceName: string,
  options: { signal?: AbortSignal } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  return composePull(projectName, { ...options, services: [serviceName] }, onOutput);
}

export async function composeUpService(
  projectName: string,
  serviceName: string,
  options: { signal?: AbortSignal } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  return composeUp(projectName, { ...options, services: [serviceName] }, onOutput);
}

export async function composeLogs(
  projectName: string,
  options: { follow?: boolean; tail?: number; service?: string; signal?: AbortSignal } = {}
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
  options: { follow?: boolean; tail?: number; signal?: AbortSignal } = {}
): AsyncGenerator<string, void, unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const iterators = services.filter((service) => service.containerId).map((service) => ({
    name: service.name,
    iterator: streamContainerLogs(service.containerId!, { ...options, signal: controller.signal }),
  }));
  const pending = new Map<number, Promise<{ index: number; result: IteratorResult<string, void> }>>();
  const next = (index: number) => iterators[index].iterator.next().then((result) => ({ index, result }));
  try {
    iterators.forEach((_, index) => pending.set(index, next(index)));
    while (pending.size > 0 && !controller.signal.aborted) {
      const { index, result } = await Promise.race(pending.values());
      pending.delete(index);
      if (result.done) continue;
      yield `${iterators[index].name}  | ${result.value.trimEnd()}`;
      pending.set(index, next(index));
    }
  } finally {
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
    await Promise.allSettled(iterators.map(({ iterator }) => iterator.return()));
    await Promise.allSettled(pending.values());
  }
}

export async function saveComposeFile(projectName: string, content: string): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  try {
    await writeFile(project.composeFile, content, "utf-8");
    invalidateProjectScanCache();
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
    return { success: false, output: "", error: "Invalid project name", status: 400 };
  }

  const projectsDir = getProjectsDir();
  const projectPath = join(projectsDir, name);
  const composePath = join(projectPath, "compose.yaml");

  try {
    await mkdir(projectsDir, { recursive: true });
    await mkdir(projectPath, { recursive: false });
    await writeFile(composePath, composeContent, "utf-8");

    if (envContent) {
      await writeFile(join(projectPath, ".env"), envContent, "utf-8");
    }

    invalidateProjectScanCache();
    return { success: true, output: `Project "${name}" created` };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EEXIST") {
      return {
        success: false,
        output: "",
        error: `Project "${name}" already exists`,
        status: 409,
      };
    }
    return { success: false, output: "", error: String(error) };
  }
}

export async function deleteProject(
  name: string,
  options: { removeVolumes?: boolean; signal?: AbortSignal } = {},
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(name);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  // First, bring down the project
  const downResult = await composeDown(name, {
    volumes: options.removeVolumes,
    removeOrphans: true,
    signal: options.signal,
  }, onOutput);

  if (!downResult.success) {
    return downResult;
  }

  // Then remove the directory
  try {
    await rm(project.path, { recursive: true });
    invalidateProjectScanCache();
    return { success: true, output: `Project "${name}" deleted` };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}
