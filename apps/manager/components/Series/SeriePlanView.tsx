import React, { useState } from 'react';
import {
    ArrowLeft, Plus, Trash2, Layers, Link2, Rows3, Wand2, CheckCircle2, AlertCircle,
    ChevronDown, ChevronRight,
} from 'lucide-react';
import {
    ContentItem, Serie, SerieStatus, TargetFormat, Objectif,
    TARGET_FORMAT_VALUES, OBJECTIF_VALUES, isTargetFormat, isObjectif,
} from '../../types';
import { PlanSeriesEntry, SerieSibling, emptyPlanEntry, isPlanEntryUsable, isPlanEntryCreatable } from '@luminose/editorial';
import type { ModeSuppressionSerie } from '@luminose/shared';
import { ConfirmSuppressionSerie } from './ConfirmSuppressionSerie';
import { EnCours } from '../Feedback';
import { Bouton, CLASSES_CHAMP, Champ, Etiquette, CLASSES_SURTITRE, CLASSES_TITRE } from '../ui';

interface SeriePlanViewProps {
    serie: Serie;
    /** Les contenus déjà rattachés à la série. */
    contents: ContentItem[];
    /** Le contenu pilier, quand la série en a un (SPEC §2.9). */
    sourceContent: ContentItem | null;
    onBack: () => void;
    onUpdate: (patch: Partial<Serie>) => Promise<void>;
    /** Le sort des publications est décidé au moment de supprimer (SPEC §3.3). */
    onDelete: (mode: ModeSuppressionSerie) => Promise<void>;
    /** Création en lot : six contenus ou zéro, jamais une série à moitié peuplée (SPEC §6.3). */
    onCreateContents: (entries: PlanSeriesEntry[]) => Promise<void>;
    onOpenContent: (item: ContentItem) => void;
    /**
     * L'Éclateur (SPEC §6.2). `dejaPrevus` porte les angles déjà pris — les
     * contenus créés ET les lignes du tableau : régénérer ne doit pas
     * reproposer ce qui est déjà là.
     */
    onGeneratePlan: (nombreSouhaite: number, dejaPrevus: SerieSibling[]) => Promise<PlanSeriesEntry[]>;
}

/** Longueurs de série proposées — au-delà, l'équilibre éditorial se dilue. */
const TAILLES = [3, 4, 5, 6, 8, 10];

const STATUT_OPTIONS: Array<{ value: SerieStatus; label: string }> = [
    { value: 'en_cours', label: 'En cours' },
    { value: 'terminee', label: 'Terminée' },
];

const inputCls = CLASSES_CHAMP;

