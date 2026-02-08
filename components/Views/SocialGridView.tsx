import React from 'react';
import { PenLine, CheckCircle2, Archive, ChevronRight } from 'lucide-react';
import { ContentItem } from '../../types';
import ContentCard from '../ContentCard';

interface SocialGridViewProps {
    items: ContentItem[];
    type: 'drafts' | 'ready' | 'archive';
    searchQuery: string;
    isInitializing: boolean;
    onEdit: (item: ContentItem) => void;
    onNavigateToIdeas: () => void;
}

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
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${currentConfig.iconBg} ${currentConfig.iconBorder}`}>
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
