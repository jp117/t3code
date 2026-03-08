const { execFile } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_ATTEMPTS = 240;
const TRANSIENT_NOTARY_ERRORS = ["Code=-1001", "Code=-1009", "timed out", "offline"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCommandFailure(command, args, stdout, stderr) {
  const details = [stdout, stderr].filter(Boolean).join("\n").trim();
  return `${command} ${args.join(" ")} failed${details ? `\n${details}` : ""}`;
}

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        ...options,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(formatCommandFailure(command, args, stdout, stderr)));
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

function isTransientNotaryError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_NOTARY_ERRORS.some((fragment) => message.includes(fragment));
}

async function fetchNotaryInfo(submissionId, credentials) {
  const result = await exec("xcrun", [
    "notarytool",
    "info",
    submissionId,
    "--key",
    credentials.key,
    "--key-id",
    credentials.keyId,
    "--issuer",
    credentials.issuer,
    "--output-format",
    "json",
  ]);

  return JSON.parse(result.stdout);
}

async function fetchNotaryLog(submissionId, credentials) {
  try {
    const result = await exec("xcrun", [
      "notarytool",
      "log",
      submissionId,
      "--key",
      credentials.key,
      "--key-id",
      credentials.keyId,
      "--issuer",
      credentials.issuer,
      "--output-format",
      "json",
    ]);

    return result.stdout.trim();
  } catch (error) {
    return `Failed to fetch notarization log: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function pollForAcceptance(submissionId, credentials) {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      const info = await fetchNotaryInfo(submissionId, credentials);
      const status =
        typeof info.status === "string"
          ? info.status.toLowerCase()
          : typeof info.statusSummary === "string"
            ? info.statusSummary.toLowerCase()
            : "";

      console.log(
        `[notary] poll ${attempt}/${MAX_POLL_ATTEMPTS} submission=${submissionId} status=${info.status ?? "unknown"}`,
      );

      if (status === "accepted") {
        return;
      }

      if (status === "invalid" || status === "rejected") {
        const log = await fetchNotaryLog(submissionId, credentials);
        throw new Error(`Notarization ${info.status ?? "failed"} for ${submissionId}\n${log}`);
      }
    } catch (error) {
      if (!isTransientNotaryError(error)) {
        throw error;
      }

      console.warn(
        `[notary] transient polling failure for ${submissionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for notarization acceptance after ${MAX_POLL_ATTEMPTS} polls for submission ${submissionId}`,
  );
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const key = process.env.APPLE_API_KEY;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuer = process.env.APPLE_API_ISSUER;
  if (!key || !keyId || !issuer) {
    console.log("[notary] Skipping notarization because Apple credentials are not configured.");
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!existsSync(appPath)) {
    throw new Error(`Expected signed app bundle at ${appPath}`);
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "t3code-notary-"));
  const zipPath = path.join(tempDir, `${context.packager.appInfo.productFilename}.zip`);
  const credentials = { key, keyId, issuer };

  try {
    console.log(`[notary] Zipping ${appPath}`);
    await exec(
      "ditto",
      ["-c", "-k", "--sequesterRsrc", "--keepParent", appName, zipPath],
      { cwd: context.appOutDir },
    );

    console.log(`[notary] Submitting ${zipPath}`);
    const submitResult = await exec("xcrun", [
      "notarytool",
      "submit",
      zipPath,
      "--key",
      key,
      "--key-id",
      keyId,
      "--issuer",
      issuer,
      "--output-format",
      "json",
    ]);
    const submission = JSON.parse(submitResult.stdout);
    const submissionId = submission.id;
    if (typeof submissionId !== "string" || submissionId.length === 0) {
      throw new Error(`Could not determine notarization submission ID from response: ${submitResult.stdout}`);
    }

    console.log(`[notary] Submitted successfully id=${submissionId}`);
    await pollForAcceptance(submissionId, credentials);

    console.log(`[notary] Stapling ${appPath}`);
    await exec("xcrun", ["stapler", "staple", "-v", appPath]);
    await exec("xcrun", ["stapler", "validate", "-v", appPath]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
