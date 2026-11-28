/**
 * CORS de la porte publique (SPEC §14.5) — la porte de service n'en a pas.
 *
 * `Access-Control-Allow-Origin` vaut l'origine du site de cet environnement,
 * écrite dans la configuration : jamais `*`, jamais l'origine reçue recopiée.
 * Ni `Allow-Credentials`, ni cookie : la porte ne connaît personne.
 *
 * **L'origine écarte les autres sites ; elle n'authentifie personne** : un
 * script hors navigateur écrit l'en-tête `Origin` qu'il veut.
 */
import { ENTETES_DE_BASE, type Entetes } from './reponses.ts';

/** Les en-têtes de toutes les réponses d'une route publique, quel qu'en soit le chemin. */
export const entetesPublics = (origineSite: string): Entetes => ({
  ...ENTETES_DE_BASE,
  'Access-Control-Allow-Origin': origineSite,
  Vary: 'Origin',
});

/** La réponse au préliminaire `OPTIONS` : la même pour tous, qui que soit l'origine. */
export const preliminaire = (origineSite: string) =>
  new Response(null, {
    status: 204,
    headers: {
      ...entetesPublics(origineSite),
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });

/**
 * Les origines admises, telles que la configuration les écrit : le site, et en
 * recette la page d'essai. Rien d'autre, et jamais `*`.
 */
export const originesAdmises = (env: { ORIGINE_SITE?: string; ORIGINE_ESSAI?: string; ENVIRONNEMENT?: string }): string[] =>
  [env.ORIGINE_SITE, env.ENVIRONNEMENT === 'recette' ? env.ORIGINE_ESSAI : undefined].filter((o): o is string => !!o);

/**
 * L'origine à écrire dans `Access-Control-Allow-Origin` : celle de la liste qui
 * est exactement l'origine reçue — une valeur de la configuration, pas l'en-tête
 * recopié —, sinon la première (le site). Le navigateur d'un autre site refuse.
 */
export const origineARendre = (requete: Request, admises: string[]): string =>
  admises.find((o) => o === requete.headers.get('Origin')) ?? admises[0];

/** L'origine reçue est-elle exactement l'une des origines admises ? Absente : non. */
export const origineAdmise = (requete: Request, admises: string[]): boolean =>
  admises.includes(requete.headers.get('Origin') ?? '');
