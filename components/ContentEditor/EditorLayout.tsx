import React from 'react';
import { ChevronLeft } from 'lucide-react';

interface EditorLayoutProps {
    onClose: () => void;
    headerContent: React.ReactNode;
    /** Sous-bandeau optionnel rendu juste sous le header (utilisé pour la barre d'onglets mobile). */
    subHeaderContent?: React.ReactNode;
    footerContent?: React.ReactNode;
    children: React.ReactNode;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({ onClose, headerContent, subHeaderContent, footerContent, children }) => {
    return (
        <div className="w-full h-full flex flex-col bg-brand-light dark:bg-dark-bg animate-in fade-in slide-in-from-right-4 duration-300">
            {/* HEADER FIXE */}
            <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 z-20">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 pr-4 border-r border-brand-border dark:border-dark-sec-border text-brand-main/70 hover:text-brand-main dark:text-dark-text/70 dark:hover:text-white transition-colors font-medium text-sm shrink-0"
                >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Retour</span>
                </button>
                <div className="flex-1 min-w-0">
                    {headerContent}
                </div>
            </div>

            {/* SUB-HEADER (mobile step bar, etc.) */}
            {subHeaderContent && (
                <div className="shrink-0 z-10">
                    {subHeaderContent}
                </div>
            )}

            {/* BODY SCROLLABLE */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {children}
            </div>

            {/* FOOTER FIXE */}
            {footerContent && (
                <div className="flex items-center justify-end gap-3 px-4 md:px-6 py-4 border-t border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shrink-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    {footerContent}
                </div>
            )}
        </div>
    );
};