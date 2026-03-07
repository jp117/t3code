import { type OrchestrationEvent } from "@t3tools/contracts";

export const DEFAULT_COMPLETION_SOUND_VOLUME_PERCENT = 50;

let completionAudioContext: AudioContext | null = null;
let unlockCleanup: (() => void) | null = null;

export function clampCompletionSoundVolumePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_COMPLETION_SOUND_VOLUME_PERCENT;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function shouldPlayThreadCompletionSound(event: OrchestrationEvent): boolean {
  return event.type === "thread.turn-diff-completed" && event.payload.status === "ready";
}

function cleanupUnlockListeners(): void {
  unlockCleanup?.();
  unlockCleanup = null;
}

function installUnlockListeners(context: AudioContext): void {
  if (typeof document === "undefined" || unlockCleanup) {
    return;
  }

  const resume = () => {
    void context.resume().catch(() => undefined).finally(() => {
      if (context.state === "running") {
        cleanupUnlockListeners();
      }
    });
  };

  const events = ["pointerdown", "keydown"] as const;
  const listenerOptions = { capture: true, passive: true } as const;
  for (const eventName of events) {
    document.addEventListener(eventName, resume, listenerOptions);
  }

  unlockCleanup = () => {
    for (const eventName of events) {
      document.removeEventListener(eventName, resume, listenerOptions);
    }
  };
}

function getCompletionAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
    return null;
  }

  if (completionAudioContext === null || completionAudioContext.state === "closed") {
    completionAudioContext = new window.AudioContext();
    cleanupUnlockListeners();
    installUnlockListeners(completionAudioContext);
  }

  return completionAudioContext;
}

function scheduleCompletionChime(context: AudioContext, volumePercent: number): void {
  const normalizedVolume = clampCompletionSoundVolumePercent(volumePercent) / 100;
  if (normalizedVolume <= 0) {
    return;
  }

  const now = context.currentTime;
  const masterGain = context.createGain();
  const oscillator = context.createOscillator();

  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(normalizedVolume, now + 0.02);
  masterGain.gain.exponentialRampToValueAtTime(Math.max(normalizedVolume * 0.6, 0.0001), now + 0.14);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(783.99, now);
  oscillator.frequency.setValueAtTime(1046.5, now + 0.12);
  oscillator.connect(masterGain);
  masterGain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.34);

  oscillator.addEventListener(
    "ended",
    () => {
      oscillator.disconnect();
      masterGain.disconnect();
    },
    { once: true },
  );
}

export function playCompletionSound(volumePercent: number): void {
  const context = getCompletionAudioContext();
  if (!context) {
    return;
  }

  const play = () => {
    if (context.state !== "running") {
      return;
    }
    scheduleCompletionChime(context, volumePercent);
  };

  if (context.state === "running") {
    play();
    return;
  }

  void context.resume().then(play).catch(() => undefined);
}

export function playThreadCompletionSoundForEvent(
  event: OrchestrationEvent,
  options: {
    enabled: boolean;
    volumePercent: number;
  },
): void {
  if (!options.enabled || !shouldPlayThreadCompletionSound(event)) {
    return;
  }

  playCompletionSound(options.volumePercent);
}
