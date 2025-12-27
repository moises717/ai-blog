import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'motion/react';
import { $saveStatus, $modelStatus, $currentTitle } from '@/store/editor-store';
import { Check, Cloud, Sparkles } from 'lucide-react'; // Quitamos Loader2 de aquí
import { cn } from '@/lib/utils';

export const DocumentInfo = () => {
  const saveStatus = useStore($saveStatus);
  const modelStatus = useStore($modelStatus);
  const liveTitle = useStore($currentTitle);

  const title = liveTitle || 'Documento sin título';

  // Lógica UX Depurada:
  // El centro SOLO muestra cosas que el botón NO puede mostrar por sí mismo
  // o confirmaciones finales.
  const getStatus = () => {
    // 1. Errores (Siempre prioridad máxima)
    if (saveStatus.phase === 'error') {
      return {
        type: 'status',
        text: 'Error al guardar',
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        icon: Cloud,
      };
    }

    // 2. Procesos de Fondo (IA) - El usuario no clicó nada, así que el centro informa.
    if (modelStatus.phase === 'loading') {
      return {
        type: 'status',
        text: 'Cargando...',
        color: 'text-gray-600 dark:text-gray-400',
        bg: 'bg-transparent',
        border: 'border-transparent',
        icon: Sparkles,
        spin: true,
      };
    }

    // 3. Confirmación de Éxito (Feedback final)
    if (saveStatus.phase === 'success') {
      return {
        type: 'status',
        text: 'Guardado',
        color: 'text-gray-600 dark:text-gray-400',
        bg: 'bg-transparent',
        border: 'border-transparent',
        icon: Check,
      };
    }

    return { type: 'title' };
  };

  const current = getStatus();
  const Icon = current.icon;

  return (
    <div className='flex items-center justify-center pointer-events-none w-full h-9'>
      <AnimatePresence mode='wait' initial={false}>
        {current.type === 'status' ? (
          /* VISTA ESTADO (IA, Error o Éxito) */
          <motion.div
            key='status-pill'
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex items-center gap-2 px-4 py-1',
              current.bg,
              current.border,
            )}
          >
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                current.color,
              )}
            >
              {current.text}
            </span>
            {Icon && (
              <Icon
                className={cn(
                  'w-3.5 h-3.5 opacity-80',
                  current.spin && 'animate-spin',
                )}
              />
            )}
          </motion.div>
        ) : (
          /* VISTA TÍTULO (Visible en reposo Y mientras el botón guarda) */
          <motion.div
            key='doc-title'
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            className='text-sm font-semibold text-foreground/90 tracking-tight text-center truncate max-w-75 px-2'
          >
            <span title={title}>{title}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
