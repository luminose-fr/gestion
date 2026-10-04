/**
 * Écrire dans Google Ads — l'enchaînement commun à tous les outils d'écriture.
 *
 * LE PRINCIPE (cadrage du 01/10/2026, NORMATIF) : Claude prépare, Florent
 * publie. Les verrous vivent ici et dans google-ads.ts, jamais dans les
 * descriptions d'outils : une consigne au modèle n'est pas un verrou.
 *
 *   V8  sans le scope `ads:ecrire`, refus — avant tout appel à Google
 *   V2  sans jeton : `validateOnly`, un aperçu, et un jeton qui couvre
 *       EXACTEMENT les opérations montrées, pour dix minutes
 *       avec jeton : on recalcule les opérations ; si elles diffèrent de
 *       l'aperçu, refus. Le compte relu à l'exécution peut ÉCARTER une
 *       opération devenue sans objet, jamais en ajouter une
 *   V9  au-delà de ADS_ECRITURES_MAX_JOUR exécutions sur 24 heures, refus
 *   V7  la ligne du journal s'écrit AVANT l'appel ; si elle ne s'écrit pas,
 *       Google n'est pas appelé
 *
 * Le jeton ne demande aucune écriture KV : la propriété de la phase 1 — rien
 * n'entre dans KV sans identification — reste vraie. Son usage unique, lui, est
 * tenu par le journal (`jeton_empreinte` UNIQUE), qui n'est atteint qu'avec un
 * jeton porteur valide.
 */
import { empreinte, signer, verifier } from './crypto';
import {
  ErreurAds, connexionPour, estUnCompte, muter, normaliserCompte, rechercher, ressourcesRendues, type Operation, type ServiceEcriture,
} from './google-ads';
import { MARQUE } from './regles';
import { clore, ecrituresDuJour, ouvrir, type Journal, type Ouverture } from './journal';
import { Refus } from './refus';
import type { Env } from './env';

export const SCOPE_LECTURE = 'ads:lire';
export const SCOPE_ECRITURE = 'ads:ecrire';
/** Écrire dans le corpus : une case à part du consentement (décision du 03/10/2026). */
export const SCOPE_CORPUS = 'corpus:ecrire';

const DUREE_APERCU_MS = 10 * 60 * 1000;

/** Ce que /mcp sait de l'appelant, une fois le jeton porteur vérifié par la bibliothèque. */
export type Contexte = { email: string; scopes: string[] };

/** Ce qu'un outil d'écriture a préparé : les opérations exactes, et ce qu'on en dit. */
export type Preparation = {
  service: ServiceEcriture;
  operations: Operation[];
  /** L'aperçu en français : ce qui serait créé ou modifié. */
  description: string;
  /** Une fois fait. */
  bilan: string;
  /**
   * Annonces et mots-clés n'ont pas de nom à marquer : le libellé « [Claude] »
   * se pose juste après leur création, sur les noms de ressource rendus par
   * Google (cadrage du 02/10/2026, R2). `libelle` : celui du compte, s'il existe
   * déjà — sinon il est créé au moment d'exécuter.
   */
  libeller?: { service: 'adGroupAdLabels' | 'adGroupCriterionLabels'; champ: 'adGroupAd' | 'adGroupCriterion'; libelle?: string };
  /**
   * Ce que l'aperçu a LU dans le compte et dont les opérations dépendent :
   * exceptions de règlement rendues par Google, doublons écartés, critères
   * résolus. Signé dans le jeton et rendu à l'outil à l'exécution, qui
   * reconstruit les opérations de l'aperçu sans relire ce qu'un appel
   * concurrent a pu changer entre-temps (voir `ecrire`). Court : le modèle
   * recopie le jeton.
   */
  fige?: unknown;
  /**
   * La demande normalisée, quand les opérations ne la disent pas toute — des
   * entrées écartées à l'aperçu, des retraits désignés par identifiant et non
   * par texte. L'empreinte la couvre : sans elle, un mot-clé ajouté aux
   * arguments entre l'aperçu et l'exécution pourrait s'y perdre en silence.
   */
  demande?: unknown;
  /**
   * À l'exécution seulement : les opérations, par rang, que le compte a
   * rendues sans objet depuis l'aperçu — un doublon apparu, une entrée déjà
   * retirée. Elles ne partent pas. On ne peut qu'écarter : rien que l'aperçu
   * n'a pas montré ne part jamais.
   */
  sansObjet?: { rang: number; raison: string }[];
};

