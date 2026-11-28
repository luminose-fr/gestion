/**
 * Les entrées nommées que gestion ouvre à la porte (SPEC §14.3) —
 * `PortePublique` et `PorteService`, exportées par `src/index.ts`.
 *
 * **Le seul fichier qui connaît `WorkerEntrypoint`.** Les fonctions de S2a
 * (`publique.ts`, `service.ts`) ne savent rien du transport et ne changent pas
 * de signature ; ces classes ne font que les envelopper. Elles n'ont pas
 * d'adresse : seul un Worker qui déclare la liaison les atteint, et aucune
 * route de `fetch` n'y mène.
 *
 * **Une entrée ne vaut pas une authentification** : `PorteService` transmet
 * l'en-tête `Authorization` tel quel à `confirmation`, qui seul le vérifie.
 *
 * **Une panne lève un code fixe**, jamais l'exception d'origine ni l'envoi : la
 * porte sert un 5xx. Gestion journalise ce code, et rien d'autre (règle 7).
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import type {
  PortePublique as ContratPublique, PorteService as ContratService, Reponse, AutorisationRefusee,
} from '@luminose/contrat';
import type { Env } from '../../env';
import { questionnaire, verifierLienQuestionnaire } from './publique';
import { confirmation } from './service';
import { creneaux, reserver } from './reservation';

/** Les codes qu'une entrée lève. Le texte d'une erreur levée par S2a n'en sort pas. */
export type CodePanne = 'porte.panne' | 'porte.non_reliee' | 'porte.non_configuree' | 'porte.suite';

/** Le code d'une panne, d'après les incidents que S2a lève — et `porte.panne` pour tout le reste. */
const codeDe = (erreur: unknown): CodePanne => {
  const message = erreur instanceof Error ? erreur.message : '';
  if (message === 'incident: base_non_reliee') return 'porte.non_reliee';
  if (message === 'incident: portes_secret_absent') return 'porte.non_configuree';
  return 'porte.panne';
};

/** Journalise le code, et lève une erreur qui ne porte que lui. */
const panne = (erreur: unknown): never => {
  const code = codeDe(erreur);
  console.error(code);
  throw new Error(code);
};

export class PortePublique extends WorkerEntrypoint<Env> implements ContratPublique {
  /**
   * Gestion tient le `waitUntil` : la fiche se complète APRÈS la réponse
   * (§14.6.1, point 10), et la porte n'attend pas qu'elle le soit. Si ce
   * travail échoue, le passage planifié le reprend (`fiche_completee_le` vide).
   */
  async questionnaire(envoi: unknown): Promise<Reponse> {
    try {
      const { reponse, suite } = await questionnaire(this.env, envoi, Date.now());
      this.ctx.waitUntil(suite().catch(() => { console.error('porte.suite' satisfies CodePanne); }));
      return reponse;
    } catch (erreur) {
      return panne(erreur);
    }
  }

  async lienQuestionnaire(envoi: unknown): Promise<Reponse> {
    try {
      return await verifierLienQuestionnaire(this.env, envoi, Date.now());
    } catch (erreur) {
      return panne(erreur);
    }
  }

  /** Une lecture : rien n'est écrit (contrat §3.1). */
  async creneaux(lecture: unknown): Promise<Reponse> {
    try {
      return await creneaux(this.env, lecture, Date.now());
    } catch (erreur) {
      return panne(erreur);
    }
  }

  /** Ce qui dépend de qui est la personne — l'alerte d'une fiche ambiguë — se fait après la réponse. */
  async reserver(envoi: unknown): Promise<Reponse> {
    try {
      const { reponse, suite } = await reserver(this.env, envoi, Date.now());
      this.ctx.waitUntil(suite().catch(() => { console.error('porte.suite' satisfies CodePanne); }));
      return reponse;
    } catch (erreur) {
      return panne(erreur);
    }
  }
}

export class PorteService extends WorkerEntrypoint<Env> implements ContratService {
  async confirmation(autorisation: string | null, envoi: unknown): Promise<Reponse | AutorisationRefusee> {
    try {
      return await confirmation(this.env, typeof autorisation === 'string' ? autorisation : null, envoi, Date.now());
    } catch (erreur) {
      return panne(erreur);
    }
  }
}
