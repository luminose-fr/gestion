import React, { useState } from 'react';
import { Search, Plus, Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { ContentItem, Verdict } from '../../types';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';
import { CharCounter } from '../CommonModals';

interface SocialIdeasViewProps {
    items: ContentItem[]; // Liste déjà filtrée par la recherche globale ou brute ? -> Disons brute ou filtrée par App, mais on gère le filtre Verdict ici.
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onEdit: (item: ContentItem) => void;
    onQuickAdd: (title: string, notes: string) => Promise<void>;
    onGlobalAnalyze: () => void;
    isSyncing: boolean;
    isInitializing: boolean;
    onNavigateToIdeas: () => void; // Pour le cas "empty"
}

export const SocialIdeasView: React.FC<SocialIdeasViewProps> = ({
    items, searchQuery, onSearchChange, onEdit, onQuickAdd, onGlobalAnalyze, isSyncing, isInitializing
}) => {
    // Local State for Quick Add
    const [newIdeaTitle, setNewIdeaTitle] = useState("");
    const [newIdeaNotes, setNewIdeaNotes] = useState("");
    
    // Local State for Filters
    const [verdictFilter, setVerdictFilter] = useState<Verdict | 'ALL' | 'TO_ANALYZE'>('ALL');

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newIdeaTitle.trim()) return;
        await onQuickAdd(newIdeaTitle, newIdeaNotes);
        setNewIdeaTitle("");
        setNewIdeaNotes("");
    };

    // Filter Logic
    const filteredItems = items.filter(i => {
        if (verdictFilter === 'ALL') return true;
        if (verdictFilter === 'TO_ANALYZE' && !i.analyzed) return true;
        if (verdictFilter === Verdict.VALID && i.verdict === Verdict.VALID) return true;
        if (verdictFilter === Verdict.TOO_BLAND && i.verdict === Verdict.TOO_BLAND) return true;
        if (verdictFilter === Verdict.NEEDS_WORK && i.verdict === Verdict.NEEDS_WORK) return true;
        return false;
    });

    const countAll = items.length;
    const countToAnalyze = items.filter(i => !i.analyzed).length;
    const countValid = items.filter(i => i.verdict === Verdict.VALID).length;
    const countBland = items.filter(i => i.verdict === Verdict.TOO_BLAND).length;
    const countWork = items.filter(i => i.verdict === Verdict.NEEDS_WORK).length;

    const getVerdictColor = (verdict?: Verdict) => {
        switch (verdict) {
            case Verdict.VALID: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
            case Verdict.TOO_BLAND: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
            case Verdict.NEEDS_WORK: return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
            default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
        }
    };

    const HighlightText = ({ text, highlight }: { text: string, highlight: string }) => {
        if (!highlight || !highlight.trim()) return <>{text}</>;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === highlight.toLowerCase() ? (
                        <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded px-0.5">{part}</span>
                    ) : part
                )}
            </>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* QUICK ADD FORM */}
            <div className="bg-white dark:bg-dark-surface shadow-sm rounded-xl p-6 border border-brand-border dark:border-dark-sec-border">
                <h3 className="text-sm font-semibold text-brand-main dark:text-white mb-3">Ajout rapide</h3>
                <form onSubmit={handleAdd} className="space-y-3">
                    <input 
                        type="text" 
                        value={newIdeaTitle}
                        onChange={(e) => setNewIdeaTitle(e.target.value)}
                        placeholder="Titre de l'idée..."
                        className="w-full px-4 py-2 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border rounded-lg outline-none focus:border-brand-main dark:focus:border-brand-light text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 font-bold"
                    />
                    
                    <div className="flex-1 flex flex-col w-full border border-brand-border dark:border-dark-sec-border rounded-lg bg-brand-light dark:bg-dark-bg focus-within:ring-2 focus-within:ring-brand-main dark:focus:ring-brand-light overflow-hidden transition-shadow">
                        <MarkdownToolbar />
                        <RichTextarea 
                            value={newIdeaNotes}
                            onChange={setNewIdeaNotes}
                            className="w-full h-24 p-3"
                            placeholder="Détails, notes, liens..."
                        />
                        {newIdeaNotes.length > 80 && (
                            <div className="p-1 px-3 border-t border-brand-border/50 dark:border-dark-sec-border/50">
                                <CharCounter current={newIdeaNotes.length} max={2000} />
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-end">
                        <button 
                            type="submit" 
                            disabled={!newIdeaTitle.trim() || isSyncing}
                            className="bg-brand-main hover:bg-brand-hover dark:bg-brand-light dark:text-brand-hover dark:hover:bg-white text-white px-6 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                        >
                            {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            Ajouter
                        </button>
                    </div>
                </form>
            </div>

            {/* TOOLBAR */}
            <div className="flex flex-col xl:flex-row items-center justify-between gap-4 pt-4">
                
                <div className="relative group w-full xl:w-72 flex-shrink-0 animate-in fade-in slide-in-from-left-4 duration-300">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-brand-main/50 dark:text-dark-text/50 group-focus-within:text-brand-main transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Rechercher..." 
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-brand-light rounded-lg text-sm outline-none transition-all shadow-sm text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 xl:pb-0 scrollbar-hide max-w-full">
                    <button onClick={() => setVerdictFilter('ALL')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${verdictFilter === 'ALL' ? 'bg-brand-main text-white border-brand-main dark:bg-brand-light dark:text-brand-main' : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-brand-main'}`}>
                        Tout <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${verdictFilter === 'ALL' ? 'bg-white/20' : 'bg-brand-light dark:bg-dark-bg'}`}>{countAll}</span>
                    </button>
                    <button onClick={() => setVerdictFilter('TO_ANALYZE')} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${verdictFilter === 'TO_ANALYZE' ? 'bg-brand-hover text-white border-brand-hover dark:bg-dark-sec-bg' : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-brand-hover'}`}>
                        À analyser <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${verdictFilter === 'TO_ANALYZE' ? 'bg-white/20' : 'bg-brand-light dark:bg-dark-bg'}`}>{countToAnalyze}</span>
                    </button>
                    <button onClick={() => setVerdictFilter(Verdict.VALID)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${verdictFilter === Verdict.VALID ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-green-500'}`}>
                        Valide <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${verdictFilter === Verdict.VALID ? 'bg-white/20' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'}`}>{countValid}</span>
                    </button>
                    <button onClick={() => setVerdictFilter(Verdict.TOO_BLAND)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${verdictFilter === Verdict.TOO_BLAND ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-yellow-500'}`}>
                        Trop lisse <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${verdictFilter === Verdict.TOO_BLAND ? 'bg-white/20' : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'}`}>{countBland}</span>
                    </button>
                    <button onClick={() => setVerdictFilter(Verdict.NEEDS_WORK)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${verdictFilter === Verdict.NEEDS_WORK ? 'bg-red-500 text-white border-red-500' : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-red-500'}`}>
                        À revoir <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${verdictFilter === Verdict.NEEDS_WORK ? 'bg-white/20' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>{countWork}</span>
                    </button>
                </div>

                <button 
                    onClick={onGlobalAnalyze}
                    className="w-full xl:w-auto flex items-center gap-2 text-xs sm:text-sm bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-lg font-medium transition-colors border border-purple-200 dark:border-purple-800 shadow-sm whitespace-nowrap justify-center animate-in fade-in slide-in-from-right-4 duration-300"
                    title="Analyser toutes les nouvelles idées avec l'IA"
                >
                    <Sparkles className="w-4 h-4" />
                    Analyser
                </button>
            </div>

            {/* LIST */}
            <div className="space-y-2">
                {!isInitializing && filteredItems.length === 0 && (
                    <div className="p-12 text-center text-brand-main/50 dark:text-dark-text/50 italic bg-white dark:bg-dark-surface rounded-xl border border-dashed border-brand-border dark:border-dark-sec-border">
                        {searchQuery ? "Aucune idée trouvée pour cette recherche." : "La boîte à idées est vide pour ce filtre."}
                    </div>
                )}
                {filteredItems.map(item => (
                    <div 
                        key={item.id} 
                        onClick={() => onEdit(item)}
                        className="group bg-white dark:bg-dark-surface p-4 rounded-xl border border-brand-border dark:border-dark-sec-border hover:border-brand-main dark:hover:border-white hover:shadow-md cursor-pointer transition-all flex flex-col md:flex-row md:items-start justify-between gap-4"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                {item.verdict && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getVerdictColor(item.verdict)}`}>
                                        {item.verdict}
                                    </span>
                                )}
                            </div>
                            <h4 className="font-medium text-brand-main dark:text-white group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors whitespace-normal break-words leading-snug">
                                <HighlightText text={item.title || "Idée sans titre"} highlight={searchQuery} />
                            </h4>
                            
                            {item.strategicAngle && (
                                <p className="text-xs text-brand-main/50 dark:text-dark-text/50 italic mt-1 line-clamp-2">
                                    Angle : {item.strategicAngle}
                                </p>
                            )}
                            {item.notes && !item.strategicAngle && (
                                <p className="text-sm text-brand-main/60 dark:text-dark-text/70 line-clamp-2 mt-1">
                                    <HighlightText text={item.notes} highlight={searchQuery} />
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