/** Le temps de l'appel, tel que l'outil le voit quand il prépare. `fige` : ce que l'aperçu avait arrêté, rendu par le jeton vérifié. */
export type Temps = { execution: false } | { execution: true; fige: unknown };

/** Une préparation fixe, ou qui dépend du temps de l'appel. */
export type Source = Preparation | ((temps: Temps) => Promise<Preparation>);

/** La charge signée d'un jeton d'aperçu : l'outil, l'empreinte, l'expiration, et ce que l'aperçu a figé. */
export type Apercu = { o: string; h: string; e: number; f?: unknown };

const cleApercu = (env: Env): string => {
  if (!env.ADS_APERCU_KEY) {
    throw new Refus("Secret ADS_APERCU_KEY absent du Worker MCP : l'écriture est fermée. openssl rand -base64 32 | npx wrangler secret put ADS_APERCU_KEY", 503);
  }
  return env.ADS_APERCU_KEY;
};

/** V8. Vérifié avant toute autre chose, aperçu compris. */
export const exigerEcriture = (contexte: Contexte): void => {
  if (!contexte.scopes.includes(SCOPE_ECRITURE)) {
    throw new Refus(
      "L'écriture n'est pas accordée à cette connexion. Dans Claude, déconnecter puis reconnecter le connecteur Google Ads, " +
      "et cocher « Préparer des modifications » sur la page de consentement.",
      403,
    );
  }
};

/** On n'écrit que sur le compte Luminose — jamais sur le compte administrateur ni sur un compte passé en argument. */
export const compteEcriture = (env: Env): string => {
  const compte = normaliserCompte(env.GOOGLE_ADS_CUSTOMER_ID ?? '');
  if (!estUnCompte(compte)) throw new Refus('GOOGLE_ADS_CUSTOMER_ID absent ou invalide : l’écriture est fermée.', 503);
  return compte;
};

/** V8 pour le corpus. Vérifié avant toute autre chose, aperçu compris. */
export const exigerEcritureCorpus = (contexte: Contexte): void => {
  if (!contexte.scopes.includes(SCOPE_CORPUS)) {
    throw new Refus(
      "L'écriture du corpus n'est pas accordée à cette connexion. Dans Claude, déconnecter puis reconnecter le connecteur, " +
      "et cocher « Modifier le corpus » sur la page de consentement.",
      403,
    );
  }
};

/** Chaque journal a son plafond, dans [vars] de wrangler.toml. */
const PLAFONDS = { ads: 'ADS_ECRITURES_MAX_JOUR', corpus: 'CORPUS_ECRITURES_MAX_JOUR' } as const satisfies Record<Journal, keyof Env>;

const plafondJour = (env: Env, journal: Journal): number => {
  const nom = PLAFONDS[journal];
  const plafond = Number(env[nom]);
  // Échoue fermé : un plafond illisible n'est pas « pas de plafond ».
  if (!env[nom] || !Number.isInteger(plafond) || plafond < 0) {
    throw new Refus(`${nom} absent ou illisible dans wrangler.toml : l’écriture est fermée.`, 503);
  }
  return plafond;
};

// ── Le jeton et le journal, communs à Google Ads et au corpus ────────────

/** V2 : signe ce que l'aperçu a montré, pour dix minutes. */
export const emettreJeton = (env: Env, outil: string, h: string, fige?: unknown): Promise<string> =>
  signer('apercu', { o: outil, h, e: Date.now() + DUREE_APERCU_MS, ...(fige === undefined ? {} : { f: fige }) } satisfies Apercu, cleApercu(env));

/** V2 : le jeton présenté, vérifié — signé ici, pour cet outil, encore valable. Sinon, un refus. */
export const lireJeton = async (env: Env, outil: string, jeton: string): Promise<Apercu> => {
  const apercu = await verifier<Apercu>('apercu', jeton, cleApercu(env));
  if (!apercu || apercu.o !== outil) throw new Refus("Jeton d'aperçu invalide pour cet outil : refaites un aperçu (appel sans jeton).");
  if (apercu.e < Date.now()) throw new Refus("Jeton d'aperçu expiré (dix minutes) : refaites un aperçu.");
  return apercu;
};

