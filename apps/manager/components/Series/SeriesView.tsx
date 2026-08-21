import React, { useMemo, useState } from 'react';
import { Layers, Plus, Loader2, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ContentItem, Serie } from '../../types';

interface SeriesViewProps {
    series: Serie[];
    /** Les contenus servent uniquement à compter ceux déjà rattachés. */
    contents: ContentItem[];
    isInitializing: boolean;
    isSyncing: boolean;
    onOpen: (serie: Serie) => void;
    onCreate: (input: { titre: string; intention: string | null }) => Promise<void>;
}

const STATUT_LABEL: Record<string, string> = {
    en_cours: 'En cours',
    terminee: 'Terminée',
};

const STATUT_CLS: Record<string, string> = {
    en_cours: 'bg-brand-light text-brand-main border-brand-border dark:bg-dark-bg dark:text-dark-text dark:border-dark-sec-border',
    terminee: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50',
};

const formatDate = (at: number | undefined): string => {
    if (!at) return '—';
    try {
        return format(new Date(at), 'd MMM yyyy', { locale: fr });
    } catch {
        return '—';
    }
};

export const SeriesView: React.FC<SeriesViewProps> = ({
    series, contents, isInitializing, isSyncing, onOpen, onCreate
}) => {
    const [createOpen, setCreateOpen] = useState(false);
    const [titre, setTitre] = useState('');
    const [intention, setIntention] = useState('');
    const titreRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (createOpen) titreRef.current?.focus();
    }, [createOpen]);

    /** Un passage sur les contenus, pas un filtre par ligne de tableau (N+1 côté UI). */
    const countBySerie = useMemo(() => {
        const counts = new Map<string, number>();
        contents.forEach(item => {
            if (!item.serieId) return;
            counts.set(item.serieId, (counts.get(item.serieId) ?? 0) + 1);
        });
        return counts;
    }, [contents]);

    const reset = () => {
        setTitre('');
        setIntention('');
        setCreateOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titre.trim()) return;
        await onCreate({ titre: titre.trim(), intention: intention.trim() || null });
        reset();
    };

    const cellCls = 'px-4 py-2.5 align-top';

    return (
        <div className="space-y-4 animate-fade-in">

            {/* CRÉATION — replié en bouton, déplié en formulaire (même geste que la boîte à idées) */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-brand-border dark:border-dark-sec-border overflow-hidden transition-all">
                {!createOpen ? (
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white hover:bg-brand-light dark:hover:bg-dark-bg transition-colors group"
                    >
                        <span className="w-6 h-6 rounded-md bg-brand-light dark:bg-dark-bg flex items-center justify-center shrink-0 group-hover:bg-brand-main dark:group-hover:bg-white transition-colors">
                            <Plus className="w-3 h-3 text-brand-main dark:text-white group-hover:text-white dark:group-hover:text-brand-main transition-colors" />
                        </span>
                        Nouvelle série…
                    </button>
                ) : (
                    <form onSubmit={handleSubmit} className="p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <input
                            ref={titreRef}
                            type="text"
                            value={titre}
                            onChange={e => setTitre(e.target.value)}
                            placeholder="Le sujet de la série…"
                            className="w-full px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-white rounded-lg text-sm font-semibold text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors"
                        />
                        <textarea
                            value={intention}
                            onChange={e => setIntention(e.target.value)}
                            placeholder="L'intention : ce que cette série doit produire chez le lecteur… (optionnel)"
                            className="w-full h-20 px-3 py-2.5 bg-brand-light dark:bg-dark-bg border border-brand-border dark:border-dark-sec-border focus:border-brand-main dark:focus:border-white rounded-lg text-sm text-brand-main dark:text-white placeholder-brand-main/40 dark:placeholder-dark-text/40 outline-hidden transition-colors resize-none"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={reset}
                                className="px-3 py-1.5 text-sm text-brand-main/60 dark:text-dark-text/60 hover:text-brand-main dark:hover:text-white transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                disabled={!titre.trim() || isSyncing}
                                className="flex items-center gap-2 px-4 py-1.5 bg-brand-main hover:bg-brand-hover dark:bg-white dark:text-brand-main dark:hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 shadow-sm shadow-brand-main/30"
                            >
                                {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                Créer la série
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {!isInitializing && series.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-xs bg-white dark:bg-dark-surface border-brand-border dark:border-dark-sec-border">
                        <Layers className="w-8 h-8 text-brand-main/50 dark:text-dark-text/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-brand-main dark:text-white">Aucune série</h3>
                    <p className="text-sm text-brand-main/60 dark:text-dark-text/60 max-w-sm mx-auto mt-2">
                        Une série regroupe plusieurs publications autour d'un même sujet — soit à partir d'un thème,
                        soit en déclinant un contenu déjà prêt.
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-brand-light dark:bg-dark-bg border-b border-brand-border dark:border-dark-sec-border">
                                <tr>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 min-w-[18rem]">Série</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">Statut</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">Contenus</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-main/55 dark:text-dark-text/55 whitespace-nowrap">Créée le</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                                {series.map(serie => (
                                    <tr
                                        key={serie.id}
                                        tabIndex={0}
                                        onClick={() => onOpen(serie)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(serie); }
                                        }}
                                        className="cursor-pointer transition-colors hover:bg-brand-light/40 dark:hover:bg-dark-bg/40 focus-visible:outline-none focus-visible:bg-brand-light/40 dark:focus-visible:bg-dark-bg/40 group"
                                    >
                                        <td className={cellCls}>
                                            <div className="font-semibold text-brand-main dark:text-white leading-tight group-hover:text-brand-hover dark:group-hover:text-brand-light transition-colors flex items-center gap-2">
                                                {serie.titre}
                                                {serie.sourceContentId && (
                                                    <span
                                                        title="Série issue d'un contenu pilier"
                                                        className="inline-flex items-center gap-1 rounded-full border text-[10px] px-1.5 py-0.5 font-semibold bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800/50"
                                                    >
                                                        <Link2 className="w-2.5 h-2.5" /> Déclinaison
                                                    </span>
                                                )}
                                            </div>
                                            {serie.intention && (
                                                <div className="mt-1 max-w-2xl text-xs leading-5 text-brand-main/60 dark:text-dark-text/60 line-clamp-2">
                                                    {serie.intention}
                                                </div>
                                            )}
                                        </td>
                                        <td className={`${cellCls} whitespace-nowrap`}>
                                            <span className={`inline-flex items-center rounded-full border text-[10px] px-1.5 py-0.5 font-semibold ${STATUT_CLS[serie.statut] ?? ''}`}>
                                                {STATUT_LABEL[serie.statut] ?? serie.statut}
                                            </span>
                                        </td>
                                        <td className={`${cellCls} whitespace-nowrap text-sm text-brand-main/70 dark:text-dark-text/70`}>
                                            {countBySerie.get(serie.id) ?? 0}
                                        </td>
                                        <td className={`${cellCls} whitespace-nowrap text-sm text-brand-main/70 dark:text-dark-text/70`}>
                                            {formatDate(serie.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
