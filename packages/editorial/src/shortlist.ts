/**
 * La courte liste des modèles (SPEC §5.6).
 *
 * Quatre cents modèles au catalogue, sept utilisés au plus. Le problème n'est
 * pas d'en trouver un bon — il y en a cinquante — mais d'avoir devant soi une
 * liste assez courte pour être lue, et assez variée pour que chaque ligne
 * réponde à une question différente. D'où deux axes de différence imposés :
 * le PRIX, parce que c'est l'arbitrage réel, et le FABRICANT, pour ne pas
 * s'enfermer chez un seul.
 *
 * Ce module ne connaît ni réseau ni source : on lui passe des notes déjà
 * appariées, il rend une sélection. C'est ce qui le rend testable.
 */

/** Une note de qualité rédactionnelle, appariée à une entrée du catalogue. */
export interface ModeleNote {
    /** L'identifiant OpenRouter, seul lien avec le reste du système. */
    slug: string;
    /** Prix de SORTIE par million de jetons — celui qui pèse sur la facture. */
    prixSortie: number | null;
    elo: number | null;
    ecriture: number | null;
    /** Densité de tournures d'IA. PLUS BAS EST MEILLEUR. */
    slop: number | null;
}

export interface PalierPrix {
    id: string;
    libelle: string;
    /** Places visées dans ce palier — indicatif : les places non pourvues sont redistribuées. */
    places: number;
    contient: (prixSortie: number) => boolean;
}

/**
 * Les paliers ne sont pas réguliers : entre 0,08 $ et 1 $ l'arbitrage est
 * réel, entre 25 $ et 50 $ il ne l'est plus guère. On resserre donc en bas.
 */
export const PALIERS_PRIX: readonly PalierPrix[] = [
    { id: 'gratuit', libelle: 'gratuit',    places: 3, contient: p => p === 0 },
    { id: 'micro',   libelle: '≤ 0,25 $',   places: 3, contient: p => p > 0 && p <= 0.25 },
    { id: 'eco',     libelle: '≤ 1 $',      places: 3, contient: p => p > 0.25 && p <= 1 },
    { id: 'moyen',   libelle: '≤ 4 $',      places: 4, contient: p => p > 1 && p <= 4 },
    { id: 'eleve',   libelle: '≤ 15 $',     places: 4, contient: p => p > 4 && p <= 15 },
    { id: 'premium', libelle: '> 15 $',     places: 3, contient: p => p > 15 },
];

/**
 * En dessous, le modèle n'écrit pas assez bien pour mériter une ligne — même
 * comme option économique. Un quota de palier ne justifie pas de recommander
 * ce qu'on ne recommanderait pas.
 */
export const PLANCHER_ELO = 1400;

/**
 * Le slop est la métrique la plus discriminante du jeu (de 6 à 63) et la plus
 * proche du besoin : c'est exactement ce que les personas combattent. Au-delà
 * de 30, le texte sent l'IA quoi qu'on écrive dans le prompt.
 */
export const PLAFOND_SLOP = 30;

/** Trois modèles d'un même fabricant, au plus : au-delà, la liste n'informe plus. */
export const CAP_FABRICANT = 3;

export const CIBLE_COURTE_LISTE = 20;

/**
 * Ramène un nom de modèle à une clé d'appariement. Les catalogues ne nomment
 * pas pareil : `anthropic/claude-opus-5` d'un côté, `claude-opus-5` de l'autre,
 * avec des suffixes de date, de variante ou de gratuité qui ne changent pas le
 * modèle.
 */
