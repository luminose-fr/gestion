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
export type TonElement = 'ombre' | 'lumiere' | 'neutre';
export type RegistreScene = 'pedagogie' | 'humour';
/** Avant le 28/10/2026 (v2.26), les cartes d'une scène s'empilaient. Lus encore, plus écrits. */
export type TypeElement = 'carte' | 'pastille' | 'liaison';
export type TailleCarte = 'petite' | 'moyenne' | 'grande';
export type NatureVisuel = 'illustration' | 'schema';

/**
 * L'illustration de la métaphore (SPEC §12.3, v2.26) : une scène figurative,
 * décrite par le Rédacteur, une seule par Reel — deux au plus quand la métaphore
 * se transforme (la digue qui fuit, puis la vanne et le bassin). Chaque écran la
 * montre au cadrage qu'il lui faut. Elle se produit une fois, pas carte par carte.
 */
export interface IllustrationReel {
    id: string;
    /** Ce que l'image montre, et OÙ — l'écran zoomera sur la partie dite. */
    description: string;
    /** L'autre illustration dont celle-ci est la suite : la même scène, transformée. */
    depuis?: string | null;
}

export type CadrageIllustration = 'ensemble' | 'haut' | 'bas' | 'gauche' | 'droite' | 'centre';
export const CADRAGES: readonly CadrageIllustration[] = ['ensemble', 'haut', 'bas', 'gauche', 'droite', 'centre'];

/** Un schéma que l'outil dessine et anime lui-même : rien à produire, rien à déposer. */
export type SchemaEcran =
    | { schema: 'niveau'; de: number; a: number }
    | { schema: 'compteur'; valeur: number; unite?: string | null }
    | { schema: 'opposition'; gauche: string; droite: string }
    | { schema: 'liste'; items: string[]; barres?: boolean }
    | { schema: 'enchainement'; de: string; vers: string };
export type MotifSchema = SchemaEcran['schema'];
export const MOTIFS: readonly MotifSchema[] = ['niveau', 'compteur', 'opposition', 'liste', 'enchainement'];

/** Un visuel décrit carte par carte, que Florent produisait et déposait — la forme d'avant la v2.26. */
export interface VisuelDecrit {
    nature: NatureVisuel;
    /** Ce que l'image montre, en français. Florent la produit : ce n'est pas un prompt. */
    description: string;
}
export interface VisuelIllustre { illustration: string; cadrage?: CadrageIllustration | null }
export type VisuelCarte = VisuelDecrit | VisuelIllustre | SchemaEcran;

const objet = (v: unknown): Record<string, any> | null => (v && typeof v === 'object' ? v as Record<string, any> : null);
export const schemaDe = (v: unknown): SchemaEcran | null => {
    const o = objet(v);
    return o && typeof o.schema === 'string' ? o as SchemaEcran : null;
};
export const illustrationDe = (v: unknown): VisuelIllustre | null => {
    const o = objet(v);
    return o && typeof o.illustration === 'string' ? o as VisuelIllustre : null;
};
export const visuelDecrit = (v: unknown): VisuelDecrit | null => {
    const o = objet(v);
    return o && !schemaDe(o) && !illustrationDe(o) && typeof o.description === 'string' ? o as VisuelDecrit : null;
};

/**
 * Un écran de scène (v2.26) : une chose à la fois, qui remplace la précédente —
 * un visuel en grand, de un à quatre mots, sur le fond de son ton. Décision de
 * Florent, le 28/10/2026, après la première vidéo exportée : « beaucoup trop
 * d'infos, donc pas percutant ».
 */
export interface ElementScene {
    texte?: string | null;
    ton?: TonElement;
    visuel?: VisuelCarte | null;
    /** Les mots de la voix sur lesquels l'écran apparaît, recopiés à l'identique. */
    apparait_sur: string;
    type?: TypeElement;
    detail?: string | null;
    taille?: TailleCarte;
}

/**
 * Quelques mots qui envahissent l'écran, le temps de les dire, au milieu d'un
 * passage face caméra (SPEC §12.5.3). C'est la rupture de rythme de la seconde
 * référence : le visage s'efface, la formule frappe, le visage revient.
 */
