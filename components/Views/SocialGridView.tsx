import React from 'react';
import { PenLine, CheckCircle2, Archive, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { bodyJsonToText } from '../../ai/formats';
import { ContentItem, TargetFormat } from '../../types';
import ContentCard from '../ContentCard';

interface SocialGridViewProps {
    items: ContentItem[];
    type: 'drafts' | 'ready' | 'archive';
    searchQuery: string;
    isInitializing: boolean;
    onEdit: (item: ContentItem) => void;
    onNavigateToIdeas: () => void;
}

const getHighlightedText = (text: string, highlightTerm?: string) => {
    if (!highlightTerm || !highlightTerm.trim()) return text;

    const escaped = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));

    return parts.map((part, i) =>
        part.toLowerCase() === highlightTerm.toLowerCase() ? (
            <span
                key={`${part}-${i}`}
                className="bg-yellow-200 dark:bg-yellow-900/50 text-gray-900 dark:text-white font-medium rounded-sm px-0.5"
            >
                {part}
            </span>
        ) : part
    );
};

const getPreviewText = (item: ContentItem) => {
    const rawText = (
        item.targetFormat === TargetFormat.SCRIPT_VIDEO_REEL_SHORT ||
        item.targetFormat === TargetFormat.SCRIPT_VIDEO_YOUTUBE
    )
        ? bodyJsonToText(item.scriptVideo || '') || bodyJsonToText(item.body)
        : bodyJsonToText(item.body);

    return rawText || 'Pas de contenu...';
};

const formatScheduledDate = (scheduledDate: string | null) => {
    if (!scheduledDate) return 'Non planifie';

    try {
        return format(parseISO(scheduledDate), 'd MMM yyyy', { locale: fr });
    } catch {
        return 'Date invalide';
    }
};

export const SocialGridView: React.FC<SocialGridViewProps> = ({
    items, type, searchQuery, isInitializing, onEdit, onNavigateToIdeas
}) => {
    // Configurations spécifiques à chaque type
    const config = {
        drafts: {
            icon: PenLine,
            emptyTitle: "Aucun brouillon en cours",
            emptyText: "Vous n'avez aucun post en rédaction.",
            emptySearch: "Aucun brouillon ne correspond à votre recherche.",
            showIdeaButton: true,
            iconBg: "bg-white dark:bg-dark-surface",
            iconColor: "text-brand-main/50 dark:text-dark-text/50",
            iconBorder: "border-brand-border dark:border-dark-sec-border"
        },
        ready: {
            icon: CheckCircle2,
            emptyTitle: "Rien à valider",
            emptyText: "Tous vos posts sont soit en brouillon, soit déjà publiés.",
            emptySearch: "Aucun post prêt ne correspond à votre recherche.",
            showIdeaButton: false,
            iconBg: "bg-green-50 dark:bg-green-900/20",
            iconColor: "text-green-500 dark:text-green-400",
            iconBorder: "border-green-200 dark:border-green-800"
        },
        archive: {
            icon: Archive,
            emptyTitle: "Aucune archive",
            emptyText: "Vos publications passées apparaîtront ici.",
            emptySearch: "Aucune archive ne correspond à votre recherche.",
            showIdeaButton: false,
            iconBg: "bg-white dark:bg-dark-surface",
            iconColor: "text-brand-main/50 dark:text-dark-text/50",
            iconBorder: "border-brand-border dark:border-dark-sec-border"
        }
    };

    const currentConfig = config[type];
    const Icon = currentConfig.icon;

    return (
        <div className="space-y-6 animate-fade-in">
            {!isInitializing && items.length === 0 ? (
                <div className="text-center py-20">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-xs ${currentConfig.iconBg} ${currentConfig.iconBorder}`}>
                        <Icon className={`w-8 h-8 ${currentConfig.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-medium text-brand-main dark:text-white">{currentConfig.emptyTitle}</h3>
                    <p className="text-brand-main/60 dark:text-dark-text/60 max-w-xs mx-auto mt-2">
                        {searchQuery ? currentConfig.emptySearch : currentConfig.emptyText}
                    </p>
                    {currentConfig.showIdeaButton && (
                        <button onClick={onNavigateToIdeas} className="mt-6 text-brand-main dark:text-white font-medium hover:underline flex items-center justify-center gap-1 mx-auto">
                            Choisir une idée <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ) : type === 'ready' ? (
                <ReadyItemsTable items={items} searchQuery={searchQuery} onEdit={onEdit} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(item => (
                        <ContentCard key={item.id} item={item} onClick={onEdit} highlight={searchQuery} />
                    ))}
                </div>
            )}
        </div>
    );
};

const ReadyItemsTable: React.FC<{
    items: ContentItem[];
    searchQuery: string;
    onEdit: (item: ContentItem) => void;
}> = ({ items, searchQuery, onEdit }) => {
    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, item: ContentItem) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onEdit(item);
        }
    };

    return (
        <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shadow-xs">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-brand-light/70 dark:bg-dark-bg/70 border-b border-brand-border dark:border-dark-sec-border">
                        <tr>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-main/55 dark:text-dark-text/55 min-w-[22rem]">
                                Contenu
                            </th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                Format
                            </th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
                                Offre
                            </th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-main/55 dark:text-dark-text/55 min-w-[13rem]">
                                Plateformes
                            </th>
                            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">
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
                                onKeyDown={(event) => handleRowKeyDown(event, item)}
                                className="cursor-pointer transition-colors hover:bg-brand-light/45 dark:hover:bg-dark-bg/45 focus-visible:outline-none focus-visible:bg-brand-light/45 dark:focus-visible:bg-dark-bg/45"
                            >
                                <td className="px-4 py-4 align-top">
                                    <div className="font-semibold text-brand-main dark:text-white leading-tight">
                                        {getHighlightedText(item.title || 'Nouvelle idée', searchQuery)}
                                    </div>
                                    <div className="mt-1 max-w-2xl text-xs leading-5 text-brand-main/65 dark:text-dark-text/65 line-clamp-2">
                                        {getHighlightedText(getPreviewText(item), searchQuery)}
                                    </div>
                                </td>

                                <td className="px-4 py-4 align-top">
                                    {item.targetFormat ? (
                                        <span className="inline-flex rounded-md bg-pink-100 px-2 py-1 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                                            {item.targetFormat}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                                    )}
                                </td>

                                <td className="px-4 py-4 align-top">
                                    {item.targetOffer ? (
                                        <span className="inline-flex rounded-md bg-brand-light px-2 py-1 text-xs font-medium text-brand-main dark:bg-dark-bg dark:text-dark-text">
                                            {item.targetOffer}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                                    )}
                                </td>

                                <td className="px-4 py-4 align-top">
                                    {item.platforms.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {item.platforms.map((platform) => (
                                                <span
                                                    key={`${item.id}-${platform}`}
                                                    className="inline-flex rounded-md bg-brand-light px-2 py-1 text-xs font-medium text-brand-main dark:bg-dark-bg dark:text-dark-text"
                                                >
                                                    {platform}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-brand-main/45 dark:text-dark-text/45">-</span>
                                    )}
                                </td>

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
