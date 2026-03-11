import { type CodexProviderRuntime } from "@t3tools/contracts";

import { resolveWslHostCwd, resolveWslPath, toWslDirectory } from "./wsl";

export interface CodexCliLaunchSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: boolean;
}

export interface ResolveCodexCliLaunchInput {
  platform: NodeJS.Platform;
  cwd: string;
  binaryPath: string;
  homePath?: string;
  runtime?: CodexProviderRuntime;
  wslDistro?: string;
  passthroughArgs: readonly string[];
  env: NodeJS.ProcessEnv;
}

function normalizeWslDistro(value: string | undefined, cwd: string): string {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }
  return toWslDirectory(cwd)?.distro ?? "Ubuntu";
}

export function resolveCodexCliLaunch(input: ResolveCodexCliLaunchInput): CodexCliLaunchSpec {
  if (input.platform === "win32" && input.runtime === "wsl") {
    const linuxCwd = resolveWslPath(input.cwd) ?? "/";
    const wslDistro = normalizeWslDistro(input.wslDistro, input.cwd);
    const linuxHomePath = resolveWslPath(input.homePath);
    const args = ["-d", wslDistro, "--cd", linuxCwd];

    if (linuxHomePath) {
      args.push("env", `CODEX_HOME=${linuxHomePath}`, input.binaryPath, ...input.passthroughArgs);
    } else {
      args.push(input.binaryPath, ...input.passthroughArgs);
    }

    return {
      command: "wsl.exe",
      args,
      cwd: resolveWslHostCwd(input.cwd, input.env),
      env: input.env,
      shell: false,
    };
  }

  return {
    command: input.binaryPath,
    args: [...input.passthroughArgs],
    cwd: input.cwd,
    env: {
      ...input.env,
      ...(input.homePath ? { CODEX_HOME: input.homePath } : {}),
    },
    shell: input.platform === "win32",
  };
}
