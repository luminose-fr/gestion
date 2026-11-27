/**
 * Désigner un client (SPEC §14.4, « Désigner un client »).
 *
 * Une personne qui réserve ou s'inscrit est rattachée à sa fiche par sa CLÉ, et
 * jamais par le nom seul : l'adresse e-mail normalisée, puis les mots du prénom
 * et du nom, sans accents, en minuscules, triés. Une même adresse peut donc
 * porter plusieurs fiches — un enfant a la sienne avec l'adresse de sa mère —,
 * et une même clé aussi : c'est le cas « à rapprocher », que Florent tranche.
 *
 * Trier les mots rend la clé indifférente à l'ordre : « MARTIN Émilie » saisi
 * dans les deux cases inversées désigne la même personne. La contrepartie est
 * assumée : « Jean-Pierre L'Hôte » et « Pierre-Jean L'Hôte » partagent une clé,
 * et l'adresse e-mail est là pour les séparer.
 */

/** Toutes les apostrophes qu'un clavier ou un correcteur peut produire. */
const APOSTROPHES = /[‘’‚‛ʼʻ′`´]/g;

/**
 * Les traits d'union Unicode : trait d'union (U+2010), insécable (U+2011),
 * tirets (U+2012 à U+2015), signe moins, et leurs variantes de compatibilité.
 * Un correcteur remplace volontiers le trait d'union d'un prénom composé.
 */
const TRAITS_D_UNION = /[‐-―−﹘﹣－]/g;

/** `\s` de JavaScript couvre l'espace insécable et les espaces fines Unicode. */
const ESPACES = /\s+/g;

/** Les lettres que la décomposition Unicode ne sépare pas de leur « accent ». */
const LIGATURES: [RegExp, string][] = [[/œ/g, 'oe'], [/æ/g, 'ae']];

/** Retire les accents : décomposition, puis suppression des signes combinants. */
const sansAccents = (texte: string): string => {
    let resultat = texte.normalize('NFC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    for (const [motif, remplacement] of LIGATURES) resultat = resultat.replace(motif, remplacement);
    return resultat;
};

/** Sans espaces, en minuscules. Une adresse vide reste vide. */
export const normaliserEmail = (email: string | null | undefined): string =>
    (email ?? '').replace(ESPACES, '').toLowerCase();

/**
 * Le nom tel qu'il s'affiche : espaces retirés aux bords et réduits, apostrophe
 * et trait d'union ramenés à leur forme simple. Accents et casse sont
 * conservés — « L'Hôte » reste « L'Hôte ». Seul un nom saisi tout en
 * minuscules ou tout en majuscules reçoit des initiales en capitale : c'est
 * le signe d'une saisie, pas d'une graphie voulue.
 */
export const normaliserNom = (nom: string | null | undefined): string => {
    const propre = (nom ?? '')
        .normalize('NFC')
        .replace(APOSTROPHES, "'")
        .replace(TRAITS_D_UNION, '-')
        .replace(ESPACES, ' ')
        .trim();
    const aDesLettres = propre.toLowerCase() !== propre.toUpperCase();
    if (!aDesLettres || (propre !== propre.toLowerCase() && propre !== propre.toUpperCase())) return propre;
    // Une initiale au début, et après une espace, un trait d'union ou une apostrophe.
    return propre.toLowerCase().replace(/(^|[ '-])(\p{L})/gu, (_, avant: string, lettre: string) => avant + lettre.toUpperCase());
};

/** Prénom et nom sans accents, en minuscules : pour chercher et pour trier. */
export const nomRecherche = (prenom: string | null | undefined, nom: string | null | undefined): string =>
    sansAccents(`${normaliserNom(prenom)} ${normaliserNom(nom)}`).replace(ESPACES, ' ').trim();

/** Les mots d'un texte : lettres et chiffres, sans accents, en minuscules. */
const mots = (texte: string): string[] =>
    sansAccents(texte).split(/[^\p{L}\p{N}]+/u).filter((mot) => mot.length > 0);

/**
 * La clé d'un client : l'adresse normalisée, puis les mots du prénom et du nom,
 * triés, séparés par une espace — une adresse normalisée n'en contient pas.
 *
 * **Sans adresse e-mail, pas de clé** (`null`) : une fiche sans adresse ne se
 * rattache jamais d'elle-même, et deux homonymes ne deviennent pas une personne.
 */
export const cleClient = (
    email: string | null | undefined,
    prenom: string | null | undefined,
    nom: string | null | undefined,
): string | null => {
    const adresse = normaliserEmail(email);
    if (!adresse) return null;
    // Tri par point de code : le même résultat sur toute machine, quelle que soit sa langue.
    const tries = [...mots(prenom ?? ''), ...mots(nom ?? '')].sort();
    return [adresse, ...tries].join(' ');
};
