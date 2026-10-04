import React, { useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { renderMediaOnWeb } from '@remotion/web-renderer';
import { Clapperboard, Download, X } from 'lucide-react';
import {
    minuterReel, horlogeEstimee, DEBIT_MIN, DEBIT_MAX, MOTS_PAR_MINUTE, motsNormalises,
    type ReelExplique,
} from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';
import { Barre, EnCours } from '../Feedback';
import * as Activite from '../../services/activityService';
import {
    CompositionReel, SceneAnimee, CADRE, FPS, chargerPolices, dureeDuReel, dureeDeLaScene,
    type ProprietesReel, type ProprietesScene,
} from './ReelComposition';

/**
 * L'aperçu animé et l'export des scènes d'un Reel expliqué (SPEC §12.4, V2).
 *
 * Chargé à la demande : Remotion n'entre dans le navigateur que lorsqu'on ouvre
 * un storyboard, jamais dans le paquet principal de l'application.
 *
 * **Le rendu se fait ici, dans l'onglet.** `renderMediaOnWeb` encode avec
 * WebCodecs : aucun serveur, aucun envoi. Aucune `licenseKey` ne lui est
 * passée — c'est ce qui coupe la télémétrie de Remotion (licence gratuite,
 * versions < 5.0) : rien ne sort, pas même l'origine de la page.
 */

const PLAYER_LARGEUR = 270;

/** WebCodecs manque à Safari pour une partie de ce que l'encodage demande ; Chrome l'a. */
const sansWebCodecs = (): boolean => typeof window === 'undefined' || typeof (window as any).VideoEncoder === 'undefined';

const nomDeFichier = (rang: number, role: string): string => {
    const mots = motsNormalises(role).join('-');
    return `scene-${rang}${mots ? `-${mots}` : ''}.mp4`;
};

const telecharger = (blob: Blob, nom: string) => {
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    // Le téléchargement a déjà lu l'URL ; la garder retiendrait la vidéo en mémoire.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const secondes = (s: number) => `${s.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;

export interface PanneauMontageProps {
    data: ReelExplique;
    /** Les visuels déposés, par séquence puis par élément. */
    visuelsDeLaScene: (sequence: number) => Record<number, string>;
}

const PanneauMontage: React.FC<PanneauMontageProps> = ({ data, visuelsDeLaScene }) => {
    const [debit, setDebit] = useState(MOTS_PAR_MINUTE);
    const [export_, setExport] = useState<{ sequence: number; part: number } | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const annulation = useRef<AbortController | null>(null);

    const minutage = useMemo(() => minuterReel(data, horlogeEstimee(debit)), [data, debit]);
    const sequences = data.sequences ?? [];
    const visuels = useMemo(
        () => Object.fromEntries(sequences.map((_, i) => [i, visuelsDeLaScene(i)])) as ProprietesReel['visuels'],
        [sequences, visuelsDeLaScene],
    );
    const proprietes: ProprietesReel = { data, minutage, visuels };
    const indisponible = sansWebCodecs();

    const exporter = async (rang: number) => {
        const sequence = sequences[rang];
        const m = minutage.sequences[rang];
        if (!sequence || !m) return;
        setErreur(null);
        setExport({ sequence: rang, part: 0 });
        const controle = new AbortController();
        annulation.current = controle;
        const temoin = Activite.ouvrir({ label: `Export de la scène ${rang + 1}`, part: 0, etape: sequence.role || null });
        try {
            await chargerPolices();
            const entree: ProprietesScene = { sequence, apparitions: m.apparitions, visuels: visuels[rang] };
            const { getBlob } = await renderMediaOnWeb({
                composition: {
                    id: `scene-${rang + 1}`,
                    component: SceneAnimee,
                    durationInFrames: dureeDeLaScene(minutage, rang),
                    fps: FPS,
                    width: CADRE.largeur,
                    height: CADRE.hauteur,
                    defaultProps: entree,
                },
                inputProps: entree,
                container: 'mp4',
                videoCodec: 'h264',
                // Une scène se pose sur la voix de la prise : elle n'a pas de son à elle.
                muted: true,
                signal: controle.signal,
                onProgress: ({ progress }) => {
                    setExport({ sequence: rang, part: progress });
                    temoin.avancer({ part: progress });
                },
            });
            telecharger(await getBlob(), nomDeFichier(rang + 1, sequence.role));
            temoin.fermer(true);
        } catch (e: any) {
            temoin.fermer(false);
            if (!controle.signal.aborted) setErreur(`L'export de la scène ${rang + 1} a échoué : ${e?.message ?? String(e)}`);
        } finally {
            annulation.current = null;
            setExport(null);
        }
    };

    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="justify-self-center">
                <Player
                    component={CompositionReel}
                    inputProps={proprietes}
                    durationInFrames={dureeDuReel(minutage)}
                    fps={FPS}
                    compositionWidth={CADRE.largeur}
                    compositionHeight={CADRE.hauteur}
                    style={{ width: PLAYER_LARGEUR, height: Math.round(PLAYER_LARGEUR * CADRE.hauteur / CADRE.largeur), borderRadius: 8, overflow: 'hidden' }}
                    controls
                    acknowledgeRemotionLicense
                />
            </div>

            <div className="space-y-4 min-w-0">
                <div className="space-y-1">
                    <Etiquette forme="entete" avecIcone><Clapperboard /> Aperçu animé</Etiquette>
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                        Les passages face caméra montrent ce qui s'y dit ; votre prise les remplacera à l'étape suivante.
                    </p>
                </div>

                <div>
                    <label htmlFor="debit-reel" className="block mb-1 text-xs text-brand-main dark:text-dark-text">
                        Débit : <span className="font-bold">{debit} mots par minute</span> — durée ≈ {secondes(minutage.duree)}
                    </label>
                    <input
                        id="debit-reel"
                        type="range"
                        min={DEBIT_MIN}
                        max={DEBIT_MAX}
                        step={5}
                        value={debit}
                        onChange={e => setDebit(Number(e.target.value))}
                        className="w-full accent-brand-main dark:accent-dark-text"
                    />
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                        Lisez le script à voix haute, chronométrez, et réglez le débit pour retrouver votre durée : les scènes exportées tomberont au bon rythme.
                    </p>
                </div>

                <div className="space-y-2">
                    <Etiquette>Exporter une scène (MP4 1080 × 1920, sans son)</Etiquette>
                    {indisponible && (
                        <p className="text-xs text-alerte">L'export demande Chrome : ce navigateur ne sait pas encoder la vidéo (WebCodecs).</p>
                    )}
                    {sequences.map((sequence, rang) => {
                        if (sequence.plan !== 'scene') return null;
                        const m = minutage.sequences[rang];
                        const enCours = export_?.sequence === rang;
                        return (
                            <div key={rang} className="space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-brand-main dark:text-dark-text truncate">
                                        {rang + 1}. {sequence.role || 'Scène'} — {secondes(m.fin - m.debut)}
                                    </span>
                                    {enCours ? (
                                        <Bouton taille="petit" intention="secondaire" onClick={() => annulation.current?.abort()}>
                                            <X /> Annuler
                                        </Bouton>
                                    ) : (
                                        <Bouton taille="petit" intention="secondaire" disabled={indisponible || export_ !== null} onClick={() => void exporter(rang)}>
                                            <Download /> Exporter
                                        </Bouton>
                                    )}
                                </div>
                                {enCours && (
                                    <div className="space-y-1">
                                        <p className="flex items-center gap-1.5 text-xs text-brand-main dark:text-dark-text">
                                            <EnCours label={`Export… ${Math.round(export_.part * 100)} %`} taille="xs" />
                                        </p>
                                        <Barre part={export_.part} libelle={`Export de la scène ${rang + 1}`} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {erreur && <p className="text-xs text-erreur">{erreur}</p>}
                </div>
            </div>
        </div>
    );
};

export default PanneauMontage;