export const normaliserNomModele = (nom: string): string =>
    String(nom).toLowerCase()
        .replace(/^~/, '')
        .replace(/^[^/]+\//, '')
        .replace(/:(free|extended|thinking|nitro|floor)$/, '')
        .replace(/-\d{8}$|-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-(preview|latest|exp)$/, '')
        .replace(/[^a-z0-9]/g, '');

/** Le fabricant, tel qu'OpenRouter le préfixe. */
export const fabricantDe = (slug: string): string =>
    String(slug).replace(/^~/, '').split('/')[0] ?? '';

/**
 * La lignée : ce qui distingue une VARIANTE d'une GÉNÉRATION. Les numéros de
 * version sont conservés — `kimi-k2.6` et `kimi-k3` sont deux modèles — mais
 * les tailles, les dates et les déclinaisons tombent : `v4-flash-latest` et
 * `v4-flash-0731` sont le même, et n'ont pas à occuper deux lignes.
 */
export const ligneeDe = (slug: string): string => {
    const sans = String(slug).replace(/^~/, '');
    const [fabricant, reste = ''] = sans.split('/');
    const base = reste
        .replace(/:.*$/, '')
        .replace(/-(mini|nano|lite|small|thinking|it|instruct|latest|preview|exp|\d{4,8}|\d+b|a\d+b)\b/g, '')
        .replace(/[-.]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${fabricant}/${base || reste}`;
};

/**
 * Les quinze critères de la source, en français. Trois d'entre eux disent
 * exactement ce que les personas exigent — « Montre au lieu de dire »,
 * « Évite l'emphase », « Évite la complaisance » — et c'est la raison pour
 * laquelle cette source-là a été retenue plutôt qu'un indice de raisonnement.
 */
export const CRITERES_ECRITURE: Readonly<Record<string, string>> = {
    'Coherent': 'Cohérence',
    'Consistent Voice & Tone': 'Constance de la voix',
    "Show-Don't-Tell": 'Montre au lieu de dire',
    'Creativity': 'Créativité',
    'Descriptive Imagery': 'Images concrètes',
    'Pacing': 'Rythme',
    'Sentence Flow': 'Fluidité',
    'Avoids Amateurish Prose': 'Évite la prose amateur',
    'Strong Dialogue': 'Dialogue',
    'Instruction Following': 'Suivi des consignes',
    'Elegant Prose': 'Élégance',
    'Emotional Depth': 'Profondeur émotionnelle',
    'Avoids Positivity Bias': 'Évite la complaisance',
    'Avoids Purple Prose': "Évite l'emphase",
    'Believable Characters': 'Personnages crédibles',
};

/** Le critère traduit, ou son nom d'origine si la source en ajoute un. */
export const critereEnFrancais = (label: string): string =>
    CRITERES_ECRITURE[label] ?? label;

interface NoteComplete extends ModeleNote {
    prixSortie: number;
    elo: number;
    ecriture: number;
    slop: number;
}

const estComplete = (m: ModeleNote): m is NoteComplete =>
    m.prixSortie !== null && m.elo !== null && m.ecriture !== null && m.slop !== null;

/**
 * Dominé = le MÊME FABRICANT propose, dans le même palier de prix, un modèle
 * qui fait aussi bien ou mieux sur les trois axes sans coûter plus cher.
 * C'est ainsi que `claude-opus-4.7` s'efface devant Opus 5 : même maison, même
 * budget, moins bon partout. Le garder n'offrirait pas un choix, seulement une
 * erreur possible.
 *
 * Les deux bornes ne sont pas décoratives.
 *
 * **Le palier**, parce qu'un modèle gratuit bat sur le papier n'importe quel
 * modèle à 0,08 $ tout en étant plafonné en débit : il ne le remplace pas.
 *
 * **Le fabricant**, parce que ces notes mesurent de la fiction en anglais. Un
 * écart de deux dixièmes n'y dit rien du français de Florent, et laisser ce
 * bruit effacer la maison d'en face coûterait ce qui a le plus de valeur ici :
 * une porte de sortie quand l'une tombe, sature, ou déplaît à la lecture.
 */
const estDomine = (m: NoteComplete, tous: readonly NoteComplete[], comparable: (a: NoteComplete, b: NoteComplete) => boolean): boolean =>
    tous.some(n =>
        n.slug !== m.slug
        && comparable(n, m)
        && n.prixSortie <= m.prixSortie
        && n.elo >= m.elo
        && n.ecriture >= m.ecriture
        && n.slop <= m.slop
        && (n.prixSortie < m.prixSortie || n.elo > m.elo || n.ecriture > m.ecriture || n.slop < m.slop)
    );

/** Une ligne retenue, et le palier qui explique sa présence. */
export interface Retenu {
    slug: string;
    palier: string;
    palierLibelle: string;
}

/**
 * La sélection. Un passage par palier pour garantir l'étalement des prix, puis
 * une redistribution des places qu'aucun modèle défendable n'a pu prendre —
 * un palier pauvre ne doit pas amputer la liste, ni la remplir de mauvais.
 */
export const selectionnerCourteListe = (
    modeles: readonly ModeleNote[],
    cible: number = CIBLE_COURTE_LISTE,
): Retenu[] => {
    const eligibles = modeles
        .filter(estComplete)
        .filter(m => m.elo >= PLANCHER_ELO && m.slop < PLAFOND_SLOP);

    /**
     * Un même modèle est publié sous plusieurs codes — `:free`, variante datée,
     * déclinaison de taille. On ne garde que l'ACCÈS LE MOINS CHER, avant tout
     * le reste : sans cette étape, la liste proposait Inkling à 4,05 $ alors
     * qu'il est gratuit. À prix égal, le meilleur Elo tranche.
     */
    const parLignee = new Map<string, NoteComplete>();
    for (const m of eligibles) {
        const cle = ligneeDe(m.slug);
        const tenant = parLignee.get(cle);
        if (!tenant
            || m.prixSortie < tenant.prixSortie
            || (m.prixSortie === tenant.prixSortie && m.elo > tenant.elo)) {
            parLignee.set(cle, m);
        }
    }
    const uniques = [...parLignee.values()];

    const palierDe = (m: NoteComplete) => PALIERS_PRIX.find(p => p.contient(m.prixSortie)) ?? null;
    const comparable = (a: NoteComplete, b: NoteComplete) =>
        palierDe(a)?.id === palierDe(b)?.id && fabricantDe(a.slug) === fabricantDe(b.slug);

    const candidats = uniques.filter(m => !estDomine(m, uniques, comparable));
    if (candidats.length === 0) return [];

    // Min-max sur les candidats : les bornes doivent décrire le champ réel,
    // pas un absolu qui écraserait toutes les différences.
    const echelle = (lire: (m: NoteComplete) => number, inverse = false) => {
        const valeurs = candidats.map(lire);
        const bas = Math.min(...valeurs);
        const haut = Math.max(...valeurs);
        const etendue = haut - bas || 1;
        return (m: NoteComplete) => {
            const n = (lire(m) - bas) / etendue;
            return inverse ? 1 - n : n;
        };
    };
    const nElo = echelle(m => m.elo);
    const nEcriture = echelle(m => m.ecriture);
    const nSlop = echelle(m => m.slop, true);
    const qualite = (m: NoteComplete) => 0.45 * nElo(m) + 0.25 * nEcriture(m) + 0.30 * nSlop(m);

    const parQualite = [...candidats].sort((a, b) => qualite(b) - qualite(a));

    const parFabricant = new Map<string, number>();
    const ligneesPrises = new Set<string>();
    const retenus: Retenu[] = [];
    const dejaPris = new Set<string>();

    const prendre = (m: NoteComplete): boolean => {
        if (dejaPris.has(m.slug)) return false;
        const fabricant = fabricantDe(m.slug);
        const lignee = ligneeDe(m.slug);
        if ((parFabricant.get(fabricant) ?? 0) >= CAP_FABRICANT) return false;
        if (ligneesPrises.has(lignee)) return false;
        const palier = palierDe(m);
        if (!palier) return false;
        parFabricant.set(fabricant, (parFabricant.get(fabricant) ?? 0) + 1);
        ligneesPrises.add(lignee);
        dejaPris.add(m.slug);
        retenus.push({ slug: m.slug, palier: palier.id, palierLibelle: palier.libelle });
        return true;
    };

    for (const palier of PALIERS_PRIX) {
        let pris = 0;
        for (const m of parQualite) {
            if (pris >= palier.places || retenus.length >= cible) break;
            if (!palier.contient(m.prixSortie)) continue;
            if (prendre(m)) pris++;
        }
    }
    for (const m of parQualite) {
        if (retenus.length >= cible) break;
        prendre(m);
    }

    return retenus.sort((a, b) => {
        const pa = candidats.find(m => m.slug === a.slug)!.prixSortie;
        const pb = candidats.find(m => m.slug === b.slug)!.prixSortie;
        return pa - pb;
    });
};
