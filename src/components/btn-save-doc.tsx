import { Command, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $saveStatus } from '@/store/editor-store';
import { useEditorActions, useSaveShortcut } from '@/lib/editor-actions';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export const BtnSaveDoc = () => {
  const { save, isBusy, canSave } = useEditorActions();
  const saveStatus = useStore($saveStatus);
  const isActuallySaving = saveStatus.phase === 'saving';

  const handleSave = useCallback(() => {
    void save();
  }, [save]);

  useSaveShortcut(handleSave);

  return (
    <button
      onClick={handleSave}
      disabled={!canSave && !isBusy}
      className={cn(
        'relative flex items-center justify-center h-9 px-4 min-w-27.5 rounded-lg text-sm font-medium transition-all duration-200',
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95',
        'disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100',
      )}
      aria-label='Guardar documento'
    >
      <div className='flex items-center gap-2'>
        {/* ICONO */}
        <div className='relative w-4 h-4 flex items-center justify-center'>
          <AnimatePresence mode='popLayout'>
            {isActuallySaving ? (
              <Spinner />
            ) : (
              <motion.div
                key='icon'
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className='absolute inset-0'
              >
                <Save className='w-4 h-4' />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <motion.span layout className='whitespace-nowrap'>
          {isActuallySaving ? 'Guardando...' : 'Guardar'}
        </motion.span>
        {!isActuallySaving && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            className='hidden sm:flex items-center ml-1 overflow-hidden'
          >
            <div className='flex items-center gap-0.5 text-[10px] bg-primary-foreground/20 px-1.5 py-0.5 rounded text-primary-foreground/90'>
              <Command size={10} />
              <span>S</span>
            </div>
          </motion.div>
        )}
      </div>
    </button>
  );
};
