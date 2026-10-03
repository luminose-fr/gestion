/**
 * Écrire dans le corpus — les deux temps, appliqués au dépôt (décision du
 * 03/10/2026, decisions/2026-10-03-corpus.md).
 *
 * Le principe de ecriture.ts, inchangé : Claude prépare, Florent valide. Sans
 * jeton, un aperçu, et rien ne part chez GitHub. Avec le jeton, l'opération
 * exacte de l'aperçu, journalisée avant l'appel (`corpus_ecritures`, V7), sous
 * son propre plafond (V9). Le jeton et le journal sont ceux de ecriture.ts.
 *
 * GitHub n'a pas de `validateOnly`. La vérification à blanc, c'est la table
 * fermée de github.ts (`ecritureRefusee`), jouée à l'aperçu sans rien écrire,
 * et rejouée par `ecrireFichier` au moment d'écrire.
 */
import { empreinte } from './crypto';
import { emettreJeton, exigerEcritureCorpus, lireJeton, ouvrirEcriture, type Contexte, type Temps } from './ecriture';
import { DEPOT, ecrireFichier, ecritureRefusee, lancerDeploiement } from './github';
import { clore } from './journal';
import { Refus } from './refus';
import type { Env } from './env';

/** Une écriture du corpus, une seule opération : un commit, ou le déploiement qui le publie. */
export type OperationCorpus =
  /** `sha` : l'empreinte du fichier vu à l'aperçu ; `null` pour une création. */
  | { type: 'commit'; chemin: string; contenu: string; sha: string | null; message: string }
  /** `commit` : celui de `main` à l'aperçu — ce qui partirait. */
  | { type: 'deploiement'; cible: 'api'; commit: string };

export type PlanCorpus = {
  operation: OperationCorpus;
  /** Ce que l'aperçu a lu et dont l'opération dépend — signé dans le jeton (voir ecriture.ts). */
  fige?: unknown;
  /** L'aperçu, en français. */
  description: string;
  /** Une fois fait. */
  bilan: string;
};

export const ecrireCorpus = async (
  env: Env,
  contexte: Contexte,
  options: { outil: string; jeton?: string; preparer: (temps: Temps) => Promise<PlanCorpus> },
): Promise<string> => {
  const { outil, jeton, preparer } = options;
  exigerEcritureCorpus(contexte);
  const empreinteDe = (operation: OperationCorpus) => empreinte(JSON.stringify([outil, DEPOT, operation]));

  // ── Premier temps : l'aperçu ─────────────────────────────────────────
  if (!jeton) {
    const plan = await preparer({ execution: false });
    if (plan.operation.type === 'commit') {
      // Un défaut de l'outil, pas de l'appelant : l'outil n'aurait pas dû préparer ceci.
      const refus = ecritureRefusee(plan.operation);
      if (refus) throw new Error(`Écriture refusée par la table fermée (corpus) : ${refus}`);
    }
    const nouveau = await emettreJeton(env, outil, await empreinteDe(plan.operation), plan.fige);
    return [
      "APERÇU — rien n'a été modifié : le dépôt n'a pas été touché.",
      '',
      plan.description,
      '',
      `Pour exécuter exactement ceci : rappeler ${outil} avec les mêmes arguments et jeton = "${nouveau}".`,
      "Le jeton vaut dix minutes, une seule fois, et pour ce contenu seulement. Montrer l'aperçu à Florent avant.",
    ].join('\n');
  }

  // ── Second temps : l'exécution de ce qui a été vu ────────────────────
  const apercu = await lireJeton(env, outil, jeton);
  const plan = await preparer({ execution: true, fige: apercu.f });
  if (apercu.h !== await empreinteDe(plan.operation)) {
    throw new Refus("Le contenu diffère de celui de l'aperçu : rien n'est parti. Refaites un aperçu avec les arguments voulus.");
  }

  const numero = await ouvrirEcriture(env, 'corpus', {
    outil, cible: DEPOT, auteur: contexte.email, contenu: plan.operation, jetonEmpreinte: await empreinte(jeton),
  }, 'GitHub');

  try {
    const op = plan.operation;
    const ressources = op.type === 'commit' ? [(await ecrireFichier(env, op)).lien] : [(await lancerDeploiement(env)).lien];
    // GitHub a écrit : un journal resté ouvert se signale, il ne défait rien.
    await clore(env, 'corpus', numero, 'ok', { ressources }).catch((e) => console.error(`Écriture corpus n° ${numero} faite, journal non clos :`, e));
    return [`FAIT — écriture n° ${numero} du journal du corpus.`, '', plan.bilan, ...ressources.map((r) => `- ${r}`)].join('\n');
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    await clore(env, 'corpus', numero, 'erreur', { erreur: message }).catch((e) => console.error(`Journal corpus n° ${numero} non clos :`, e));
    // GitHub refuse (un conflit, un droit) : rien n'est écrit, et ce jeton est consommé.
    if (erreur instanceof Refus) throw new Refus(`ÉCHEC — écriture n° ${numero} : ${erreur.message}`, erreur.status);
    throw erreur;
  }
};
