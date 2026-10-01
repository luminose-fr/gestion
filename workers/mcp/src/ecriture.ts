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
 *       l'aperçu, refus
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
import { ErreurAds, estUnCompte, muter, normaliserCompte, type Operation, type ServiceEcriture } from './google-ads';
import { clore, ecrituresDuJour, ouvrir } from './journal';
import { Refus } from './refus';
import type { Env } from './env';

export const SCOPE_LECTURE = 'ads:lire';
export const SCOPE_ECRITURE = 'ads:ecrire';

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
};

type Apercu = { o: string; h: string; e: number };

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

const plafondJour = (env: Env): number => {
  const plafond = Number(env.ADS_ECRITURES_MAX_JOUR);
  // Échoue fermé : un plafond illisible n'est pas « pas de plafond ».
  if (!env.ADS_ECRITURES_MAX_JOUR || !Number.isInteger(plafond) || plafond < 0) {
    throw new Refus('ADS_ECRITURES_MAX_JOUR absent ou illisible dans wrangler.toml : l’écriture est fermée.', 503);
  }
  return plafond;
};

/**
 * L'empreinte de ce qui partirait chez Google. Les opérations sont construites
 * par nos outils, dans un ordre de clés fixe : la même entrée donne toujours la
 * même chaîne, une entrée différente jamais.
 */
const empreinteOperations = (outil: string, compte: string, p: Preparation) =>
  empreinte(JSON.stringify([outil, compte, p.service, p.operations]));

export const ecrire = async (
  env: Env,
  contexte: Contexte,
  options: { outil: string; compte: string; jeton?: string; preparation: Preparation },
): Promise<string> => {
  const { outil, compte, jeton, preparation: p } = options;
  const secret = cleApercu(env);
  const h = await empreinteOperations(outil, compte, p);

  // ── Premier temps : l'aperçu ─────────────────────────────────────────
  if (!jeton) {
    // Une erreur de Google remonte telle quelle (ErreurAds) : c'est le but de
    // l'aperçu que de la voir avant d'écrire.
    await muter(env, compte, p.service, p.operations, true);
    const nouveau = await signer('apercu', { o: outil, h, e: Date.now() + DUREE_APERCU_MS } satisfies Apercu, secret);
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
  const apercu = await verifier<Apercu>('apercu', jeton, secret);
  if (!apercu || apercu.o !== outil) throw new Refus("Jeton d'aperçu invalide pour cet outil : refaites un aperçu (appel sans jeton).");
  if (apercu.e < Date.now()) throw new Refus("Jeton d'aperçu expiré (dix minutes) : refaites un aperçu.");
  if (apercu.h !== h) {
    throw new Refus("Le contenu diffère de celui de l'aperçu : rien n'est parti. Refaites un aperçu avec les arguments voulus.");
  }

  const plafond = plafondJour(env);

  // Compter (V9) et ouvrir la ligne (V7) : si la base ne répond pas, Google
  // n'est pas appelé — une écriture sans trace n'est pas acceptable.
  let numero: number;
  try {
    const deja = await ecrituresDuJour(env);
    if (deja >= plafond) {
      throw new Refus(`Plafond atteint : ${deja} écritures sur les dernières 24 heures (ADS_ECRITURES_MAX_JOUR = ${plafond}). Rien n'est parti.`);
    }
    numero = await ouvrir(env, {
      outil, compte, auteur: contexte.email,
      contenu: { service: p.service, operations: p.operations },
      jetonEmpreinte: await empreinte(jeton),
    });
  } catch (erreur) {
    if (erreur instanceof Refus) throw erreur;
    console.error('Journal des écritures indisponible :', erreur);
    throw new Refus("Le journal des écritures n'a pas pu s'écrire : rien n'est parti chez Google. Réessayer plus tard.", 503);
  }

  try {
    const reponse = await muter(env, compte, p.service, p.operations, false);
    const ressources = (reponse.results ?? []).map((r) => r.resourceName ?? '').filter(Boolean);
    try {
      await clore(env, numero, 'ok', { ressources });
    } catch (erreur) {
      // Google a appliqué : on le dit, et on signale le journal resté ouvert.
      console.error(`Écriture n° ${numero} faite, journal non clos :`, erreur);
    }
    return [`FAIT — écriture n° ${numero} du journal.`, '', p.bilan, ...ressources.map((r) => `- ${r}`)].join('\n');
  } catch (erreur) {
    const message = erreur instanceof ErreurAds ? erreur.message : String(erreur);
    await clore(env, numero, 'erreur', { erreur: message }).catch((e) => console.error(`Journal n° ${numero} non clos :`, e));
    // Google refuse : `partialFailure` étant à false, rien n'a été appliqué.
    // Le message de Google suit, avec son code. Ce jeton est consommé.
    if (erreur instanceof ErreurAds) {
      throw new Refus(`ÉCHEC — écriture n° ${numero} : Google a refusé, rien n'a été appliqué.\n\n${message}`);
    }
    throw erreur;
  }
};
