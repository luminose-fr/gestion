/**
 * Le Reel expliqué — une prise face caméra, recouverte par moments de scènes
 * animées écrites par le Rédacteur (SPEC §12).
 *
 * Ce module porte la FORME du brouillon et ce qui s'y compte. Il ne dessine
 * rien : le storyboard et, plus tard, la composition Remotion lisent ces
 * fonctions-là, et c'est ce qui garantit qu'un repère jugé introuvable ici l'est
 * aussi à l'écran.
 */

// ── La forme ─────────────────────────────────────────────────────────

export type PlanReel = 'camera' | 'scene';
export type TypeElement = 'carte' | 'pastille' | 'liaison';
export type TonElement = 'ombre' | 'lumiere' | 'neutre';
export type TailleCarte = 'petite' | 'moyenne' | 'grande';
export type RegistreScene = 'pedagogie' | 'humour';
export type NatureVisuel = 'illustration' | 'schema';

export interface VisuelCarte {
    nature: NatureVisuel;
    /** Ce que l'image montre, en français. Florent la produit : ce n'est pas un prompt. */
    description: string;
}

export interface ElementScene {
    type: TypeElement;
    texte?: string | null;
    detail?: string | null;
    ton?: TonElement;
    taille?: TailleCarte;
    visuel?: VisuelCarte | null;
    /** Les mots de la voix sur lesquels l'élément apparaît, recopiés à l'identique. */
    apparait_sur: string;
}

export interface SequenceReel {
    plan: PlanReel;
    role: string;
    /** Tout ce qui se dit pendant la séquence, scène comprise. */
    voix: string;
    intention?: string | null;
    titre?: string | null;
    registre?: RegistreScene;
    elements?: ElementScene[];
}

export interface ReelExplique {
    format: string;
    sequences: SequenceReel[];
    accroche_pub?: { voix: string; intention?: string | null } | null;
    legende?: { texte?: string; cta?: string; hashtags?: string[] } | null;
}

/**
 * Reconnaît un brouillon de Reel expliqué à sa STRUCTURE, pas à son format :
 * l'écran choisit son rendu sur ce qu'il a sous les yeux, sans comparer de
 * format en dur (règle n°3 du CLAUDE.md).
 */
export const estReelExplique = (data: unknown): data is ReelExplique =>
    !!data && typeof data === 'object' && Array.isArray((data as any).sequences);

// ── Les limites — NORMATIF (SPEC §12.3) ─────────────────────────────

export const LIMITES_REEL = {
    titre: 32,
    carte: 30,
    detail: 45,
    pastille: 30,
    liaison: 10,
    elementsParScene: 4,
    scenesMin: 2,
    scenesMax: 4,
    accrocheMots: 15,
    dureeMinSecondes: 45,
    dureeMaxSecondes: 90,
} as const;

/**
 * Débit de lecture retenu pour ESTIMER la durée avant le tournage. Le français
 * parlé tourne autour de 150 mots par minute ; la prise donnera le vrai débit
 * (SPEC §12.5). L'estimation sert à savoir si le script tient, pas à caler.
 */
export const MOTS_PAR_MINUTE = 150;

// ── Le surlignage ────────────────────────────────────────────────────

export interface Segment { texte: string; surligne: boolean }

/**
 * Découpe un texte d'écran en segments, le passage entre crochets étant
 * surligné. Le gras markdown est accepté aussi : un modèle y revient par
 * habitude, et refuser sa réponse pour ça coûterait un appel.
 */
export function segmentsSurlignes(texte: string | null | undefined): Segment[] {
    if (!texte) return [];
    const segments: Segment[] = [];
    const motif = /\[([^\]]+)\]|\*\*([^*]+)\*\*/g;
    let curseur = 0;
    for (const m of texte.matchAll(motif)) {
        const debut = m.index ?? 0;
        if (debut > curseur) segments.push({ texte: texte.slice(curseur, debut), surligne: false });
        segments.push({ texte: m[1] ?? m[2], surligne: true });
        curseur = debut + m[0].length;
    }
    if (curseur < texte.length) segments.push({ texte: texte.slice(curseur), surligne: false });
    return segments;
}

