import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { renderMediaOnWeb } from '@remotion/web-renderer';
import { Download, Film, X } from 'lucide-react';
import {
    minuterReel, horlogeEstimee, planDeMontage, CARTON_FINAL, instantDansLaVideo, DEBIT_MIN, DEBIT_MAX, MOTS_PAR_MINUTE,
    cadrer, momentsFiges, avecAnimations, jourCourt, visuelsAProduire, passagesManuels, compterMots,
    enDeuxTemps, sansVisageEclair, tempsDeLaSequence, ecransEstimes, texteAffiche, visuelEnClair, illustrationDe, visuelDecrit,
    type MinutageReel, type PlanDeMontage, type ReelExplique,
} from '@luminose/editorial';
import { Bouton, ControleSegmente, Etiquette } from '../ui';
import { Barre, EnCours } from '../Feedback';
import * as Activite from '../../services/activityService';
import * as Api from '../../services/apiService';
import {
    CompositionReel, CompositionFinale, SceneAnimee, FPS, chargerPolices, dureeDuReel, dureeDuPlan, enImages,
    type ProprietesFinale, type ProprietesReel, type ProprietesScene,
} from './ReelComposition';
import { CADRES, type FormatVideo } from './SceneLuminose';
import { preparerEncodage } from './encodage';
import { sousVeille } from './veille';
import { nomDeScene, nomDeVideo } from './noms';
import { usePrisesReel } from './usePrisesReel';
import { DepotPrise, poids } from './DepotPrise';
import type { Montage } from './useMontage';
import { MontageTexte, type EcranDansLeTexte } from './MontageTexte';
import { ReglagesPrise } from './ReglagesPrise';
import { AvantDExporter } from './AvantDExporter';
import type { VisuelsReel } from './useVisuelsReel';

/**
 * Le montage d'un Reel expliqué, de l'aperçu à la vidéo publiée (SPEC §12.4 à
 * §12.6).
 *
 * Sans prise, l'aperçu suit le débit estimé et les scènes s'exportent seules
 * (V2). Une prise déposée est transcrite et calée : l'aperçu devient la vraie
 * vidéo — la prise, les scènes sur leurs mots, les sous-titres —, un écran se
 * déplace d'un clic sur le mot où il doit apparaître, et la vidéo s'exporte en 9:16 ou 4:5, organique ou
 * publicitaire (V3, V4). La prise arrive telle que tournée : ses silences et
 * ses phrases reprises se coupent ici (§12.5.2).
 *
 * Chargé à la demande : Remotion et Mediabunny n'entrent dans le navigateur que
 * lorsqu'on ouvre un storyboard, jamais dans le paquet principal.
 *
 * **Le rendu se fait ici, dans l'onglet.** `renderMediaOnWeb` encode avec
 * WebCodecs : aucun serveur, et la vidéo ne sort pas. Un signal, si : à chaque
 * export, Remotion envoie à remotion.pro l'origine de la page et le succès de
 * l'export, avec ou sans `licenseKey` — constaté le 25/10/2026, alors qu'il
 * était écrit ici le contraire (SPEC §12.4.1).
 */

/** L'aperçu du studio : 306 px de large, 544 en 9:16 (SPEC §13.11). */
const PLAYER_LARGEUR = 306;

/** Une vidéo sans scène n'a pas de visuel : la même fonction à chaque rendu, pour ne rien recalculer. */
const AUCUN_VISUEL = (): Record<number, string> => ({});
const AUCUNE_ILLUSTRATION = (): Record<string, string> => ({});

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
    if (typeof (window as any).VideoEncoder === 'undefined') {
        return "L'export demande WebCodecs, que ce navigateur n'a pas : Chrome 94, Firefox 130 ou Safari 26 et suivants.";
    }
    return null;
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
/** « 1:03 » : une durée de vidéo se lit comme dans un lecteur. */
const minutes = (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Les passages d'une prise que la vidéo montre, en secondes de cette prise. */
const morceaux = (plan: PlanDeMontage, source: 'principale' | 'accroche') =>
    plan.segments.filter(s => s.source === source).map(s => ({ debut: s.depuis, fin: s.jusqua }));

/**
 * Décode d'avance les images que le rendu va poser : `<Img>` de Remotion retient
 * chaque image jusqu'à son décodage, et une image déjà décodée ne le fait pas
 * attendre.
 */
const decoderLesVisuels = async (visuels: Record<number, Record<number, string>>, illustrations: Record<string, string>) => {
    const urls = [...Object.values(visuels).flatMap(parScene => Object.values(parScene)), ...Object.values(illustrations)];
    await Promise.all(urls.map(async url => {
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => undefined);
    }));
};