export interface CoupDePoing {
    texte: string;
    /** Les mots de la voix sur lesquels il frappe, recopiés à l'identique. */
    apparait_sur: string;
}

export interface SequenceReel {
    plan: PlanReel;
    role: string;
    /** Tout ce qui se dit pendant la séquence, scène comprise. */
    voix: string;
    intention?: string | null;
    /** Avant la v2.26, une scène avait un titre. Il ne s'affiche plus. */
    titre?: string | null;
    registre?: RegistreScene;
    /** Les écrans d'une scène, dans l'ordre où ils se succèdent. */
    elements?: ElementScene[];
    /** Sur un passage face caméra seulement, ni le premier ni le dernier. */
    coup?: CoupDePoing | null;
}

export interface ReelExplique {
    format: string;
    illustrations?: IllustrationReel[] | null;
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

/**
 * Où se rangent les images des illustrations parmi les visuels du montage
 * (`montage_visuels`, une ligne par séquence et élément) : une séquence qui
 * n'existe pas, et leur rang dans `illustrations` pour élément.
 */
export const SEQUENCE_DES_ILLUSTRATIONS = -1;

/** Les illustrations d'un Reel, sans celles qui n'ont ni nom ni description. */
export const illustrationsDuReel = (data: ReelExplique | null | undefined): IllustrationReel[] =>
    (Array.isArray(data?.illustrations) ? data!.illustrations! : [])
        .filter(i => typeof i?.id === 'string' && i.id.trim() && typeof i?.description === 'string' && i.description.trim());

// ── Les limites — NORMATIF (SPEC §12.3) ─────────────────────────────

export const LIMITES_REEL = {
    /** Un écran se lit d'un coup d'œil : quatre mots. */
    ecranMots: 4,
    ecranCaracteres: 28,
    /** Un libellé de schéma — un côté d'une opposition, une ligne de liste. */
    schemaMots: 3,
    listeItems: 3,
    elementsParScene: 3,
    /** Une scène dure six secondes au plus : seize mots à 150 mots par minute. */
    sceneMots: 16,
    /** Entre deux écrans, de quoi lire le premier : quatre mots, un peu plus d'une seconde et demie. */
    ecartMots: 4,
    /** Le premier écran arrive avec la scène : son repère est dans ses premiers mots. */
    premierEcran: 2,
    illustrations: 2,
    scenesMin: 3,
    scenesMax: 7,
    accrocheMots: 15,
    dureeMinSecondes: 45,
    dureeMaxSecondes: 90,
    coup: 24,
    coupsMax: 2,
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

// ── Le minutage ──────────────────────────────────────────────────────

/**
 * Le moment où un mot est prononcé, à partir de son rang dans la voix ENTIÈRE
 * (toutes séquences mises bout à bout). Deux horloges, un seul calcul :
 * l'estimée, au débit choisi, sert avant le tournage (V2) ; celle de la prise,
 * tirée des horodatages de Whisper, la remplacera (V3) sans rien changer d'autre.
 */
export type Horloge = (rang: number) => number;

/** Les bornes du débit qu'on laisse régler : en deçà on lit, au-delà on récite. */
export const DEBIT_MIN = 110;
export const DEBIT_MAX = 200;

export const horlogeEstimee = (motsParMinute: number = MOTS_PAR_MINUTE): Horloge => {
    const debit = Math.min(DEBIT_MAX, Math.max(DEBIT_MIN, motsParMinute));
    return rang => (rang * 60) / debit;
};

export interface MinutageSequence {
    /** En secondes depuis le début de la vidéo. */
    debut: number;
    fin: number;
    /**
     * Quand chaque élément apparaît, en secondes depuis le début de SA séquence —
     * `null` pour un repère introuvable, qui ne s'affiche donc qu'à la fin.
     */
    apparitions: Array<number | null>;
    /** Le coup de poing d'un passage face caméra, en secondes depuis le début de la séquence. */
    coup?: { debut: number; fin: number } | null;
}

export interface MinutageReel {
    duree: number;
    sequences: MinutageSequence[];
}

/**
 * Combien de temps un coup de poing tient l'écran : le temps de dire ses mots,
 * plus un souffle pour qu'il se lise ; jamais moins qu'il ne faut pour le lire,
 * jamais assez pour que le visage se fasse oublier.
 */
export const COUP_SOUFFLE = 0.4;
export const COUP_MIN = 0.9;
export const COUP_MAX = 2.5;

/** Où frappe le coup de poing d'une séquence, en rang de mot dans sa voix — ou `null`. */
export function positionDuCoup(sequence: SequenceReel): { position: number; longueur: number } | null {
    const repere = motsNormalises(sequence.coup?.apparait_sur);
    if (!sequence.coup || repere.length === 0) return null;
    const position = trouverRepere(motsNormalises(sequence.voix), repere);
    return position === -1 ? null : { position, longueur: repere.length };
}

/**
 * Où tombe chaque séquence, et chaque élément dans sa séquence. Une séquence
 * commence au premier de ses mots et finit au premier mot de la suivante : la
 * voix ne s'arrête jamais, c'est l'image qui change.
 */
export function minuterReel(data: ReelExplique, horloge: Horloge): MinutageReel {
    const sequences = data.sequences ?? [];
    const total = sequences.reduce((n, s) => n + compterMots(s.voix), 0);
    let rang = 0;
    const minutees = sequences.map(sequence => {
        const premier = rang;
        rang += compterMots(sequence.voix);
        const debut = horloge(premier);
        const fin = horloge(rang);
        const apparitions = positionsDesReperes(sequence).map(position =>
            position === null ? null : horloge(premier + position) - debut);
        const situe = sequence.plan === 'camera' ? positionDuCoup(sequence) : null;
        let coup: MinutageSequence['coup'] = null;
        if (situe) {
            const frappe = horloge(premier + situe.position) - debut;
            const dit = horloge(premier + situe.position + situe.longueur) - debut;
            const tenue = Math.min(COUP_MAX, Math.max(COUP_MIN, dit - frappe + COUP_SOUFFLE));
            coup = { debut: frappe, fin: Math.min(fin - debut, frappe + tenue) };
        }
        return { debut, fin, apparitions, coup };
    });
    return { duree: horloge(total), sequences: minutees };
}

/**
 * Quand arrivent les lignes d'une liste, en secondes depuis l'arrivée de son
 * écran : au fil de l'écran, comme une énumération se dit — réparties sur ses
 * trois premiers quarts, entre 0,4 et 1,5 s d'écart. Le rendu les pose là, et
 * le contrôle du rythme les compte comme autant de changements.
 */
export function arriveesDeLaListe(lignes: number, duree: number): number[] {
    const pas = Math.min(1.5, Math.max(0.4, (duree * 0.75) / Math.max(1, lignes)));
    return Array.from({ length: Math.max(0, lignes) }, (_, k) => k * pas);
}

/**
 * Quand chaque écran d'une scène prend la place du précédent, en secondes depuis
 * le début de la scène (v2.26). Le premier arrive avec la scène ; un repère
 * introuvable prend sa place à égale distance de ses voisins ; un écran ne
 * revient jamais en arrière.
 */
export function debutsDesEcrans(apparitions: Array<number | null>, duree: number): number[] {
    const debuts = apparitions.map((a, i) => (i === 0 ? 0 : a));
    for (let i = 1; i < debuts.length; i++) {
        if (debuts[i] !== null) continue;
        let k = i;
        while (k < debuts.length && debuts[k] === null) k++;
        const avant = debuts[i - 1]!;
        const apres = k < debuts.length ? debuts[k]! : duree;
        for (let x = i; x < k; x++) debuts[x] = avant + ((apres - avant) * (x - i + 1)) / (k - i + 1);
    }
    const resultat = debuts as number[];
    for (let i = 1; i < resultat.length; i++) resultat[i] = Math.max(resultat[i], resultat[i - 1]);
    return resultat;
}

// ── Les contrôles — NORMATIF (SPEC §12.3) ───────────────────────────

export interface ProblemeReel {
    /** « séquence 3 », « séquence 3, élément 2 », « seconde accroche »… */
    ou: string;
    probleme: string;
}

const trop = (texte: string, max: number) =>
    `${texte.length} caractères (max ${max}) : « ${texte} »`;

/** Ce qu'un schéma a de travers — ses libellés comptent comme du texte d'écran. */
function problemesDuSchema(schema: SchemaEcran): string[] {
    const libelle = (texte: unknown, nom: string): string[] => {
        const vu = texteAffiche(typeof texte === 'string' ? texte : '');
        if (!vu) return [`${nom} vide`];
        const mots = compterMots(vu);
        return mots > LIMITES_REEL.schemaMots ? [`${nom} : ${mots} mots (max ${LIMITES_REEL.schemaMots}) : « ${vu} »`] : [];
    };
    const pourcent = (n: unknown) => typeof n === 'number' && n >= 0 && n <= 100;
    switch (schema.schema) {
        case 'niveau':
            return pourcent(schema.de) && pourcent(schema.a) && schema.de !== schema.a ? []
                : ['niveau : "de" et "a" sont deux nombres différents, de 0 à 100'];
        case 'compteur':
            return [
                ...(typeof schema.valeur === 'number' && Number.isFinite(schema.valeur) ? [] : ['compteur : "valeur" est un nombre']),
                ...(schema.unite ? libelle(schema.unite, 'unité') : []),
            ];
        case 'opposition':
            return [...libelle(schema.gauche, 'opposition, côté gauche'), ...libelle(schema.droite, 'opposition, côté droit')];
        case 'enchainement':
            return [...libelle(schema.de, 'enchaînement, départ'), ...libelle(schema.vers, 'enchaînement, arrivée')];
        case 'liste': {
            const items = Array.isArray(schema.items) ? schema.items : [];
            if (items.length < 2 || items.length > LIMITES_REEL.listeItems) return [`liste : ${items.length} ligne(s) (attendu : 2 à ${LIMITES_REEL.listeItems})`];
            return items.flatMap((item, k) => libelle(item, `liste, ligne ${k + 1}`));
        }
        default:
            return [`schéma inconnu « ${String((schema as any).schema)} » (attendu : ${MOTIFS.join(', ')})`];
    }
}

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
    const ids = new Set(illustrationsDuReel(data).map(i => i.id));

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

        const elements = sequence.elements ?? [];
        if (elements.length === 0 || elements.length > LIMITES_REEL.elementsParScene) {
            problemes.push({ ou, probleme: `${elements.length} écran(s) (attendu : 1 à ${LIMITES_REEL.elementsParScene})` });
        }
        const motsDeLaScene = compterMots(sequence.voix);
        if (motsDeLaScene > LIMITES_REEL.sceneMots) {
            problemes.push({ ou, probleme: `${motsDeLaScene} mots de voix (max ${LIMITES_REEL.sceneMots}) : une scène dure six secondes au plus, le visage revient entre deux` });
        }

        const positions = positionsDesReperes(sequence);
        elements.forEach((element, j) => {
            const ouElement = `${ou}, écran ${j + 1}`;
            const texte = texteAffiche(element.texte);
            if (!texte && !element.visuel) problemes.push({ ou: ouElement, probleme: 'écran vide : ni texte ni visuel' });
            if (compterMots(texte) > LIMITES_REEL.ecranMots) problemes.push({ ou: ouElement, probleme: `${compterMots(texte)} mots (max ${LIMITES_REEL.ecranMots}) : « ${texte} »` });
            else if (texte.length > LIMITES_REEL.ecranCaracteres) problemes.push({ ou: ouElement, probleme: trop(texte, LIMITES_REEL.ecranCaracteres) });

            const schema = schemaDe(element.visuel);
            const illustre = illustrationDe(element.visuel);
            const decrit = visuelDecrit(element.visuel);
            if (schema) problemesDuSchema(schema).forEach(probleme => problemes.push({ ou: ouElement, probleme }));
            else if (illustre) {
                if (!ids.has(illustre.illustration)) problemes.push({ ou: ouElement, probleme: `illustration « ${illustre.illustration} » inconnue (attendu : ${[...ids].map(x => `« ${x} »`).join(' ou ') || 'aucune n\'est décrite dans "illustrations"'})` });
                if (illustre.cadrage && !CADRAGES.includes(illustre.cadrage)) problemes.push({ ou: ouElement, probleme: `cadrage « ${illustre.cadrage} » inconnu (attendu : ${CADRAGES.join(', ')})` });
            } else if (element.visuel && !decrit?.description?.trim()) {
                problemes.push({ ou: ouElement, probleme: 'visuel illisible : ni "illustration", ni "schema"' });
            }

            if (!element.apparait_sur?.trim()) {
                problemes.push({ ou: ouElement, probleme: 'repère "apparait_sur" absent : l\'écran n\'a pas de moment où apparaître' });
            } else if (positions[j] === null) {
                problemes.push({ ou: ouElement, probleme: `repère « ${element.apparait_sur} » introuvable dans la voix de la séquence (ou placé avant le repère précédent) — il doit en être recopié à l'identique` });
            } else if (j === 0 && positions[j]! > LIMITES_REEL.premierEcran) {
                problemes.push({ ou: ouElement, probleme: `le premier écran arrive avec la scène : son repère doit être dans les ${LIMITES_REEL.premierEcran + 1} premiers mots de la voix` });
            } else if (j > 0 && positions[j - 1] !== null && positions[j]! - positions[j - 1]! < LIMITES_REEL.ecartMots) {
                problemes.push({ ou: ouElement, probleme: `${positions[j]! - positions[j - 1]!} mot(s) après l'écran précédent (min ${LIMITES_REEL.ecartMots}) : le précédent n'aurait pas le temps d'être lu` });
            }
        });
    });

    // Les illustrations du Reel : deux au plus, chacune montrée au moins une fois.
    const illustrations = illustrationsDuReel(data);
    if (illustrations.length > LIMITES_REEL.illustrations) {
        problemes.push({ ou: 'illustrations', probleme: `${illustrations.length} illustrations (max ${LIMITES_REEL.illustrations}) : une scène de la métaphore, et au plus son autre état` });
    }
    const montrees = new Set(sequences.flatMap(s => (s.plan === 'scene' ? s.elements ?? [] : []).map(e => illustrationDe(e.visuel)?.illustration)));
    illustrations.forEach(ill => {
        const ou = `illustration « ${ill.id} »`;
        if (!montrees.has(ill.id)) problemes.push({ ou, probleme: 'aucun écran ne la montre : elle serait produite pour rien' });
        if (ill.depuis && (ill.depuis === ill.id || !ids.has(ill.depuis))) problemes.push({ ou, probleme: `"depuis" désigne « ${ill.depuis} », qui n'est pas l'autre illustration` });
    });

    const coups = sequences.flatMap((s, i) => s.coup ? [i] : []);
    if (coups.length > LIMITES_REEL.coupsMax) {
        problemes.push({ ou: 'script', probleme: `${coups.length} coups de poing (max ${LIMITES_REEL.coupsMax}) : au-delà, la rupture devient le rythme` });
    }
    coups.forEach(i => {
        const sequence = sequences[i];
        const ou = `séquence ${i + 1}, coup de poing`;
        if (sequence.plan !== 'camera') {
            problemes.push({ ou, probleme: 'un coup de poing frappe sur un passage face caméra : une scène occupe déjà l\'écran' });
            return;
        }
        if (i === 0 || i === sequences.length - 1) {
            problemes.push({ ou, probleme: 'ni sur l\'accroche ni sur l\'appel à l\'action : la vidéo s\'ouvre et se ferme sur le visage' });
        }
        const texte = texteAffiche(sequence.coup!.texte);
        if (!texte) problemes.push({ ou, probleme: 'coup de poing vide' });
        else if (texte.length > LIMITES_REEL.coup) problemes.push({ ou, probleme: trop(texte, LIMITES_REEL.coup) });
        if (!sequence.coup!.apparait_sur?.trim()) {
            problemes.push({ ou, probleme: 'repère "apparait_sur" absent : le coup de poing n\'a pas de moment où frapper' });
        } else if (!positionDuCoup(sequence)) {
            problemes.push({ ou, probleme: `repère « ${sequence.coup!.apparait_sur} » introuvable dans la voix de la séquence — il doit en être recopié à l'identique` });
        }
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

/** Ce que montre un visuel, en clair : ce qu'on lit au tournage et ce que reçoit le Lecteur froid. */
export function visuelEnClair(visuel: unknown): string | null {
    const schema = schemaDe(visuel);
    if (schema) {
        switch (schema.schema) {
            case 'niveau': return `schéma : un niveau qui ${schema.a > schema.de ? 'monte' : 'descend'} de ${schema.de} à ${schema.a} %`;
            case 'compteur': return `schéma : un compteur jusqu'à ${schema.valeur}${schema.unite ? ` ${texteAffiche(schema.unite)}` : ''}`;
            case 'opposition': return `schéma : « ${texteAffiche(schema.gauche)} » contre « ${texteAffiche(schema.droite)} »`;
            case 'enchainement': return `schéma : « ${texteAffiche(schema.de)} » mène à « ${texteAffiche(schema.vers)} »`;
            case 'liste': return `schéma : ${(schema.items ?? []).map(x => `« ${texteAffiche(x)} »`).join(', ')}${schema.barres ? ', barrés un à un' : ''}`;
            default: return 'schéma inconnu';
        }
    }
    const illustre = illustrationDe(visuel);
    if (illustre) {
        const cadrage = illustre.cadrage && illustre.cadrage !== 'ensemble' ? `, cadrée ${illustre.cadrage === 'centre' ? 'au centre' : `en ${illustre.cadrage}`}` : '';
        return `illustration « ${illustre.illustration} »${cadrage}`;
    }
    const decrit = visuelDecrit(visuel);
    return decrit ? `${decrit.nature === 'schema' ? 'schéma' : 'illustration'} : ${t(decrit.description)}` : null;
}

/** Un écran, en une ligne : ses mots, puis ce qu'il montre. */
export const ecranEnClair = (e: ElementScene): string =>
    [texteAffiche(e.texte) ? `« ${texteAffiche(e.texte)} »` : null, visuelEnClair(e.visuel)].filter(Boolean).join(' — ') || '(écran vide)';

const decrireElement = (e: ElementScene, j: number): string => {
    const parties = [t(e.texte) ? `« ${t(e.texte)} »` : null, t(e.detail) || null, visuelEnClair(e.visuel), e.ton ? `fond ${e.ton === 'lumiere' ? 'lumière' : e.ton}` : null]
        .filter(Boolean).join(' — ');
    const repere = t(e.apparait_sur) ? ` — apparaît sur « ${t(e.apparait_sur)} »` : '';
    return `- Écran ${j + 1} : ${parties || '(vide)'}${repere}`;
};

/**
 * Le script lisible : ce qui se dit ET ce qui s'affiche. C'est ce que reçoit le
 * Lecteur froid — il doit voir l'écran pour juger qu'il ne recopie pas la voix.
 */
export function reelToMarkdown(data: ReelExplique): string {
    const out: string[] = [];
    const illustrations = illustrationsDuReel(data);
    if (illustrations.length) {
        out.push(`**Illustrations de la métaphore**\n${illustrations.map(i =>
            `- « ${i.id} »${i.depuis ? ` (la même scène que « ${i.depuis} », transformée)` : ''} : ${t(i.description)}`).join('\n')}`);
    }
    (data.sequences ?? []).forEach((s, i) => {
        const plan = s.plan === 'scene' ? 'Scène' : 'Face caméra';
        const registre = s.plan === 'scene' && s.registre ? ` (${s.registre === 'humour' ? 'humour' : 'pédagogie'})` : '';
        out.push(`**Séquence ${i + 1} — ${plan} — ${t(s.role)}${registre}**\n${t(s.voix)}`);
        if (s.plan === 'scene') out.push((s.elements ?? []).map(decrireElement).join('\n'));
        if (s.plan === 'camera' && s.coup) {
            const repere = t(s.coup.apparait_sur) ? ` — frappe sur « ${t(s.coup.apparait_sur)} »` : '';
            out.push(`Écran — coup de poing : ${t(s.coup.texte)}${repere}`);
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
