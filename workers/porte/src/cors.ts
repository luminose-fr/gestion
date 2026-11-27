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

/** L'origine reçue est-elle exactement celle du site ? Absente : non. */
export const origineAdmise = (requete: Request, origineSite: string): boolean =>
  requete.headers.get('Origin') === origineSite;
