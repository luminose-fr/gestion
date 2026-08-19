import React, { useMemo, useState } from 'react';
import { PenLine, CheckCircle2, Archive, ChevronRight, Sparkles, MinusCircle, XCircle, HelpCircle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { bodyJsonToText } from '../../ai/formats';
import { ContentItem, TargetFormat, Verdict, DisplayPrefs, DEFAULT_DISPLAY_PREFS } from '../../types';

const VERDICT_STRIPE: Record<Verdict, string> = {
    [Verdict.VALID]:       'bg-emerald-500',
    [Verdict.TOO_BLAND]:   'bg-amber-500',
    [Verdict.NEEDS_WORK]:  'bg-red-500',
};

const VERDICT_BADGE_CFG: Record<Verdict, { Icon: React.ComponentType<{ className?: string }>; cls: string }> = {
    [Verdict.VALID]:      { Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50' },
    [Verdict.TOO_BLAND]:  { Icon: MinusCircle,  cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50' },
    [Verdict.NEEDS_WORK]: { Icon: XCircle,      cls: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50' },
};

// Ordre logique pour le tri "Statut" : Valide → Trop lisse → À revoir → À analyser → (rien)
// asc = du plus positif vers le moins positif
const VERDICT_SORT_ORDER: Record<Verdict, number> = {
    [Verdict.VALID]:      1,
    [Verdict.TOO_BLAND]:  2,
    [Verdict.NEEDS_WORK]: 3,
};
const getStatutKey = (item: ContentItem): number => {
    if (item.verdict && VERDICT_SORT_ORDER[item.verdict]) return VERDICT_SORT_ORDER[item.verdict];
    if (item.analyzed === false) return 4; // À analyser
    return 5; // pas d'info
};

type SortColumn = 'statut' | 'contenu' | 'format' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface SocialGridViewProps {
    items: ContentItem[];
    type: 'drafts' | 'ready' | 'archive';
    searchQuery: string;
    isInitializing: boolean;
    onEdit: (item: ContentItem) => void;
    onNavigateToIdeas: () => void;
    displayPrefs?: DisplayPrefs;
}

export const getHighlightedText = (text: string, highlightTerm?: string): React.ReactNode => {
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

export const getPreviewText = (item: ContentItem): string => {
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

const formatCreatedAt = (iso: string | undefined): string => {
    if (!iso) return '—';
    try {
        return format(parseISO(iso), 'd MMM yyyy', { locale: fr });
    } catch {
        return '—';
    }
};

// ───────────────────────── VerdictBadge ─────────────────────────

const VerdictBadgeCell: React.FC<{ verdict?: Verdict; analyzed?: boolean }> = ({ verdict, analyzed }) => {
    if (verdict && VERDICT_BADGE_CFG[verdict]) {
        const { Icon, cls } = VERDICT_BADGE_CFG[verdict];
        return (
            <span className={`inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold whitespace-nowrap ${cls}`}>
                <Icon className="w-2.5 h-2.5" />
                {verdict}
            </span>
        );
    }
    if (analyzed === false) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold whitespace-nowrap bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                <HelpCircle className="w-2.5 h-2.5" />
                À analyser
            </span>
        );
    }
    return <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>;
};

// ───────────────────────── Content Table (unifié) ─────────────────────────

/**
 * Tableau unifié pour Idées / En cours / Prêts / Archives.
 * Colonnes affichées selon les flags ; bande verdict à gauche selon prefs.showVerdictStripe.
 * Tri cliquable sur Statut / Contenu / Format (défaut : Contenu ascendant).
 */
export const ContentTable: React.FC<{
    items: ContentItem[];
    searchQuery: string;
    onEdit: (item: ContentItem) => void;
    prefs: DisplayPrefs;
    /** Affiche la colonne Statut (verdict) */
    showStatut: boolean;
    /** Affiche la colonne Publication (date planifiée) */
    showPublication: boolean;
    /** Affiche le strategicAngle sous le titre */
    showStrategicAngle: boolean;
    /** Affiche la colonne "Créé le" (date de création) */
    showCreatedAt?: boolean;
}> = ({ items, searchQuery, onEdit, prefs, showStatut, showPublication, showStrategicAngle, showCreatedAt = false }) => {
    const { showPlatforms, showObjectif, showVerdictStripe } = prefs;

    // Cellules en mode compact (densité fixée)
    const cellCls = 'px-4 py-2 align-top';

    const [sortColumn, setSortColumn] = useState<SortColumn>('contenu');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSortClick = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const sortedItems = useMemo(() => {
        const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
        const dir = sortDirection === 'asc' ? 1 : -1;
        const arr = [...items];
        const tsOf = (s: string | undefined): number => {
            if (!s) return 0;
            const t = Date.parse(s);
            return Number.isNaN(t) ? 0 : t;
        };
        arr.sort((a, b) => {
            let cmp = 0;
            if (sortColumn === 'statut') {
                cmp = getStatutKey(a) - getStatutKey(b);
                if (cmp === 0) cmp = collator.compare(a.title || '', b.title || '');
            } else if (sortColumn === 'format') {
                const fa = a.targetFormat || '';
                const fb = b.targetFormat || '';
                if (!fa && fb) cmp = 1;
                else if (fa && !fb) cmp = -1;
                else cmp = collator.compare(fa, fb);
                if (cmp === 0) cmp = collator.compare(a.title || '', b.title || '');
            } else if (sortColumn === 'createdAt') {
                cmp = tsOf(a.createdAt) - tsOf(b.createdAt);
                if (cmp === 0) cmp = collator.compare(a.title || '', b.title || '');
            } else {
                cmp = collator.compare(a.title || '', b.title || '');
            }
            return cmp * dir;
        });
        return arr;
    }, [items, sortColumn, sortDirection]);

    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, item: ContentItem) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onEdit(item);
        }
    };

    const SortableTh: React.FC<{
        column: SortColumn;
        label: string;
        className?: string;
    }> = ({ column, label, className = '' }) => {
        const active = sortColumn === column;
        const Icon = !active ? ChevronsUpDown : (sortDirection === 'asc' ? ChevronUp : ChevronDown);
        return (
            <th className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 ${className}`}>
                <button
                    type="button"
                    onClick={() => handleSortClick(column)}
                    className={`inline-flex items-center gap-1 group transition-colors ${
                        active
                            ? 'text-brand-main dark:text-white'
                            : 'hover:text-brand-main dark:hover:text-white'
                    }`}
                    title={active ? `Tri : ${sortDirection === 'asc' ? 'croissant' : 'décroissant'} (clic pour inverser)` : `Trier par ${label}`}
                    aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                    {label}
                    <Icon className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'} transition-opacity`} />
                </button>
            </th>
        );
    };

    return (
        <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shadow-sm">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                        <tr>
                            {showVerdictStripe && (
                                <th className="w-1 p-0" aria-hidden="true" />
                            )}
                            {showStatut && (
                                <SortableTh column="statut" label="Statut" className="whitespace-nowrap" />
                            )}
                            <SortableTh column="contenu" label="Contenu" className="min-w-[18rem]" />
                            <SortableTh column="format" label="Format" className="whitespace-nowrap" />
                            {showObjectif && (
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                    Objectif
                                </th>
                            )}
                            {showPlatforms && (
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[12rem]">
                                    Plateformes
                                </th>
                            )}
                            {showCreatedAt && (
                                <SortableTh column="createdAt" label="Créé le" className="whitespace-nowrap" />
                            )}
                            {showPublication && (
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                    Publication
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                        {sortedItems.map(item => {
                            const stripeColor = item.verdict ? VERDICT_STRIPE[item.verdict] : 'bg-brand-border dark:bg-dark-sec-border';
                            return (
                                <tr
                                    key={item.id}
                                    tabIndex={0}
                                    onClick={() => onEdit(item)}
                                    onKeyDown={event => handleRowKeyDown(event, item)}
                                    className="cursor-pointer transition-colors hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 focus-visible:outline-none focus-visible:bg-brand-light/40 dark:focus-visible:bg-dark-bg/40 group"
                                >
                                    {showVerdictStripe && (
                                        <td className={`w-1 p-0 ${stripeColor}`} aria-hidden="true" />
                                    )}

                                    {showStatut && (
                                        <td className={cellCls}>
                                            <VerdictBadgeCell verdict={item.verdict} analyzed={item.analyzed} />
                                        </td>
                                    )}

                                    <td className={cellCls}>
                                        <div className="font-semibold text-brand-main dark:text-white leading-tight group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors">
                                            {getHighlightedText(item.title || 'Nouvelle idée', searchQuery)}
                                        </div>
                                        {showStrategicAngle && item.strategicAngle && (
                                            <div className="mt-1 flex items-start gap-1.5 text-xs text-brand-main/70 dark:text-brand-light/70 italic leading-snug max-w-2xl line-clamp-1">
                                                <Sparkles className="w-3 h-3 mt-0.5 shrink-0 not-italic" />
                                                <span>{item.strategicAngle.replace(/\*\*/g, '').split('\n')[0]}</span>
                                            </div>
                                        )}
                                        <div className="mt-1 max-w-2xl text-xs leading-5 text-brand-main/60 dark:text-dark-text/60 line-clamp-2">
                                            {getHighlightedText(getPreviewText(item), searchQuery)}
                                        </div>
                                    </td>

                                    <td className={`${cellCls} whitespace-nowrap`}>
                                        {item.targetFormat ? (
                                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                                {item.targetFormat}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>
                                        )}
                                    </td>

                                    {showObjectif && (
                                        <td className={`${cellCls} whitespace-nowrap`}>
                                            {item.objectif ? (
                                                <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-main/20 dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                    {item.objectif}
                                                </span>
                                            ) : (
                                                <span className="text-sm text-brand-main/40 dark:text-dark-text/40">—</span>
                                            )}
                                        </td>
                                    )}

                                    {showPlatforms && (
                                        <td className={cellCls}>
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

                                    {showCreatedAt && (
                                        <td className={`${cellCls} whitespace-nowrap text-sm text-brand-main/70 dark:text-dark-text/70`}>
                                            {formatCreatedAt(item.createdAt)}
                                        </td>
                                    )}
                                    {showPublication && (
                                        <td className={`${cellCls} whitespace-nowrap text-sm text-brand-main/70 dark:text-dark-text/70`}>
                                            {formatScheduledDate(item.scheduledDate)}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
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
            iconBorder: 'border-brand-border dark:border-dark-sec-border',
            showStatut: true,
            showPublication: false,
            showStrategicAngle: true,
        },
        ready: {
            icon: CheckCircle2,
            emptyTitle: 'Rien à publier',
            emptyText: 'Les posts validés et prêts apparaîtront ici.',
            emptySearch: 'Aucun post prêt ne correspond à votre recherche.',
            showIdeaButton: false,
            iconBg: 'bg-emerald-50 dark:bg-emerald-900/20',
            iconColor: 'text-emerald-500 dark:text-emerald-400',
            iconBorder: 'border-emerald-200 dark:border-emerald-800/50',
            showStatut: false,
            showPublication: true,
            showStrategicAngle: false,
        },
        archive: {
            icon: Archive,
            emptyTitle: 'Aucune archive',
            emptyText: 'Vos publications passées apparaîtront ici.',
            emptySearch: 'Aucune archive ne correspond à votre recherche.',
            showIdeaButton: false,
            iconBg: 'bg-white dark:bg-dark-surface',
            iconColor: 'text-brand-main/50 dark:text-dark-text/50',
            iconBorder: 'border-brand-border dark:border-dark-sec-border',
            showStatut: false,
            showPublication: true,
            showStrategicAngle: false,
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
            ) : (
                <ContentTable
                    items={items}
                    searchQuery={searchQuery}
                    onEdit={onEdit}
                    prefs={prefs}
                    showStatut={currentConfig.showStatut}
                    showPublication={currentConfig.showPublication}
                    showStrategicAngle={currentConfig.showStrategicAngle}
                />
            )}
        </div>
    );
};