/** Le texte tel qu'il s'affiche : c'est lui qui se mesure, pas ses crochets. */
export const texteAffiche = (texte: string | null | undefined): string =>
    segmentsSurlignes(texte).map(s => s.texte).join('').trim();

// ── Les mots ─────────────────────────────────────────────────────────

export interface MotSitue {
    /** Le mot normalisé : minuscules, sans accents, ligatures dépliées. */
    mot: string;
    /** Son empan dans le texte d'origine, pour le souligner à l'écran. */
    debut: number;
    fin: number;
}

/**
 * Les mots d'un texte, chacun à sa place. Un mot est une suite de lettres et de
 * chiffres — accents combinés compris, sans quoi un texte décomposé (NFD, comme
 * un nom de fichier macOS) couperait « évident » en deux : l'apostrophe, le trait d'union et le point séparent (« l'ombre » →
 * « l », « ombre » ; « luminose.fr » → « luminose », « fr »).
 *
 * C'est la même découpe qui servira à aligner les repères sur la transcription
 * de la prise (SPEC §12.5) : un repère trouvé ici doit l'être là-bas, et un mot
 * souligné à l'écran doit être celui que le contrôle a trouvé.
 */
export function motsSitues(texte: string | null | undefined): MotSitue[] {
    if (!texte) return [];
    const mots: MotSitue[] = [];
    for (const m of texte.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
        const mot = m[0]
            .toLowerCase()
            .replace(/œ/g, 'oe')
            .replace(/æ/g, 'ae')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
        if (!mot) continue;
        const debut = m.index ?? 0;
        mots.push({ mot, debut, fin: debut + m[0].length });
    }
    return mots;
}

/** Les mots seuls, sans leur place : ce qui se compare. */
export const motsNormalises = (texte: string | null | undefined): string[] =>
    motsSitues(texte).map(m => m.mot);

/** Position du repère dans la voix, à partir de `depuis` — ou -1. */
export function trouverRepere(voix: string[], repere: string[], depuis = 0): number {
    if (repere.length === 0) return -1;
    for (let i = Math.max(0, depuis); i + repere.length <= voix.length; i++) {
        let egal = true;
        for (let j = 0; j < repere.length; j++) {
            if (voix[i + j] !== repere[j]) { egal = false; break; }
        }
        if (egal) return i;
    }
    return -1;
}

/**
 * Où chaque élément d'une scène apparaît, en rang de mot dans sa voix — `null`
 * quand le repère est introuvable. Les repères se cherchent dans l'ordre : un
 * élément ne peut pas apparaître avant celui qui le précède à l'écran.
 */
export function positionsDesReperes(sequence: SequenceReel): Array<number | null> {
    const voix = motsNormalises(sequence.voix);
    let depuis = 0;
    return (sequence.elements ?? []).map(element => {
        const position = trouverRepere(voix, motsNormalises(element.apparait_sur), depuis);
        if (position === -1) return null;
        depuis = position;
        return position;
    });
}

export const compterMots = (texte: string | null | undefined): number => motsNormalises(texte).length;

/** Durée estimée de la voix entière, en secondes, au débit de `MOTS_PAR_MINUTE`. */
export function dureeEstimee(data: ReelExplique): number {
    const mots = (data.sequences ?? []).reduce((total, s) => total + compterMots(s.voix), 0);
    return Math.round((mots / MOTS_PAR_MINUTE) * 60);
}

// ── Les contrôles — NORMATIF (SPEC §12.3) ───────────────────────────

export interface ProblemeReel {
    /** « séquence 3 », « séquence 3, élément 2 », « seconde accroche »… */
    ou: string;
    probleme: string;
}

const LIMITE_PAR_TYPE: Record<TypeElement, number> = {
    carte: LIMITES_REEL.carte,
    pastille: LIMITES_REEL.pastille,
    liaison: LIMITES_REEL.liaison,
};

const trop = (texte: string, max: number) =>
    `${texte.length} caractères (max ${max}) : « ${texte} »`;

