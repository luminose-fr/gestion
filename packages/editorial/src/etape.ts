/**
 * Où en est un contenu (SPEC §13.1) : une étape CALCULÉE, jamais stockée.
 *
 * Les quatre statuts — Idée, Brouillon, Prêt, Publié — restent en base, mais
 * « Brouillon » couvrait sept situations : un atelier à peine ouvert comme un
 * script prêt à tourner. L'étape se lit dans ce qui existe déjà — la session
 * Coach, le brouillon, le journal des productions, les slides, le résumé des
 * montages, la date —, et un seul calcul la sert partout : listes, sélecteur
 * d'étape, règle d'arrivée. Ils ne peuvent plus se contredire.
 *
 * Aucun format n'est nommé ici : le registre dit ce que chacun produit
 * (`rendu`, `versMontage`, `animee`, `controler`, `supportsColdRead`).
 */
import { getFormatDef, montageDuBrouillon, parseBodyJson, supportsColdRead } from './formats';
import type { TargetFormat } from './domain';
import type { ReelExplique } from './reelExplique';

export type StatutContenu = 'Idée' | 'Brouillon' | 'Prêt' | 'Publié';

export type Etape = 'ouverture' | 'atelier' | 'brouillon' | 'slides' | 'script' | 'tournage' | 'montage' | 'publication';

export const ETAPES: readonly Etape[] = ['ouverture', 'atelier', 'brouillon', 'slides', 'script', 'tournage', 'montage', 'publication'];

export const estEtape = (valeur: unknown): valeur is Etape => ETAPES.includes(valeur as Etape);

/** Ce que le contenu produit, et donc le fil d'étapes qu'il suit (SPEC §13.2). */
export type Sorte = 'ecrit' | 'carrousel' | 'video' | 'video-sans-script';

/** Le geste qui attend : c'est le filtre des listes. */
export type Geste = 'ecrire' | 'tourner' | 'monter' | 'publier' | 'publie';

/** Ce que le calcul lit d'un contenu — la forme de la liste, rien de plus. */
export interface ContenuPourEtape {
    status: StatutContenu | string;
    targetFormat: string | null;
    draft: string | null;
    slides: string | null;
    analyzedAt: number | null;
    serieId: string | null;
    seriePosition: number | null;
    scheduledDate: string | null;
    coachStatus: string | null;
}

/** La conversation Coach, comptée : la liste ne porte pas les messages (SPEC §3.2). */
export interface SessionPourEtape {
    messages: number;
    /** Les réponses du Coach : un tour, c'est une question posée. */
    tours: number;
}

/** La dernière relecture à froid du journal (SPEC §2.6). */
export interface RelecturePourEtape {
    verdict: string | null;
    /** Problèmes relevés et contrôles en échec : ce qui reste à reprendre. */
    points: number;
    le: number;
}

/** Le résumé du montage d'un contenu — la forme de `GET /api/montage`. */
export interface MontagePourEtape {
    prises: Array<{ role: string; pret: boolean; transcrite: boolean }>;
    visuels: number;
    dernierExport: { format: string; version: string; le: number } | null;
}

/**
 * Ce qui se passe en ce moment dans l'onglet : un envoi, une transcription, un
 * export. Rien de cela n'est en base — c'est le navigateur qui travaille.
 */
export interface EnCoursPourEtape {
    /** Pourcentage de l'envoi de la prise. */
    envoi?: number | null;
    transcription?: boolean;
    /** Pourcentage de l'export. */
    export?: number | null;
}

export interface EntreeEtape {
    contenu: ContenuPourEtape;
    session?: SessionPourEtape | null;
    relecture?: RelecturePourEtape | null;
    /**
     * Quand le brouillon a été produit pour la dernière fois (rédaction ou
     * ajustement, au journal). Une relecture plus ancienne jugeait un autre
     * texte. `null` : un brouillon d'avant le journal, que toute relecture vise.
     */
    brouillonLe?: number | null;
    montage?: MontagePourEtape | null;
    enCours?: EnCoursPourEtape | null;
    /** L'instant présent, pour situer une date de publication. */
    maintenant?: number;
}

export type SegmentDeProgression = 'fait' | 'encours' | 'avenir';

export interface EtapeCourante {
    sorte: Sorte;
    /** L'étape où le contenu s'ouvre, d'où qu'on vienne (SPEC §13.4). */
    etape: Etape;
    /** Ce que les listes affichent, mot pour mot (SPEC §13.3). */
    libelle: string;
    geste: Geste;
    progression: { segments: SegmentDeProgression[]; complet: boolean };
}

// ── La sorte et son fil ──────────────────────────────────────────────

const lireBrouillon = (draft: string | null): any | null => (draft ? parseBodyJson(draft) : null);

