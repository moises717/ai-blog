import { useCallback, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { replaceAll } from '@milkdown/kit/utils';
import { actions } from 'astro:actions';
import { inferTitle, loadCurrentDoc } from '@/lib/utils';
import { preparePassageText } from '@/lib/embedding-utils';
import { STORAGE_KEY } from '@/constants';
import {
  $embeddingProgress,
  $modelStatus,
  $saveStatus,
  editorInstance,
  resetEmbeddingProgress,
  resetSaveStatus,
  setEmbeddingProgress,
  setLastMarkdownSnapshot,
  setModelError,
  setModelLoading,
  setModelReady,
  setSaveError,
  setSaveSaving,
  setSaveSuccess,
  type EditorProgress,
  type ModelStatus,
  type SaveStatus,
} from '@/store/editor-store';
import {
  embedPost,
  ensureSwReady,
  ensureModelInitialized,
} from '@/scripts/ai-embeddings';

const MODEL = {
  modelId: 'Xenova/multilingual-e5-small',
  device: 'wasm' as const,
};

// Solo tracking local de estado de guardado
let isSaving = false;

function normalizeProgressPayload(payload: unknown): EditorProgress {
  if (!payload || typeof payload !== 'object') return null;

  const anyPayload = payload as any;
  const phase = anyPayload.phase || '';
  const message = anyPayload.label || anyPayload.message;
  const fromCache = anyPayload.fromCache === true;
  const pct = Number.isFinite(anyPayload.percent)
    ? Math.round(anyPayload.percent)
    : null;

  // Si el modelo ya está en caché/memoria, mostrar mensaje apropiado
  if (phase === 'cached' || phase === 'ready') {
    if (fromCache) {
      return {
        label: 'Generando vectores',
        percent: null,
      };
    }
    return {
      label: 'Modelo listo',
      percent: 100,
    };
  }

  if (
    phase === 'running' &&
    typeof anyPayload.total === 'number' &&
    anyPayload.total > 0
  ) {
    const position =
      typeof anyPayload.index === 'number'
        ? Math.min(anyPayload.index + 1, anyPayload.total)
        : anyPayload.total;
    const percent =
      anyPayload.percent != null
        ? pct
        : Math.round((position / anyPayload.total) * 100);

    return {
      label: `Procesando ${position}/${anyPayload.total}`,
      percent: percent,
    };
  }

  // Solo mostrar "Descargando modelo" si realmente está descargando (no desde caché)
  if (phase === 'loading' && !fromCache) {
    return {
      label: message || 'Descargando modelo',
      percent: pct,
    };
  }

  // Default para otros casos
  return {
    label: message || 'Preparando',
    percent: pct,
  };
}

function saveCurrentDoc(doc: { id: string; slug: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

function clearCurrentDoc() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Asegura que el modelo de embeddings esté listo para usar.
 * Usa la función centralizada de ai-embeddings.ts para evitar duplicación de estado.
 */
export async function ensureModelReady() {
  try {
    setModelLoading({ label: 'Cargando modelo', percent: 0 });
    await ensureSwReady();
    await ensureModelInitialized(MODEL, (payload: unknown) => {
      const next = normalizeProgressPayload(payload);
      if (next) setModelLoading(next);
    });
    setModelReady();
  } catch (err) {
    console.warn('No se pudo inicializar embeddings:', err);
    setModelError('No se pudo cargar el modelo');
    throw err;
  }
}

function formatProgress(p: EditorProgress): string {
  if (!p) return '';
  if (p.percent == null) return p.label;
  const pct = Math.max(0, Math.min(100, Math.round(p.percent)));
  return `${p.label} ${pct}%`;
}

function deriveBusyLabel(
  modelStatus: ModelStatus,
  saveStatus: SaveStatus,
  embeddingProgress: EditorProgress,
) {
  if (saveStatus.phase === 'saving') return saveStatus.message || 'Guardando…';

  if (embeddingProgress) {
    const formatted = formatProgress(embeddingProgress);
    return formatted || 'Generando embeddings…';
  }

  if (modelStatus.phase === 'loading') {
    const formatted = formatProgress(modelStatus.progress);
    return formatted || 'Cargando modelo…';
  }

  return '';
}

async function setEditorMarkdown(md: string, options?: { replace?: boolean }) {
  const crepe = editorInstance.get();
  if (!crepe) return;
  const value = md ?? '#';
  if (options?.replace === false) return;
  crepe.editor.action(replaceAll(value));
}

async function resetEditorToNew() {
  await setEditorMarkdown('#');
  setLastMarkdownSnapshot('#');
  resetEmbeddingProgress();
  setSaveSuccess('Nuevo documento listo');
  clearCurrentDoc();
  window.setTimeout(() => resetSaveStatus(), 1200);
}

async function importMarkdownFromFile() {
  const crepe = editorInstance.get();
  if (!crepe) {
    setSaveError('Editor no listo.');
    return;
  }

  const input = document.querySelector(
    '#import-md-input',
  ) as HTMLInputElement | null;
  if (!input) {
    setSaveError('No se encontró el selector de importación.');
    return;
  }

  return new Promise<void>((resolve) => {
    const handler = async () => {
      const file = input.files?.[0];
      if (!file) return resolve();
      try {
        const text = await file.text();
        crepe.editor.action(replaceAll(text));
      } catch (err) {
        console.error('Error importando markdown:', err);
        setSaveError('Error importando markdown.');
      } finally {
        input.value = '';
        resolve();
      }
    };

    input.addEventListener('change', handler, { once: true });
    input.click();
  });
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name: string) {
  return (
    String(name || 'documento')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'documento'
  );
}

async function exportMarkdownFile() {
  const crepe = editorInstance.get();
  if (!crepe) return;
  const rawMarkdown = await crepe.getMarkdown();
  setLastMarkdownSnapshot(rawMarkdown);
  const title = inferTitle(rawMarkdown);
  const filename = `${sanitizeFilename(title)}.md`;
  downloadTextFile(filename, rawMarkdown, 'text/markdown;charset=utf-8');
}

async function exportPdfFile() {
  const crepe = editorInstance.get();
  if (!crepe) return;
  const rawMarkdown = await crepe.getMarkdown();
  setLastMarkdownSnapshot(rawMarkdown);
  const title = inferTitle(rawMarkdown);

  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;

  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8" />`);
  w.document.write(`<title>${title}</title>`);
  w.document.write(
    `<style>body{font-family:ui-sans-serif,system-ui; padding:24px;} pre{white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:12px; line-height:1.5}</style>`,
  );
  w.document.write(`</head><body>`);
  w.document.write(`<h1>${title}</h1>`);
  const safe = rawMarkdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  w.document.write(`<pre>${safe}</pre>`);
  w.document.write(`</body></html>`);
  w.document.close();

  w.focus();
  w.print();
}

async function saveDocumentWithEmbeddings() {
  const crepe = editorInstance.get();
  if (!crepe) {
    setSaveError('Editor no listo.');
    return;
  }

  if (isSaving) return;
  isSaving = true;
  setSaveSaving('Guardando…');
  setEmbeddingProgress({ label: 'Generando embeddings', percent: 0 });

  try {
    await ensureModelReady();
    const rawMarkdown = await crepe.getMarkdown();
    setLastMarkdownSnapshot(rawMarkdown);
    const title = inferTitle(rawMarkdown);
    const currentDoc = loadCurrentDoc();

    const { data: saved, error: saveError } = await actions.documents.save({
      id: currentDoc?.id || undefined,
      slug: currentDoc?.slug || undefined,
      title,
      rawMarkdown,
      metadata: {},
    });

    if (saveError || !saved) {
      console.error(saveError);
      setSaveError('Error guardando documento.');
      setEmbeddingProgress({
        label: 'Error generando embedding',
        percent: null,
      });
      return;
    }

    // Preparar texto limpio para embedding (sin sintaxis markdown)
    const cleanedText = preparePassageText(title, rawMarkdown);
    const embeddingText = `passage: ${cleanedText}`;
    const embedding = await embedPost({
      postId: saved.id,
      text: embeddingText,
      model: MODEL,
      onProgress: (payload: unknown) => {
        const next = normalizeProgressPayload(payload);
        if (next) setEmbeddingProgress(next);
      },
    });

    const { error: embError } = await actions.documents.upsertEmbeddings({
      documentId: saved.id,
      items: [
        {
          chunkIndex: 0,
          chunkText: cleanedText,
          embedding,
          modelId: MODEL.modelId,
          device: MODEL.device,
          pooling: 'mean',
          normalize: true,
        },
      ],
    });

    if (embError) {
      console.error(embError);
      setSaveError('Documento guardado; error guardando embedding.');
      return;
    }

    saveCurrentDoc({ id: saved.id, slug: saved.slug });
    setSaveSuccess('Guardado.');
    resetEmbeddingProgress();
    window.setTimeout(() => {
      resetSaveStatus();
    }, 1400);
  } catch (err) {
    console.error(err);
    setSaveError('Error inesperado al guardar.');
    setEmbeddingProgress({
      label: 'Error generando embedding',
      percent: null,
    });
  } finally {
    isSaving = false;
  }
}

export function useEditorActions() {
  const modelStatus = useStore($modelStatus);
  const saveStatus = useStore($saveStatus);
  const embeddingProgress = useStore($embeddingProgress);

  const handleSave = useCallback(async () => {
    await saveDocumentWithEmbeddings();
  }, []);

  const handleNew = useCallback(async () => {
    await resetEditorToNew();
  }, []);

  const handleImport = useCallback(async () => {
    await importMarkdownFromFile();
  }, []);

  const handleExportMarkdown = useCallback(async () => {
    await exportMarkdownFile();
  }, []);

  const handleExportPdf = useCallback(async () => {
    await exportPdfFile();
  }, []);

  const isBusy =
    saveStatus.phase === 'saving' ||
    modelStatus.phase === 'loading' ||
    Boolean(embeddingProgress);

  const canSave =
    saveStatus.phase !== 'saving' && modelStatus.phase !== 'error';

  const saveLabel = useMemo(() => {
    if (!isBusy) return 'Guardar';
    return deriveBusyLabel(modelStatus, saveStatus, embeddingProgress);
  }, [embeddingProgress, isBusy, modelStatus, saveStatus]);

  return {
    save: handleSave,
    newDoc: handleNew,
    importMarkdown: handleImport,
    exportMarkdown: handleExportMarkdown,
    exportPdf: handleExportPdf,
    isBusy,
    canSave,
    saveLabel,
  };
}

export function useSaveShortcut(onSave: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;
      if (e.key.toLowerCase() !== 's') return;
      if (e.repeat) return;
      e.preventDefault();
      onSave();
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSave]);
}