/**
 * Ce qui se compte dans un Reel expliqué, sans appel réseau. Une liste vide
 * veut dire que le script tient — pas qu'il est bon : ça, c'est le Lecteur
 * froid qui le dit.
 */
export function verifierReelExplique(data: unknown): ProblemeReel[] {
    if (!estReelExplique(data) || data.sequences.length === 0) {
        return [{ ou: 'script', probleme: 'aucune séquence : le champ "sequences" est vide ou absent' }];
    }

    const problemes: ProblemeReel[] = [];
    const sequences = data.sequences;

    if (sequences[0]?.plan !== 'camera') {
        problemes.push({ ou: 'séquence 1', probleme: 'la vidéo doit s\'ouvrir face caméra (plan "camera")' });
    } else if (compterMots(sequences[0].voix) > LIMITES_REEL.accrocheMots) {
        problemes.push({ ou: 'séquence 1', probleme: `l'accroche fait ${compterMots(sequences[0].voix)} mots (max ${LIMITES_REEL.accrocheMots})` });
    }
    if (sequences[sequences.length - 1]?.plan !== 'camera') {
        problemes.push({ ou: `séquence ${sequences.length}`, probleme: 'la vidéo doit se fermer face caméra (plan "camera")' });
    }

    const nbScenes = sequences.filter(s => s.plan === 'scene').length;
    if (nbScenes < LIMITES_REEL.scenesMin || nbScenes > LIMITES_REEL.scenesMax) {
        problemes.push({ ou: 'script', probleme: `${nbScenes} scène(s) (attendu : ${LIMITES_REEL.scenesMin} à ${LIMITES_REEL.scenesMax})` });
    }

    sequences.forEach((sequence, i) => {
        const ou = `séquence ${i + 1}`;
        if (sequence.plan !== 'camera' && sequence.plan !== 'scene') {
            problemes.push({ ou, probleme: `plan inconnu « ${String(sequence.plan)} » (attendu : "camera" ou "scene")` });
            return;
        }
        if (!sequence.voix?.trim()) problemes.push({ ou, probleme: 'voix vide : chaque séquence se dit' });
        if (sequence.plan !== 'scene') return;

        const titre = texteAffiche(sequence.titre);
        if (!titre) problemes.push({ ou, probleme: 'scène sans titre' });
        else if (titre.length > LIMITES_REEL.titre) problemes.push({ ou: `${ou}, titre`, probleme: trop(titre, LIMITES_REEL.titre) });

        const elements = sequence.elements ?? [];
        if (elements.length === 0 || elements.length > LIMITES_REEL.elementsParScene) {
            problemes.push({ ou, probleme: `${elements.length} élément(s) (attendu : 1 à ${LIMITES_REEL.elementsParScene})` });
        }
        if (elements.filter(e => e.taille === 'grande').length > 1) {
            problemes.push({ ou, probleme: 'plus d\'une grande carte : le cadre vertical n\'en tient qu\'une' });
        }

        const positions = positionsDesReperes(sequence);
        elements.forEach((element, j) => {
            const ouElement = `${ou}, élément ${j + 1}`;
            const max = LIMITE_PAR_TYPE[element.type];
            if (max === undefined) {
                problemes.push({ ou: ouElement, probleme: `type inconnu « ${String(element.type)} » (attendu : carte, pastille ou liaison)` });
                return;
            }
            const texte = texteAffiche(element.texte);
            const visuel = element.type === 'carte' && element.visuel ? element.visuel : null;
            if (!texte && !visuel) problemes.push({ ou: ouElement, probleme: 'élément vide : ni texte ni visuel' });
            if (texte.length > max) problemes.push({ ou: ouElement, probleme: trop(texte, max) });
            const detail = texteAffiche(element.detail);
            if (detail.length > LIMITES_REEL.detail) problemes.push({ ou: `${ouElement}, détail`, probleme: trop(detail, LIMITES_REEL.detail) });
            if (visuel && !visuel.description?.trim()) problemes.push({ ou: ouElement, probleme: 'visuel sans description : Florent ne saura pas quoi produire' });

            if (!element.apparait_sur?.trim()) {
                problemes.push({ ou: ouElement, probleme: 'repère "apparait_sur" absent : l\'élément n\'a pas de moment où apparaître' });
            } else if (positions[j] === null) {
                problemes.push({ ou: ouElement, probleme: `repère « ${element.apparait_sur} » introuvable dans la voix de la séquence (ou placé avant le repère précédent) — il doit en être recopié à l'identique` });
            }
        });
    });

    if (!data.accroche_pub?.voix?.trim()) {
        problemes.push({ ou: 'seconde accroche', probleme: '"accroche_pub" absente : la variante publicitaire n\'aura pas d\'ouverture' });
    }

    const duree = dureeEstimee(data);
    if (duree < LIMITES_REEL.dureeMinSecondes || duree > LIMITES_REEL.dureeMaxSecondes) {
        problemes.push({ ou: 'script', probleme: `durée estimée ${duree} s (attendu : ${LIMITES_REEL.dureeMinSecondes} à ${LIMITES_REEL.dureeMaxSecondes} s, à ${MOTS_PAR_MINUTE} mots par minute)` });
    }

    return problemes;
}

