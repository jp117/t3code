import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assert, describe, it } from "@effect/vitest";

const repoRoot = resolve(import.meta.dirname, "..");

describe("build-desktop-artifact mac signing config", () => {
  it("references explicit mac entitlements assets", async () => {
    const source = await readFile(resolve(repoRoot, "scripts/build-desktop-artifact.ts"), "utf8");

    assert.match(source, /hardenedRuntime:\s*true/);
    assert.match(source, /gatekeeperAssess:\s*false/);
    assert.match(source, /entitlements:\s*MAC_ENTITLEMENTS_PATH/);
    assert.match(source, /entitlementsInherit:\s*MAC_INHERIT_ENTITLEMENTS_PATH/);
    assert.match(source, /forceCodeSigning:\s*signed/);
    assert.match(source, /notarize:\s*false/);
    assert.match(source, /afterSign:\s*MAC_AFTER_SIGN_HOOK_PATH/);
  });

  it("checks in the mac entitlements plists required by the build", async () => {
    const [mainEntitlements, inheritEntitlements] = await Promise.all([
      readFile(resolve(repoRoot, "apps/desktop/resources/entitlements.mac.plist"), "utf8"),
      readFile(resolve(repoRoot, "apps/desktop/resources/entitlements.mac.inherit.plist"), "utf8"),
    ]);

    for (const contents of [mainEntitlements, inheritEntitlements]) {
      assert.match(contents, /com\.apple\.security\.cs\.allow-jit/);
      assert.match(contents, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
      assert.match(contents, /com\.apple\.security\.cs\.disable-library-validation/);
    }

    assert.match(inheritEntitlements, /com\.apple\.security\.inherit/);
  });

  it("checks in the custom mac notarization hook required by the build", async () => {
    const source = await readFile(
      resolve(repoRoot, "apps/desktop/resources/electron-builder-notarize.cjs"),
      "utf8",
    );

    assert.match(source, /notarytool",\s*"submit/);
    assert.match(source, /notarytool",\s*"info/);
    assert.match(source, /stapler",\s*"staple/);
    assert.match(source, /MAX_POLL_ATTEMPTS = 240/);
  });
});
