import { spawn } from "child_process";
import { writeFile, mkdir, access, rm } from "fs/promises";
import { join } from "path";
import { getProjectsDir, getProject, toHostPath, isValidProjectName } from "./scanner";
import { isPathMappingActive, preprocessComposeFile } from "./preprocess";
import { log } from "@/lib/logger";

/**
 * Build a filtered environment for Docker Compose subprocesses.
 * Only passes through variables that Docker Compose needs, avoiding
 * exposure of sensitive credentials to child processes.
 */
function getComposeEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

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

  return env;
}

interface ComposeResult {
  success: boolean;
  output: string;
  error?: string;
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
  onOutput?: (data: string) => void,
  composeFile?: string
): Promise<ComposeResult> {
  const { args: composeArgs, cleanup } = await prepareComposeCommand(projectPath, composeFile);
  composeArgs.push(...args);

  log.compose.debug("Running command", { command: `docker ${composeArgs.join(" ")}`, cwd: projectPath });

  return new Promise((resolve) => {
    const proc = spawn("docker", composeArgs, {
      cwd: projectPath,
      env: getComposeEnvironment(),
    });

    let output = "";

    proc.stdout.on("data", (data) => {
      const str = data.toString();
      output += str;
      onOutput?.(str);
    });

    proc.stderr.on("data", (data) => {
      const str = data.toString();
      // docker compose often writes progress to stderr
      output += str;
      onOutput?.(str);
    });

    proc.on("close", async (code) => {
      if (code !== 0) {
        log.compose.warn("Command failed", { exitCode: code, output: output.slice(0, 500) });
      } else {
        log.compose.debug("Command completed", { exitCode: code });
      }
      if (cleanup) {
        await cleanup();
      }
      resolve({
        success: code === 0,
        output,
        error: code !== 0 ? output : undefined,
      });
    });

    proc.on("error", async (err) => {
      log.compose.error("Spawn error", err);
      if (cleanup) {
        await cleanup();
      }
      resolve({
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

  const args = ["up"];
  if (options.detach !== false) args.push("-d");
  if (options.build) args.push("--build");
  if (options.pull) args.push("--pull", "always");

  return runComposeCommand(project.path, args, onOutput, project.composeFile);
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

  return runComposeCommand(project.path, args, onOutput, project.composeFile);
}

export async function composePull(
  projectName: string,
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  return runComposeCommand(project.path, ["pull"], onOutput, project.composeFile);
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

  return runComposeCommand(project.path, ["pull", serviceName], onOutput, project.composeFile);
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

  return runComposeCommand(project.path, ["up", "-d", serviceName], onOutput, project.composeFile);
}

export async function composeLogs(
  projectName: string,
  options: { follow?: boolean; tail?: number; service?: string } = {}
): Promise<AsyncGenerator<string, void, unknown>> {
  const project = await getProject(projectName);
  if (!project) {
    throw new Error("Project not found");
  }

  const args = ["logs"];
  if (options.follow) args.push("-f");
  if (options.tail) args.push("--tail", options.tail.toString());
  if (options.service) args.push(options.service);

  return streamComposeCommand(project.path, args, project.composeFile);
}

async function* streamComposeCommand(
  projectPath: string,
  args: string[],
  composeFile?: string
): AsyncGenerator<string, void, unknown> {
  const { args: composeArgs, cleanup } = await prepareComposeCommand(projectPath, composeFile);
  composeArgs.push(...args);

  const proc = spawn("docker", composeArgs, {
    cwd: projectPath,
    env: getComposeEnvironment(),
  });

  const lines: string[] = [];
  let resolveNext: ((value: IteratorResult<string, void>) => void) | null = null;
  let done = false;

  const pushLine = (line: string) => {
    if (resolveNext) {
      const resolve = resolveNext;
      resolveNext = null;
      resolve({ value: line, done: false });
    } else {
      lines.push(line);
    }
  };

  proc.stdout.on("data", (data) => {
    const str = data.toString();
    for (const line of str.split("\n")) {
      if (line) pushLine(line);
    }
  });

  proc.stderr.on("data", (data) => {
    const str = data.toString();
    for (const line of str.split("\n")) {
      if (line) pushLine(line);
    }
  });

  proc.on("close", () => {
    done = true;
    if (resolveNext) {
      resolveNext({ value: undefined, done: true });
    }
  });

  try {
    while (!done || lines.length > 0) {
      if (lines.length > 0) {
        yield lines.shift()!;
      } else if (!done) {
        yield await new Promise<string>((resolve) => {
          resolveNext = (result) => {
            if (result.done) {
              done = true;
              resolve("");
            } else {
              resolve(result.value);
            }
          };
        });
      }
    }
  } finally {
    proc.kill();
    // Clean up temp file if preprocessing was used
    if (cleanup) {
      await cleanup();
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
