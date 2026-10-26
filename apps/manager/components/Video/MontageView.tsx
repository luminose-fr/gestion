import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, Lightbulb, Plus, Video } from 'lucide-react';
import {
    estMontable, estVideoAnimee, montageDuBrouillon, parseBodyJson, verifierReelExplique,
} from '@luminose/editorial';
import type { ResumeMontage, ResumeMontages } from '@luminose/shared';
import { ContentItem, ContentStatus } from '../../types';
import { STATUS_COLORS } from '../../constants';
import { Bouton, Champ, Etiquette } from '../ui';
import { EnCours } from '../Feedback';
import * as Api from '../../services/apiService';
import { poids } from './DepotPrise';

/**
 * L'espace Vidéos → Montage (SPEC §12.4.3, §12.7) : toutes les vidéos qui se
 * montent ici, et où chacune en est, du script à la vidéo publiée.
 *
 * Deux sortes, dites sur chaque ligne : **avec animations** (le Reel expliqué,
 * des scènes écrites par le Rédacteur) et **directe** (face caméra de bout en
 * bout — un Script Reel, ou une vidéo sans script créée d'ici). Le registre
 * dit laquelle est laquelle (`estVideoAnimee`) : l'écran ne nomme aucun format
 * (règle n°3 du CLAUDE.md).
 *
 * Le montage lui-même vit dans le contenu ; cet écran est la porte d'entrée.
 */

const lire = (item: ContentItem) => montageDuBrouillon(parseBodyJson(item.draft ?? ''), item.targetFormat);