/**
 * V9 puis V7 : compter, puis ouvrir la ligne du journal. Si la base ne répond
 * pas, le fournisseur n'est pas appelé — une écriture sans trace n'est pas
 * acceptable. Rend le numéro de l'écriture.
 */
export const ouvrirEcriture = async (env: Env, journal: Journal, o: Ouverture, fournisseur: string): Promise<number> => {
  const plafond = plafondJour(env, journal);
  try {
    const deja = await ecrituresDuJour(env, journal);
    if (deja >= plafond) {
      throw new Refus(`Plafond atteint : ${deja} écritures sur les dernières 24 heures (${PLAFONDS[journal]} = ${plafond}). Rien n'est parti.`);
    }
    return await ouvrir(env, journal, o);
  } catch (erreur) {
    if (erreur instanceof Refus) throw erreur;
    console.error('Journal des écritures indisponible :', erreur);
    throw new Refus(`Le journal des écritures n'a pas pu s'écrire : rien n'est parti chez ${fournisseur}. Réessayer plus tard.`, 503);
  }
};

/**
 * L'empreinte de ce qui partirait chez Google — et de la demande, quand l'outil
 * la donne. Les opérations sont construites par nos outils, dans un ordre de
 * clés fixe : la même entrée donne toujours la même chaîne, une entrée
 * différente jamais.
 */
const empreinteOperations = (outil: string, compte: string, p: Preparation) =>
  empreinte(JSON.stringify([outil, compte, p.service, p.operations, ...(p.demande === undefined ? [] : [p.demande])]));

export const ecrire = async (
  env: Env,
  contexte: Contexte,
  options: { outil: string; compte: string; jeton?: string; preparation: Source },
): Promise<string> => {
  const { outil, compte, jeton } = options;
  // Sans clé, l'écriture est fermée — dit avant même l'aperçu, qui n'aurait pas de jeton à rendre.
  cleApercu(env);
  const preparer = (temps: Temps): Promise<Preparation> =>
    typeof options.preparation === 'function' ? options.preparation(temps) : Promise.resolve(options.preparation);

  // ── Premier temps : l'aperçu ─────────────────────────────────────────
  if (!jeton) {
    const p = await preparer({ execution: false });
    const h = await empreinteOperations(outil, compte, p);
    // Une erreur de Google remonte telle quelle (ErreurAds) : c'est le but de
    // l'aperçu que de la voir avant d'écrire.
    await muter(env, compte, p.service, p.operations, true);
    const nouveau = await emettreJeton(env, outil, h, p.fige);
    return [
      "APERÇU — rien n'a été modifié. Google a vérifié la requête sans l'appliquer.",
      '',
      p.description,
      '',
      `Pour exécuter exactement ceci : rappeler ${outil} avec les mêmes arguments et jeton = "${nouveau}".`,
      "Le jeton vaut dix minutes, une seule fois, et pour ce contenu seulement. Montrer l'aperçu à Florent avant.",
    ].join('\n');
  }

  // ── Second temps : l'exécution de ce qui a été vu ────────────────────
  const apercu = await lireJeton(env, outil, jeton);

  // L'empreinte se recalcule sur des opérations reconstruites. Tout ce qui, dans
  // cette reconstruction, viendrait d'une lecture du compte faite MAINTENANT
  // dépendrait d'un état partagé avec les appels concurrents. Le 02/10/2026,
  // quatre exécutions parallèles d'ads_mots_cles_ajouter relisaient ainsi le
  // règlement de Google : les premières, en demandant une exception pour un
  // texte, faisaient que Google ne l'arrêtait plus pour les suivantes, qui
  // reconstruisaient des opérations sans exception — et se voyaient refuser
  // leur jeton. Ce que l'aperçu a lu voyage donc dans le jeton (`fige`), et le
  // compte relu ici ne peut plus qu'écarter (`sansObjet`).
  const p = await preparer({ execution: true, fige: apercu.f });
  if (apercu.h !== await empreinteOperations(outil, compte, p)) {
    throw new Refus("Le contenu diffère de celui de l'aperçu : rien n'est parti. Refaites un aperçu avec les arguments voulus.");
  }
  const ecartees = new Map((p.sansObjet ?? []).filter((s) => s.rang >= 0 && s.rang < p.operations.length).map((s) => [s.rang, s.raison]));
  const operations = p.operations.filter((_, i) => !ecartees.has(i));
  const notes = ecartees.size
    ? ['', `Écarté${ecartees.size > 1 ? 's' : ''} à l'exécution, sans objet depuis l'aperçu :`, ...[...ecartees.values()].map((r) => `- ${r}`)]
    : [];
  if (operations.length === 0) {
    return ["RIEN À FAIRE — le compte est déjà dans l'état que l'aperçu prévoyait. Rien n'est parti chez Google.", ...notes].join('\n');
  }

  const numero = await ouvrirEcriture(env, 'ads', {
    outil, cible: compte, auteur: contexte.email,
    contenu: { service: p.service, operations },
    jetonEmpreinte: await empreinte(jeton),
  }, 'Google');

  try {
    const ressources = ressourcesRendues(await muter(env, compte, p.service, operations, false));
    const marque = p.libeller ? await libeller(env, compte, p.libeller, ressources) : null;
    try {
      await clore(env, 'ads', numero, 'ok', { ressources, ...(marque?.echec ? { erreur: marque.echec } : {}) });
    } catch (erreur) {
      // Google a appliqué : on le dit, et on signale le journal resté ouvert.
      console.error(`Écriture n° ${numero} faite, journal non clos :`, erreur);
    }
    return [
      `FAIT — écriture n° ${numero} du journal.`, '', p.bilan, ...ressources.map((r) => `- ${r}`),
      ...(marque ? ['', marque.echec ?? `Libellé ${MARQUE} posé.`] : []),
      ...notes,
    ].join('\n');
  } catch (erreur) {
    const message = erreur instanceof ErreurAds ? erreur.message : String(erreur);
    await clore(env, 'ads', numero, 'erreur', { erreur: message }).catch((e) => console.error(`Journal n° ${numero} non clos :`, e));
    // Google refuse : `partialFailure` étant à false, rien n'a été appliqué.
    // Le message de Google suit, avec son code. Ce jeton est consommé.
    if (erreur instanceof ErreurAds) {
      throw new Refus(`ÉCHEC — écriture n° ${numero} : Google a refusé, rien n'a été appliqué.\n\n${message}`);
    }
    throw erreur;
  }
};

