import React, { useState, useMemo } from 'react';
import {
    Search, Plus, Loader2, Sparkles, ArrowRightFromLine, ChevronRight, Globe,
    CheckCircle2, MinusCircle, XCircle, HelpCircle, Bolt, Tag, Lightbulb
} from 'lucide-react';
import {
    ContentItem, Verdict, TargetFormat, TARGET_FORMAT_VALUES,
    DisplayPrefs, DEFAULT_DISPLAY_PREFS
} from '../../types';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';
import { CharCounter } from '../CommonModals';

interface SocialIdeasViewProps {
    items: ContentItem[];
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onEdit: (item: ContentItem) => void;
    onQuickAdd: (title: string, notes: string, targetFormat?: TargetFormat | null) => Promise<void>;
    onGlobalAnalyze: () => void;
    isSyncing: boolean;
    isInitializing: boolean;
    onNavigateToIdeas: () => void;
    displayPrefs?: DisplayPrefs;
}

const VERDICT_STRIPE_COLOR: Record<Verdict, string> = {
    [Verdict.VALID]:      '#10b981',
    [Verdict.TOO_BLAND]:  '#f59e0b',
    [Verdict.NEEDS_WORK]: '#ef4444',
};

const HighlightText: React.FC<{ text: string; highlight?: string }> = ({ text, highlight }) => {
    if (!highlight || !highlight.trim()) return <>{text}</>;
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded-sm px-0.5">{part}</span>
                ) : part
            )}
        </>
    );
};

