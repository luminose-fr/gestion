import React, { useRef } from 'react';
import { Film, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Bouton, Etiquette } from '../ui';
import { Barre, EnCours } from '../Feedback';
import type { EtapePrise, PriseAffichee } from './usePrisesReel';

/**
 * Le dépôt d'une prise, et ce qu'on en sait (SPEC §12.5).
 *
 * L'écran dit à chaque étape ce qui se passe — lecture, envoi vers
 * Cloudflare, téléchargement, extraction du son, transcription — et, une fois
 * la prise calée, quelle part du script y a été retrouvée. C'est ce chiffre qui
 * dit s'il faut aller vérifier les repères.
 */

/** Au-dessous, la prise s'écarte assez du script pour que des cartes tombent à côté. */
const COUVERTURE_SURE = 0.8;

const LIBELLES: Record<EtapePrise, string> = {
    lecture: 'Lecture de la prise…',
    envoi: 'Envoi vers Cloudflare…',
    telechargement: 'Téléchargement de la prise…',
    son: 'Extraction du son…',
    transcription: 'Transcription…',
};

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
/** Un poids lisible ; un fichier minuscule compte pour 1 Mo, mais rien compte pour 0. */
export const poids = (octets: number) => octets >= 1e9
    ? `${(octets / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`
    : `${octets > 0 ? Math.max(1, Math.round(octets / 1e6)).toLocaleString('fr-FR') : 0} Mo`;

export interface DepotPriseProps {
    titre: string;
    /** Ce que la prise doit contenir, dit avant qu'elle soit déposée. */
    consigne: string;
    prise?: PriseAffichee;
    enCours?: { etape: EtapePrise; part: number | null };
    erreur?: string;
    deposable: boolean;
    onDeposer: (fichier: File) => void;
    onTranscrire: () => void;
    onRetirer: () => void;
}

export const DepotPrise: React.FC<DepotPriseProps> = ({
    titre, consigne, prise, enCours, erreur, deposable, onDeposer, onTranscrire, onRetirer,
}) => {
    const choix = useRef<HTMLInputElement>(null);
    const occupe = !!enCours;
    const calage = prise?.calage;

    return (
        <div
            className="space-y-2"
            onDragOver={deposable ? (e) => e.preventDefault() : undefined}
            onDrop={deposable ? (e) => {
                e.preventDefault();
                const fichier = e.dataTransfer.files?.[0];
                if (fichier && !occupe) onDeposer(fichier);
            } : undefined}
        >
            <Etiquette avecIcone><Film /> {titre}</Etiquette>
            <input
                ref={choix}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onDeposer(f); e.target.value = ''; }}
            />

            {prise ? (
                <p className="text-sm text-brand-main dark:text-dark-text truncate">
                    {prise.prise.nom} — {secondes(prise.prise.duree)}, {prise.prise.largeur} × {prise.prise.hauteur}, {poids(prise.prise.taille)}
                </p>
            ) : (
                <p className="text-xs text-brand-main/60 dark:text-dark-text/60">{consigne}</p>
            )}

            {enCours && (
                <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-brand-main dark:text-dark-text">
                        <EnCours label={LIBELLES[enCours.etape]} taille="xs" />
                    </p>
                    <Barre part={enCours.part} libelle={LIBELLES[enCours.etape]} />
                </div>
            )}

            {!enCours && calage && (
                <p className={`text-xs ${calage.couverture < COUVERTURE_SURE ? 'text-alerte' : 'text-brand-main/70 dark:text-dark-text/70'}`}>
                    Calée : {Math.round(calage.couverture * 100)} % des mots du script retrouvés dans la prise
                    {calage.couverture < COUVERTURE_SURE ? ' — elle s’en écarte : vérifiez les repères avant d’exporter.' : '.'}
                </p>
            )}
            {!enCours && prise && !prise.prise.pretLe && !erreur && (
                <p className="text-xs text-alerte">Envoi interrompu : la prise n'est pas entière dans Cloudflare. Redéposez-la, ou retirez-la.</p>
            )}
            {!enCours && prise?.prise.pretLe && !prise.prise.transcription && !erreur && (
                <p className="text-xs text-alerte">Pas encore transcrite : sans les mots, rien ne se cale.</p>
            )}
            {erreur && <p className="text-xs text-erreur">{erreur}</p>}

            {deposable && (
                <div className="flex flex-wrap items-center gap-2">
                    <Bouton taille="petit" intention="secondaire" disabled={occupe} onClick={() => choix.current?.click()}>
                        <Upload /> {prise ? 'Remplacer' : 'Déposer la prise'}
                    </Bouton>
                    {prise?.prise.pretLe && (
                        <Bouton taille="petit" intention="secondaire" disabled={occupe || !prise.url} onClick={onTranscrire}>
                            <RefreshCw /> Transcrire à nouveau
                        </Bouton>
                    )}
                    {prise && (
                        <Bouton taille="petit" intention="discrete" disabled={occupe} onClick={onRetirer}>
                            <Trash2 /> Retirer
                        </Bouton>
                    )}
                </div>
            )}
        </div>
    );
};

export default DepotPrise;
