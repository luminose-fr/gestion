import React, { useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { renderMediaOnWeb } from '@remotion/web-renderer';
import { Clapperboard, Download, X } from 'lucide-react';
import {
    minuterReel, horlogeEstimee, planDeMontage, DEBIT_MIN, DEBIT_MAX, MOTS_PAR_MINUTE, motsNormalises,
    type MinutageReel, type ReelExplique,
} from '@luminose/editorial';
import { Bouton, Etiquette } from '../ui';
import { Barre, EnCours } from '../Feedback';
import * as Activite from '../../services/activityService';
import {
    CompositionReel, CompositionFinale, SceneAnimee, FPS, chargerPolices, dureeDuReel, dureeDuPlan, enImages,
    type ProprietesFinale, type ProprietesReel, type ProprietesScene,
} from './ReelComposition';
import { CADRES, type FormatVideo } from './SceneLuminose';
import { usePrisesReel } from './usePrisesReel';
import { DepotPrise } from './DepotPrise';
import { ReperesPrise } from './ReperesPrise';

/**
 * Le montage d'un Reel expliqué, de l'aperçu à la vidéo publiée (SPEC §12.4 à
 * §12.6).
 *
 * Sans prise, l'aperçu suit le débit estimé et les scènes s'exportent seules
 * (V2). Une prise déposée est transcrite et calée : l'aperçu devient la vraie
 * vidéo — la prise, les scènes sur leurs mots, les sous-titres —, les repères
 * se corrigent à la main, et la vidéo s'exporte en 9:16 ou 4:5, organique ou
 * publicitaire (V3, V4).
 *
 * Chargé à la demande : Remotion et Mediabunny n'entrent dans le navigateur que
 * lorsqu'on ouvre un storyboard, jamais dans le paquet principal.
 *
 * **Le rendu se fait ici, dans l'onglet.** `renderMediaOnWeb` encode avec
 * WebCodecs : aucun serveur, aucun envoi. Aucune `licenseKey` ne lui est
 * passée — c'est ce qui coupe la télémétrie de Remotion (licence gratuite,
 * versions < 5.0) : rien ne sort, pas même l'origine de la page.
 */

const PLAYER_LARGEUR = 270;

type Version = 'organique' | 'publicite';

/**
 * Pourquoi l'export est impossible ici, ou `null`. Deux causes, qui ne se
 * corrigent pas pareil : WebCodecs n'existe que dans une page SÉCURISÉE (https,
 * ou localhost) — une page de développement servie par l'adresse d'une machine
 * du réseau en est privée, même dans Chrome — et il manque à une partie des
 * navigateurs. Dire « Chrome » à quelqu'un qui est déjà dans Chrome serait faux.
 */
const exportImpossible = (): string | null => {
    if (typeof window === 'undefined') return "L'export demande un navigateur.";
    if (!window.isSecureContext) return "L'export demande une page sécurisée (https) : WebCodecs n'existe pas ailleurs.";
    if (typeof (window as any).VideoEncoder === 'undefined') return "L'export demande Chrome : ce navigateur ne sait pas encoder la vidéo (WebCodecs).";
    return null;
};

const nomDeScene = (rang: number, role: string): string => {
    const mots = motsNormalises(role).join('-');
    return `scene-${rang}${mots ? `-${mots}` : ''}.mp4`;
};

const nomDeVideo = (format: FormatVideo, version: Version): string =>
    `reel-${format === '9:16' ? '9x16' : '4x5'}${version === 'publicite' ? '-pub' : ''}.mp4`;

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

/** Deux ou trois choix exclusifs, en boutons : un sélecteur se lit mal pour si peu. */
function Choix<T extends string>({ valeur, options, onChange }: {
    valeur: T;
    options: Array<{ valeur: T; libelle: string; desactive?: boolean }>;
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(o => (
                <Bouton
                    key={o.valeur}
                    taille="petit"
                    intention={o.valeur === valeur ? 'principale' : 'secondaire'}
                    disabled={o.desactive}
                    aria-pressed={o.valeur === valeur}
                    onClick={() => onChange(o.valeur)}
                >
                    {o.libelle}
                </Bouton>
            ))}
        </div>
    );
}

