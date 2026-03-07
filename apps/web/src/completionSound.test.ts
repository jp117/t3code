import { describe, expect, it } from "vitest";
import { type OrchestrationEvent } from "@t3tools/contracts";

import {
  DEFAULT_COMPLETION_SOUND_VOLUME_PERCENT,
  clampCompletionSoundVolumePercent,
  shouldPlayThreadCompletionSound,
} from "./completionSound";

describe("clampCompletionSoundVolumePercent", () => {
  it("clamps values into the supported 0-100 range", () => {
    expect(clampCompletionSoundVolumePercent(-5)).toBe(0);
    expect(clampCompletionSoundVolumePercent(42.4)).toBe(42);
    expect(clampCompletionSoundVolumePercent(101)).toBe(100);
  });

  it("falls back to the default volume when the value is not finite", () => {
    expect(clampCompletionSoundVolumePercent(Number.NaN)).toBe(
      DEFAULT_COMPLETION_SOUND_VOLUME_PERCENT,
    );
  });
});

describe("shouldPlayThreadCompletionSound", () => {
  it("plays only for successful thread turn completions", () => {
    const readyEvent = {
      type: "thread.turn-diff-completed",
      payload: { status: "ready" },
    } as OrchestrationEvent;
    const errorEvent = {
      type: "thread.turn-diff-completed",
      payload: { status: "error" },
    } as OrchestrationEvent;
    const unrelatedEvent = { type: "thread.activity-appended", payload: {} } as OrchestrationEvent;

    expect(shouldPlayThreadCompletionSound(readyEvent)).toBe(true);
    expect(shouldPlayThreadCompletionSound(errorEvent)).toBe(false);
    expect(shouldPlayThreadCompletionSound(unrelatedEvent)).toBe(false);
  });
});