export const SeriePlanView: React.FC<SeriePlanViewProps> = ({
    serie, contents, sourceContent, onBack, onUpdate, onDelete, onCreateContents, onOpenContent,
    onGeneratePlan
}) => {
    /**
     * Le plan vit en mémoire jusqu'à la création en lot : tant que Florent
     * n'a pas cliqué, aucune ligne n'existe côté serveur. C'est ce qui permet
     * de tout retoucher — y compris ce que l'IA a proposé — sans laisser
     * derrière soi une traînée de contenus à moitié pensés.
     */
    const [rows, setRows] = useState<PlanSeriesEntry[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isPlanning, setIsPlanning] = useState(false);
    const [nombreSouhaite, setNombreSouhaite] = useState(6);

    /**
     * Le plan se REPLIE dès que la série a des publications, et il ne disparaît
     * pas.
     *
     * Se replier, parce qu'une fois les contenus créés c'est eux qu'on vient
     * voir : le plan les repoussait sous un grand tableau vide — vide parce
     * qu'il ne vit qu'en mémoire et repart à zéro à chaque ouverture.
     *
     * Ne pas disparaître, parce que régénérer un plan est le SEUL chemin pour
     * allonger une série existante — et `handleGenerate` est fait pour ça : il
     * passe à l'Éclateur les publications déjà créées comme angles pris
     * (SPEC §6.4). Masquer le bloc rendrait cette anti-répétition inatteignable.
     *
     * `null` = on suit la règle ; un booléen = Florent a tranché, et son choix
     * tient pour la visite.
     */
    const [planForce, setPlanForce] = useState<boolean | null>(null);

    // Champs d'en-tête : édition locale, écriture au blur — une requête par
    // champ quitté, pas une par frappe.
    const [titre, setTitre] = useState(serie.titre);
    const [intention, setIntention] = useState(serie.intention ?? '');

    React.useEffect(() => {
        setTitre(serie.titre);
        setIntention(serie.intention ?? '');
    }, [serie.id, serie.titre, serie.intention]);

    const usableRows = rows.filter(isPlanEntryUsable);
    /** Ce qui peut réellement devenir un contenu : titre ET format. */
    const creatableRows = rows.filter(isPlanEntryCreatable);
    /** Les lignes qui ont un titre mais attendent encore un format. */
    const sansFormat = usableRows.length - creatableRows.length;

    const planOuvert = planForce ?? contents.length === 0;

    const patchRow = (index: number, patch: Partial<PlanSeriesEntry>) => {
        setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const addRow = () => setRows(prev => [...prev, emptyPlanEntry()]);

    const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

    /**
     * Le plan généré s'AJOUTE aux lignes présentes plutôt que de les remplacer :
     * une ligne écrite à la main ne doit pas disparaître parce qu'on a demandé
     * une rallonge à l'Éclateur.
     */
    const handleGenerate = async () => {
        if (isPlanning) return;
        setIsPlanning(true);
        setCreateError(null);
        try {
            const dejaPrevus: SerieSibling[] = [
                ...contents.map(item => ({ titre: item.title, angle: item.angle })),
                ...usableRows.map(row => ({ titre: row.titre, angle: row.angle })),
            ];
            const entries = await onGeneratePlan(nombreSouhaite, dejaPrevus);
            setRows(prev => [...prev, ...entries]);
            setPlanForce(true);
        } catch (e: any) {
            setCreateError(e?.message || "L'Éclateur n'a pas pu produire de plan.");
        } finally {
            setIsPlanning(false);
        }
    };

    const handleCreate = async () => {
        if (creatableRows.length === 0 || isCreating) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            await onCreateContents(creatableRows);
            // Les lignes créées quittent le plan — les garder inviterait à les
            // créer deux fois. Une ligne encore sans titre reste : c'est du
            // travail en cours, pas un déchet.
            // Une ligne sans format n'a pas été créée : elle reste, à compléter.
            setRows(prev => prev.filter(row => !isPlanEntryCreatable(row)));
        } catch (e: any) {
            setCreateError(e?.message || "La création en lot a échoué.");
        } finally {
            setIsCreating(false);
        }
    };

    const saveTitre = () => {
        const value = titre.trim();
        if (!value || value === serie.titre) {
            setTitre(serie.titre);
            return;
        }
        void onUpdate({ titre: value });
    };

    const saveIntention = () => {
        const value = intention.trim();
        if (value === (serie.intention ?? '')) return;
        void onUpdate({ intention: value || null });
    };

    return (
        <div className="space-y-5 animate-fade-in">

            {/* ── En-tête de la série ────────────────────────────────────── */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" /> Séries
                    </button>
                    <Etiquette as="span" avecIcone>
                        <Layers className="w-3 h-3" /> Série
                    </Etiquette>
                    <div className="ml-auto flex items-center gap-2">
                        <select
                            value={serie.statut}
                            onChange={e => void onUpdate({ statut: e.target.value as SerieStatus })}
                            className="px-3 py-1.5 rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg text-xs font-semibold text-brand-main dark:text-white outline-hidden cursor-pointer"
                        >
                            {STATUT_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <Bouton
                            onClick={() => setConfirmDelete(true)}
                            taille="petit" intention="discrete" ton="erreur">
                            <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </Bouton>
                    </div>
                </div>

                <input
                    type="text"
                    value={titre}
                    onChange={e => setTitre(e.target.value)}
                    onBlur={saveTitre}
                    placeholder="Le sujet de la série…"
                    className={`${CLASSES_TITRE} w-full bg-transparent outline-hidden placeholder-brand-main/30 dark:placeholder-dark-text/30`}
                />

                <Champ multiligne
                    value={intention}
                    onChange={e => setIntention(e.target.value)}
                    onBlur={saveIntention}
                    placeholder="L'intention : ce que cette série doit produire chez le lecteur… (optionnel)"
                    className="h-16 resize-none"
                />

                {sourceContent && (
                    <Bouton
                        onClick={() => onOpenContent(sourceContent)}
                        className="w-full">
                        <Link2 className="w-3.5 h-3.5 shrink-0 text-brand-main dark:text-dark-text" />
                        <Etiquette as="span" className="shrink-0">
                            Contenu pilier
                        </Etiquette>
                        <span className="text-xs text-brand-main dark:text-dark-text/80 truncate">
                            {sourceContent.title || 'Sans titre'}
                        </span>
                    </Bouton>
                )}
            </div>

            {/* ── Le plan de publication ─────────────────────────────────── */}
            <div className={`bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden ${planOuvert ? '' : 'opacity-80'}`}>
                <div className={`px-4 py-2 bg-brand-light dark:bg-dark-bg flex items-center gap-2 flex-wrap ${planOuvert ? 'border-b border-brand-border dark:border-dark-sec-border' : ''}`}>
                    <button
                        type="button"
                        onClick={() => setPlanForce(!planOuvert)}
                        aria-expanded={planOuvert}
                        className="flex items-center"
                        title={planOuvert ? 'Replier le plan' : 'Déplier le plan pour allonger la série'}
                    >
                        <Etiquette as="span" forme="entete" avecIcone>
                            {planOuvert ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <Rows3 className="w-3 h-3" /> Plan de publication
                        </Etiquette>
                    </button>
                    {/*
                        Replié, l'en-tête doit répondre à « pourquoi j'ouvrirais ça ? ».
                        Nommer la section ne suffit pas : c'est le geste qu'on annonce.
                    */}
                    <span className="text-micro text-brand-main/50 dark:text-dark-text/50">
                        {rows.length > 0
                            ? `${usableRows.length} contenu${usableRows.length > 1 ? 's' : ''} à créer`
                            : planOuvert
                                ? 'aucune ligne'
                                : '· allonger la série'}
                    </span>
                    {planOuvert && (
                    <div className="ml-auto flex items-center gap-2">
                        <select
                            value={nombreSouhaite}
                            onChange={e => setNombreSouhaite(Number(e.target.value))}
                            title="Nombre de publications demandé à l'Éclateur"
                            className="px-2 py-1.5 rounded-md border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-micro font-semibold text-brand-main/70 dark:text-dark-text/70 outline-hidden cursor-pointer"
                        >
                            {TAILLES.map(n => (
                                <option key={n} value={n}>{n} publications</option>
                            ))}
                        </select>
                        <Bouton
                            onClick={handleGenerate}
                            disabled={isPlanning}
                            title="L'Éclateur propose un plan à partir du sujet, de l'intention et du contenu pilier"
                            taille="petit">
                            {isPlanning
                                ? <EnCours label="L’Éclateur travaille…" taille="xs" />
                                : <><Wand2 className="w-3 h-3" /> Générer un plan</>}
                        </Bouton>
                        <Bouton
                            onClick={addRow}
                            taille="petit">
                            <Plus className="w-3 h-3" /> Ajouter une ligne
                        </Bouton>
                        <Bouton
                            onClick={handleCreate}
                            disabled={creatableRows.length === 0 || isCreating}
                            taille="petit" intention="principale" posee>
                            {isCreating
                                ? <EnCours label="Création…" taille="xs" />
                                : <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    {creatableRows.length > 1 ? `Créer les ${creatableRows.length} contenus` : 'Créer le contenu'}
                                  </>}
                        </Bouton>
                    </div>
                    )}
                </div>

                {/* Replié, le bloc se réduit à sa seule ligne d'en-tête : c'est la
                    liste des publications qu'on vient voir, pas un tableau vide. */}
                {planOuvert && (<>
                {/* Un bouton grisé sans explication est une énigme : on dit ce qui manque. */}
                {sansFormat > 0 && (
                    <div className="flex items-start gap-2 px-4 py-2 text-xs text-alerte bg-alerte/10 border-b border-alerte/30">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                            <strong className="font-bold">
                                {sansFormat > 1
                                    ? `${sansFormat} publications n'ont pas de format`
                                    : `1 publication n'a pas de format`}
                            </strong>{' '}
                            — choisissez-le ici. Après création, le format se fige dès qu'on passe la
                            publication en Brouillon.
                        </span>
                    </div>
                )}

                {createError && (
                    <div className="flex items-center gap-2 px-4 py-2 text-xs text-erreur bg-erreur/10 border-b border-erreur/30">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {createError}
                    </div>
                )}

                {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                        <Wand2 className="w-10 h-10 mx-auto mb-3 text-brand-border dark:text-dark-sec-border" />
                        <p className="text-sm text-brand-main/60 dark:text-dark-text/60 text-balance mx-auto">
                            Le plan est vide. Demandez-en un à l'Éclateur : il rend une progression —
                            titre, angle, matière, format et objectif pour chaque publication, dans
                            l'ordre où elles se lisent. Vous pouvez aussi les ajouter ligne par ligne.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="border-b border-brand-border dark:border-dark-sec-border">
                                <tr>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[14rem]`}>Titre</th>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[16rem]`}>Angle</th>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[20rem]`}>Matière</th>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[12rem]`}>Format</th>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[12rem]`}>Objectif</th>
                                    <th className={`${CLASSES_SURTITRE} px-3 py-2 text-left min-w-[16rem]`}>Justification</th>
                                    <th className="w-10 px-3 py-2" aria-hidden="true" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                                {rows.map((row, index) => (
                                    <tr key={index} className="align-top">
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={row.titre}
                                                onChange={e => patchRow(index, { titre: e.target.value })}
                                                placeholder="Titre de la publication"
                                                className={inputCls}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <textarea
                                                value={row.angle}
                                                onChange={e => patchRow(index, { angle: e.target.value })}
                                                placeholder="Ce que CE contenu traite, et que les autres ne traitent pas"
                                                className={`${inputCls} h-16 resize-none`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <textarea
                                                value={row.notes}
                                                onChange={e => patchRow(index, { notes: e.target.value })}
                                                placeholder="Ce que la publication doit contenir : faits, objections à lever, éléments prélevés du pilier"
                                                className={`${inputCls} h-24 resize-none`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <select
                                                value={row.format ?? ''}
                                                onChange={e => patchRow(index, {
                                                    format: isTargetFormat(e.target.value) ? e.target.value as TargetFormat : null,
                                                })}
                                                className={`${inputCls} cursor-pointer`}
                                            >
                                                <option value="">— Format —</option>
                                                {TARGET_FORMAT_VALUES.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-3 py-2">
                                            <select
                                                value={row.objectif ?? ''}
                                                onChange={e => patchRow(index, {
                                                    objectif: isObjectif(e.target.value) ? e.target.value as Objectif : null,
                                                })}
                                                className={`${inputCls} cursor-pointer`}
                                            >
                                                <option value="">— Objectif —</option>
                                                {OBJECTIF_VALUES.map(o => (
                                                    <option key={o} value={o}>{o}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-3 py-2">
                                            <textarea
                                                value={row.justification}
                                                onChange={e => patchRow(index, { justification: e.target.value })}
                                                placeholder="Pourquoi ce contenu, à cette place de la série"
                                                className={`${inputCls} h-16 resize-none`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() => removeRow(index)}
                                                title="Retirer cette ligne"
                                                className="p-1.5 rounded-lg text-erreur hover:bg-erreur/10 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                </>)}
            </div>

            {/* ── Les contenus déjà créés ────────────────────────────────── */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                <div className="px-4 py-2 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                    <Etiquette forme="entete" avecIcone>
                        <Layers className="w-3 h-3" /> Contenus de la série ({contents.length})
                    </Etiquette>
                </div>
                {contents.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-brand-main/50 dark:text-dark-text/50">
                        Aucun contenu rattaché pour l'instant.
                    </p>
                ) : (
                    <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
                        {/* Dans l'ordre de la progression : une série se relit comme elle a été pensée. */}
                        {[...contents]
                            .sort((a, b) => (a.seriePosition ?? 9999) - (b.seriePosition ?? 9999))
                            .map((item, index) => (
                            <li key={item.id}>
                                <button
                                    onClick={() => onOpenContent(item)}
                                    className="w-full text-left px-4 py-2 hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 transition-colors group flex items-start gap-3"
                                >
                                    <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border flex items-center justify-center text-micro font-bold text-brand-main/70 dark:text-dark-text/70">
                                        {item.seriePosition ?? index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm text-brand-main dark:text-white group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors">
                                            {item.title || 'Sans titre'}
                                        </span>
                                        {item.targetFormat && (
                                            <span className="inline-flex items-center rounded-full border text-micro px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                                {item.targetFormat}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center rounded-full border text-micro px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
                                            {item.status}
                                        </span>
                                    </div>
                                    {item.angle && (
                                        <p className="mt-1 text-xs text-brand-main/60 dark:text-dark-text/60 line-clamp-2">
                                            {item.angle}
                                        </p>
                                    )}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ConfirmSuppressionSerie
                isOpen={confirmDelete}
                titre={serie.titre}
                nbPublications={contents.length}
                titrePilier={sourceContent ? (sourceContent.title || 'Sans titre') : null}
                onClose={() => setConfirmDelete(false)}
                onConfirm={onDelete}
            />
        </div>
    );
};
