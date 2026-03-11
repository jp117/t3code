import { type TerminalShellProfile } from "@t3tools/contracts";

export interface TerminalShellLaunchCandidate {
  shell: string;
  args?: string[];
  cwd: string;
}

interface ResolveTerminalShellLaunchOptions {
  platform: NodeJS.Platform;
  cwd: string;
  shellProfile: TerminalShellProfile;
  shellResolver: () => string;
  env: NodeJS.ProcessEnv;
}

interface WslDirectory {
  distro: string | null;
  linuxPath: string;
}

export function defaultShellResolver(): string {
  if (process.platform === "win32") {
    return process.env.ComSpec ?? "cmd.exe";
  }
  return process.env.SHELL ?? "bash";
}

function normalizeShellCommand(platform: NodeJS.Platform, value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (platform === "win32") {
    return trimmed;
  }

  const firstToken = trimmed.split(/\s+/g)[0]?.trim();
  if (!firstToken) return null;
  return firstToken.replace(/^['"]|['"]$/g, "");
}

function shellCandidateFromCommand(
  platform: NodeJS.Platform,
  command: string | null,
  cwd: string,
): TerminalShellLaunchCandidate | null {
  if (!command || command.length === 0) return null;
  const shellName = command.split(/[\\/]/g).pop()?.toLowerCase() ?? command.toLowerCase();
  if (platform !== "win32" && shellName === "zsh") {
    return { shell: command, args: ["-o", "nopromptsp"], cwd };
  }
  return { shell: command, cwd };
}

export function formatShellLaunchCandidate(candidate: TerminalShellLaunchCandidate): string {
  if (!candidate.args || candidate.args.length === 0) return candidate.shell;
  return `${candidate.shell} ${candidate.args.join(" ")}`;
}

function uniqueShellCandidates(
  candidates: Array<TerminalShellLaunchCandidate | null>,
): TerminalShellLaunchCandidate[] {
  const seen = new Set<string>();
  const ordered: TerminalShellLaunchCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = `${candidate.cwd}\u0000${formatShellLaunchCandidate(candidate)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(candidate);
  }
  return ordered;
}

function normalizeLinuxPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length > 0 ? normalized : "/";
}

export function toWslDirectory(cwd: string): WslDirectory | null {
  const trimmed = cwd.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("/")) {
    return {
      distro: null,
      linuxPath: normalizeLinuxPath(trimmed),
    };
  }

  const uncMatch = trimmed.match(/^\\\\wsl(?:\$|\.localhost)?\\([^\\]+)(?:\\(.*))?$/i);
  if (uncMatch) {
    const distro = uncMatch[1]?.trim() || null;
    const rest = uncMatch[2] ?? "";
    return {
      distro,
      linuxPath: rest.length > 0 ? normalizeLinuxPath(`/${rest}`) : "/",
    };
  }

  const driveMatch = trimmed.match(/^([A-Za-z]):[\\/]*(.*)$/);
  if (driveMatch) {
    const drive = driveMatch[1]?.toLowerCase();
    const rest = driveMatch[2] ?? "";
    const suffix = rest.length > 0 ? `/${rest}` : "";
    return {
      distro: null,
      linuxPath: normalizeLinuxPath(`/mnt/${drive}${suffix}`),
    };
  }

  return null;
}

function resolveWslSpawnCwd(cwd: string, env: NodeJS.ProcessEnv): string {
  if (!cwd.startsWith("\\\\")) {
    return cwd;
  }
  return env.USERPROFILE?.trim() || env.SystemRoot?.trim() || "C:\\";
}

function buildWslArguments(directory: WslDirectory | null): string[] {
  if (!directory) {
    return [];
  }

  const args: string[] = [];
  if (directory.distro) {
    args.push("-d", directory.distro);
  }
  args.push("--cd", directory.linuxPath);
  return args;
}

function resolveWindowsShellCandidates(
  cwd: string,
  shellProfile: TerminalShellProfile,
  shellResolver: () => string,
  env: NodeJS.ProcessEnv,
): TerminalShellLaunchCandidate[] {
  if (shellProfile === "powershell") {
    return uniqueShellCandidates([
      { shell: "pwsh.exe", cwd },
      { shell: "powershell.exe", cwd },
    ]);
  }

  if (shellProfile === "commandPrompt") {
    return uniqueShellCandidates([{ shell: "cmd.exe", cwd }]);
  }

  if (shellProfile === "wsl") {
    const directory = toWslDirectory(cwd);
    const args = buildWslArguments(directory);
    const spawnCwd = resolveWslSpawnCwd(cwd, env);
    const systemRoot = env.SystemRoot?.trim();

    return uniqueShellCandidates([
      {
        shell: "wsl.exe",
        ...(args.length > 0 ? { args } : {}),
        cwd: spawnCwd,
      },
      systemRoot
        ? {
            shell: `${systemRoot}\\System32\\wsl.exe`,
            ...(args.length > 0 ? { args } : {}),
            cwd: spawnCwd,
          }
        : null,
    ]);
  }

  const requested = shellCandidateFromCommand("win32", normalizeShellCommand("win32", shellResolver()), cwd);
  return uniqueShellCandidates([
    requested,
    shellCandidateFromCommand("win32", env.ComSpec ?? null, cwd),
    shellCandidateFromCommand("win32", "powershell.exe", cwd),
    shellCandidateFromCommand("win32", "cmd.exe", cwd),
  ]);
}

function resolvePosixShellCandidates(
  platform: NodeJS.Platform,
  cwd: string,
  shellResolver: () => string,
  env: NodeJS.ProcessEnv,
): TerminalShellLaunchCandidate[] {
  const requested = shellCandidateFromCommand(
    platform,
    normalizeShellCommand(platform, shellResolver()),
    cwd,
  );

  return uniqueShellCandidates([
    requested,
    shellCandidateFromCommand(platform, normalizeShellCommand(platform, env.SHELL), cwd),
    shellCandidateFromCommand(platform, "/bin/zsh", cwd),
    shellCandidateFromCommand(platform, "/bin/bash", cwd),
    shellCandidateFromCommand(platform, "/bin/sh", cwd),
    shellCandidateFromCommand(platform, "zsh", cwd),
    shellCandidateFromCommand(platform, "bash", cwd),
    shellCandidateFromCommand(platform, "sh", cwd),
  ]);
}

export function resolveTerminalShellLaunchCandidates(
  options: ResolveTerminalShellLaunchOptions,
): TerminalShellLaunchCandidate[] {
  if (options.platform === "win32") {
    return resolveWindowsShellCandidates(
      options.cwd,
      options.shellProfile,
      options.shellResolver,
      options.env,
    );
  }

  return resolvePosixShellCandidates(
    options.platform,
    options.cwd,
    options.shellResolver,
    options.env,
  );
}
