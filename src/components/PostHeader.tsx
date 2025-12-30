import { useEffect, useState, useCallback } from "react";
import { HomeIcon, FileJson, FileText, Download, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ModeToggle } from "./ui/mode-toggle";
import { Button } from "./ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { exportPostAsMarkdown, exportPostAsPdf } from "@/lib/post-export";

interface PostHeaderProps {
    title: string;
    rawMarkdown: string;
    slug: string;
    className?: string;
}

function PostHeader({ title, rawMarkdown, slug, className }: PostHeaderProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            const scrollY = window.scrollY;
            setIsScrolled(scrollY > 20);
            setShowTitle(scrollY > 150);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const handleExportMarkdown = useCallback(() => {
        exportPostAsMarkdown(title, rawMarkdown);
    }, [title, rawMarkdown]);

    const handleExportPdf = useCallback(async () => {
        setIsExporting(true);
        try {
            await exportPostAsPdf(title, rawMarkdown);
        } finally {
            setTimeout(() => setIsExporting(false), 1000);
        }
    }, [title, rawMarkdown]);

    return (
        <div
            className={cn(
                "w-full flex justify-center sticky z-20 pointer-events-none transition-all duration-300 ease-out",
                isScrolled ? "top-0" : "top-4",
                className
            )}
        >
            <div
                className={cn(
                    "relative overflow-hidden p-px pointer-events-auto shadow-sm w-full transition-all duration-300 ease-out",
                    isScrolled ? "max-w-full rounded-none" : "max-w-5xl rounded-xl"
                )}
            >
                <AnimatePresence>
                    {isExporting && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, rotate: 360 }}
                            exit={{ opacity: 0 }}
                            transition={{
                                opacity: { duration: 0.3 },
                                rotate: {
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "linear",
                                },
                            }}
                            className="absolute -inset-[100px] z-0 pointer-events-none"
                            style={{
                                background:
                                    "conic-gradient(from 0deg, transparent 30%, #06b6d4 60%, #a855f7 80%, #ec4899 100%)",
                            }}
                        />
                    )}
                </AnimatePresence>

                <div
                    className={cn(
                        "relative z-10 flex items-center justify-between w-full h-12 px-4 transition-all duration-300 ease-out",
                        "border border-border/40",
                        isScrolled
                            ? "bg-background/60 backdrop-blur-2xl shadow-lg shadow-black/5 dark:shadow-black/20 rounded-none"
                            : "bg-background/95 backdrop-blur-xl rounded-xl"
                    )}
                >
                    <div className="flex items-center gap-3 z-20">
                        <a href="/" className="flex items-center gap-2.5 group">
                            <div className="size-8 rounded-lg bg-linear-to-br from-foreground/90 to-foreground/70 dark:from-foreground/80 dark:to-foreground/60 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                                <HomeIcon
                                    size={16}
                                    className="text-background group-hover:scale-110 transition-transform"
                                />
                            </div>
                            <span className="font-semibold text-base text-foreground hidden sm:block">
                                AI Blog
                            </span>
                        </a>
                    </div>
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 max-w-56 hidden sm:block overflow-hidden">
                        <AnimatePresence mode="wait">
                            {showTitle && (
                                <motion.h1
                                    initial={{ y: 20, opacity: 0, filter: "blur(4px)" }}
                                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                                    exit={{ y: -20, opacity: 0, filter: "blur(4px)" }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 300,
                                        damping: 25,
                                        opacity: { duration: 0.2 },
                                        filter: { duration: 0.2 },
                                    }}
                                    className="text-[17px]! font-medium text-foreground/80 truncate"
                                >
                                    {title}
                                </motion.h1>
                            )}
                        </AnimatePresence>
                    </div>
                    <div className="flex items-center gap-1.5 z-20">
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground gap-1.5"
                        >
                            <a href={`/new?edit=${slug}`}>
                                <Pencil size={14} />
                                <span className="hidden sm:inline">Editar</span>
                            </a>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground gap-1.5"
                                >
                                    <Download size={14} />
                                    <span className="hidden sm:inline">Exportar</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportMarkdown}>
                                    <FileJson className="mr-2 h-4 w-4" />
                                    Exportar MD
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportPdf}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Exportar PDF
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <ModeToggle />
                    </div>
                </div>
            </div>
        </div>
    );
}

export { PostHeader };
