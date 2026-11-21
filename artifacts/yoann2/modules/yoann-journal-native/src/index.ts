import { requireNativeModule } from 'expo-modules-core';
import type { NativeJournalPlan } from '@/utils/nativeJournalPlan';

export type NativeJournalProgress = {
  jobId: string;
  stage: 'preparing' | 'encoding' | 'finalizing';
  progress: number;
  scene: number;
  scenes: number;
  frames: number;
  totalFrames: number;
  bytes: number;
};

export type NativeJournalResult = {
  uri: string;
  bytes: number;
  frames: number;
  durationMs: number;
  encoderName: string;
};

type NativeJournalModule = {
  generate(jobId: string, plan: NativeJournalPlan): Promise<NativeJournalResult>;
  cancel(jobId: string): void;
  addListener(
    eventName: 'onProgress',
    listener: (progress: NativeJournalProgress) => void,
  ): { remove: () => void };
};

let moduleInstance: NativeJournalModule | null | undefined;

function getModule(): NativeJournalModule | null {
  if (moduleInstance !== undefined) return moduleInstance;
  try {
    moduleInstance = requireNativeModule<NativeJournalModule>('YoannJournalEncoder');
  } catch {
    moduleInstance = null;
  }
  return moduleInstance ?? null;
}

export function isNativeJournalEncoderAvailable(): boolean {
  return getModule() !== null;
}

export function addNativeJournalProgressListener(
  listener: (progress: NativeJournalProgress) => void,
): { remove: () => void } | null {
  const nativeModule = getModule();
  if (!nativeModule) return null;
  return nativeModule.addListener('onProgress', listener);
}

export async function generateNativeJournal(
  jobId: string,
  plan: NativeJournalPlan,
): Promise<NativeJournalResult> {
  const nativeModule = getModule();
  if (!nativeModule) throw new Error('Le moteur vidéo natif n’est pas installé.');
  return nativeModule.generate(jobId, plan);
}

export function cancelNativeJournal(jobId: string): void {
  getModule()?.cancel(jobId);
}
