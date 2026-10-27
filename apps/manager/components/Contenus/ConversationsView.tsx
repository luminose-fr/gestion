import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Lightbulb, MessagesSquare, Plus, Search, Video } from 'lucide-react';
import { getFormatDef, type EtapeCourante, type Geste, type RoleDuFil } from '@luminose/editorial';
import { ContentItem, ContentStatus, Serie } from '../../types';
import { BarreProgression, Bouton, Carte, Champ, ControleSegmente, Etiquette, Menu } from '../ui';
import { EnCours } from '../Feedback';

/**
 * La liste Conversations (SPEC §13) : tout ce qui n'est ni une idée ni publié,
 * c'est-à-dire tout ce qui attend un geste.
 *
 * Chaque ligne dit où en est le contenu — sa barre, son étape — et ce qui s'y
 * est dit en dernier. Les séries d'abord, une carte chacune, dans l'ordre de
 * leur plan ; puis le hors série, les plus proches de la publication en tête :
 * on finit ce qui est presque fini.
 */

export type FiltreGeste = 'tout' | Exclude<Geste, 'publie'>;

const FILTRES: Array<{ valeur: FiltreGeste; libelle: string }> = [
    { valeur: 'tout', libelle: 'Tout' },
    { valeur: 'ecrire', libelle: 'Écrire' },
    { valeur: 'tourner', libelle: 'Tourner' },
    { valeur: 'monter', libelle: 'Monter' },
    { valeur: 'publier', libelle: 'Publier' },
];

export interface DernierMot { role: RoleDuFil; texte: string; moment: string }

export interface ConversationsViewProps {
    /** Les contenus de la liste : ni idées ni publiés. */
    items: ContentItem[];
    /** Tous les contenus, pour compter les publications d'une série, publiées comprises. */
    tous: ContentItem[];
    series: Serie[];
    etapes: Record<string, EtapeCourante>;
    derniers: Record<string, DernierMot | null>;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    filtre: FiltreGeste;
    onFiltre: (f: FiltreGeste) => void;
    onOuvrir: (item: ContentItem) => void;
    onOuvrirPlan: (serie: Serie) => void;
    /** « + Nouveau → Idée » : la ligne s'écrit dans Idées. */
    onNouvelleIdee: () => void;
    onCreerSerie: (titre: string) => Promise<void>;
    onCreerVideoDirecte: (titre: string) => Promise<void>;
    isInitializing?: boolean;
}

/** Combien du fil est fait : ce qui range le hors série, les plus avancés d'abord. */
const avancement = (e: EtapeCourante | undefined) => {
    if (!e) return 0;
    const faits = e.progression.segments.filter(s => s === 'fait').length;
    return e.progression.complet ? 2 : faits / e.progression.segments.length;
};

const formatCourt = (format: string | null) => getFormatDef(format)?.shortKey ?? null;

