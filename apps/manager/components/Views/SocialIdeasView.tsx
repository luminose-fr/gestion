import React, { useState, useMemo } from 'react';
import {
    Search, Plus, Sparkles, ArrowRightFromLine, Lightbulb
} from 'lucide-react';
import {
    ContentItem, Verdict, TargetFormat, TARGET_FORMAT_VALUES,
    DisplayPrefs, DEFAULT_DISPLAY_PREFS
} from '../../types';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { RichTextarea } from '../RichTextarea';
import { CharCounter } from '../CommonModals';
import { EnCours } from '../Feedback';
import { ContentTable } from './SocialGridView';
import type { Tri } from '../TriTableau';
import { Bouton, Carte, Champ, Etiquette, type TonBouton } from '../ui';

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
    /** Tri ET filtre sont pilotés : ils se conservent d'une visite à l'autre (SPEC §3.7). */
    tri: Tri;
    onTri: (tri: Tri) => void;
    filtre: FilterId;
    onFiltre: (filtre: FilterId) => void;
}

export type FilterId = 'ALL' | 'TO_ANALYZE' | 'VALID' | 'TOO_BLAND' | 'NEEDS_WORK';

/** Les filtres reconnus — sert à valider ce que la base rend (SPEC §3.7). */
export const FILTRES_IDEES: readonly FilterId[] = ['ALL', 'TO_ANALYZE', 'VALID', 'TOO_BLAND', 'NEEDS_WORK'];

/*
  Un filtre actif prend la couleur du verdict qu'il isole. « À analyser »
  n'est pas un verdict : il reste à la marque, comme « Tout ».
*/
const FILTER_CHIPS: Array<{ id: FilterId; label: string; ton: TonBouton }> = [
    { id: 'ALL',        label: 'Tout',       ton: 'neutre' },
    { id: 'TO_ANALYZE', label: 'À analyser', ton: 'neutre' },
    { id: 'VALID',      label: 'Valide',     ton: 'succes' },
    { id: 'TOO_BLAND',  label: 'Trop lisse', ton: 'alerte' },
    { id: 'NEEDS_WORK', label: 'À revoir',   ton: 'erreur' },
];

const matchesFilter = (item: ContentItem, filter: FilterId): boolean => {
    if (filter === 'ALL') return true;
    if (filter === 'TO_ANALYZE') return !item.analyzedAt;
    if (filter === 'VALID')      return item.verdict === Verdict.VALID;
    if (filter === 'TOO_BLAND')  return item.verdict === Verdict.TOO_BLAND;
    if (filter === 'NEEDS_WORK') return item.verdict === Verdict.NEEDS_WORK;
    return true;
};