/**
 * Le 04/10/2026, un export complet a échoué une fois sur une image de carte
 * restée « en chargement » 28 secondes, puis a réussi à l'identique : un hoquet
 * du chargement d'images de Remotion, pas un défaut de la scène. Une reprise,
 * et une seule — comme pour les appels IA (§5.2) : au-delà, c'est une panne, et
 * le message le dit.
 */
const estUnHoquetDeChargement = (e: unknown) => /delayRender\(\)/.test(String((e as any)?.message ?? e));

/**
 * Une minute sans une image de plus, c'est un rendu figé : Remotion abandonne
 * lui-même, au bout de trente secondes, une image qui tarde à se charger.
 */
const SANS_IMAGE_DEPUIS = 60_000;

export interface PanneauMontageProps {
    data: ReelExplique;
    /** Le contenu enregistré : les prises s'y rattachent. */
    contentId: string;
    /** L'état du montage chez Cloudflare. */
    montage: Montage;
    /** Les visuels des scènes : ce que l'aperçu montre, et ce qui se dépose en tête du studio. */
    visuels?: VisuelsReel | null;
    /** Vidéo directe sans script (§12.7) : le texte de référence vient de la transcription. */
    sansScript?: boolean;
    /** Le dernier export noté : la ligne de sortie le dit, et le bouton devient « Exporter à nouveau ». */
    dernierExport?: { format: string; version: string; le: number } | null;
    /** Ouvrir le tiroir de la prise à l'entrée : on vient la déposer, ou la remplacer. */
    priseOuverte?: boolean;
    /** Le titre du contenu : il nomme les fichiers exportés. */
    titre?: string;
}

