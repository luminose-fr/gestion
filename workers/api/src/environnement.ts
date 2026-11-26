/**
 * Où l'on est (SPEC §14.8), et ce qui en dépend : l'origine acceptée pour une
 * écriture, et le nom que la console affiche dans son bandeau.
 *
 * L'origine était l'adresse appelée, ou `https://gestion.luminose.fr` écrit en
 * dur. Avec un second environnement durable, ce repli devenait un trou : le
 * Worker de recette aurait accepté une écriture venue de la page de
 * production. Chaque environnement n'accepte désormais que la sienne.
 */
import type { Env } from './env';

export type NomEnvironnement = 'production' | 'recette' | 'local';

/** L'origine de la console, par environnement déployé. */
const ORIGINES: Record<Exclude<NomEnvironnement, 'local'>, string> = {
  production: 'https://gestion.luminose.fr',
  recette: 'https://gestion-recette.luminose.fr',
};

/** La production est la cible par défaut : un Worker sans déclaration en est une. */
export const nomEnvironnement = (env: Pick<Env, 'ENVIRONNEMENT'>): NomEnvironnement =>
  env.ENVIRONNEMENT ?? 'production';

/**
 * L'origine qu'une écriture doit porter pour être acceptée.
 *
 * - production, recette : la leur, et elle seule ;
 * - local : celle de l'adresse appelée — le proxy de Vite traduit la page en
 *   origine du Worker (apps/manager/proxy-dev.ts), et le Worker n'a toujours
 *   aucune origine de développement à connaître (§1.2) ;
 * - non déclaré (un Worker déployé avant la v3.0, et les tests d'avant) : le
 *   comportement d'avant, l'adresse appelée ou la production ;
 * - une valeur inconnue : aucune.
 */
export const originesAcceptees = (env: Pick<Env, 'ENVIRONNEMENT'>, url: string): string[] => {
  const appelee = new URL(url).origin;
  switch (env.ENVIRONNEMENT) {
    case 'production':
    case 'recette':
      return [ORIGINES[env.ENVIRONNEMENT]];
    case 'local':
      return [appelee];
    case undefined:
      return [appelee, ORIGINES.production];
    default:
      // Une valeur mal écrite dans wrangler.toml ferme les écritures au lieu
      // de rouvrir le repli : la connexion échoue, et l'erreur se voit.
      return [];
  }
};
