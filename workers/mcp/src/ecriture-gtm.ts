/**
 * Écrire dans Tag Manager — les deux temps, appliqués à un espace de travail
 * (décision du 09/10/2026, decisions/2026-10-09-gtm-ecriture.md).
 *
 * Le principe de ecriture.ts, inchangé : Claude prépare, Florent valide — et
 * ici Florent PUBLIE, dans Tag Manager : ce serveur ne le peut pas (G6). Sans
 * jeton, un aperçu — ce qui serait créé, paramètre par paramètre —, et rien ne
 * part. Avec le jeton, ce corps-là, journalisé avant l'appel (`gtm_ecritures`,
 * V7), sous son propre plafond (V9). Le jeton et le journal sont ceux de
 * ecriture.ts.
 *
 * Tag Manager n'a pas de `validateOnly`. La vérification à blanc, c'est la
 * table fermée de gtm.ts (`formeRefusee`), jouée à l'aperçu, et rejouée par
 * `creerGtm` au moment d'écrire ; ce que seul Tag Manager sait — un nom pris
 * entre-temps, un déclencheur disparu —, il le refuse à l'exécution, sans
 * rien créer.
 */
import { empreinte } from './crypto';
import { emettreJeton, exigerEcritureGtm, lireJeton, ouvrirEcriture, type Contexte, type Temps } from './ecriture';
import { ESPACE_CLAUDE, conteneurGtm, creerGtm, espaces, formeRefusee, jetonEcritureGtm, type Conteneur, type Espace } from './gtm';
import { clore } from './journal';
import { Refus } from './refus';
import type { Env } from './env';

/** Ce qu'un outil d'écriture de Tag Manager a préparé : un élément, et ce qu'on en dit. */
export type PlanGtm = {
  entite: 'declencheur' | 'balise';
  /** Le corps exact envoyé à Tag Manager. C'est lui que couvre le jeton. */
  corps: Record<string, unknown>;
  /** L'aperçu, en français. Vide à l'exécution : personne ne le lit. */
  description: string;
  /** Une fois fait ; `id` est l'identifiant que Tag Manager donne à l'élément créé. */
  bilan: (id: string, espace: Espace) => string;
  /**
   * Ce que l'aperçu a LU et dont le corps dépend — l'identifiant et le
   * libellé lus dans Google Ads, l'identifiant de mesure lu dans le
   * conteneur. Signé dans le jeton, rendu à l'outil à l'exécution, qui
   * reconstruit le corps de l'aperçu sans relire (voir ecriture.ts).
   */
  fige?: unknown;
};

/** Le temps de l'appel, et ce que l'outil y voit : le conteneur, et l'espace « [Claude] » s'il existe. */
export type Preparer = (temps: Temps, c: Conteneur, espace: Espace | undefined) => Promise<PlanGtm>;

/** Ce qui voyage dans le jeton : l'espace vu à l'aperçu, et ce que l'outil a figé. */
type Fige = { w: string | null; l?: unknown };

const DESCRIPTION_ESPACE =
  'Préparé par Claude (serveur MCP mcp.luminose.fr). Rien n’y est publié : relire, puis Envoyer → Publier — ou supprimer ce qui ne convient pas.';

/**
 * L'espace « [Claude] » du conteneur, s'il existe. Deux espaces de ce nom : on
 * ne choisit pas à la place de Florent.
 */
export const espaceClaude = async (env: Env, c: Conteneur): Promise<Espace | undefined> => {
  const liste = (await espaces(env, c)).filter((e) => e.name === ESPACE_CLAUDE);
  if (liste.length > 1) {
    throw new Refus(`${liste.length} espaces de travail se nomment « ${ESPACE_CLAUDE} » dans ${c.publicId} : en renommer ou en supprimer un ` +
      'dans Tag Manager. Rien n\'est parti.', 409);
  }
  return liste[0];
};

/** Ce qui reste à faire, et à qui : le serveur s'arrête là. */
export const aPublier = (espace: Espace) => [
  `Rien n'est publié. Ce que l'espace publierait : gtm_verifier_conversions ou gtm_lire avec espace = "${espace.workspaceId}".`,
  `Dans Tag Manager, Florent relit l'espace « ${ESPACE_CLAUDE} »${espace.tagManagerUrl ? ` (${espace.tagManagerUrl})` : ''}, ` +
  'le prévisualise s\'il le veut, puis Envoyer → Publier — ou supprime ce qui ne convient pas.',
].join('\n');