export const SocialIdeasView: React.FC<SocialIdeasViewProps> = ({
    items, searchQuery, onSearchChange, onEdit, onQuickAdd, onGlobalAnalyze,
    isSyncing, isInitializing, displayPrefs, tri, onTri, filtre, onFiltre
}) => {
    const prefs = { ...DEFAULT_DISPLAY_PREFS, ...(displayPrefs || {}) };

    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [newIdeaTitle, setNewIdeaTitle] = useState('');
    const [newIdeaNotes, setNewIdeaNotes] = useState('');
    const [newIdeaFormat, setNewIdeaFormat] = useState<TargetFormat | ''>('');
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

    /**
     * Le format est OBLIGATOIRE à la création.
     *
     * Une idée sans format traverse le flux sans que rien ne le signale, puis
     * se fige : le format n'est modifiable que tant que le statut vaut Idée, et
     * « Travailler cette idée » ferme cette porte pour de bon. Exiger le choix
     * ici coûte un clic ; le découvrir plus tard coûte le contenu.
     */
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newIdeaTitle.trim() || !newIdeaFormat) return;
        await onQuickAdd(newIdeaTitle, newIdeaNotes, newIdeaFormat);
        resetQuickAdd();
    };

    const filteredItems = useMemo(
        () => items.filter(i => matchesFilter(i, filtre)),
        [items, filtre]
    );

    const counts = useMemo(() => ({
        ALL:        items.length,
        TO_ANALYZE: items.filter(i => !i.analyzedAt).length,
        VALID:      items.filter(i => i.verdict === Verdict.VALID).length,
        TOO_BLAND:  items.filter(i => i.verdict === Verdict.TOO_BLAND).length,
        NEEDS_WORK: items.filter(i => i.verdict === Verdict.NEEDS_WORK).length,
    }), [items]);

    return (
        <div className="space-y-4 animate-fade-in">

            {/* QUICK ADD — état replié = bouton seul, ouvert = formulaire complet */}
            <Carte densite="tableau" className="transition-all">
                {!quickAddOpen ? (
                    /*
                      Pas un `Bouton` : c'est la carte entière qui se déplie,
                      une ligne de la hauteur d'une ligne de tableau.
                    */
                    <button
                        onClick={() => setQuickAddOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-bg transition-colors group"
                    >
                        <span className="w-6 h-6 rounded-md bg-brand-light dark:bg-dark-bg flex items-center justify-center shrink-0 group-hover:bg-brand-main dark:group-hover:bg-white transition-colors">
                            <Plus className="w-3.5 h-3.5 text-brand-main dark:text-white group-hover:text-white dark:group-hover:text-brand-main transition-colors" />
                        </span>
                        Ajouter une idée…
                    </button>
                ) : (
                    <form onSubmit={handleAdd} className="p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <Champ
                            ref={titleInputRef}
                            type="text"
                            value={newIdeaTitle}
                            onChange={e => setNewIdeaTitle(e.target.value)}
                            placeholder="Titre de l'idée…"
                            className="font-semibold"
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
                                <div className="px-3 py-1 border-t border-brand-border/50 dark:border-dark-sec-border/50">
                                    <CharCounter current={newIdeaNotes.length} max={2000} />
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-2 bg-brand-light dark:bg-dark-bg rounded-lg px-3 py-2">
                            <ArrowRightFromLine className="w-3 h-3 text-brand-main/50 dark:text-dark-text/50 shrink-0" />
                            <Etiquette as="label" className="shrink-0">
                                Format <span className="text-erreur" aria-label="obligatoire">*</span>
                            </Etiquette>
                            <select
                                value={newIdeaFormat}
                                onChange={e => setNewIdeaFormat((e.target.value || '') as TargetFormat | '')}
                                className="flex-1 bg-transparent border-none text-sm text-brand-main dark:text-white outline-hidden cursor-pointer min-w-0"
                            >
                                <option value="">— Choisir un format (obligatoire) —</option>
                                {TARGET_FORMAT_VALUES.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Bouton type="button" intention="discrete" onClick={resetQuickAdd}>
                                Annuler
                            </Bouton>
                            <Bouton
                                type="submit"
                                intention="principale"
                                posee
                                disabled={!newIdeaTitle.trim() || !newIdeaFormat || isSyncing}
                            >
                                {isSyncing
                                    ? <EnCours label="Ajout…" />
                                    : <><Plus /> Ajouter</>}
                            </Bouton>
                        </div>
                    </form>
                )}
            </Carte>

            {/* TOOLBAR */}
            <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3">
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-main/50 dark:text-dark-text/50" />
                    <Champ
                        type="text"
                        placeholder="Rechercher…"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        className="xl:w-56 pl-8"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 xl:pb-0 scrollbar-hide flex-1">
                    {FILTER_CHIPS.map(c => {
                        const active = filtre === c.id;
                        return (
                            <Bouton
                                key={c.id}
                                taille="petit"
                                intention={active ? 'principale' : 'secondaire'}
                                ton={active ? c.ton : 'neutre'}
                                onClick={() => onFiltre(c.id)}
                            >
                                {c.label}
                                <span className={`text-micro font-bold px-1.5 py-0.5 rounded-full leading-none ${
                                    active ? 'bg-white/25 dark:bg-dark-bg/15' : 'bg-brand-light dark:bg-dark-bg'
                                }`}>
                                    {counts[c.id]}
                                </span>
                            </Bouton>
                        );
                    })}
                </div>

                <Bouton
                    onClick={onGlobalAnalyze}
                    className="shrink-0"
                    title="Analyser toutes les nouvelles idées avec l'IA"
                >
                    <Sparkles />
                    Analyser tout
                </Bouton>
            </div>

            {/* LIST — table unifié (même rendu que "Prêts" + Statut + stripe verdict) */}
            {!isInitializing && filteredItems.length === 0 ? (
                <div className="py-16 text-center">
                    <Lightbulb className="w-12 h-12 mx-auto mb-4 text-brand-border dark:text-dark-sec-border" />
                    <p className="text-sm text-brand-main/50 dark:text-dark-text/50">
                        {searchQuery ? 'Aucune idée pour cette recherche.' : 'La boîte à idées est vide pour ce filtre.'}
                    </p>
                </div>
            ) : (
                <ContentTable
                    items={filteredItems}
                    searchQuery={searchQuery}
                    onEdit={onEdit}
                    prefs={prefs}
                    showStatut
                    showPublication={false}
                    showStrategicAngle
                    showCreatedAt
                    tri={tri}
                    onTri={onTri}
                />
            )}
        </div>
    );
};
