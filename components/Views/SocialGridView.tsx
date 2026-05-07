import React from 'react';
import { PenLine, CheckCircle2, Archive, ChevronRight, Sparkles } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { bodyJsonToText } from '../../ai/formats';
import { ContentItem, TargetFormat, Verdict, DisplayPrefs, DEFAULT_DISPLAY_PREFS } from '../../types';

const VERDICT_STRIPE: Record<Verdict, string> = {
    [Verdict.VALID]:       'bg-emerald-500',
    [Verdict.TOO_BLAND]:   'bg-amber-500',
    [Verdict.NEEDS_WORK]:  'bg-red-500',
};

interface SocialGridViewProps {
    items: ContentItem[];
    type: 'drafts' | 'ready' | 'archive';
    searchQuery: string;
    isInitializing: boolean;
    onEdit: (item: ContentItem) => void;
    onNavigateToIdeas: () => void;
    displayPrefs?: DisplayPrefs;
}

const getHighlightedText = (text: string, highlightTerm?: string): React.ReactNode => {
    if (!highlightTerm || !highlightTerm.trim()) return text;
    const escaped = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === highlightTerm.toLowerCase() ? (
            <span key={`${part}-${i}`} className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded-sm px-0.5">
                {part}
            </span>
        ) : part
    );
};

const getPreviewText = (item: ContentItem): string => {
    const rawText = (
        item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT ||
        item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE
    )
        ? bodyJsonToText(item.scriptVideo || '') || bodyJsonToText(item.body)
        : bodyJsonToText(item.body);
    return rawText || 'Pas de contenu…';
};

const formatScheduledDate = (scheduledDate: string | null): string => {
    if (!scheduledDate) return 'Non planifié';
    try {
        return format(parseISO(scheduledDate), 'd MMM yyyy', { locale: fr });
    } catch {
        return 'Date invalide';
    }
};

// ───────────────────────── Draft Card ─────────────────────────