// ── Les lectures en texte ────────────────────────────────────────────

const t = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** La voix entière, puis la légende : ce qu'on cherche et ce qu'on prévisualise. */
export function reelToPlainText(data: ReelExplique): string {
    const out: string[] = (data.sequences ?? []).map(s => t(s.voix));
    if (data.legende?.texte) out.push(t(data.legende.texte));
    if (data.legende?.cta) out.push(t(data.legende.cta));
    return out.filter(Boolean).join(' ');
}

const decrireElement = (e: ElementScene): string => {
    const nature = e.type === 'carte' ? 'Carte' : e.type === 'pastille' ? 'Pastille' : 'Liaison';
    const qualites = [e.taille, e.ton].filter(Boolean).join(', ');
    const parties = [t(e.texte), t(e.detail)].filter(Boolean).join(' — ');
    const visuel = e.visuel?.description ? ` [${e.visuel.nature === 'schema' ? 'schéma' : 'illustration'} : ${t(e.visuel.description)}]` : '';
    const repere = t(e.apparait_sur) ? ` — apparaît sur « ${t(e.apparait_sur)} »` : '';
    return `- ${nature}${qualites ? ` (${qualites})` : ''} : ${parties || '(sans texte)'}${visuel}${repere}`;
};

/**
 * Le script lisible : ce qui se dit ET ce qui s'affiche. C'est ce que reçoit le
 * Lecteur froid — il doit voir l'écran pour juger qu'il ne recopie pas la voix.
 */
export function reelToMarkdown(data: ReelExplique): string {
    const out: string[] = [];
    (data.sequences ?? []).forEach((s, i) => {
        const plan = s.plan === 'scene' ? 'Scène' : 'Face caméra';
        const registre = s.plan === 'scene' && s.registre ? ` (${s.registre === 'humour' ? 'humour' : 'pédagogie'})` : '';
        out.push(`**Séquence ${i + 1} — ${plan} — ${t(s.role)}${registre}**\n${t(s.voix)}`);
        if (s.plan === 'scene') {
            const ecran = [`Écran — titre : ${t(s.titre)}`, ...(s.elements ?? []).map(decrireElement)];
            out.push(ecran.join('\n'));
        }
        if (t(s.intention)) out.push(`_${t(s.intention)}_`);
    });
    if (data.accroche_pub?.voix) {
        out.push(`**Seconde accroche (publicité)**\n${t(data.accroche_pub.voix)}`);
        if (t(data.accroche_pub.intention)) out.push(`_${t(data.accroche_pub.intention)}_`);
    }
    const legende = data.legende;
    if (legende) {
        const tags = Array.isArray(legende.hashtags) ? legende.hashtags.map(t).filter(Boolean) : [];
        const parties = [t(legende.texte), t(legende.cta), tags.join(' ')].filter(Boolean);
        if (parties.length) out.push(`**Légende de publication**\n${parties.join('\n\n')}`);
    }
    return out.join('\n\n');
}