export const ConversationsView: React.FC<ConversationsViewProps> = ({
    items, tous, series, etapes, derniers, searchQuery, onSearchChange, filtre, onFiltre,
    onOuvrir, onOuvrirPlan, onNouvelleIdee, onCreerSerie, onCreerVideoDirecte, isInitializing,
}) => {
    const [menu, setMenu] = useState(false);
    const [formulaire, setFormulaire] = useState<null | 'serie' | 'video'>(null);
    const [titre, setTitre] = useState('');
    const [creation, setCreation] = useState(false);

    const comptes = useMemo(() => {
        const c: Record<FiltreGeste, number> = { tout: items.length, ecrire: 0, tourner: 0, monter: 0, publier: 0 };
        for (const i of items) {
            const g = etapes[i.id]?.geste;
            if (g && g !== 'publie') c[g] += 1;
        }
        return c;
    }, [items, etapes]);

    const visibles = useMemo(
        () => (filtre === 'tout' ? items : items.filter(i => etapes[i.id]?.geste === filtre)),
        [items, etapes, filtre],
    );

    /**
     * Une carte par série qui a une publication visible ; une série en cours
     * sans publication garde aussi la sienne, sans quoi un plan pas encore
     * généré ne se retrouverait plus nulle part.
     */
    const groupes = useMemo(() => {
        const parSerie = new Map<string, ContentItem[]>();
        const horsSerie: ContentItem[] = [];
        for (const i of visibles) {
            if (i.serieId && series.some(s => s.id === i.serieId)) {
                parSerie.set(i.serieId, [...(parSerie.get(i.serieId) ?? []), i]);
            } else horsSerie.push(i);
        }
        const recherche = !!searchQuery.trim() || filtre !== 'tout';
        const cartes = series
            .filter(s => parSerie.has(s.id) || (!recherche && s.statut === 'en_cours' && !tous.some(i => i.serieId === s.id)))
            .map(s => ({
                serie: s,
                lignes: [...(parSerie.get(s.id) ?? [])].sort((a, b) => (a.seriePosition ?? 9999) - (b.seriePosition ?? 9999)),
            }))
            // La série où l'on a travaillé en dernier passe devant.
            .sort((a, b) => Math.max(0, ...b.lignes.map(i => i.updatedAt)) - Math.max(0, ...a.lignes.map(i => i.updatedAt)) || b.serie.updatedAt - a.serie.updatedAt);
        horsSerie.sort((a, b) => avancement(etapes[b.id]) - avancement(etapes[a.id]) || b.updatedAt - a.updatedAt);
        return { cartes, horsSerie };
    }, [visibles, series, tous, etapes, searchQuery, filtre]);

    const ouvrirFormulaire = (f: 'serie' | 'video') => { setFormulaire(f); setTitre(''); };

    const creer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titre.trim() || !formulaire) return;
        setCreation(true);
        try {
            await (formulaire === 'serie' ? onCreerSerie(titre.trim()) : onCreerVideoDirecte(titre.trim()));
            setFormulaire(null);
            setTitre('');
        } catch {
            // L'alerte est déjà affichée par l'application ; la saisie reste.
        } finally {
            setCreation(false);
        }
    };

    const ligne = (item: ContentItem) => {
        const etape = etapes[item.id];
        const dernier = derniers[item.id];
        const total = item.serieId ? tous.filter(i => i.serieId === item.serieId).length : 0;
        const format = formatCourt(item.targetFormat);
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => onOuvrir(item)}
                // Sur téléphone, la ligne devient une carte : le titre et le moment, puis l'avancement dessous.
                className="w-full min-h-[68px] grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_220px_72px_20px] items-center gap-x-4 gap-y-2 px-4 md:px-5 py-3 text-left hover:bg-survol dark:hover:bg-dark-sec-bg transition-colors"
            >
                <span className="min-w-0 space-y-1">
                    <span className="flex items-center gap-2 min-w-0">
                        {item.seriePosition !== null && total > 0 && (
                            <span className="shrink-0 rounded-full border border-brand-border dark:border-dark-sec-border px-1.5 py-0.5 text-micro font-semibold tabular-nums text-brand-main/70 dark:text-dark-text/70">
                                {item.seriePosition}/{total}
                            </span>
                        )}
                        <span className="text-sm font-semibold text-brand-main dark:text-white truncate">{item.title || 'Sans titre'}</span>
                        {format && <Etiquette as="span" forme="pastille" className="shrink-0">{format}</Etiquette>}
                    </span>
                    {dernier && (
                        <span className="block text-xs text-brand-main/70 dark:text-dark-text/70 truncate">
                            <span className="font-bold">{dernier.role}</span> · {dernier.texte}
                        </span>
                    )}
                </span>
                <span className="space-y-1.5 col-span-2 md:col-span-1 order-3 md:order-none">
                    {etape && <BarreProgression segments={etape.progression.segments} complet={etape.progression.complet} className="w-[200px]" />}
                    <span className={`block text-xs font-semibold truncate ${etape?.progression.complet ? 'text-succes' : 'text-brand-main dark:text-dark-text'}`}>
                        {etape?.libelle ?? ''}
                    </span>
                </span>
                <span className="text-xs text-right text-brand-main/60 dark:text-dark-text/60 tabular-nums self-start md:self-center">{dernier?.moment ?? ''}</span>
                <ChevronRight className="hidden md:block w-4 h-4 text-brand-main/40 dark:text-dark-text/40" />
            </button>
        );
    };

    const publiees = (serie: Serie) => tous.filter(i => i.serieId === serie.id);

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Une seule ligne : la recherche rétrécit la première, les filtres et « Nouveau » gardent leur place.
                Sur téléphone, la recherche prend sa ligne et les filtres défilent. */}
            <div className="flex flex-wrap md:flex-nowrap items-center gap-3">
                <div className="relative w-full md:w-auto md:flex-1 md:min-w-[140px] md:max-w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-main/50 dark:text-dark-text/50" />
                    <Champ
                        type="search"
                        placeholder="Rechercher…"
                        value={searchQuery}
                        onChange={e => onSearchChange((e.target as HTMLInputElement).value)}
                        className="h-10 pl-9"
                        aria-label="Rechercher dans les conversations"
                    />
                </div>
                <div className="max-w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    <ControleSegmente<FiltreGeste>
                        libelle="Filtrer par geste"
                        valeur={filtre}
                        onChange={onFiltre}
                        options={FILTRES.map(f => ({ ...f, compte: comptes[f.valeur] }))}
                    />
                </div>
                <div className="hidden md:block flex-1" />
                <Menu
                    ouvert={menu}
                    onFermer={() => setMenu(false)}
                    largeur={280}
                    entrees={[
                        { id: 'idee', icone: <Lightbulb />, libelle: 'Idée', aide: 'Une ligne dans Idées ; l’Analyste la prépare.', onChoisir: onNouvelleIdee },
                        { id: 'serie', icone: <Layers />, libelle: 'Série', aide: 'Un plan de publications, généré par l’Éclateur.', onChoisir: () => ouvrirFormulaire('serie') },
                        { id: 'video', icone: <Video />, libelle: 'Vidéo directe', aide: 'Face caméra, sans script : on dépose la prise.', onChoisir: () => ouvrirFormulaire('video') },
                    ]}
                >
                    <Bouton taille="grand" intention="principale" posee onClick={() => setMenu(m => !m)} aria-expanded={menu}>
                        <Plus /> Nouveau <ChevronDown />
                    </Bouton>
                </Menu>
            </div>

            {formulaire && (
                <Carte densite="contenu" className="max-w-3xl">
                    <form onSubmit={creer} className="space-y-3">
                        <Etiquette as="label" htmlFor="nouveau-titre">
                            {formulaire === 'serie' ? 'Nouvelle série' : 'Nouvelle vidéo directe'}
                        </Etiquette>
                        <div className="flex items-center gap-3">
                            <Champ
                                id="nouveau-titre"
                                taille="grand"
                                autoFocus
                                value={titre}
                                onChange={e => setTitre((e.target as HTMLInputElement).value)}
                                placeholder={formulaire === 'serie' ? 'Perdre le contrôle' : 'Suis-je le bon thérapeute pour vous ?'}
                            />
                            <Bouton type="submit" taille="grand" intention="principale" disabled={!titre.trim() || creation}>
                                {creation
                                    ? <EnCours label="Création…" />
                                    : formulaire === 'serie' ? 'Créer et ouvrir le plan' : 'Créer et ouvrir le montage'}
                            </Bouton>
                            <Bouton type="button" intention="discrete" onClick={() => setFormulaire(null)}>Annuler</Bouton>
                        </div>
                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                            {formulaire === 'serie'
                                ? 'Le plan s’ouvre ensuite : l’Éclateur y propose les publications, dans l’ordre où elles se lisent.'
                                : 'Face caméra, sans script : déposez la prise telle que tournée, sa transcription servira de texte.'}
                        </p>
                    </form>
                </Carte>
            )}

            {groupes.cartes.map(({ serie, lignes }) => {
                const toutes = publiees(serie);
                const nbPubliees = toutes.filter(i => i.status === ContentStatus.PUBLISHED).length;
                return (
                    <Carte key={serie.id} densite="tableau" posee>
                        <div className="min-h-[52px] flex items-center gap-3 px-5 py-2 bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                            <Layers className="w-4 h-4 shrink-0 text-brand-main/60 dark:text-dark-text/60" />
                            <span className="flex-1 md:flex-none min-w-0 text-sm font-semibold text-brand-main dark:text-white truncate">Série · {serie.titre}</span>
                            <span className="hidden sm:inline text-xs text-brand-main/60 dark:text-dark-text/60 shrink-0">
                                {toutes.length} publication{toutes.length > 1 ? 's' : ''} · {nbPubliees} publiée{nbPubliees > 1 ? 's' : ''}
                            </span>
                            <span className="hidden md:block flex-1" />
                            <Bouton intention="discrete" taille="petit" className="shrink-0" onClick={() => onOuvrirPlan(serie)}>Ouvrir le plan</Bouton>
                        </div>
                        <div className="divide-y divide-brand-border/60 dark:divide-dark-sec-border/60">
                            {lignes.length > 0
                                ? lignes.map(ligne)
                                : <p className="px-5 py-4 text-xs text-brand-main/60 dark:text-dark-text/60">Pas encore de publication : le plan les propose.</p>}
                        </div>
                    </Carte>
                );
            })}

            {groupes.horsSerie.length > 0 && (
                <Carte densite="tableau" posee>
                    <div className="min-h-[52px] flex items-center gap-3 px-5 py-2 bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                        <span className="text-sm font-semibold text-brand-main dark:text-white">Hors série</span>
                        <span className="text-xs text-brand-main/60 dark:text-dark-text/60">les plus proches de la publication d’abord</span>
                    </div>
                    <div className="divide-y divide-brand-border/60 dark:divide-dark-sec-border/60">
                        {groupes.horsSerie.map(ligne)}
                    </div>
                </Carte>
            )}

            {!isInitializing && visibles.length === 0 && groupes.cartes.length === 0 && (
                <Carte densite="seule" className="text-center space-y-2">
                    <MessagesSquare className="w-8 h-8 mx-auto text-brand-main/40 dark:text-dark-text/40" />
                    <p className="text-sm text-brand-main dark:text-dark-text">
                        {searchQuery.trim()
                            ? 'Aucune conversation pour cette recherche.'
                            : filtre !== 'tout'
                                ? 'Rien n’attend ce geste pour l’instant.'
                                : 'Aucune conversation en cours. Une idée s’ouvre depuis Idées ; « Nouveau » crée une série ou une vidéo directe.'}
                    </p>
                </Carte>
            )}
        </div>
    );
};

export default ConversationsView;
