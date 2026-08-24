import React, { useState } from 'react';
import {
    ArrowLeft, Plus, Trash2, Layers, Link2, Rows3, Wand2, CheckCircle2, AlertCircle
} from 'lucide-react';
import {
    ContentItem, Serie, SerieStatus, TargetFormat, Objectif,
    TARGET_FORMAT_VALUES, OBJECTIF_VALUES, isTargetFormat, isObjectif,
} from '../../types';
import { PlanSeriesEntry, SerieSibling, emptyPlanEntry, isPlanEntryUsable, isPlanEntryCreatable } from '@luminose/editorial';
import { ConfirmModal } from '../CommonModals';
import { EnCours } from '../Feedback';

interface SeriePlanViewProps {
    serie: Serie;
    /** Les contenus déjà rattachés à la série. */
    contents: ContentItem[];
    /** Le contenu pilier, quand la série en a un (SPEC §2.9). */
    sourceContent: ContentItem | null;
    onBack: () => void;
    onUpdate: (patch: Partial<Serie>) => Promise<void>;
    onDelete: () => Promise<void>;
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

const inputCls =
    'w-full px-2.5 py-1.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border ' +
    'focus:border-brand-main dark:focus:border-white rounded-lg text-sm text-brand-main dark:text-white ' +
    'placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors';

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
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-main/40 dark:text-dark-text/40">
                        <Layers className="w-3 h-3" /> Série
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <select
                            value={serie.statut}
                            onChange={e => void onUpdate({ statut: e.target.value as SerieStatus })}
                            className="px-2.5 py-1.5 rounded-lg border border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg text-xs font-semibold text-brand-main dark:text-white outline-hidden cursor-pointer"
                        >
                            {STATUT_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Supprimer
                        </button>
                    </div>
                </div>

                <input
                    type="text"
                    value={titre}
                    onChange={e => setTitre(e.target.value)}
                    onBlur={saveTitre}
                    placeholder="Le sujet de la série…"
                    className="w-full bg-transparent text-lg font-bold text-brand-main dark:text-white outline-hidden placeholder-brand-main/30 dark:placeholder-dark-text/30"
                />

                <textarea
                    value={intention}
                    onChange={e => setIntention(e.target.value)}
                    onBlur={saveIntention}
                    placeholder="L'intention : ce que cette série doit produire chez le lecteur… (optionnel)"
                    className="w-full h-16 px-3 py-2 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-white rounded-lg text-sm text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors resize-none"
                />

                {sourceContent && (
                    <button
                        onClick={() => onOpenContent(sourceContent)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/20 text-left transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/40"
                    >
                        <Link2 className="w-3.5 h-3.5 shrink-0 text-violet-700 dark:text-violet-300" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 shrink-0">
                            Contenu pilier
                        </span>
                        <span className="text-xs text-violet-900 dark:text-violet-100/80 truncate">
                            {sourceContent.title || 'Sans titre'}
                        </span>
                    </button>
                )}
            </div>

            {/* ── Le plan de publication ─────────────────────────────────── */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                <div className="px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                        <Rows3 className="w-3 h-3" /> Plan de publication
                    </p>
                    <span className="text-[11px] text-brand-main/50 dark:text-dark-text/50">
                        {rows.length === 0 ? 'aucune ligne' : `${usableRows.length} contenu${usableRows.length > 1 ? 's' : ''} à créer`}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <select
                            value={nombreSouhaite}
                            onChange={e => setNombreSouhaite(Number(e.target.value))}
                            title="Nombre de publications demandé à l'Éclateur"
                            className="px-2 py-1.5 rounded-sm border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface text-[10px] font-semibold text-brand-main/70 dark:text-dark-text/70 outline-hidden cursor-pointer"
                        >
                            {TAILLES.map(n => (
                                <option key={n} value={n}>{n} publications</option>
                            ))}
                        </select>
                        <button
                            onClick={handleGenerate}
                            disabled={isPlanning}
                            title="L'Éclateur propose un plan à partir du sujet, de l'intention et du contenu pilier"
                            className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-sm border shadow-xs transition-colors disabled:opacity-50 bg-white dark:bg-violet-900/30 hover:bg-violet-50 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800"
                        >
                            {isPlanning
                                ? <EnCours label="L’Éclateur travaille…" taille="xs" />
                                : <><Wand2 className="w-3 h-3" /> Générer un plan</>}
                        </button>
                        <button
                            onClick={addRow}
                            className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-sm border shadow-xs transition-colors bg-white dark:bg-dark-surface hover:bg-brand-light dark:hover:bg-dark-bg text-brand-main/60 dark:text-dark-text/60 border-brand-border dark:border-dark-sec-border"
                        >
                            <Plus className="w-3 h-3" /> Ajouter une ligne
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={creatableRows.length === 0 || isCreating}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40 shadow-sm shadow-brand-main/30"
                        >
                            {isCreating
                                ? <EnCours label="Création…" taille="xs" />
                                : <>
                                    <CheckCircle2 className="w-3 h-3" />
                                    {creatableRows.length > 1 ? `Créer les ${creatableRows.length} contenus` : 'Créer le contenu'}
                                  </>}
                        </button>
                    </div>
                </div>

                {/* Un bouton grisé sans explication est une énigme : on dit ce qui manque. */}
                {sansFormat > 0 && (
                    <div className="flex items-start gap-2 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
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
                    <div className="flex items-center gap-2 px-4 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/25 border-b border-red-200 dark:border-red-800">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {createError}
                    </div>
                )}

                {rows.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                        <Wand2 className="w-10 h-10 mx-auto mb-3 text-brand-border dark:text-dark-sec-border" />
                        <p className="text-sm text-brand-main/60 dark:text-dark-text/60 max-w-md mx-auto">
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
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[14rem]">Titre</th>
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[16rem]">Angle</th>
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[20rem]">Matière</th>
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[12rem]">Format</th>
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[12rem]">Objectif</th>
                                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[16rem]">Justification</th>
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
                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
            </div>

            {/* ── Les contenus déjà créés ────────────────────────────────── */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden">
                <div className="px-4 py-2.5 border-b border-brand-border dark:border-dark-sec-border bg-brand-light dark:bg-dark-bg">
                    <p className="text-xs font-bold text-brand-main/50 dark:text-dark-text/50 uppercase flex items-center gap-2">
                        <Layers className="w-3 h-3" /> Contenus de la série ({contents.length})
                    </p>
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
                                    className="w-full text-left px-4 py-2.5 hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 transition-colors group flex items-start gap-3"
                                >
                                    <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border flex items-center justify-center text-[11px] font-bold text-brand-main/70 dark:text-dark-text/70">
                                        {item.seriePosition ?? index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-sm text-brand-main dark:text-white group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors">
                                            {item.title || 'Sans titre'}
                                        </span>
                                        {item.targetFormat && (
                                            <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800/50">
                                                {item.targetFormat}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-brand-light text-brand-main/70 border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border">
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

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={() => { void onDelete(); }}
                title="Supprimer cette série ?"
                message="Les contenus de la série ne sont pas supprimés : ils sont simplement détachés."
                isDestructive
                confirmLabel="Supprimer"
            />
        </div>
    );
};
