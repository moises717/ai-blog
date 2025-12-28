import { useEffect, useState } from 'react';
import {
  FileJson,
  FilePlus,
  FileText,
  FolderUp,
  HomeIcon,
  Menu,
} from 'lucide-react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'motion/react';
import { $modelStatus, $saveStatus } from '@/store/editor-store';
import { BtnSaveDoc } from './btn-save-doc';
import { useEditorActions, ensureModelReady } from './editor-actions';
import { Button } from './ui/button';
import { DocumentInfo } from './document-info';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from '@/components/ui/menubar';
import { cn } from '@/lib/utils';

function ManagementBar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { newDoc, importMarkdown, exportMarkdown, exportPdf } =
    useEditorActions();

  // Detectar scroll para efecto glassmorphism
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const modelStatus = useStore($modelStatus);
  const saveStatus = useStore($saveStatus);

  // Iniciar la descarga del modelo cuando se monta el componente
  useEffect(() => {
    ensureModelReady().catch((err) => {
      console.warn('Error al iniciar descarga del modelo:', err);
    });
  }, []);

  const isBusy =
    modelStatus.phase === 'loading' || saveStatus.phase === 'saving';

  return (
    <div className={cn(
      'w-full flex justify-center sticky z-20 pointer-events-none transition-all duration-300 ease-out',
      isScrolled ? 'top-0' : 'top-4'
    )}>
      <div className={cn(
        'relative overflow-hidden p-px pointer-events-auto shadow-sm w-full transition-all duration-300 ease-out',
        isScrolled ? 'max-w-full rounded-none' : 'max-w-5xl rounded-xl'
      )}>
        <AnimatePresence>
          {isBusy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{
                opacity: { duration: 0.5 },
                rotate: {
                  duration: 4,
                  repeat: Infinity,
                  ease: 'linear',
                },
              }}
              className='absolute -inset-[150%] z-0'
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 40%, #06b6d4 80%, #a855f7 90%, #ec4899 100%)',
              }}
            />
          )}
        </AnimatePresence>
        <div
          className={cn(
            'relative z-10 flex items-center justify-between w-full h-11 px-3 transition-all duration-300 ease-out',
            !isBusy && 'border border-border/40',
            isScrolled
              ? 'bg-background/60 backdrop-blur-2xl shadow-lg shadow-black/5 border-white/10 rounded-none'
              : 'bg-background/95 backdrop-blur-xl rounded-xl',
          )}
        >
          <div className='flex items-center gap-2 z-20'>
            <Button
              asChild
              variant='ghost'
              size='icon-sm'
              className='text-muted-foreground hover:text-foreground shrink-0'
            >
              <a href='/'>
                <HomeIcon size={24} />
              </a>
            </Button>

            <div className='h-4 w-px bg-border/60 shrink-0' />

            <Menubar className='border-none shadow-none bg-transparent p-0 h-auto'>
              <MenubarMenu>
                <MenubarTrigger className='cursor-pointer font-medium text-sm px-2.5 py-1.5 h-8 data-[state=open]:bg-accent/50 rounded-md transition-colors'>
                  <Menu className='w-4 h-4 sm:hidden' />
                  <span className='hidden sm:inline'>Archivo</span>
                </MenubarTrigger>
                <MenubarContent align='start'>
                  <MenubarItem onClick={() => newDoc()}>
                    <FilePlus className='mr-2 h-4 w-4' /> Nuevo{' '}
                    <MenubarShortcut>⌘N</MenubarShortcut>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem onClick={() => importMarkdown()}>
                    <FolderUp className='mr-2 h-4 w-4' /> Importar...
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem onClick={() => exportMarkdown()}>
                    <FileJson className='mr-2 h-4 w-4' /> Exportar MD
                  </MenubarItem>
                  <MenubarItem onClick={() => exportPdf()}>
                    <FileText className='mr-2 h-4 w-4' /> Exportar PDF
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </div>
          <div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full max-w-75 flex justify-center pointer-events-none'>
            <div className='pointer-events-auto'>
              <DocumentInfo />
            </div>
          </div>
          <div className='flex items-center gap-2 z-20'>
            <BtnSaveDoc />
          </div>
        </div>
      </div>
    </div>
  );
}

export { ManagementBar };
