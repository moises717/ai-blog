import { atom } from 'nanostores';

export type EditorProgress = {
  label: string;
  percent: number | null;
} | null;

export type ModelStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; progress: EditorProgress }
  | { phase: 'ready' }
  | { phase: 'error'; message?: string };

export type SaveStatus =
  | { phase: 'idle' }
  | { phase: 'saving'; message?: string }
  | { phase: 'success'; message?: string }
  | { phase: 'error'; message?: string };

export const $modelStatus = atom<ModelStatus>({ phase: 'idle' });
export const $embeddingProgress = atom<EditorProgress>(null);
export const $saveStatus = atom<SaveStatus>({ phase: 'idle' });
export const $lastMarkdownSnapshot = atom<string>('');

export function setModelLoading(progress: EditorProgress) {
  $modelStatus.set({ phase: 'loading', progress });
}

export function setModelReady() {
  $modelStatus.set({ phase: 'ready' });
}

export function setModelError(message?: string) {
  $modelStatus.set({ phase: 'error', message });
}

export function resetModelStatus() {
  $modelStatus.set({ phase: 'idle' });
}

export function setEmbeddingProgress(progress: EditorProgress) {
  $embeddingProgress.set(progress);
}

export function resetEmbeddingProgress() {
  $embeddingProgress.set(null);
}

export function setSaveSaving(message?: string) {
  $saveStatus.set({ phase: 'saving', message });
}

export function setSaveSuccess(message?: string) {
  $saveStatus.set({ phase: 'success', message });
}

export function setSaveError(message?: string) {
  $saveStatus.set({ phase: 'error', message });
}

export function resetSaveStatus() {
  $saveStatus.set({ phase: 'idle' });
}

export function setLastMarkdownSnapshot(md: string) {
  $lastMarkdownSnapshot.set(md);
}