const PanneauMontage: React.FC<PanneauMontageProps> = ({ data: brouillon, contentId, montage, visuels: visuelsDuReel = null, sansScript = false, dernierExport = null, priseOuverte = false, titre }) => {
    // Les fonds en deux temps (v2.30) : le storyboard, l'aperçu et l'export dessinent la même copie.
    const data = useMemo(() => enDeuxTemps(brouillon), [brouillon]);
    const visuelsDeLaScene = visuelsDuReel?.deLaScene ?? AUCUN_VISUEL;
    // Une vidéo directe (§12.7) n'a ni scène, ni repère, ni export de scènes seules.
    const animations = avecAnimations(data);
    const prises = usePrisesReel(contentId, data, montage);
    const [debit, setDebit] = useState(MOTS_PAR_MINUTE);
    const [format, setFormat] = useState<FormatVideo>('9:16');
    const [version, setVersion] = useState<Version>('organique');
    // La signature est là par défaut (v2.27) ; on la retire pour une vidéo qui en a déjà une.
    const [signature, setSignature] = useState(true);
    const [export_, setExport] = useState<{ cible: string; part: number } | null>(null);
    const [erreur, setErreur] = useState<string | null>(null);
    const annulation = useRef<AbortController | null>(null);
    const lecteur = useRef<PlayerRef>(null);

    const sequences = data.sequences ?? [];
    const visuels = useMemo(
        () => Object.fromEntries(sequences.map((_, i) => [i, visuelsDeLaScene(i)])) as ProprietesReel['visuels'],
        [sequences, visuelsDeLaScene],
    );
    const desIllustrations = visuelsDuReel?.desIllustrations ?? AUCUNE_ILLUSTRATION;
    const illustrations = useMemo(() => desIllustrations(), [desIllustrations]);

    // Une prise ne sert qu'une fois calée ET relue : sans son fichier, rien à montrer.
    const principale = prises.principale?.calage && prises.principale.url ? prises.principale : undefined;
    const accroche = prises.accroche?.calage && prises.accroche.url ? prises.accroche : undefined;
    const versionEffective: Version = version === 'publicite' && principale && accroche ? 'publicite' : 'organique';

    const estime = useMemo(() => sansVisageEclair(data, minuterReel(data, horlogeEstimee(debit))), [data, debit]);
    const calageBrut = useMemo<MinutageReel | null>(
        () => principale ? minuterReel(data, principale.calage!.horloge) : null,
        [data, principale],
    );
    const plan = useMemo(() => principale ? planDeMontage(
        data,
        { calage: principale.calage!, duree: principale.prise.duree },
        {
            reperes: principale.prise.reperes,
            coupes: principale.appliquees,
            accroche: versionEffective === 'publicite' && accroche ? { calage: accroche.calage!, duree: accroche.prise.duree } : null,
            coupesAccroche: accroche?.appliquees,
            retablis: passagesManuels(principale.prise.coupes).filter(m => !m.coupe),
            retablisAccroche: accroche ? passagesManuels(accroche.prise.coupes).filter(m => !m.coupe) : [],
        },
    ) : null, [data, principale, accroche, versionEffective]);

    // Les écrans dont les mots n'ont pas été dits : c'est eux qu'il faut vérifier (v2.30).
    const estimes = useMemo(
        () => prises.principale?.calage ? ecransEstimes(data, prises.principale.calage).length : 0,
        [data, prises.principale],
    );

    // Le rythme se juge sur ce qui sortira : la prise calée, ou à défaut le débit
    // estimé. Le cadre ne change plus aux phrases (v2.30) : rien à ajouter.
    const figes = useMemo(() => {
        if (plan) return momentsFiges(data, plan.minutage, plan.cadrages);
        return momentsFiges(data, estime, cadrer(data, estime, [], []));
    }, [data, plan, estime]);

    const cadre = CADRES[format];
    const reglageDe = (p?: { prise: { decalageSon?: number; rotation?: number } }) =>
        p ? { decalageSon: p.prise.decalageSon ?? 0, rotation: p.prise.rotation ?? 0 } : undefined;
    const finale: ProprietesFinale | null = plan && principale ? {
        data, plan, visuels, illustrations, format, signature,
        sources: { principale: principale.url, accroche: accroche?.url },
        reglages: { principale: reglageDe(principale), accroche: reglageDe(accroche) },
    } : null;
    const reel: ProprietesReel = { data, minutage: estime, visuels, illustrations, format };
    // Les scènes exportées seules suivent la prise quand il y en a une : elles
    // tomberont sur les mots dans Final Cut aussi.
    const minutageDesScenes: MinutageReel = plan?.minutage ?? estime;
    const indisponible = exportImpossible();
    const occupe = export_ !== null;

    /** Un rendu dans l'onglet, annoncé au bandeau, annulable, téléchargé à la fin. */
    const rendre = async (
        cible: string, libelle: string, nom: string,
        lancer: (signal: AbortSignal, avancer: (p: number) => void) => Promise<Blob>,
        apres?: () => void,
    ) => {
        setErreur(null);
        setExport({ cible, part: 0 });
        const controle = new AbortController();
        annulation.current = controle;
        const temoin = Activite.ouvrir({ label: libelle, part: 0 });
        // Remotion ne mène qu'un rendu à la fois : un rendu figé retient tous ceux qui suivent dans la page.
        const fige = new Error("il ne progresse plus depuis une minute. Rechargez la page pour le relancer : un nouvel export attendrait derrière celui-ci.");
        try {
            const blob = await sousVeille(async (signeDeVie) => {
                const avancer = (part: number) => {
                    signeDeVie();
                    setExport({ cible, part });
                    temoin.avancer({ part });
                };
                await chargerPolices();
                await preparerEncodage(cadre.largeur, cadre.hauteur);
                await decoderLesVisuels(visuels, illustrations);
                try {
                    return await lancer(controle.signal, avancer);
                } catch (e) {
                    if (controle.signal.aborted || !estUnHoquetDeChargement(e)) throw e;
                    temoin.avancer({ part: 0, etape: 'Nouvelle tentative' });
                    return await lancer(controle.signal, avancer);
                }
            }, controle, SANS_IMAGE_DEPUIS, fige);
            telecharger(blob, nom);
            temoin.fermer(true);
            apres?.();
        } catch (e: any) {
            temoin.fermer(false);
            // Annulé, il n'y a rien à dire ; figé, le dire est tout ce qui reste à faire.
            if (!controle.signal.aborted || controle.signal.reason === fige) setErreur(`${libelle} : échec — ${e?.message ?? String(e)}`);
        } finally {
            annulation.current = null;
            setExport(null);
        }
    };

    const exporterScene = (rang: number) => {
        const sequence = sequences[rang];
        const m = minutageDesScenes.sequences[rang];
        if (!sequence || !m) return;
        const entree: ProprietesScene = { sequence, apparitions: m.apparitions, visuels: visuels[rang], illustrations, format };
        void rendre(`scene-${rang}`, `Export de la scène ${rang + 1}`, nomDeScene(titre, rang + 1, sequence.role), async (signal, avancer) => {
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
        const nom = nomDeVideo(titre, format, versionEffective === 'publicite');
        void rendre('video', `Export de la vidéo ${format}${versionEffective === 'publicite' ? ' (publicité)' : ''}`, nom, async (signal, avancer) => {
            const { getBlob } = await renderMediaOnWeb({
                composition: {
                    id: 'reel',
                    component: CompositionFinale,
                    durationInFrames: dureeDuPlan(plan, signature),
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
        // Noter l'export ne doit jamais en gâcher un réussi : une note perdue est perdue.
        }, () => {
            void Api.noterExport(contentId, { format, version: versionEffective, duree: plan.duree + (signature ? CARTON_FINAL : 0) })
                // Noté, il change l'étape : « Exportée », et la Publication s'ouvre.
                .then(() => montage.recharger())
                .catch(() => undefined);
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
    const style = { width: PLAYER_LARGEUR, height: hauteur, borderRadius: 12, overflow: 'hidden' };

    // ── Le studio (SPEC §13.11, sans onglets depuis la v2.32) ──

    const calee = !!principale;
    const aProduire = animations ? visuelsAProduire(data) : 0;
    const deposes = animations ? sequences.reduce((n, _, i) => n + Object.keys(visuelsDeLaScene(i)).length, 0) + Object.keys(illustrations).length : 0;
    const manquent = Math.max(0, aProduire - deposes);
    const [tiroir, setTiroir] = useState(priseOuverte);
    useEffect(() => {
        if (!tiroir) return;
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setTiroir(false); };
        window.addEventListener('keydown', echap);
        return () => window.removeEventListener('keydown', echap);
    }, [tiroir]);

    /*
     * Écouter une version écartée : elle n'est pas dans la vidéo, l'aperçu ne
     * peut pas la jouer. Un lecteur hors de la page lit la prise brute, du
     * début du passage à sa fin, et se tait.
     */
    const ecoute = useRef<{ video: HTMLVideoElement; arret?: () => void } | null>(null);
    useEffect(() => () => {
        const e = ecoute.current;
        if (!e) return;
        e.video.pause();
        e.video.removeAttribute('src');
    }, []);
    const ecouterLaPrise = (url: string | undefined) => url ? (debut: number, fin: number) => {
        lecteur.current?.pause();
        const e = ecoute.current ?? (ecoute.current = { video: document.createElement('video') });
        const v = e.video;
        if (e.arret) v.removeEventListener('timeupdate', e.arret);
        if (v.getAttribute('src') !== url) v.src = url;
        v.currentTime = Math.max(0, debut - 0.1);
        const arret = () => {
            if (v.currentTime < fin + 0.15) return;
            v.pause();
            v.removeEventListener('timeupdate', arret);
        };
        e.arret = arret;
        v.addEventListener('timeupdate', arret);
        void v.play()?.catch(() => undefined);
    } : undefined;
    const ecouter = (s: number) => {
        ecoute.current?.video.pause();
        lecteur.current?.seekTo(enImages(s));
        lecteur.current?.play();
    };
    const aller = (s: number) => lecteur.current?.seekTo(enImages(s));

    const gardesPrincipale = useMemo(() => plan ? morceaux(plan, 'principale') : null, [plan]);
    const situerPrincipale = useCallback((t: number) => plan ? instantDansLaVideo(plan, 'principale', t) : null, [plan]);
    const situerAccroche = useCallback((t: number) => plan ? instantDansLaVideo(plan, 'accroche', t) : null, [plan]);
    // La séquence que la vidéo montre à un instant : c'est elle qui range les mots dans le texte.
    const sequenceDansLaVideo = useCallback((t: number) => {
        let derniere: number | null = null;
        for (const [i, s] of (plan?.minutage.sequences ?? []).entries()) {
            if (s.fin <= s.debut) continue;
            if (t < s.debut) return derniere ?? i;
            if (t < s.fin) return i;
            derniere = i;
        }
        return derniere;
    }, [plan]);

    /*
     * Les écrans posés dans le texte, là où ils apparaissent dans la prise : un
     * repère corrigé à la main l'emporte sur le calage. Ils remplacent la liste
     * des repères et ses « + − » au dixième de seconde, en temps de la prise,
     * que Florent ne comprenait pas (30/10/2026).
     */
    const ecransDuTexte = useMemo<EcranDansLeTexte[]>(() => {
        if (!calageBrut || !principale || !animations) return [];
        const reperes = principale.prise.reperes ?? {};
        const aVerifier = new Set(ecransEstimes(data, principale.calage!).map(e => `${e.sequence}:${e.element}`));
        return sequences.flatMap((s, i): EcranDansLeTexte[] => {
            const m = calageBrut.sequences[i];
            if (!m) return [];
            if (s.plan !== 'scene') {
                return s.coup && m.coup ? [{
                    sequence: i, element: -1, libelle: texteAffiche(s.coup.texte), instant: m.debut + m.coup.debut,
                    sombre: tempsDeLaSequence(data, i) === 'sombre', coup: true,
                }] : [];
            }
            return (s.elements ?? []).map((e, j) => {
                const corrige = reperes[`${i}:${j}`];
                const illustre = illustrationDe(e.visuel);
                return {
                    sequence: i,
                    element: j,
                    // Un schéma se nomme par ses mots, sans guillemets : le bandeau qui le déplace l'entoure des siens.
                    libelle: texteAffiche(e.texte) || (illustre ? `illustration ${illustre.illustration}` : visuelEnClair(e.visuel)?.replace(/^schéma : /, '').replace(/\s*»,\s*«\s*/g, ' · ').replace(/[«»]/g, '').replace(/\s+/g, ' ').trim()) || `Écran ${i + 1}.${j + 1}`,
                    instant: corrige ?? m.debut + (m.apparitions[j] ?? m.fin - m.debut),
                    sombre: e.ton !== 'lumiere',
                    manque: illustre ? !illustrations[illustre.illustration] : !!visuelDecrit(e.visuel)?.description && !visuelsDeLaScene(i)[j],
                    aVerifier: aVerifier.has(`${i}:${j}`),
                    corrige: corrige !== undefined,
                };
            });
        });
    }, [calageBrut, principale, animations, data, sequences, illustrations, visuelsDeLaScene]);

    const exportee = dernierExport;
    const resume = export_?.cible === 'video'
        ? null
        : exportee
            ? `Exportée le ${jourCourt(exportee.le)} · ${exportee.format} · ${exportee.version === 'publicite' ? 'publicité' : 'organique'}`
            : plan ? `${secondes(plan.duree)} gardées · ${format} · ${versionEffective === 'publicite' ? 'publicité' : 'organique'}` : null;
    const [scenesSeules, setScenesSeules] = useState(false);

    const aDesChoix = Object.keys(principale?.prise.coupes ?? {}).length > 0;

    const section = (titreSection: string, contenu: React.ReactNode) => (
        <div className="space-y-2 py-4 border-t border-brand-border dark:border-dark-sec-border">
            <Etiquette>{titreSection}</Etiquette>
            {contenu}
        </div>
    );

    /** Ce qui se fait une fois par prise : dans le studio avant qu'elle soit calée, dans un tiroir ensuite. */
    const contenuDeLaPrise = (dansLeTiroir: boolean) => (
        <div>
            <DepotPrise
                titre={dansLeTiroir ? 'Le fichier' : 'La prise'}
                consigne={sansScript
                    ? 'Déposez la prise telle que tournée (H.264 de préférence) : sa transcription servira de texte, ses hésitations et ses phrases reprises se coupent ici.'
                    : 'Déposez la prise telle que tournée (H.264 de préférence) : ses silences et ses phrases reprises se coupent ici, une fois le son transcrit. Elle est rangée chez Cloudflare.'}
                prise={prises.principale}
                enCours={prises.enCours.principale}
                erreur={prises.erreurs.principale}
                ecransEstimes={estimes}
                deposable={!prises.indisponible}
                onDeposer={(f) => void prises.deposer('principale', f)}
                onTranscrire={(moteur) => void prises.transcrire('principale', moteur)}
                onRetirer={() => void prises.retirer('principale')}
            />
            <div className="mt-4">
                {prises.principale?.prise.pretLe && section('Image et son', (
                    <ReglagesPrise
                        decalageSon={prises.principale.prise.decalageSon ?? 0}
                        rotation={(prises.principale.prise.rotation ?? 0) as 0 | 90 | 180 | 270}
                        largeur={prises.principale.prise.largeur}
                        hauteur={prises.principale.prise.hauteur}
                        onRegler={(r) => void prises.regler('principale', r)}
                        desactive={!!prises.enCours.principale}
                    />
                ))}
                {data.accroche_pub?.voix && section('Seconde accroche, pour la publicité', (
                    <div className="space-y-3">
                        <DepotPrise
                            titre="La seconde accroche"
                            consigne="Facultative : tournée à part, elle remplace la séquence 1 dans la version publicitaire."
                            prise={prises.accroche}
                            enCours={prises.enCours.accroche}
                            erreur={prises.erreurs.accroche}
                            deposable={!prises.indisponible && !!prises.principale}
                            onDeposer={(f) => void prises.deposer('accroche', f)}
                            onTranscrire={(moteur) => void prises.transcrire('accroche', moteur)}
                            onRetirer={() => void prises.retirer('accroche')}
                        />
                        {prises.accroche?.prise.pretLe && (
                            <ReglagesPrise
                                decalageSon={prises.accroche.prise.decalageSon ?? 0}
                                rotation={(prises.accroche.prise.rotation ?? 0) as 0 | 90 | 180 | 270}
                                largeur={prises.accroche.prise.largeur}
                                hauteur={prises.accroche.prise.hauteur}
                                onRegler={(r) => void prises.regler('accroche', r)}
                                desactive={!!prises.enCours.accroche}
                            />
                        )}
                    </div>
                ))}
                {animations && !plan && sequences.length > 0 && section('Débit, sans prise', (
                    <div className="space-y-1">
                        <label htmlFor="debit-reel" className="block text-xs text-brand-main dark:text-dark-text">
                            <span className="font-bold">{debit} mots par minute</span> — durée ≈ {secondes(estime.duree)}
                        </label>
                        <input id="debit-reel" type="range" min={DEBIT_MIN} max={DEBIT_MAX} step={5} value={debit}
                            onChange={e => setDebit(Number(e.target.value))} className="w-full accent-brand-main dark:accent-dark-text" />
                        <p className="text-xs text-brand-main/60 dark:text-dark-text/60">
                            Lisez le script à voix haute, chronométrez, et réglez le débit : l’aperçu et les scènes seules tomberont au bon rythme.
                        </p>
                    </div>
                ))}
                {section('Stockage', montage.etat && prises.indisponible
                    ? <p className="text-xs text-alerte">Le stockage Cloudflare (R2) n'est pas configuré sur le Worker : aucune prise ne peut être déposée.</p>
                    : montage.etat?.stockage.disponible && montage.etat.stockage.plafond > 0
                        ? <p className="text-xs text-brand-main/70 dark:text-dark-text/70">{poids(montage.etat.stockage.octets)} sur {poids(montage.etat.stockage.plafond)} gratuits, tous contenus confondus. Une prise retirée rend sa place.</p>
                        : <p className="text-xs text-brand-main/60 dark:text-dark-text/60">—</p>)}
            </div>
        </div>
    );

    return (
        <div className="h-full min-h-0 grid grid-cols-[440px_minmax(0,1fr)]">
            {/* La vidéo telle qu'elle sortira, sur une scène sombre dans les deux thèmes. */}
            <div className="min-h-0 overflow-y-auto bg-dark-bg flex flex-col items-center gap-4 px-6 py-6">
                {finale && plan ? (
                    <Player
                        key={`finale-${format}`}
                        ref={lecteur}
                        component={CompositionFinale}
                        inputProps={finale}
                        durationInFrames={dureeDuPlan(plan, signature)}
                        fps={FPS}
                        compositionWidth={cadre.largeur}
                        compositionHeight={cadre.hauteur}
                        style={style}
                        controls
                        acknowledgeRemotionLicense
                    />
                ) : animations ? (
                    // Sans prise, les scènes s'animent au débit estimé : on vérifie les visuels avant de tourner.
                    <Player
                        key={`estime-${format}`}
                        ref={lecteur}
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
                ) : (
                    <div style={{ width: PLAYER_LARGEUR, height: hauteur }} className="rounded-xl border border-dashed border-white/30 flex items-center justify-center p-6 text-center">
                        <p className="text-sm text-white/70">L’aperçu apparaîtra avec la prise.</p>
                    </div>
                )}

                <div className="flex flex-wrap justify-center gap-2">
                    <ControleSegmente<FormatVideo> libelle="Format" valeur={format} onChange={setFormat}
                        options={[{ valeur: '9:16', libelle: '9:16', titre: 'Reels, Shorts' }, { valeur: '4:5', libelle: '4:5', titre: 'Le fil de Meta' }]} />
                    <ControleSegmente<Version> libelle="Version" valeur={versionEffective} onChange={setVersion}
                        options={[
                            { valeur: 'organique', libelle: 'Organique' },
                            { valeur: 'publicite', libelle: 'Publicité', desactive: !(principale && accroche), titre: principale && accroche ? undefined : 'Déposez d’abord la seconde accroche, depuis « La prise »' },
                        ]} />
                    {finale && (
                        <ControleSegmente<'avec' | 'sans'> libelle="Signature" valeur={signature ? 'avec' : 'sans'} onChange={(v) => setSignature(v === 'avec')}
                            options={[
                                { valeur: 'avec', libelle: 'Signée', titre: 'Votre nom sur l’accroche, et luminose.fr à la fin' },
                                { valeur: 'sans', libelle: 'Sans' },
                            ]} />
                    )}
                </div>

                <div className="w-[306px] space-y-2">
                    {export_?.cible === 'video' ? (
                        <div className="space-y-2">
                            <Barre part={export_.part} libelle="Export" />
                            <p className="flex items-center justify-between text-xs text-white">
                                <span>Export · {Math.round(export_.part * 100)} %</span>
                                <button type="button" className="underline hover:no-underline" onClick={() => annulation.current?.abort()}>Annuler</button>
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={exporterVideo}
                            disabled={!finale || indisponible !== null || occupe}
                            className="w-full h-12 rounded-lg bg-white text-brand-main text-sm font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-light transition-colors disabled:opacity-40 [&_svg]:size-4"
                        >
                            <Download /> {exportee ? 'Exporter à nouveau' : 'Exporter la vidéo'}
                        </button>
                    )}
                    {!finale && <p className="text-xs text-center text-white/70">Il faut une prise calée pour exporter.</p>}
                    {manquent > 0 && (
                        <p className="text-xs text-center text-white/80">
                            {manquent === 1
                                ? '1 image manque : sans elle, l’écran garde son texte, ou reste vide s’il n’avait qu’elle.'
                                : `${manquent} images manquent : sans elles, un écran garde son texte, ou reste vide s’il n’avait que son image.`}
                        </p>
                    )}
                    {indisponible && <p className="text-xs text-center text-white/80">{indisponible}</p>}
                    {resume && <p className="text-xs text-center text-white/70">{resume}</p>}
                    {erreur && <p className="text-xs text-center text-erreur">{erreur}</p>}
                </div>

                {animations && (
                    <div className="w-[306px] space-y-2">
                        <button type="button" onClick={() => setScenesSeules(o => !o)} className="text-xs text-white/80 underline hover:no-underline">
                            Exporter les scènes seules
                        </button>
                        {scenesSeules && sequences.map((sequence, rang) => {
                            if (sequence.plan !== 'scene') return null;
                            const m = minutageDesScenes.sequences[rang];
                            return (
                                <div key={rang} className="space-y-1">
                                    <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                                        <span className="text-xs text-brand-main truncate">{rang + 1}. {sequence.role || 'Scène'} — {secondes(m.fin - m.debut)}</span>
                                        {boutonExport(`scene-${rang}`, () => exporterScene(rang))}
                                    </div>
                                    {progression(`scene-${rang}`)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Le texte tel qu'il sera entendu, et au-dessus ce qui reste à faire. */}
            <div className="relative min-h-0 flex flex-col bg-white dark:bg-dark-surface">
                <div className="h-[52px] shrink-0 flex items-center gap-3 px-7 border-b border-brand-border dark:border-dark-sec-border">
                    {plan && principale ? (
                        <>
                            <span className="text-lg font-bold tabular-nums text-brand-main dark:text-white">{minutes(plan.duree)}</span>
                            <span className="text-sm text-brand-main/80 dark:text-dark-text/80">gardées sur {minutes(principale.prise.duree)} de prise</span>
                        </>
                    ) : (
                        <span className="text-sm font-semibold text-brand-main dark:text-white">{sansScript || !animations ? 'La prise' : 'Avant le tournage'}</span>
                    )}
                    {calee && (
                        <div className="ml-auto flex items-center gap-2">
                            <Bouton taille="petit" intention="discrete" disabled={!aDesChoix} onClick={() => void prises.reinitialiser('principale')}
                                title={aDesChoix ? 'Oublier vos coupes et vos choix de version : la prise revient au montage proposé' : 'Rien à défaire : c’est le montage proposé.'}>
                                Revenir au montage proposé
                            </Bouton>
                            <Bouton taille="petit" intention="secondaire" aria-expanded={tiroir} onClick={() => setTiroir(o => !o)}>
                                <Film /> La prise <Etiquette as="span" forme="pastille" ton="succes">calée</Etiquette>
                            </Bouton>
                        </div>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-7 space-y-6">
                    <AvantDExporter data={data} animations={animations} visuels={visuelsDuReel} manquent={manquent}
                        figes={calee ? figes : []} estimes={calee ? estimes : 0} onAller={aller} />

                    {principale?.calage && plan ? (
                        <>
                            <MontageTexte
                                sequences={sequences.map((s, i) => ({ repere: `${i + 1} · ${s.role}`, mots: compterMots(s.voix) }))}
                                calage={principale.calage}
                                coupes={principale.coupes}
                                appliquees={principale.appliquees}
                                gardes={gardesPrincipale}
                                choix={principale.prise.coupes ?? {}}
                                situer={situerPrincipale}
                                sequenceDansLaVideo={sequenceDansLaVideo}
                                ecrans={ecransDuTexte}
                                onAller={aller}
                                onEcouter={ecouter}
                                onEcouterLaPrise={ecouterLaPrise(principale.url)}
                                onTrancher={(d) => void prises.trancher('principale', d)}
                                onTrancherPassage={(passage, coupe) => void prises.trancherPassage('principale', passage, coupe)}
                                onChoisirVersion={(phrase, debut) => void prises.choisirVersion('principale', phrase, debut)}
                                onPlacerEcran={(i, j, t) => void prises.corrigerRepere(i, j, t)}
                            />
                            {accroche?.calage && (
                                <MontageTexte
                                    titre="Seconde accroche"
                                    sequences={[{ repere: 'Accroche publicité', mots: compterMots(data.accroche_pub?.voix) }]}
                                    calage={accroche.calage}
                                    coupes={accroche.coupes}
                                    appliquees={accroche.appliquees}
                                    gardes={versionEffective === 'publicite' ? morceaux(plan, 'accroche') : null}
                                    choix={accroche.prise.coupes ?? {}}
                                    situer={situerAccroche}
                                    onAller={aller}
                                    onEcouter={ecouter}
                                    onEcouterLaPrise={ecouterLaPrise(accroche.url)}
                                    onTrancher={(d) => void prises.trancher('accroche', d)}
                                    onTrancherPassage={(passage, coupe) => void prises.trancherPassage('accroche', passage, coupe)}
                                    onChoisirVersion={(phrase, debut) => void prises.choisirVersion('accroche', phrase, debut)}
                                    onReinitialiser={() => void prises.reinitialiser('accroche')}
                                />
                            )}
                        </>
                    ) : contenuDeLaPrise(false)}
                </div>

                {tiroir && calee && (
                    <aside aria-label="La prise" className="absolute inset-y-0 right-0 z-20 w-[440px] max-w-full flex flex-col bg-white dark:bg-dark-surface border-l border-brand-border dark:border-dark-sec-border shadow-lg">
                        <div className="h-[60px] shrink-0 flex items-center gap-2 px-5 border-b border-brand-border dark:border-dark-sec-border">
                            <Film className="size-4 text-brand-main dark:text-dark-text" />
                            <span className="flex-1 text-sm font-bold text-brand-main dark:text-white">La prise</span>
                            <Bouton taille="grand" intention="discrete" className="w-10 px-0 no-underline" aria-label="Fermer le tiroir de la prise" onClick={() => setTiroir(false)}>
                                <X />
                            </Bouton>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{contenuDeLaPrise(true)}</div>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default PanneauMontage;
