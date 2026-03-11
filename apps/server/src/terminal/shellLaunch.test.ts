import { describe, expect, it } from "vitest";

import {
  resolveTerminalShellLaunchCandidates,
  toWslDirectory,
} from "./shellLaunch";

describe("toWslDirectory", () => {
  it("maps WSL UNC paths to distro-backed Linux paths", () => {
    expect(toWslDirectory("\\\\wsl.localhost\\Ubuntu\\home\\john\\project")).toEqual({
      distro: "Ubuntu",
      linuxPath: "/home/john/project",
    });
  });

  it("maps Windows drive paths to /mnt paths", () => {
    expect(toWslDirectory("C:\\Users\\john\\project")).toEqual({
      distro: null,
      linuxPath: "/mnt/c/Users/john/project",
    });
  });
});

describe("resolveTerminalShellLaunchCandidates", () => {
  it("builds WSL launch arguments from a WSL UNC cwd on Windows", () => {
    const candidates = resolveTerminalShellLaunchCandidates({
      platform: "win32",
      cwd: "\\\\wsl.localhost\\Ubuntu\\home\\john\\project",
      shellProfile: "wsl",
      shellResolver: () => "cmd.exe",
      env: {
        USERPROFILE: "C:\\Users\\john",
        SystemRoot: "C:\\Windows",
      },
    });

    expect(candidates[0]).toEqual({
      shell: "wsl.exe",
      args: ["-d", "Ubuntu", "--cd", "/home/john/project"],
      cwd: "C:\\Users\\john",
    });
  });

  it("offers Windows shell-specific candidates when explicitly requested", () => {
    expect(
      resolveTerminalShellLaunchCandidates({
        platform: "win32",
        cwd: "C:\\Users\\john\\project",
        shellProfile: "powershell",
        shellResolver: () => "cmd.exe",
        env: {},
      }).map((candidate) => candidate.shell),
    ).toEqual(["pwsh.exe", "powershell.exe"]);

    expect(
      resolveTerminalShellLaunchCandidates({
        platform: "win32",
        cwd: "C:\\Users\\john\\project",
        shellProfile: "commandPrompt",
        shellResolver: () => "powershell.exe",
        env: {},
      }).map((candidate) => candidate.shell),
    ).toEqual(["cmd.exe"]);
  });

  it("keeps zsh prompt-spacer suppression on POSIX shells", () => {
    expect(
      resolveTerminalShellLaunchCandidates({
        platform: "linux",
        cwd: "/repo",
        shellProfile: "system",
        shellResolver: () => "/bin/zsh",
        env: {},
      })[0],
    ).toEqual({
      shell: "/bin/zsh",
      args: ["-o", "nopromptsp"],
      cwd: "/repo",
    });
  });
});
