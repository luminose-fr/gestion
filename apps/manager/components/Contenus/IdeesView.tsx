import React, { useMemo, useState } from 'react';
import { ChevronRight, Lightbulb, Plus, Search, Sparkles } from 'lucide-react';
import { getFormatDef } from '@luminose/editorial';
import { ContentItem, TargetFormat, TARGET_FORMAT_VALUES } from '../../types';
import { Bouton, Carte, Champ, CLASSES_CHAMP, Etiquette } from '../ui';
import { EnCours } from '../Feedback';

/**
 * La liste Idées (SPEC §13) : des intuitions d'une ligne, pas encore des
 * conversations.
 *
 * Plus de verdict : « Valide », « Trop lisse », « À revoir » étaient une porte
 * qui n'arrêtait rien — quel qu'il soit, l'idée partait à l'atelier.
 * L'Analyste reste ; ce qu'il dit prépare l'ouverture de l'idée, et la liste
 * ne dit plus que si elle est préparée ou non.
 */

export interface IdeesViewProps {
    items: ContentItem[];
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onOuvrir: (item: ContentItem) => void;
    onAjouter: (titre: string, format: TargetFormat) => Promise<void>;
    /** Prépare les trois idées les plus récentes qui ne le sont pas encore. */
    onPreparer: () => void;
    /** Le champ d'ajout prend la main à l'arrivée (« + Nouveau → Idée »). */
    ajoutEnAvant?: boolean;
    isSyncing?: boolean;
    isInitializing?: boolean;
}

const LE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

export const IdeesView: React.FC<IdeesViewProps> = ({
    items, searchQuery, onSearchChange, onOuvrir, onAjouter, onPreparer, ajoutEnAvant, isSyncing, isInitializing,
}) => {
    const [titre, setTitre] = useState('');
    const [format, setFormat] = useState<TargetFormat | ''>('');
    const [ajout, setAjout] = useState(false);

    const aPreparer = useMemo(() => items.filter(i => !i.analyzedAt).length, [items]);

    /**
     * Le format est OBLIGATOIRE à la création : il décide du fil que suivra le
     * contenu (SPEC §13.2), et une idée sans format traverse tout sans que rien
     * ne le signale.
     */
    const ajouter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titre.trim() || !format) return;
        setAjout(true);
        try {
            await onAjouter(titre.trim(), format);
            setTitre('');
        } catch {
            // L'alerte est déjà affichée ; la saisie reste.
        } finally {
            setAjout(false);
        }
    };

    const triees = useMemo(() => [...items].sort((a, b) => b.createdAt - a.createdAt), [items]);

    return (
        <div className="space-y-4 animate-fade-in">
            <Carte densite="contenu">
                {/* Une grille, pas un flex : le `w-full` du champ l'emporterait sur toute largeur posée à côté. */}
                <form onSubmit={ajouter} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_240px_auto] items-center gap-3">
                    <Champ
                        taille="grand"
                        autoFocus={ajoutEnAvant}
                        value={titre}
                        onChange={e => setTitre((e.target as HTMLInputElement).value)}
                        placeholder="Une idée, en une ligne…"
                        aria-label="Titre de l’idée"
                    />
                    <select
                        value={format}
                        onChange={e => setFormat((e.target.value || '') as TargetFormat | '')}
                        aria-label="Format"
                        className={`${CLASSES_CHAMP} h-11 cursor-pointer`}
                    >
                        <option value="">Format…</option>
                        {TARGET_FORMAT_VALUES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <Bouton type="submit" taille="grand" intention="principale" disabled={!titre.trim() || !format || ajout || isSyncing}>
                        {ajout ? <EnCours label="Ajout…" /> : <><Plus /> Ajouter</>}
                    </Bouton>
                </form>
            </Carte>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 min-w-[140px] max-w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />
                    <Champ
                        type="search"
                        placeholder="Rechercher…"
                        value={searchQuery}
                        onChange={e => onSearchChange((e.target as HTMLInputElement).value)}
                        className="h-10 pl-9"
                        aria-label="Rechercher dans les idées"
                    />
                </div>
                <p className="flex-1 text-xs text-brand-main/70 dark:text-dark-text/70">
                    Pas de verdict : l’Analyste prépare l’ouverture de chaque idée, ce qu’elle dit et ce qui lui manque.
                </p>
                <Bouton taille="grand" onClick={onPreparer} disabled={aPreparer === 0}
                    title={aPreparer === 0 ? 'Toutes les idées sont préparées.' : `${aPreparer} idée${aPreparer > 1 ? 's' : ''} à préparer`}>
                    <Sparkles /> Préparer {Math.min(3, Math.max(aPreparer, 1))} idée{Math.min(3, aPreparer) > 1 ? 's' : ''}
                </Bouton>
            </div>

            {triees.length > 0 ? (
                <Carte densite="tableau" posee>
                    <div className="divide-y divide-brand-border/60 dark:divide-dark-sec-border/60">
                        {triees.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onOuvrir(item)}
                                className="w-full min-h-[60px] grid grid-cols-[minmax(0,1fr)_auto_112px_72px_20px] items-center gap-4 px-5 py-2 text-left hover:bg-survol dark:hover:bg-dark-sec-bg transition-colors"
                            >
                                <span className="text-sm font-semibold text-brand-main dark:text-white truncate">{item.title || 'Sans titre'}</span>
                                <span>
                                    {getFormatDef(item.targetFormat)?.shortKey && (
                                        <Etiquette as="span" forme="pastille">{getFormatDef(item.targetFormat)!.shortKey}</Etiquette>
                                    )}
                                </span>
                                <span className={`text-xs font-semibold ${item.analyzedAt ? 'text-brand-main dark:text-dark-text' : 'text-brand-main/50 dark:text-dark-text/50'}`}>
                                    {item.analyzedAt ? 'Préparée' : 'À préparer'}
                                </span>
                                <span className="text-xs text-right text-brand-main/60 dark:text-dark-text/60">{LE.format(new Date(item.createdAt))}</span>
                                <ChevronRight className="w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
                            </button>
                        ))}
                    </div>
                </Carte>
            ) : !isInitializing && (
                <Carte densite="seule" className="text-center space-y-2">
                    <Lightbulb className="w-8 h-8 mx-auto text-brand-main/40 dark:text-dark-text/40" />
                    <p className="text-sm text-brand-main dark:text-dark-text">
                        {searchQuery.trim() ? 'Aucune idée pour cette recherche.' : 'Aucune idée en réserve. Écrivez-en une ci-dessus.'}
                    </p>
                </Carte>
            )}
        </div>
    );
};

export default IdeesView;