/** Le libellé « [Claude] » du compte, s'il existe — sinon l'exécution le créera. */
export const trouverLibelle = async (env: Env, compte: string): Promise<string | undefined> =>
  ((await rechercher(env, compte, `SELECT label.resource_name, label.name FROM label WHERE label.name = '${MARQUE}'`, connexionPour(env, compte)))
    .results?.[0] as { label?: { resourceName?: string } } | undefined)?.label?.resourceName;

/**
 * Créé au premier besoin. Deux exécutions concurrentes peuvent le créer
 * ensemble ; Google refuse la seconde — un nom de libellé est unique dans le
 * compte. On relit alors celui que l'autre vient de créer.
 */
const creerLibelle = async (env: Env, compte: string): Promise<string | undefined> => {
  try {
    return ressourcesRendues(await muter(env, compte, 'labels', [{ create: { name: MARQUE } }], false))[0];
  } catch (erreur) {
    const existant = await trouverLibelle(env, compte).catch(() => undefined);
    if (existant) return existant;
    throw erreur;
  }
};

/**
 * Le libellé « [Claude] » sur ce qui vient d'être créé. Un échec ici ne défait
 * rien — l'entité existe, en pause, donc sans dépense — mais il se dit : sans
 * libellé, Florent ne la retrouverait pas parmi les autres.
 */
const libeller = async (
  env: Env,
  compte: string,
  l: NonNullable<Preparation['libeller']>,
  ressources: string[],
): Promise<{ echec?: string }> => {
  try {
    const libelle = l.libelle ?? await creerLibelle(env, compte);
    if (!libelle) throw new Error('Google n’a rendu aucun libellé');
    await muter(env, compte, l.service, ressources.map((r) => ({ create: { [l.champ]: r, label: libelle } })), false);
    return {};
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message.split('\n')[0] : String(erreur);
    return { echec: `ATTENTION — libellé ${MARQUE} NON posé (${message}). Ce qui a été créé est en pause ; à marquer à la main.` };
  }
};
