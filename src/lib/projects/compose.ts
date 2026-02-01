import { spawn } from "child_process";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { getProjectsDir, getProject } from "./scanner";

interface ComposeResult {
  success: boolean;
  output: string;
  error?: string;
}

async function runComposeCommand(
  projectPath: string,
  args: string[],
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["compose", ...args], {
      cwd: projectPath,
      env: { ...process.env },
    });

    let output = "";
    let error = "";

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

    proc.on("close", (code) => {
      console.log(`[Compose] Exit code: ${code}`);
      if (code !== 0) {
        console.log(`[Compose] Error output: ${error || output}`);
      }
      resolve({
        success: code === 0,
        output,
        error: code !== 0 ? error || output : undefined,
      });
    });

    proc.on("error", (err) => {
      console.log(`[Compose] Spawn error: ${err.message}`);
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

  return runComposeCommand(project.path, args, onOutput);
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

  return runComposeCommand(project.path, args, onOutput);
}

export async function composePull(
  projectName: string,
  onOutput?: (data: string) => void
): Promise<ComposeResult> {
  const project = await getProject(projectName);
  if (!project) {
    return { success: false, output: "", error: "Project not found" };
  }

  return runComposeCommand(project.path, ["pull"], onOutput);
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

  return streamComposeCommand(project.path, args);
}

async function* streamComposeCommand(
  projectPath: string,
  args: string[]
): AsyncGenerator<string, void, unknown> {
  const proc = spawn("docker", ["compose", ...args], {
    cwd: projectPath,
    env: { ...process.env },
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
  const { rm } = await import("fs/promises");
  try {
    await rm(project.path, { recursive: true });
    return { success: true, output: `Project "${name}" deleted` };
  } catch (error) {
    return { success: false, output: "", error: String(error) };
  }
}
