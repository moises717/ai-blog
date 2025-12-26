import {
  Ban,
  Command,
  IdCard,
  LoaderCircle,
  FileText,
  FolderUp,
} from 'lucide-react';
import { motion, type Variants, type Transition } from 'motion/react';
import { useMemo, useSyncExternalStore } from 'react';
import type { Store } from 'nanostores';
import {
  $embeddingProgress,
  $modelStatus,
  $saveStatus,
  type EditorProgress,
  type ModelStatus,
  type SaveStatus,
} from '@/store/editor-store';

const BUTTON_MOTION_CONFIG = {
  initial: 'rest',
  whileHover: 'hover',
  whileTap: 'tap',
  variants: {
    rest: { maxWidth: '40px' },
    hover: {
      maxWidth: '140px',
      transition: { type: 'spring', stiffness: 200, damping: 35, delay: 0.15 },
    },
    tap: { scale: 0.95 },
  },
  transition: { type: 'spring', stiffness: 250, damping: 25 },
} as const;

const LABEL_VARIANTS: Variants = {
  rest: { opacity: 0, x: 4 },
  hover: { opacity: 1, x: 0, visibility: 'visible' },
  tap: { opacity: 1, x: 0, visibility: 'visible' },
};

const LABEL_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 25,
};

function useNanostore<T>(store: Store<T>) {
  return useSyncExternalStore(
    (onStoreChange) => store.listen(() => onStoreChange()),
    () => store.get(),
    () => store.get(),
  );
}

function dispatchEditorEvent(type: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
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

function ManagementBar() {
  const modelStatus = useNanostore($modelStatus);
  const saveStatus = useNanostore($saveStatus);
  const embeddingProgress = useNanostore($embeddingProgress);

  const isBusy =
    saveStatus.phase === 'saving' ||
    modelStatus.phase === 'loading' ||
    Boolean(embeddingProgress);

  const saveLabel = useMemo(() => {
    if (!isBusy) return 'Guardar';
    return deriveBusyLabel(modelStatus, saveStatus, embeddingProgress);
  }, [embeddingProgress, isBusy, modelStatus, saveStatus]);

  const canSave =
    modelStatus.phase === 'ready' && saveStatus.phase !== 'saving';

  return (
    <div className='@container/wrapper w-full flex justify-end sticky top-0 z-20 py-4 px-3'>
      <div className='flex w-fit flex-col @xl/wrapper:flex-row items-center gap-y-2 rounded-2xl border border-border p-2 shadow-lg backdrop-blur-sm bg-card/80 @xl/wrapper:space-x-3'>
        <div className='mx-auto flex flex-col @lg/wrapper:flex-row shrink-0 items-center'>
          <div className='mx-3 h-6 w-px rounded-full hidden @lg/wrapper:block' />

          <motion.div
            layout
            layoutRoot
            className='mx-auto flex flex-wrap space-x-2 sm:flex-nowrap'
          >
            <motion.button
              {...BUTTON_MOTION_CONFIG}
              className='flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-neutral-200/60 dark:bg-neutral-600/80 px-2.5 py-2 text-neutral-600 dark:text-neutral-200'
              aria-label='Exportar Markdown'
              onClick={() => dispatchEditorEvent('editor:exportMarkdown')}
            >
              <Ban size={20} className='shrink-0' />
              <motion.span
                variants={LABEL_VARIANTS}
                transition={LABEL_TRANSITION}
                className='invisible text-sm'
              >
                Exportar MD
              </motion.span>
            </motion.button>

            <motion.button
              {...BUTTON_MOTION_CONFIG}
              className='flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-red-200/60 dark:bg-red-800/80 px-2.5 py-2 text-red-600 dark:text-red-300'
              aria-label='Exportar PDF'
              onClick={() => dispatchEditorEvent('editor:exportPdf')}
            >
              <FileText size={20} className='shrink-0' />
              <motion.span
                variants={LABEL_VARIANTS}
                transition={LABEL_TRANSITION}
                className='invisible text-sm'
              >
                Exportar PDF
              </motion.span>
            </motion.button>

            <motion.button
              {...BUTTON_MOTION_CONFIG}
              className='flex h-10 items-center space-x-2 overflow-hidden whitespace-nowrap rounded-lg bg-green-200/60 dark:bg-green-800/80 px-2.5 py-2 text-green-600 dark:text-green-300'
              aria-label='Importar Markdown'
              onClick={() => dispatchEditorEvent('editor:importMarkdown')}
            >
              <FolderUp size={20} className='shrink-0' />
              <motion.span
                variants={LABEL_VARIANTS}
                transition={LABEL_TRANSITION}
                className='invisible text-sm'
              >
                Importar
              </motion.span>
            </motion.button>
          </motion.div>
        </div>

        <div className='mx-3 hidden h-6 w-px bg-border @xl/wrapper:block rounded-full' />

        <motion.button
          whileTap={{ scale: 0.975 }}
          disabled={!canSave}
          onClick={() => dispatchEditorEvent('editor:save')}
          className='flex h-10 text-sm cursor-pointer items-center justify-center rounded-lg bg-teal-500 dark:bg-teal-600/80 px-3 py-2 text-white transition-colors duration-300 dark:hover:bg-teal-800 hover:bg-teal-600 w-full @xl/wrapper:w-auto disabled:opacity-70 disabled:cursor-not-allowed'
          aria-label='Guardar'
        >
          <motion.span
            key={saveLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className='flex items-center gap-2'
          >
            {isBusy ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                className='inline-flex'
              >
                <LoaderCircle size={16} />
              </motion.span>
            ) : null}
            <span>{saveLabel}</span>
          </motion.span>

          {!isBusy ? (
            <>
              <div className='mx-3 h-5 w-px bg-white/40 rounded-full' />
              <div className='flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 -mr-1'>
                <Command size={14} />
                CTRL + S
              </div>
            </>
          ) : null}
        </motion.button>
      </div>
    </div>
  );
}

export { ManagementBar };