/** Le montage que le brouillon décrit, quand le format se monte. */
const montageDe = (contenu: ContenuPourEtape): ReelExplique | null => {
    const data = lireBrouillon(contenu.draft);
    return data ? montageDuBrouillon(data, contenu.targetFormat) : null;
};

/**
 * La sorte d'un contenu. Une vidéo dont le brouillon n'a aucune séquence est
 * une vidéo directe sans script (SPEC §12.7) : sa transcription servira de
 * texte. Une vidéo sans brouillon du tout, elle, n'est pas encore écrite.
 */
export function sorteDuContenu(contenu: Pick<ContenuPourEtape, 'targetFormat' | 'draft'>): Sorte {
    const def = getFormatDef(contenu.targetFormat);
    if (def?.versMontage) {
        const data = lireBrouillon(contenu.draft);
        const montage = data ? montageDuBrouillon(data, contenu.targetFormat) : null;
        return montage && montage.sequences.length === 0 ? 'video-sans-script' : 'video';
    }
    return def?.rendu === 'slides' ? 'carrousel' : 'ecrit';
}

/** Les étapes que le sélecteur propose, dans l'ordre du travail (SPEC §13.2). */
export function etapesDuFil(sorte: Sorte): Etape[] {
    switch (sorte) {
        case 'carrousel': return ['ouverture', 'atelier', 'brouillon', 'slides', 'publication'];
        case 'video': return ['ouverture', 'atelier', 'script', 'tournage', 'montage', 'publication'];
        case 'video-sans-script': return ['montage', 'publication'];
        default: return ['ouverture', 'atelier', 'brouillon', 'publication'];
    }
}

/** L'étape d'écriture : là où le brouillon se lit. */
export function etapeDEcriture(sorte: Sorte): Etape {
    return sorte === 'video' || sorte === 'video-sans-script' ? 'script' : 'brouillon';
}

// ── Les dates ────────────────────────────────────────────────────────

const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** « 12 oct. » */
export const jourCourt = (ms: number): string => JOUR_COURT.format(new Date(ms));

/** Une date de publication, `AAAA-MM-JJ` ou ISO ; `null` si illisible. */
const instantDePublication = (date: string | null): number | null => {
    if (!date) return null;
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date);
    return Number.isFinite(ms) ? ms : null;
};

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ── Le calcul ────────────────────────────────────────────────────────

const estPret = (status: string) => status === 'Prêt' || status === 'Publié';

/** La relecture vise-t-elle le brouillon d'aujourd'hui ? Plus ancienne, elle jugeait un autre texte. */
const relectureCourante = (relecture: RelecturePourEtape | null | undefined, brouillonLe: number | null | undefined) =>
    relecture && (brouillonLe === null || brouillonLe === undefined || relecture.le >= brouillonLe) ? relecture : null;

const estPubliable = (relecture: RelecturePourEtape | null) => relecture?.verdict === 'Publiable';

/** Les visuels que les scènes réclament, qu'il faut produire et déposer. */
export const visuelsAProduire = (reel: ReelExplique | null | undefined): number =>
    (reel?.sequences ?? []).reduce((n, s) => n + (s.elements ?? []).filter(e => e.visuel?.description).length, 0);

/** Les segments de la barre : tout ce qui précède la dernière condition remplie est fait. */
function segmentsDe(conditions: boolean[], publie: boolean): { segments: SegmentDeProgression[]; complet: boolean } {
    const dernier = publie ? conditions.length - 1 : conditions.lastIndexOf(true);
    const segments = conditions.map((_, i): SegmentDeProgression => (i <= dernier ? 'fait' : i === dernier + 1 ? 'encours' : 'avenir'));
    return { segments, complet: dernier === conditions.length - 1 };
}

/** Ce que disent les listes avant le brouillon, quelle que soit la sorte. */
function libelleAvantBrouillon(contenu: ContenuPourEtape, session: SessionPourEtape | null | undefined): string {
    if (contenu.status === 'Idée') return contenu.analyzedAt ? 'Préparée' : 'À préparer';
    // Une session validée sans brouillon : la rédaction qui suit « Go » a échoué.
    if (contenu.coachStatus === 'validated') return 'Rédaction à relancer';
    if (session && session.messages > 0) return `Atelier · ${pluriel(Math.max(session.tours, 1), 'tour')}`;
    // Préparée par l'Analyste, ou posée par le plan de série — l'Éclateur est l'Analyste de sa série.
    if (contenu.analyzedAt || (contenu.serieId && contenu.seriePosition !== null)) return 'À ouvrir · préparée';
    return 'À ouvrir';
}

function libelleDePublication(contenu: ContenuPourEtape, maintenant: number): string {
    const le = instantDePublication(contenu.scheduledDate);
    if (le === null) return 'Publié';
    return le > maintenant ? `Programmé le ${jourCourt(le)}` : `Publié le ${jourCourt(le)}`;
}