export const ecrireGtm = async (
  env: Env,
  contexte: Contexte,
  options: { outil: string; jeton?: string; preparer: Preparer },
): Promise<string> => {
  const { outil, jeton, preparer } = options;
  exigerEcritureGtm(contexte);
  // G6 dès l'aperçu : un jeton d'écriture absent, ou plus large que permis,
  // ferme l'écriture avant qu'on montre ce qui ne pourrait pas s'exécuter.
  await jetonEcritureGtm(env);
  const c = await conteneurGtm(env);
  const espace = await espaceClaude(env, c);
  const empreinteDe = (p: PlanGtm) => empreinte(JSON.stringify([outil, c.publicId, p.entite, p.corps]));

  // ── Premier temps : l'aperçu ─────────────────────────────────────────
  if (!jeton) {
    const plan = await preparer({ execution: false }, c, espace);
    // Un défaut de l'outil, pas de l'appelant : l'outil n'aurait pas dû préparer ceci.
    const refus = formeRefusee(plan.entite, plan.corps);
    if (refus) throw new Error(`Écriture refusée par la table fermée de Tag Manager : ${refus}`);
    const fige: Fige = { w: espace?.workspaceId ?? null, ...(plan.fige === undefined ? {} : { l: plan.fige }) };
    const nouveau = await emettreJeton(env, outil, await empreinteDe(plan), fige);
    return [
      "APERÇU — rien n'a été modifié : Tag Manager n'a été que lu.",
      '',
      plan.description,
      '',
      `Pour exécuter exactement ceci : rappeler ${outil} avec les mêmes arguments et jeton = "${nouveau}".`,
      "Le jeton vaut dix minutes, une seule fois, et pour ce contenu seulement. Montrer l'aperçu à Florent avant.",
    ].join('\n');
  }

  // ── Second temps : l'exécution de ce qui a été vu ────────────────────
  const apercu = await lireJeton(env, outil, jeton);
  const fige = (apercu.f ?? { w: null }) as Fige;
  const plan = await preparer({ execution: true, fige: fige.l }, c, espace);
  if (apercu.h !== await empreinteDe(plan)) {
    throw new Refus("Le contenu diffère de celui de l'aperçu : rien n'est parti. Refaites un aperçu avec les arguments voulus.");
  }
  // L'aperçu a vérifié les déclencheurs et les noms dans CET espace. Publié
  // depuis — Tag Manager ferme un espace dont on crée une version — ou
  // supprimé : ce qu'il a vu ne vaut plus.
  if (fige.w && espace?.workspaceId !== fige.w) {
    throw new Refus(`L'espace « ${ESPACE_CLAUDE} » vu à l'aperçu (n° ${fige.w}) n'existe plus — publié ou supprimé depuis : ` +
      "rien n'est parti. Refaites un aperçu.", 409);
  }

  const numero = await ouvrirEcriture(env, 'gtm', {
    outil, cible: c.publicId, auteur: contexte.email,
    contenu: { espace: espace?.workspaceId ?? 'à créer', entite: plan.entite, corps: plan.corps },
    jetonEmpreinte: await empreinte(jeton),
  }, 'Tag Manager');

  const ressources: string[] = [];
  let ouvert = false;
  try {
    let cible = espace;
    if (!cible) {
      cible = await creerGtm<Espace>(env, c, 'espace', { name: ESPACE_CLAUDE, description: DESCRIPTION_ESPACE });
      ouvert = true;
      ressources.push(cible.tagManagerUrl ?? `espace de travail ${cible.workspaceId ?? '?'}`);
    }
    // `creerGtm` revérifie l'espace rendu par Tag Manager : son nom, et un identifiant en chiffres.
    const cree = await creerGtm<{ tagId?: string; triggerId?: string; tagManagerUrl?: string }>(env, c, plan.entite, plan.corps, cible);
    const id = (plan.entite === 'balise' ? cree.tagId : cree.triggerId) ?? '?';
    ressources.push(cree.tagManagerUrl ?? `${plan.entite} ${id}`);
    // Tag Manager a créé : un journal resté ouvert se signale, il ne défait rien.
    await clore(env, 'gtm', numero, 'ok', { ressources }).catch((e) => console.error(`Écriture Tag Manager n° ${numero} faite, journal non clos :`, e));
    return [
      `FAIT — écriture n° ${numero} du journal de Tag Manager.`,
      '',
      ...(ouvert ? [`Espace de travail « ${ESPACE_CLAUDE} » ouvert (n° ${cible.workspaceId}), depuis la dernière version du conteneur.`] : []),
      plan.bilan(id, cible),
      ...ressources.map((r) => `- ${r}`),
      '',
      aPublier(cible),
    ].join('\n');
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await clore(env, 'gtm', numero, 'erreur', { ressources, erreur: message }).catch((e) => console.error(`Journal Tag Manager n° ${numero} non clos :`, e));
    // L'espace ouvert reste : vide, il ne change rien au site, et la prochaine écriture s'en servira.
    const note = ouvert ? ` L'espace « ${ESPACE_CLAUDE} » a été ouvert, et reste vide : sans effet sur le site.` : '';
    if (erreur instanceof Refus) throw new Refus(`ÉCHEC — écriture n° ${numero} : ${erreur.message} Rien n'a été créé dans l'espace.${note}`, erreur.status);
    if (note) console.error(`Écriture Tag Manager n° ${numero} :${note}`);
    throw erreur;
  }
};
