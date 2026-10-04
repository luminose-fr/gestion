import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, Lightbulb } from 'lucide-react';
import { estMontable, estReelExplique, parseBodyJson, verifierReelExplique } from '@luminose/editorial';
import type { ResumeMontage, ResumeMontages } from '@luminose/shared';
import { ContentItem, ContentStatus } from '../../types';
import { STATUS_COLORS } from '../../constants';
import { Bouton, Etiquette } from '../ui';
import { EnCours } from '../Feedback';
import * as Api from '../../services/apiService';
import { poids } from './DepotPrise';

/**
 * L'espace Vidéos → Montage (SPEC §12.4.3) : tous les Reels expliqués, et où
 * chacun en est, du script à la vidéo publiée.
 *
 * Le montage lui-même vit dans le contenu — c'est là que sont le script, le
 * storyboard et les prises. Cet écran est la porte d'entrée qui manquait : on y
 * voit d'un coup d'œil ce qui reste à tourner, à caler, à exporter, et un clic
 * ouvre le bon montage.
 *
 * Il demande au registre quels formats se montent (`estMontable`) : il ne nomme
 * aucun format (règle n°3 du CLAUDE.md).
 */

/** Où en est un Reel, en une phrase — l'étape suivante y est dite, pas seulement l'état. */
export function etapeDuReel(item: ContentItem, resume: ResumeMontage | undefined): { texte: string; aFaire: boolean } {
    const data = parseBodyJson(item.draft ?? '');
    if (!estReelExplique(data)) {
        return { texte: "Pas encore de script — il s'écrit dans l'Atelier.", aFaire: true };
    }
    const export_ = resume?.dernierExport;
    if (export_) {
        const le = new Date(export_.le).toLocaleDateString('fr-FR');
        return { texte: `Exportée le ${le}, en ${export_.format}${export_.version === 'publicite' ? ' (publicité)' : ''}.`, aFaire: false };
    }
    const principale = resume?.prises.find(p => p.role === 'principale');
    if (!principale) {
        const aCorriger = verifierReelExplique(data).length;
        return aCorriger > 0
            ? { texte: `Script écrit — ${aCorriger} point${aCorriger > 1 ? 's' : ''} à corriger avant de tourner.`, aFaire: true }
            : { texte: 'Script prêt — à tourner.', aFaire: true };
    }
    if (!principale.pret) return { texte: 'Envoi de la prise interrompu — à redéposer.', aFaire: true };
    if (!principale.transcrite) return { texte: 'Prise déposée — transcription à faire.', aFaire: true };
    const aProduire = data.sequences.reduce((n, s) => n + (s.elements ?? []).filter(e => e.visuel?.description).length, 0);
    const visuels = aProduire > 0 ? ` Visuels : ${Math.min(resume?.visuels ?? 0, aProduire)} sur ${aProduire}.` : '';
    return { texte: `Prise calée — prête à exporter.${visuels}`, aFaire: false };
}

/** Ce qui demande un geste d'abord, puis le plus récent : c'est l'ordre dans lequel on travaille. */
const ORDRE: Record<ContentStatus, number> = {
    [ContentStatus.DRAFTING]: 0,
    [ContentStatus.READY]: 1,
    [ContentStatus.IDEA]: 2,
    [ContentStatus.PUBLISHED]: 3,
};

export interface MontageViewProps {
    items: ContentItem[];
    onOuvrir: (item: ContentItem) => void;
    /** Mène à la boîte à idées, où un Reel expliqué commence. */
    onAllerAuxIdees: () => void;
}

export const MontageView: React.FC<MontageViewProps> = ({ items, onOuvrir, onAllerAuxIdees }) => {
    const [resume, setResume] = useState<ResumeMontages | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);

    useEffect(() => {
        let vivant = true;
        Api.fetchResumeMontages()
            .then(r => { if (vivant) setResume({ contenus: r?.contenus ?? {}, stockage: r?.stockage ?? { octets: 0, plafond: 0, disponible: false } }); })
            .catch((e: any) => { if (vivant) setErreur(e?.message ?? String(e)); });
        return () => { vivant = false; };
    }, []);

    const reels = useMemo(() => items
        .filter(i => estMontable(i.targetFormat))
        .sort((a, b) => ORDRE[a.status] - ORDRE[b.status] || b.updatedAt - a.updatedAt), [items]);

    if (reels.length === 0) {
        return (
            <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-6 space-y-3">
                <Etiquette forme="entete" avecIcone><Clapperboard /> Aucun Reel expliqué pour l'instant</Etiquette>
                <p className="text-sm text-brand-main dark:text-dark-text">
                    Un Reel expliqué commence comme les autres contenus : une idée au format
                    « Reel expliqué (scènes animées) ». Une fois le script écrit dans l'Atelier, il
                    apparaît ici, et son montage — prise, scènes, export — s'ouvre d'un clic.
                </p>
                <Bouton taille="petit" intention="secondaire" onClick={onAllerAuxIdees}>
                    <Lightbulb /> Aller à la boîte à idées
                </Bouton>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {erreur && <p className="text-xs text-erreur">L'état des montages n'a pas pu être lu : {erreur}</p>}
            <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface divide-y divide-brand-border/50 dark:divide-dark-sec-border/50">
                {reels.map(item => {
                    const etape = resume ? etapeDuReel(item, resume.contenus[item.id]) : null;
                    return (
                        <div key={item.id} className="p-4 flex items-center gap-4">
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-brand-main dark:text-white truncate">
                                        {item.title || 'Sans titre'}
                                    </span>
                                    <span className={`shrink-0 text-micro font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[item.status]}`}>
                                        {item.status}
                                    </span>
                                </div>
                                {etape ? (
                                    <p className={`text-xs ${etape.aFaire ? 'text-brand-main dark:text-dark-text' : 'text-brand-main/60 dark:text-dark-text/60'}`}>
                                        {etape.texte}
                                    </p>
                                ) : !erreur && (
                                    <p className="flex items-center gap-1.5 text-xs text-brand-main/60 dark:text-dark-text/60">
                                        <EnCours label="Lecture du montage…" taille="xs" />
                                    </p>
                                )}
                            </div>
                            <Bouton taille="petit" intention="secondaire" onClick={() => onOuvrir(item)}>
                                Ouvrir <ArrowRight />
                            </Bouton>
                        </div>
                    );
                })}
            </div>
            {resume?.stockage.disponible && resume.stockage.plafond > 0 && (
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60 px-1">
                    Stockage Cloudflare : {poids(resume.stockage.octets)} sur {poids(resume.stockage.plafond)} gratuits.
                    Une prise dont la vidéo est exportée peut rendre sa place : « Retirer », dans son montage.
                </p>
            )}
        </div>
    );
};

export default MontageView;
