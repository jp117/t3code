import { describe, expect, it } from "vitest";

import { resolveCodexCliLaunch } from "./codexCliLaunch";

describe("resolveCodexCliLaunch", () => {
  it("launches Codex directly for local runtimes", () => {
    expect(
      resolveCodexCliLaunch({
        platform: "win32",
        cwd: "C:\\repo",
        binaryPath: "codex",
        homePath: "C:\\Users\\john\\.codex",
        runtime: "local",
        passthroughArgs: ["app-server"],
        env: {},
      }),
    ).toEqual({
      command: "codex",
      args: ["app-server"],
      cwd: "C:\\repo",
      env: {
        CODEX_HOME: "C:\\Users\\john\\.codex",
      },
      shell: true,
    });
  });

  it("launches Codex through WSL with translated cwd and CODEX_HOME", () => {
    expect(
      resolveCodexCliLaunch({
        platform: "win32",
        cwd: "\\\\wsl.localhost\\Ubuntu\\home\\john\\project",
        binaryPath: "codex",
        homePath: "/home/john/.codex",
        runtime: "wsl",
        wslDistro: "Ubuntu",
        passthroughArgs: ["app-server"],
        env: {
          USERPROFILE: "C:\\Users\\john",
        },
      }),
    ).toEqual({
      command: "wsl.exe",
      args: [
        "-d",
        "Ubuntu",
        "--cd",
        "/home/john/project",
        "env",
        "CODEX_HOME=/home/john/.codex",
        "codex",
        "app-server",
      ],
      cwd: "C:\\Users\\john",
      env: {
        USERPROFILE: "C:\\Users\\john",
      },
      shell: false,
    });
  });

  it("maps Windows home paths into /mnt paths for WSL launches", () => {
    expect(
      resolveCodexCliLaunch({
        platform: "win32",
        cwd: "C:\\repo",
        binaryPath: "/home/john/.local/bin/codex",
        homePath: "C:\\Users\\john\\.codex",
        runtime: "wsl",
        wslDistro: "Ubuntu",
        passthroughArgs: ["--version"],
        env: {},
      }),
    ).toEqual({
      command: "wsl.exe",
      args: [
        "-d",
        "Ubuntu",
        "--cd",
        "/mnt/c/repo",
        "env",
        "CODEX_HOME=/mnt/c/Users/john/.codex",
        "/home/john/.local/bin/codex",
        "--version",
      ],
      cwd: "C:\\repo",
      env: {},
      shell: false,
    });
  });
});