/** Où en est une vidéo, en une phrase — l'étape suivante y est dite, pas seulement l'état. */
export function etapeDuReel(item: ContentItem, resume: ResumeMontage | undefined): { texte: string; aFaire: boolean } {
    const animee = estVideoAnimee(item.targetFormat);
    const data = lire(item);
    const export_ = resume?.dernierExport;
    if (export_) {
        const le = new Date(export_.le).toLocaleDateString('fr-FR');
        return { texte: `Exportée le ${le}, en ${export_.format}${export_.version === 'publicite' ? ' (publicité)' : ''}.`, aFaire: false };
    }
    const principale = resume?.prises.find(p => p.role === 'principale');
    if (!principale) {
        if (animee && !data) return { texte: "Pas encore de script — il s'écrit dans l'Atelier.", aFaire: true };
        if (!animee && !data?.sequences.length) {
            return { texte: 'Vidéo directe, sans script — déposez la prise : sa transcription servira de texte.', aFaire: true };
        }
        const aCorriger = animee ? verifierReelExplique(data).length : 0;
        return aCorriger > 0
            ? { texte: `Script écrit — ${aCorriger} point${aCorriger > 1 ? 's' : ''} à corriger avant de tourner.`, aFaire: true }
            : { texte: 'Script prêt — à tourner.', aFaire: true };
    }
    if (!principale.pret) return { texte: 'Envoi de la prise interrompu — à redéposer.', aFaire: true };
    if (!principale.transcrite) return { texte: 'Prise déposée — transcription à faire.', aFaire: true };
    const aProduire = (data?.sequences ?? []).reduce((n, s) => n + (s.elements ?? []).filter(e => e.visuel?.description).length, 0);
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

/**
 * Une vidéo directe ne se liste que si elle est en chantier : les Script Reels
 * publiés avant le 26/10/2026, jamais montés ici, encombreraient la liste. Une
 * vidéo avec animations se liste toujours — elle n'existe que pour être montée.
 */
const enChantier = (item: ContentItem, resume: ResumeMontages | null) =>
    estVideoAnimee(item.targetFormat)
    || item.status === ContentStatus.DRAFTING || item.status === ContentStatus.READY
    || !!resume?.contenus[item.id]
    || !lire(item)?.sequences.length;

export interface MontageViewProps {
    items: ContentItem[];
    onOuvrir: (item: ContentItem) => void;
    /** Mène à la boîte à idées, où un Reel expliqué commence. */
    onAllerAuxIdees: () => void;
    /** Crée une vidéo directe, sans script, et l'ouvre (§12.7). */
    onCreerVideoDirecte?: (titre: string) => Promise<void>;
}

export const MontageView: React.FC<MontageViewProps> = ({ items, onOuvrir, onAllerAuxIdees, onCreerVideoDirecte }) => {
    const [resume, setResume] = useState<ResumeMontages | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const [titre, setTitre] = useState('');
    const [creation, setCreation] = useState<'repos' | 'formulaire' | 'enCours'>('repos');

    useEffect(() => {
        let vivant = true;
        Api.fetchResumeMontages()
            .then(r => { if (vivant) setResume({ contenus: r?.contenus ?? {}, stockage: r?.stockage ?? { octets: 0, plafond: 0, disponible: false } }); })
            .catch((e: any) => { if (vivant) setErreur(e?.message ?? String(e)); });
        return () => { vivant = false; };
    }, []);

    const videos = useMemo(() => items
        .filter(i => estMontable(i.targetFormat) && enChantier(i, resume))
        .sort((a, b) => ORDRE[a.status] - ORDRE[b.status] || b.updatedAt - a.updatedAt), [items, resume]);

    const creer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titre.trim() || !onCreerVideoDirecte) return;
        setCreation('enCours');
        try {
            await onCreerVideoDirecte(titre.trim());
            setTitre('');
            setCreation('repos');
        } catch {
            setCreation('formulaire');
        }
    };

    const actions = (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {onCreerVideoDirecte && creation === 'repos' && (
                    <Bouton taille="petit" intention="principale" onClick={() => setCreation('formulaire')}>
                        <Plus /> Nouvelle vidéo directe
                    </Bouton>
                )}
                <Bouton taille="petit" intention="secondaire" onClick={onAllerAuxIdees}>
                    <Lightbulb /> Nouveau Reel expliqué
                </Bouton>
            </div>
            {creation !== 'repos' && (
                <form onSubmit={creer} className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 space-y-3">
                    <Champ
                        label="Titre de la vidéo"
                        value={titre}
                        onChange={(e) => setTitre((e.target as HTMLInputElement).value)}
                        placeholder="Suis-je le bon thérapeute pour vous ?"
                        aide="Face caméra, sans script : déposez la prise telle que tournée, sa transcription servira de texte. Silences, hésitations et phrases recommencées se coupent ; les sous-titres se posent."
                        autoFocus
                    />
                    <div className="flex items-center gap-2">
                        <Bouton type="submit" taille="petit" intention="principale" disabled={!titre.trim() || creation === 'enCours'}>
                            {creation === 'enCours' ? <EnCours label="Création…" taille="xs" /> : <><Video /> Créer et ouvrir</>}
                        </Bouton>
                        <Bouton type="button" taille="petit" intention="discrete" onClick={() => { setCreation('repos'); setTitre(''); }}>
                            Annuler
                        </Bouton>
                    </div>
                </form>
            )}
        </div>
    );

    if (videos.length === 0) {
        return (
            <div className="space-y-4">
                {actions}
                <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-6 space-y-3">
                    <Etiquette forme="entete" avecIcone><Clapperboard /> Aucune vidéo en chantier</Etiquette>
                    <p className="text-sm text-brand-main dark:text-dark-text">
                        Deux sortes de vidéos se montent ici. <span className="font-semibold">Directe</span> : face caméra de bout en
                        bout — créez-la d'ici, ou depuis un Script Reel. <span className="font-semibold">Avec animations</span> : le
                        Reel expliqué, dont les scènes s'écrivent dans l'Atelier ; il commence comme les autres contenus, par une idée.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {actions}
            {erreur && <p className="text-xs text-erreur">L'état des montages n'a pas pu être lu : {erreur}</p>}
            <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface divide-y divide-brand-border/50 dark:divide-dark-sec-border/50">
                {videos.map(item => {
                    const etape = resume ? etapeDuReel(item, resume.contenus[item.id]) : null;
                    const animee = estVideoAnimee(item.targetFormat);
                    return (
                        <div key={item.id} className="p-4 flex items-center gap-4">
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-semibold text-brand-main dark:text-white truncate">
                                        {item.title || 'Sans titre'}
                                    </span>
                                    <Etiquette as="span" forme="pastille" className="shrink-0">
                                        {animee ? 'Avec animations' : 'Directe'}
                                    </Etiquette>
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
