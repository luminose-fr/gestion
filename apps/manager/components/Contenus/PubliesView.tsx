import React, { useMemo } from 'react';
import { CheckCircle2, ChevronRight, Search } from 'lucide-react';
import { getFormatDef, type EtapeCourante } from '@luminose/editorial';
import { ContentItem } from '../../types';
import { Carte, Champ, ControleSegmente, Etiquette } from '../ui';
import CalendarView from '../CalendarView';

/**
 * La liste Publiés (SPEC §13) : publiés et programmés, en liste ou en
 * calendrier. « Décliner » n'est pas sur la ligne : il vit à l'étape
 * Publication du contenu, où l'on voit ce qu'on déclinerait.
 */

export type VuePublies = 'liste' | 'calendrier';

export interface PubliesViewProps {
    items: ContentItem[];
    etapes: Record<string, EtapeCourante>;
    vue: VuePublies;
    onVue: (vue: VuePublies) => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onOuvrir: (item: ContentItem) => void;
    isInitializing?: boolean;
}

/** Le programmé d'abord, puis le plus récemment publié. */
const instant = (item: ContentItem) => (item.scheduledDate ? Date.parse(item.scheduledDate) || 0 : 0);

export const PubliesView: React.FC<PubliesViewProps> = ({
    items, etapes, vue, onVue, searchQuery, onSearchChange, onOuvrir, isInitializing,
}) => {
    const triees = useMemo(() => [...items].sort((a, b) => instant(b) - instant(a)), [items]);

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                <div className="relative w-full md:w-auto md:flex-1 md:min-w-[140px] md:max-w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />
                    <Champ
                        type="search"
                        placeholder="Rechercher…"
                        value={searchQuery}
                        onChange={e => onSearchChange((e.target as HTMLInputElement).value)}
                        className="h-10 pl-9"
                        aria-label="Rechercher dans les publiés"
                    />
                </div>
                <ControleSegmente<VuePublies>
                    libelle="Affichage"
                    valeur={vue}
                    onChange={onVue}
                    options={[{ valeur: 'liste', libelle: 'Liste' }, { valeur: 'calendrier', libelle: 'Calendrier' }]}
                />
            </div>

            {vue === 'calendrier' ? (
                <CalendarView items={items} onItemClick={onOuvrir} />
            ) : triees.length > 0 ? (
                <Carte densite="tableau" posee>
                    <div className="divide-y divide-brand-border/60 dark:divide-dark-sec-border/60">
                        {triees.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onOuvrir(item)}
                                className="w-full min-h-[60px] grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_160px_20px] items-center gap-4 px-4 md:px-5 py-2 text-left hover:bg-survol dark:hover:bg-dark-sec-bg transition-colors"
                            >
                                <span className="text-sm font-semibold text-brand-main dark:text-white truncate">{item.title || 'Sans titre'}</span>
                                <span className="hidden md:block">
                                    {getFormatDef(item.targetFormat)?.shortKey && (
                                        <Etiquette as="span" forme="pastille">{getFormatDef(item.targetFormat)!.shortKey}</Etiquette>
                                    )}
                                </span>
                                <span className="text-xs font-semibold text-succes truncate">{etapes[item.id]?.libelle ?? 'Publié'}</span>
                                <ChevronRight className="hidden md:block w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
                            </button>
                        ))}
                    </div>
                </Carte>
            ) : !isInitializing && (
                <Carte densite="seule" className="text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-brand-main/40 dark:text-dark-text/40" />
                    <p className="text-sm text-brand-main dark:text-dark-text">
                        {searchQuery.trim() ? 'Aucune publication pour cette recherche.' : 'Rien de publié pour l’instant.'}
                    </p>
                </Carte>
            )}
        </div>
    );
};

export default PubliesView;
