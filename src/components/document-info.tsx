import { useStore } from '@nanostores/react';
import { motion, AnimatePresence, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { $saveStatus, $modelStatus, $currentTitle } from '@/store/editor-store';
import { Check, Cloud, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

// Componente para animar el porcentaje con interpolación suave
const AnimatedPercentage = ({ percent }: { percent: number }) => {
  // Spring muy suave para transición fluida
  const spring = useSpring(0, {
    stiffness: 50,
    damping: 20,
  });

  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    spring.set(percent);
  }, [percent, spring]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (v) => {
      setDisplayValue(Math.round(v));
    });
    return unsubscribe;
  }, [spring]);

  return (
    <span className="inline-flex items-center tabular-nums font-mono min-w-[3ch] justify-end">
      <span>{displayValue}</span>
      <span className="ml-0.5">%</span>
    </span>
  );
};

export const DocumentInfo = () => {
  const saveStatus = useStore($saveStatus);
  const modelStatus = useStore($modelStatus);
  const liveTitle = useStore($currentTitle);

  const title = liveTitle || 'Documento sin título';

  const getStatus = () => {
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

    // Estado de descarga del modelo
    if (modelStatus.phase === 'loading') {
      const progress = modelStatus.progress;
      const percent = progress?.percent ?? 0;

      return {
        type: 'downloading',
        text: 'Descargando modelo',
        percent: percent,
        color: 'text-cyan-600 dark:text-cyan-400',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/20',
        icon: Download,
      };
    }

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
    <div className="flex items-center justify-center pointer-events-none w-full h-9">
      <AnimatePresence mode="wait" initial={false}>
        {current.type === 'downloading' ? (
          <motion.div
            key="downloading-pill"
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex items-center gap-2 px-4 py-1 rounded-full',
              current.bg,
              current.border,
              'border'
            )}
          >
            {Icon && (
              <motion.div
                animate={{ y: [0, -2, 0] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Icon className={cn('w-3.5 h-3.5 opacity-80', current.color)} />
              </motion.div>
            )}
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                current.color
              )}
            >
              {current.text}
            </span>
            <span className={cn('text-xs font-bold tracking-wide', current.color)}>
              <AnimatedPercentage percent={current.percent ?? 0} />
            </span>
          </motion.div>
        ) : current.type === 'status' ? (
          <motion.div
            key="status-pill"
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'flex items-center gap-2 px-4 py-1',
              current.bg,
              current.border
            )}
          >
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide',
                current.color
              )}
            >
              {current.text}
            </span>
            {Icon && <Icon className={cn('w-3.5 h-3.5 opacity-80')} />}
          </motion.div>
        ) : (
          <motion.div
            key="doc-title"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
            className="text-sm font-semibold text-foreground/90 tracking-tight text-center truncate max-w-75 px-2"
          >
            <span title={title}>{title}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