export interface PanneauMontageProps {
    data: ReelExplique;
    /** Le contenu enregistré : les prises s'y rattachent. */
    contentId: string;
    /** Les visuels déposés, par séquence puis par élément. */
    visuelsDeLaScene: (sequence: number) => Record<number, string>;
}

const PanneauMontage: React.FC<PanneauMontageProps> = ({ data, contentId, visuelsDeLaScene }) => {
    const prises = usePrisesReel(contentId, data);
    const [debit, setDebit] = useState(MOTS_PAR_MINUTE);
    const [format, setFormat] = useState<FormatVideo>('9:16');
    const [version, setVersion] = useState<Version>('organique');
    const [export_, setExport] = useState<{ cible: string; part: number } | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const annulation = useRef<AbortController | null>(null);
    const lecteur = useRef<PlayerRef>(null);

    const sequences = data.sequences ?? [];
    const visuels = useMemo(
        () => Object.fromEntries(sequences.map((_, i) => [i, visuelsDeLaScene(i)])) as ProprietesReel['visuels'],
        [sequences, visuelsDeLaScene],
    );

    // Une prise ne sert qu'une fois calée ET relue : sans son fichier, rien à montrer.
    const principale = prises.principale?.calage && prises.principale.url ? prises.principale : undefined;
    const accroche = prises.accroche?.calage && prises.accroche.url ? prises.accroche : undefined;
    const versionEffective: Version = version === 'publicite' && principale && accroche ? 'publicite' : 'organique';

    const estime = useMemo(() => minuterReel(data, horlogeEstimee(debit)), [data, debit]);
    const calageBrut = useMemo<MinutageReel | null>(
        () => principale ? minuterReel(data, principale.calage!.horloge) : null,
        [data, principale],
    );
    const plan = useMemo(() => principale ? planDeMontage(
        data,
        { calage: principale.calage!, duree: principale.prise.duree },
        {
            reperes: principale.prise.reperes,
            accroche: versionEffective === 'publicite' && accroche ? { calage: accroche.calage!, duree: accroche.prise.duree } : null,
        },
    ) : null, [data, principale, accroche, versionEffective]);

    const cadre = CADRES[format];
    const finale: ProprietesFinale | null = plan && principale ? {
        data, plan, visuels, format,
        sources: { principale: principale.url, accroche: accroche?.url },
    } : null;
    const reel: ProprietesReel = { data, minutage: estime, visuels, format };
    // Les scènes exportées seules suivent la prise quand il y en a une : elles
    // tomberont sur les mots dans Final Cut aussi.
    const minutageDesScenes: MinutageReel = plan?.minutage ?? estime;
    const indisponible = exportImpossible();
    const occupe = export_ !== null;

    /** Un rendu dans l'onglet, annoncé au bandeau, annulable, téléchargé à la fin. */
    const rendre = async (cible: string, libelle: string, nom: string, lancer: (signal: AbortSignal, avancer: (p: number) => void) => Promise<Blob>) => {
        setErreur(null);
        setExport({ cible, part: 0 });
        const controle = new AbortController();
        annulation.current = controle;
        const temoin = Activite.ouvrir({ label: libelle, part: 0 });
        try {
            await chargerPolices();
            const blob = await lancer(controle.signal, part => {
                setExport({ cible, part });
                temoin.avancer({ part });
            });
            telecharger(blob, nom);
            temoin.fermer(true);
        } catch (e: any) {
            temoin.fermer(false);
            if (!controle.signal.aborted) setErreur(`${libelle} : échec — ${e?.message ?? String(e)}`);
        } finally {
            annulation.current = null;
            setExport(null);
        }
    };

    const exporterScene = (rang: number) => {
        const sequence = sequences[rang];
        const m = minutageDesScenes.sequences[rang];
        if (!sequence || !m) return;
        const entree: ProprietesScene = { sequence, apparitions: m.apparitions, visuels: visuels[rang], format };
        void rendre(`scene-${rang}`, `Export de la scène ${rang + 1}`, nomDeScene(rang + 1, sequence.role), async (signal, avancer) => {
            const { getBlob } = await renderMediaOnWeb({
                composition: {
                    id: `scene-${rang + 1}`,
                    component: SceneAnimee,
                    durationInFrames: Math.max(1, enImages(m.fin - m.debut + 0.5)),
                    fps: FPS,
                    width: cadre.largeur,
                    height: cadre.hauteur,
                    defaultProps: entree,
                },
                inputProps: entree,
                container: 'mp4',
                videoCodec: 'h264',
                // Une scène se pose sur la voix de la prise : elle n'a pas de son à elle.
                muted: true,
                signal,
                onProgress: ({ progress }) => avancer(progress),
            });
            return getBlob();
        });
    };

    const exporterVideo = () => {
        if (!finale || !plan) return;
        const nom = nomDeVideo(format, versionEffective);
        void rendre('video', `Export de la vidéo ${format}${versionEffective === 'publicite' ? ' (publicité)' : ''}`, nom, async (signal, avancer) => {
            const { getBlob } = await renderMediaOnWeb({
                composition: {
                    id: 'reel',
                    component: CompositionFinale,
                    durationInFrames: dureeDuPlan(plan),
                    fps: FPS,
                    width: cadre.largeur,
                    height: cadre.hauteur,
                    defaultProps: finale,
                },
                inputProps: finale,
                container: 'mp4',
                videoCodec: 'h264',
                signal,
                onProgress: ({ progress }) => avancer(progress),
            });
            return getBlob();
        });
    };

    const progression = (cible: string) => export_?.cible === cible && (
        <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-brand-main dark:text-dark-text">
                <EnCours label={`Export… ${Math.round(export_.part * 100)} %`} taille="xs" />
            </p>
            <Barre part={export_.part} libelle="Export" />
        </div>
    );

    const boutonExport = (cible: string, onClick: () => void, libelle = 'Exporter', desactive = false) =>
        export_?.cible === cible ? (
            <Bouton taille="petit" intention="secondaire" onClick={() => annulation.current?.abort()}>
                <X /> Annuler
            </Bouton>
        ) : (
            <Bouton taille="petit" intention="secondaire" disabled={indisponible !== null || occupe || desactive} onClick={onClick}>
                <Download /> {libelle}
            </Bouton>
        );

    const hauteur = Math.round(PLAYER_LARGEUR * cadre.hauteur / cadre.largeur);
    const style = { width: PLAYER_LARGEUR, height: hauteur, borderRadius: 8, overflow: 'hidden' };

    return (
        <div className="rounded-xl border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-surface p-4 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="justify-self-center sm:sticky sm:top-4 self-start">
                {finale && plan ? (
                    <Player
                        key={`finale-${format}`}
                        ref={lecteur}
                        component={CompositionFinale}
                        inputProps={finale}
                        durationInFrames={dureeDuPlan(plan)}
                        fps={FPS}
                        compositionWidth={cadre.largeur}
                        compositionHeight={cadre.hauteur}
                        style={style}
                        controls
                        acknowledgeRemotionLicense
                    />
                ) : (
                    <Player
                        key={`estime-${format}`}
                        component={CompositionReel}
                        inputProps={reel}
                        durationInFrames={dureeDuReel(estime)}
                        fps={FPS}
                        compositionWidth={cadre.largeur}
                        compositionHeight={cadre.hauteur}
                        style={style}
                        controls
                        acknowledgeRemotionLicense
                    />
                )}
            </div>

            <div className="space-y-5 min-w-0">
                <div className="space-y-1">
                    <Etiquette forme="entete" avecIcone><Clapperboard /> Montage</Etiquette>
                    <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                        {finale
                            ? `L'aperçu est la vidéo telle qu'elle sortira : ${secondes(plan!.duree)}.`
                            : "Sans prise, l'aperçu suit le débit estimé et les passages face caméra montrent ce qui s'y dit."}
                    </p>
                </div>

                <div className="space-y-4">
                    <DepotPrise
                        titre="La prise"
                        consigne="Déposez la prise nettoyée, exportée de Final Cut (H.264 de préférence). Seul son son part, pour être transcrit : la vidéo reste dans ce navigateur."
                        prise={prises.principale}
                        enCours={prises.enCours.principale}
                        erreur={prises.erreurs.principale}
                        deposable={!prises.indisponible}
                        onDeposer={(f) => void prises.deposer('principale', f)}
                        onTranscrire={() => void prises.transcrire('principale')}
                        onRetirer={() => void prises.retirer('principale')}
                    />
                    {data.accroche_pub?.voix && (
                        <DepotPrise
                            titre="La seconde accroche (publicité)"
                            consigne="Facultative : la seconde accroche, tournée à part. Elle remplace la séquence 1 dans la version publicitaire."
                            prise={prises.accroche}
                            enCours={prises.enCours.accroche}
                            erreur={prises.erreurs.accroche}
                            deposable={!prises.indisponible && !!prises.principale}
                            onDeposer={(f) => void prises.deposer('accroche', f)}
                            onTranscrire={() => void prises.transcrire('accroche')}
                            onRetirer={() => void prises.retirer('accroche')}
                        />
                    )}
                    {prises.indisponible && (
                        <p className="text-xs text-alerte">Ce navigateur refuse le stockage local : une prise ne peut pas y être gardée.</p>
                    )}
                </div>

                {principale && calageBrut && plan ? (
                    <ReperesPrise
                        data={data}
                        calage={calageBrut}
                        plan={plan}
                        reperes={principale.prise.reperes}
                        onCorriger={(i, j, t) => void prises.corrigerRepere(i, j, t)}
                        onAller={(s) => lecteur.current?.seekTo(enImages(s))}
                    />
                ) : (
                    <div>
                        <label htmlFor="debit-reel" className="block mb-1 text-xs text-brand-main dark:text-dark-text">
                            Débit : <span className="font-bold">{debit} mots par minute</span> — durée ≈ {secondes(estime.duree)}
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
                )}

                <div className="space-y-3">
                    <Etiquette>Format et version</Etiquette>
                    <Choix<FormatVideo>
                        valeur={format}
                        onChange={setFormat}
                        options={[
                            { valeur: '9:16', libelle: '9:16 — Reels, Shorts' },
                            { valeur: '4:5', libelle: '4:5 — fil Meta' },
                        ]}
                    />
                    <Choix<Version>
                        valeur={versionEffective}
                        onChange={setVersion}
                        options={[
                            { valeur: 'organique', libelle: 'Organique' },
                            { valeur: 'publicite', libelle: 'Publicité', desactive: !(principale && accroche) },
                        ]}
                    />
                    {indisponible && <p className="text-xs text-alerte">{indisponible}</p>}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-brand-main dark:text-dark-text">
                                La vidéo, son compris{plan ? ` — ${secondes(plan.duree)}` : ''}
                            </span>
                            {boutonExport('video', exporterVideo, 'Exporter la vidéo', !finale)}
                        </div>
                        {!finale && (
                            <p className="text-xs text-brand-main/60 dark:text-dark-text/60">Il faut une prise calée pour exporter la vidéo entière.</p>
                        )}
                        {progression('video')}
                    </div>
                </div>

                <div className="space-y-2">
                    <Etiquette>Les scènes seules (MP4 sans son, pour Final Cut)</Etiquette>
                    {sequences.map((sequence, rang) => {
                        if (sequence.plan !== 'scene') return null;
                        const m = minutageDesScenes.sequences[rang];
                        return (
                            <div key={rang} className="space-y-1">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm text-brand-main dark:text-dark-text truncate">
                                        {rang + 1}. {sequence.role || 'Scène'} — {secondes(m.fin - m.debut)}
                                    </span>
                                    {boutonExport(`scene-${rang}`, () => exporterScene(rang))}
                                </div>
                                {progression(`scene-${rang}`)}
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