const VerdictBadge: React.FC<{ verdict?: Verdict }> = ({ verdict }) => {
    if (!verdict) return null;
    const cfg: Record<Verdict, { Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
        [Verdict.VALID]:      { Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50' },
        [Verdict.TOO_BLAND]:  { Icon: MinusCircle,  cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50' },
        [Verdict.NEEDS_WORK]: { Icon: XCircle,      cls: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50' },
    };
    const { Icon, cls } = cfg[verdict];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold ${cls}`}>
            <Icon className="w-2.5 h-2.5" />
            {verdict}
        </span>
    );
};

type FilterId = 'ALL' | 'TO_ANALYZE' | 'VALID' | 'TOO_BLAND' | 'NEEDS_WORK';

const FILTER_CHIPS: Array<{ id: FilterId; label: string; activeCls: string }> = [
    { id: 'ALL',        label: 'Tout',       activeCls: 'bg-brand-main border-brand-main text-white shadow-brand-main/20 dark:bg-white dark:border-white dark:text-brand-main' },
    { id: 'TO_ANALYZE', label: 'À analyser', activeCls: 'bg-brand-hover border-brand-hover text-white shadow-brand-hover/20' },
    { id: 'VALID',      label: 'Valide',     activeCls: 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-600/20' },
    { id: 'TOO_BLAND',  label: 'Trop lisse', activeCls: 'bg-amber-500 border-amber-500 text-white shadow-amber-500/20' },
    { id: 'NEEDS_WORK', label: 'À revoir',   activeCls: 'bg-red-500 border-red-500 text-white shadow-red-500/20' },
];

const matchesFilter = (item: ContentItem, filter: FilterId): boolean => {
    if (filter === 'ALL') return true;
    if (filter === 'TO_ANALYZE') return !item.analyzed;
    if (filter === 'VALID')      return item.verdict === Verdict.VALID;
    if (filter === 'TOO_BLAND')  return item.verdict === Verdict.TOO_BLAND;
    if (filter === 'NEEDS_WORK') return item.verdict === Verdict.NEEDS_WORK;
    return true;
};

export const SocialIdeasView: React.FC<SocialIdeasViewProps> = ({
    items, searchQuery, onSearchChange, onEdit, onQuickAdd, onGlobalAnalyze,
    isSyncing, isInitializing, displayPrefs
}) => {
    const prefs = { ...DEFAULT_DISPLAY_PREFS, ...(displayPrefs || {}) };

    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [newIdeaTitle, setNewIdeaTitle] = useState('');
    const [newIdeaNotes, setNewIdeaNotes] = useState('');
    const [newIdeaFormat, setNewIdeaFormat] = useState<TargetFormat | ''>('');
    const [filter, setFilter] = useState<FilterId>('ALL');
    const titleInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (quickAddOpen) titleInputRef.current?.focus();
    }, [quickAddOpen]);

    const resetQuickAdd = () => {
        setNewIdeaTitle('');
        setNewIdeaNotes('');
        setNewIdeaFormat('');
        setQuickAddOpen(false);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newIdeaTitle.trim()) return;
        await onQuickAdd(newIdeaTitle, newIdeaNotes, newIdeaFormat || null);
        resetQuickAdd();
    };

    const filteredItems = useMemo(
        () => items.filter(i => matchesFilter(i, filter)),
        [items, filter]
    );

    const counts = useMemo(() => ({
        ALL:        items.length,
        TO_ANALYZE: items.filter(i => !i.analyzed).length,
        VALID:      items.filter(i => i.verdict === Verdict.VALID).length,
        TOO_BLAND:  items.filter(i => i.verdict === Verdict.TOO_BLAND).length,
        NEEDS_WORK: items.filter(i => i.verdict === Verdict.NEEDS_WORK).length,
    }), [items]);

    const densityPad = prefs.density === 'compact' ? 'py-2' : prefs.density === 'airy' ? 'py-5' : 'py-3.5';
    const listGap    = prefs.density === 'compact' ? 'space-y-1.5' : prefs.density === 'airy' ? 'space-y-3' : 'space-y-2';

    return (
        <div className="space-y-4 animate-fade-in">

            {/* QUICK ADD — état replié = bouton seul, ouvert = formulaire complet */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden transition-all">
                {!quickAddOpen ? (
                    <button
                        onClick={() => setQuickAddOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-bg transition-colors group"
                    >
                        <span className="w-6 h-6 rounded-md bg-brand-light dark:bg-dark-bg flex items-center justify-center shrink-0 group-hover:bg-brand-main dark:group-hover:bg-white transition-colors">
                            <Plus className="w-3 h-3 text-brand-main dark:text-white group-hover:text-white dark:group-hover:text-brand-main transition-colors" />
                        </span>
                        Ajouter une idée…
                    </button>
                ) : (
                    <form onSubmit={handleAdd} className="p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <input
                            ref={titleInputRef}
                            type="text"
                            value={newIdeaTitle}
                            onChange={e => setNewIdeaTitle(e.target.value)}
                            placeholder="Titre de l'idée…"
                            className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-white rounded-lg text-sm font-semibold text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors"
                        />

                        <div className="flex flex-col w-full border border-brand-border dark:border-dark-sec-border rounded-lg bg-brand-light dark:bg-dark-bg focus-within:border-brand-main dark:focus-within:border-white overflow-hidden transition-colors">
                            <MarkdownToolbar />
                            <RichTextarea
                                value={newIdeaNotes}
                                onChange={setNewIdeaNotes}
                                className="w-full h-20 p-3"
                                placeholder="Notes, sources, premières idées… (optionnel)"
                            />
                            {newIdeaNotes.length > 80 && (
                                <div className="p-1 px-3 border-t border-brand-border/50 dark:border-dark-sec-border/50">
                                    <CharCounter current={newIdeaNotes.length} max={2000} />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 bg-brand-light dark:bg-dark-bg rounded-lg px-3 py-2">
                            <ArrowRightFromLine className="w-[11px] h-[11px] text-brand-main/50 dark:text-dark-text/50 shrink-0" />
                            <label className="text-[11px] font-bold text-brand-main/50 dark:text-dark-text/50 uppercase tracking-wider shrink-0">Format</label>
                            <select
                                value={newIdeaFormat}
                                onChange={e => setNewIdeaFormat((e.target.value || '') as TargetFormat | '')}
                                className="flex-1 bg-transparent border-none text-sm text-brand-main dark:text-white outline-hidden cursor-pointer min-w-0"
                            >
                                <option value="">— Choisir un format —</option>
                                {TARGET_FORMAT_VALUES.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={resetQuickAdd}
                                className="px-3 py-1.5 text-sm text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                disabled={!newIdeaTitle.trim() || isSyncing}
                                className="flex items-center gap-2 px-4 py-1.5 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-sm shadow-brand-main/30"
                            >
                                {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Ajouter
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* TOOLBAR */}
            <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-main/50 dark:text-dark-text/50" />
                    <input
                        type="text"
                        placeholder="Rechercher…"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full xl:w-56 pl-8 pr-4 py-2 bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-white rounded-lg text-sm text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0 scrollbar-hide flex-1">
                    {FILTER_CHIPS.map(c => {
                        const active = filter === c.id;
                        return (
                            <button
                                key={c.id}
                                onClick={() => setFilter(c.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-all shadow-sm ${
                                    active
                                        ? c.activeCls
                                        : 'bg-white dark:bg-dark-surface text-brand-main/70 dark:text-dark-text/70 border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 dark:hover:border-white/40 shadow-none'
                                }`}
                            >
                                {c.label}
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                                    active ? 'bg-white/25 dark:bg-brand-main/15' : 'bg-brand-light dark:bg-dark-bg'
                                }`}>
                                    {counts[c.id]}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={onGlobalAnalyze}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-lg border border-purple-200 dark:border-purple-800/50 transition-colors whitespace-nowrap shadow-sm shrink-0"
                    title="Analyser toutes les nouvelles idées avec l'IA"
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Analyser tout
                </button>
            </div>

            {/* LIST */}
            <div className={listGap}>
                {!isInitializing && filteredItems.length === 0 && (
                    <div className="py-16 text-center">
                        <Lightbulb className="w-12 h-12 mx-auto mb-4 text-brand-border dark:text-dark-sec-border" />
                        <p className="text-sm text-brand-main/50 dark:text-dark-text/50">
                            {searchQuery ? 'Aucune idée pour cette recherche.' : 'La boîte à idées est vide pour ce filtre.'}
                        </p>
                    </div>
                )}

                {filteredItems.map(item => (
                    <div
                        key={item.id}
                        onClick={() => onEdit(item)}
                        className="group flex bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 dark:hover:border-white/40 hover:shadow-md hover:shadow-brand-main/5 cursor-pointer transition-all duration-150 overflow-hidden"
                    >
                        {prefs.showVerdictStripe && (
                            <div
                                className="w-[3px] shrink-0 transition-colors duration-150"
                                style={{
                                    backgroundColor: item.verdict
                                        ? VERDICT_STRIPE_COLOR[item.verdict]
                                        : 'var(--color-brand-border)'
                                }}
                            />
                        )}

                        <div className={`flex-1 px-4 ${densityPad} flex flex-col sm:flex-row sm:items-center gap-3 min-w-0`}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                    <VerdictBadge verdict={item.verdict} />
                                    {prefs.showDepth && item.depth && (
                                        <span className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                            <Bolt className="w-2.5 h-2.5" />
                                            {item.depth}
                                        </span>
                                    )}
                                    {prefs.showOffer && item.targetOffer && (
                                        <span className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                            <Tag className="w-2.5 h-2.5" />
                                            {item.targetOffer}
                                        </span>
                                    )}
                                    {!item.analyzed && (
                                        <span className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                            <HelpCircle className="w-2.5 h-2.5" />
                                            À analyser
                                        </span>
                                    )}
                                </div>
                                <p className="font-semibold text-brand-main dark:text-white leading-snug group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors line-clamp-1">
                                    <HighlightText text={item.title || 'Idée sans titre'} highlight={searchQuery} />
                                </p>
                                {item.strategicAngle ? (
                                    <p className="text-xs text-brand-main/50 dark:text-dark-text/50 mt-0.5 line-clamp-1 italic">
                                        {item.strategicAngle.replace(/\*\*/g, '').split('\n')[0]}
                                    </p>
                                ) : item.notes ? (
                                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60 mt-0.5 line-clamp-1">
                                        <HighlightText text={item.notes} highlight={searchQuery} />
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                {item.targetFormat && (
                                    <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                        {item.targetFormat}
                                    </span>
                                )}
                                {prefs.showPlatforms && (item.platforms || []).slice(0, 2).map(p => (
                                    <span key={p} className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                        <Globe className="w-2.5 h-2.5" />
                                        {p}
                                    </span>
                                ))}
                                {prefs.showPlatforms && (item.platforms || []).length > 2 && (
                                    <span className="text-[10px] text-brand-main/40 dark:text-dark-text/40">+{item.platforms.length - 2}</span>
                                )}
                                <ChevronRight className="w-3 h-3 text-brand-main/30 dark:text-dark-text/30 group-hover:text-brand-main dark:group-hover:text-white transition-colors ml-1" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
