import { useEffect, useState, useRef } from 'react';
import { Search, HomeIcon, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ModeToggle } from './ui/mode-toggle';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface GlobalHeaderProps {
    showSearch?: boolean;
    showHome?: boolean;
    isLoading?: boolean;
    isSearching?: boolean;
    initialQuery?: string;
    className?: string;
}

function GlobalHeader({
    showSearch = true,
    showHome = true,
    isLoading = false,
    isSearching = false,
    initialQuery = '',
    className
}: GlobalHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [searchValue, setSearchValue] = useState(initialQuery);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [localSearching, setLocalSearching] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const desktopInputRef = useRef<HTMLInputElement>(null);

    // Listen for search state changes from SearchResults component
    useEffect(() => {
        const handleSearchState = (e: CustomEvent<boolean>) => {
            setLocalSearching(e.detail);
        };
        window.addEventListener('search:state' as any, handleSearchState);
        return () => window.removeEventListener('search:state' as any, handleSearchState);
    }, []);

    const isBusy = isLoading || isSearching || localSearching;

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Focus input when search opens on mobile
    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isSearchOpen]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchValue.trim()) {
            // Redirect to search page with query
            window.location.href = `/search?q=${encodeURIComponent(searchValue.trim())}`;
        }
    };

    const handleSearchClear = () => {
        setSearchValue('');
        // If on search page, redirect to home
        if (window.location.pathname === '/search') {
            window.location.href = '/';
        }
    };

    return (
        <div
            className={cn(
                'w-full flex justify-center sticky z-20 pointer-events-none transition-all duration-300 ease-out',
                isScrolled ? 'top-0' : 'top-4',
                className
            )}
        >
            <div
                className={cn(
                    'relative overflow-hidden p-px pointer-events-auto shadow-sm w-full transition-all duration-300 ease-out',
                    isScrolled ? 'max-w-full rounded-none' : 'max-w-5xl rounded-xl',
                )}
            >
                <div
                    className={cn(
                        'relative z-10 flex items-center justify-between w-full h-12 px-4 transition-all duration-300 ease-out',
                        'border border-border/40',
                        isScrolled
                            ? 'bg-background/60 backdrop-blur-2xl shadow-lg shadow-black/5 dark:shadow-black/20 rounded-none'
                            : 'bg-background/95 backdrop-blur-xl rounded-xl',
                    )}
                >
                    {/* Left section - Brand/Home */}
                    <div className="flex items-center gap-3 z-20">
                        {showHome && (
                            <a href="/" className="flex items-center gap-2.5 group">
                                <div className="size-8 rounded-lg bg-gradient-to-br from-foreground/90 to-foreground/70 dark:from-foreground/80 dark:to-foreground/60 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                                    <HomeIcon
                                        size={16}
                                        className="text-background group-hover:scale-110 transition-transform"
                                    />
                                </div>
                                <span className="font-semibold text-base text-foreground hidden sm:block">
                                    AI Blog
                                </span>
                            </a>
                        )}
                    </div>

                    {/* Center section - Search (Desktop) */}
                    {showSearch && (
                        <form
                            onSubmit={handleSearchSubmit}
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full max-w-sm px-4 hidden sm:block"
                        >
                            {/* Search input with animated border */}
                            <div className="relative rounded-lg p-px overflow-hidden">
                                {/* Animated border when searching */}
                                <AnimatePresence>
                                    {localSearching && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1, rotate: 360 }}
                                            exit={{ opacity: 0 }}
                                            transition={{
                                                opacity: { duration: 0.3 },
                                                rotate: {
                                                    duration: 2,
                                                    repeat: Infinity,
                                                    ease: 'linear',
                                                },
                                            }}
                                            className="absolute -inset-[100px] z-0 pointer-events-none"
                                            style={{
                                                background:
                                                    'conic-gradient(from 0deg, transparent 30%, #06b6d4 60%, #a855f7 80%, #ec4899 100%)',
                                            }}
                                        />
                                    )}
                                </AnimatePresence>
                                {/* Inner container with solid background to mask the gradient */}
                                <div className={cn(
                                    'relative z-10 flex items-center rounded-lg',
                                    localSearching ? 'bg-background' : 'bg-muted/40',
                                    'transition-all duration-200',
                                    !localSearching && 'hover:bg-muted/50',
                                )}>
                                    {localSearching ? (
                                        <Sparkles
                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-primary animate-pulse"
                                            size={15}
                                        />
                                    ) : (
                                        <Search
                                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
                                            size={15}
                                        />
                                    )}
                                    <input
                                        ref={desktopInputRef}
                                        type="text"
                                        value={searchValue}
                                        onChange={handleSearchChange}
                                        placeholder="Búsqueda semántica..."
                                        className={cn(
                                            'w-full h-8 pl-9 pr-8 rounded-lg bg-transparent',
                                            'text-sm text-foreground placeholder:text-muted-foreground/60',
                                            'focus:outline-none focus:ring-1 focus:ring-ring/40',
                                            'transition-all duration-200',
                                        )}
                                    />
                                    {searchValue && (
                                        <button
                                            type="button"
                                            onClick={handleSearchClear}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </form>
                    )}

                    {/* Right section - Actions */}
                    <div className="flex items-center gap-1.5 z-20">
                        {/* Mobile search button */}
                        {showSearch && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="sm:hidden text-muted-foreground hover:text-foreground"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search size={18} />
                            </Button>
                        )}

                        <ModeToggle />
                    </div>
                </div>
            </div>

            {/* Mobile search overlay */}
            <AnimatePresence>
                {isSearchOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl sm:hidden"
                    >
                        <div className="p-4">
                            <form onSubmit={handleSearchSubmit}>
                                {/* Mobile search input with animated border */}
                                <div className="relative overflow-hidden rounded-xl p-px">
                                    <AnimatePresence>
                                        {localSearching && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1, rotate: 360 }}
                                                exit={{ opacity: 0 }}
                                                transition={{
                                                    opacity: { duration: 0.3 },
                                                    rotate: {
                                                        duration: 2,
                                                        repeat: Infinity,
                                                        ease: 'linear',
                                                    },
                                                }}
                                                className="absolute -inset-[200%] z-0"
                                                style={{
                                                    background:
                                                        'conic-gradient(from 0deg, transparent 30%, #06b6d4 60%, #a855f7 80%, #ec4899 100%)',
                                                }}
                                            />
                                        )}
                                    </AnimatePresence>
                                    <div className={cn(
                                        'relative z-10 flex items-center',
                                        localSearching ? 'bg-background' : 'bg-muted/50',
                                        'border border-border/50 rounded-xl',
                                    )}>
                                        {localSearching ? (
                                            <Sparkles
                                                className="absolute left-3 top-1/2 -translate-y-1/2 text-primary animate-pulse"
                                                size={18}
                                            />
                                        ) : (
                                            <Search
                                                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                                size={18}
                                            />
                                        )}
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            value={searchValue}
                                            onChange={handleSearchChange}
                                            placeholder="Búsqueda semántica..."
                                            className={cn(
                                                'w-full h-12 pl-10 pr-12 rounded-xl bg-transparent',
                                                'text-base text-foreground placeholder:text-muted-foreground',
                                                'focus:outline-none focus:ring-2 focus:ring-ring/50',
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsSearchOpen(false);
                                                handleSearchClear();
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export { GlobalHeader };
