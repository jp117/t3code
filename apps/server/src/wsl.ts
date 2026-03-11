export interface WslDirectory {
  distro: string | null;
  linuxPath: string;
}

function normalizeLinuxPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length > 0 ? normalized : "/";
}

export function toWslDirectory(pathValue: string): WslDirectory | null {
  const trimmed = pathValue.trim();
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

export function resolveWslHostCwd(cwd: string, env: NodeJS.ProcessEnv): string {
  if (!cwd.startsWith("\\\\")) {
    return cwd;
  }
  return env.USERPROFILE?.trim() || env.SystemRoot?.trim() || "C:\\";
}

export function resolveWslPath(pathValue: string | undefined): string | undefined {
  if (!pathValue) return undefined;
  return toWslDirectory(pathValue)?.linuxPath;
}