const DraftCard: React.FC<{
    item: ContentItem;
    onClick: (item: ContentItem) => void;
    highlight: string;
    prefs: DisplayPrefs;
}> = ({ item, onClick, highlight, prefs }) => {
    const stripeColor = item.verdict ? VERDICT_STRIPE[item.verdict] : 'bg-brand-border dark:bg-dark-sec-border';
    const showStripe  = prefs.showVerdictStripe && !!item.verdict;

    return (
        <div
            onClick={() => onClick(item)}
            className="group relative bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border hover:border-brand-main/40 hover:shadow-lg hover:shadow-brand-main/5 cursor-pointer transition-all duration-150 flex overflow-hidden"
        >
            {/* Verdict stripe */}
            {showStripe && (
                <div className={`w-1 shrink-0 ${stripeColor}`} aria-hidden="true" />
            )}

            <div className="flex-1 p-4 flex flex-col min-w-0">
                {/* Title */}
                <h4 className="font-semibold text-brand-main dark:text-white leading-snug line-clamp-2 mb-1.5">
                    {getHighlightedText(item.title || 'Brouillon sans titre', highlight)}
                </h4>

                {/* Strategic angle (if analyzed) */}
                {item.strategicAngle && (
                    <p className="flex items-start gap-1.5 text-xs text-brand-main/80 dark:text-brand-light/80 italic leading-relaxed mb-2 line-clamp-2">
                        <Sparkles className="w-3 h-3 mt-0.5 shrink-0 not-italic" />
                        <span>{item.strategicAngle}</span>
                    </p>
                )}

                {/* Body preview */}
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-3 flex-1 mb-3 leading-relaxed">
                    {getHighlightedText(getPreviewText(item), highlight)}
                </p>

                {/* Meta row */}
                <div className="flex items-center justify-between gap-2 flex-wrap mt-auto">
                    <div className="flex gap-1.5 flex-wrap">
                        {prefs.showPlatforms && (item.platforms || []).slice(0, 2).map(p => (
                            <span
                                key={p}
                                className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border"
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                        {prefs.showDepth && item.depth && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/50">
                                {item.depth}
                            </span>
                        )}
                        {item.targetFormat && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                {item.targetFormat}
                            </span>
                        )}
                        {prefs.showOffer && item.targetOffer && (
                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                {item.targetOffer}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ───────────────────────── Ready Table ─────────────────────────

const ReadyTable: React.FC<{
    items: ContentItem[];
    searchQuery: string;
    onEdit: (item: ContentItem) => void;
    prefs: DisplayPrefs;
}> = ({ items, searchQuery, onEdit, prefs }) => {
    const showPlatforms = prefs.showPlatforms;
    const showOffer     = prefs.showOffer;

    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, item: ContentItem) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onEdit(item);
        }
    };

    return (
        <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shadow-sm">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                        <tr>
                            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[18rem]">
                                Contenu
                            </th>
                            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                Format
                            </th>
                            {showOffer && (
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                    Offre
                                </th>
                            )}
                            {showPlatforms && (
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[12rem]">
                                    Plateformes
                                </th>
                            )}
                            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                Publication
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                        {items.map(item => (
                            <tr
                                key={item.id}
                                tabIndex={0}
                                onClick={() => onEdit(item)}
                                onKeyDown={event => handleRowKeyDown(event, item)}
                                className="cursor-pointer transition-colors hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 focus-visible:outline-none focus-visible:bg-brand-light/40 dark:focus-visible:bg-dark-bg/40 group"
                            >
                                <td className="px-4 py-4 align-top">
                                    <div className="font-semibold text-brand-main dark:text-white leading-tight group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors">
                                        {getHighlightedText(item.title || 'Nouvelle idée', searchQuery)}
                                    </div>
                                    <div className="mt-1 max-w-2xl text-xs leading-5 text-brand-main/60 dark:text-dark-text/60 line-clamp-2">
                                        {getHighlightedText(getPreviewText(item), searchQuery)}
                                    </div>
                                </td>
                                <td className="px-4 py-4 align-top whitespace-nowrap">
                                    {item.targetFormat ? (
                                        <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                            {item.targetFormat}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>
                                    )}
                                </td>
                                {showOffer && (
                                    <td className="px-4 py-4 align-top whitespace-nowrap">
                                        {item.targetOffer ? (
                                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                {item.targetOffer}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>
                                        )}
                                    </td>
                                )}
                                {showPlatforms && (
                                    <td className="px-4 py-4 align-top">
                                        {item.platforms.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.platforms.map(p => (
                                                    <span
                                                        key={`${item.id}-${p}`}
                                                        className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border"
                                                    >
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>
                                        )}
                                    </td>
                                )}
                                <td className="px-4 py-4 align-top whitespace-nowrap text-sm text-brand-main/70 dark:text-dark-text/70">
                                    {formatScheduledDate(item.scheduledDate)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ───────────────────────── Main view ─────────────────────────

export const SocialGridView: React.FC<SocialGridViewProps> = ({
    items, type, searchQuery, isInitializing, onEdit, onNavigateToIdeas, displayPrefs
}) => {
    const prefs = { ...DEFAULT_DISPLAY_PREFS, ...(displayPrefs || {}) };

    const config = {
        drafts: {
            icon: PenLine,
            emptyTitle: 'Aucun brouillon en cours',
            emptyText: "Vous n'avez aucun post en rédaction.",
            emptySearch: 'Aucun brouillon ne correspond à votre recherche.',
            showIdeaButton: true,
            iconBg: 'bg-white dark:bg-dark-surface',
            iconColor: 'text-brand-main/50 dark:text-dark-text/50',
            iconBorder: 'border-brand-border dark:border-dark-sec-border'
        },
        ready: {
            icon: CheckCircle2,
            emptyTitle: 'Rien à publier',
            emptyText: 'Les posts validés et prêts apparaîtront ici.',
            emptySearch: 'Aucun post prêt ne correspond à votre recherche.',
            showIdeaButton: false,
            iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
            iconColor: 'text-emerald-500 dark:text-emerald-400',
            iconBorder: 'border-emerald-200 dark:border-emerald-800/50'
        },
        archive: {
            icon: Archive,
            emptyTitle: 'Aucune archive',
            emptyText: 'Vos publications passées apparaîtront ici.',
            emptySearch: 'Aucune archive ne correspond à votre recherche.',
            showIdeaButton: false,
            iconBg: 'bg-white dark:bg-dark-surface',
            iconColor: 'text-brand-main/50 dark:text-dark-text/50',
            iconBorder: 'border-brand-border dark:border-dark-sec-border'
        }
    } as const;

    const currentConfig = config[type];
    const Icon = currentConfig.icon;

    return (
        <div className="space-y-6 animate-fade-in">
            {!isInitializing && items.length === 0 ? (
                <div className="text-center py-20">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-xs ${currentConfig.iconBg} ${currentConfig.iconBorder}`}>
                        <Icon className={`w-8 h-8 ${currentConfig.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-brand-main dark:text-white">{currentConfig.emptyTitle}</h3>
                    <p className="text-sm text-brand-main/60 dark:text-dark-text/60 max-w-xs mx-auto mt-2">
                        {searchQuery ? currentConfig.emptySearch : currentConfig.emptyText}
                    </p>
                    {currentConfig.showIdeaButton && (
                        <button
                            onClick={onNavigateToIdeas}
                            className="mt-6 text-brand-main dark:text-white font-medium hover:underline flex items-center justify-center gap-1 mx-auto"
                        >
                            Choisir une idée <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ) : type === 'ready' ? (
                <ReadyTable items={items} searchQuery={searchQuery} onEdit={onEdit} prefs={prefs} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {items.map(item => (
                        <DraftCard
                            key={item.id}
                            item={item}
                            onClick={onEdit}
                            highlight={searchQuery}
                            prefs={prefs}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