export function etapeCourante(entree: EntreeEtape): EtapeCourante {
    const { contenu, session, montage, enCours } = entree;
    const maintenant = entree.maintenant ?? Date.now();
    const sorte = sorteDuContenu(contenu);
    const publie = contenu.status === 'Publié';
    const pret = estPret(contenu.status);
    const aUnBrouillon = !!contenu.draft?.trim();
    const aDesSlides = !!contenu.slides?.trim();
    const ouvert = (session?.messages ?? 0) > 0 || aUnBrouillon;
    const atelierValide = contenu.coachStatus === 'validated' || aUnBrouillon;
    const sansSession = (session?.messages ?? 0) === 0 && !contenu.coachStatus;

    if (sorte === 'video' || sorte === 'video-sans-script') {
        const principale = montage?.prises.find(p => p.role === 'principale') ?? null;
        const exportee = !!montage?.dernierExport;
        const reel = montageDe(contenu);
        const manquants = Math.max(0, visuelsAProduire(reel) - (montage?.visuels ?? 0));
        const corrections = aUnBrouillon ? (getFormatDef(contenu.targetFormat)?.controler?.(lireBrouillon(contenu.draft)) ?? []).length : 0;

        const libelle = (() => {
            if (publie) return libelleDePublication(contenu, maintenant);
            if (enCours?.export != null) return `Export en cours · ${Math.round(enCours.export)} %`;
            if (montage?.dernierExport) return `Exportée le ${jourCourt(montage.dernierExport.le)} · ${montage.dernierExport.format}`;
            if (enCours?.envoi != null) return `Envoi de la prise · ${Math.round(enCours.envoi)} %`;
            if (enCours?.transcription) return 'Transcription en cours';
            if (principale && !principale.pret) return 'Envoi interrompu · à redéposer';
            if (principale && !principale.transcrite) return 'Prise déposée · à transcrire';
            if (principale) return manquants > 0 ? `Montage · ${pluriel(manquants, 'visuel')} à déposer` : 'Montage · prête à exporter';
            if (sorte === 'video-sans-script') return 'Montage · déposez la prise';
            if (pret) return 'Prête à tourner';
            if (corrections > 0) return `Script · ${pluriel(corrections, 'point')} à corriger`;
            if (aUnBrouillon) return 'Script écrit';
            return libelleAvantBrouillon(contenu, session);
        })();

        const etape: Etape =
            publie || exportee ? 'publication'
            : principale || sorte === 'video-sans-script' ? 'montage'
            : pret ? 'tournage'
            : aUnBrouillon ? 'script'
            : sansSession ? 'ouverture'
            : 'atelier';

        const geste: Geste =
            publie ? 'publie'
            : exportee ? 'publier'
            : principale || sorte === 'video-sans-script' ? 'monter'
            : pret ? 'tourner'
            : 'ecrire';

        const progression = sorte === 'video-sans-script'
            ? segmentsDe([!!principale?.transcrite, exportee], publie)
            : segmentsDe([ouvert, atelierValide, pret || !!principale || exportee, !!principale, exportee], publie);

        return { sorte, etape, libelle, geste, progression };
    }

    const relecture = relectureCourante(entree.relecture, entree.brouillonLe);
    const relisible = supportsColdRead(contenu.targetFormat as TargetFormat | null);

    const libelle = (() => {
        if (publie) return libelleDePublication(contenu, maintenant);
        if (pret) return 'Bon à publier';
        if (sorte === 'carrousel' && aDesSlides) return 'Slides prêtes';
        if (sorte === 'carrousel' && estPubliable(relecture)) return 'Relu : Publiable · slides à produire';
        if (relecture) return estPubliable(relecture)
            ? 'Brouillon · relu : Publiable'
            : `Brouillon · relu : ${pluriel(Math.max(relecture.points, 1), 'point')}`;
        // Les formats longs ne sont pas relus à froid (décision du 26/08/2026) :
        // « pas encore relu » y promettrait une relecture qui ne viendra pas.
        if (aUnBrouillon) return relisible ? 'Brouillon · pas encore relu' : 'Brouillon écrit';
        return libelleAvantBrouillon(contenu, session);
    })();

    const etape: Etape =
        publie || pret ? 'publication'
        : aUnBrouillon ? (sorte === 'carrousel' && aDesSlides ? 'slides' : 'brouillon')
        : sansSession ? 'ouverture'
        : 'atelier';

    const geste: Geste = publie ? 'publie' : pret ? 'publier' : 'ecrire';

    // Le segment « relu » n'existe que là où la relecture existe.
    const relu = estPubliable(relecture) || pret;
    const conditions = [ouvert, atelierValide, aUnBrouillon, ...(relisible ? [relu] : []),
        ...(sorte === 'carrousel' ? [aDesSlides || pret] : []), pret];

    return { sorte, etape, libelle, geste, progression: segmentsDe(conditions, publie) };
}
