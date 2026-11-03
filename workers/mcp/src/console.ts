/**
 * La console (gestion.luminose.fr), jointe par son API — décision du 03/11/2026
 * (decisions/2026-11-03-contenus.md).
 *
 * Ni sa base, ni son secret de session : ce serveur présente son propre jeton
 * (CONSOLE_JETON), dont la console ne garde que l'empreinte, et qu'elle
 * n'accepte que sur les contenus et les séries (SPEC §1.1, §7). Ses règles
 * restent les siennes — validation, gestes, journal des générations — et ses
 * refus reviennent ici en clair.
 *
 * Le drapeau `global_fetch_strictly_public` (wrangler.toml) fait sortir cet
 * appel par Internet : la console reçoit une requête comme une autre, sur la
 * même zone ou non.
 */
import { Refus } from './refus';
import type { Env } from './env';

const ORIGINE_PAR_DEFAUT = 'https://gestion.luminose.fr';

/** Ce que zod rend dans `detail` : un chemin et un message, par entrée refusée. */
const lireDetail = (detail: unknown): string =>
  Array.isArray(detail)
    ? detail.map((d: any) => `${Array.isArray(d?.path) && d.path.length ? `${d.path.join('.')} : ` : ''}${d?.message ?? ''}`).join(' ; ')
    : '';

export const appelerConsole = async <T>(
  env: Env,
  chemin: string,
  options: { methode?: 'GET' | 'POST' | 'PATCH'; corps?: unknown } = {},
): Promise<T> => {
  const jeton = env.CONSOLE_JETON?.trim();
  if (!jeton) {
    throw new Refus(
      'CONSOLE_JETON absent du Worker MCP : les contenus sont fermés, le reste du serveur continue. ' +
      '`node workers/mcp/scripts/jeton-console.mjs` le fabrique, avec son empreinte pour la console.',
      503,
    );
  }
  const origine = (env.CONSOLE_URL?.trim() || ORIGINE_PAR_DEFAUT).replace(/\/+$/, '');

  let reponse: Response;
  try {
    reponse = await fetch(`${origine}${chemin}`, {
      method: options.methode ?? 'GET',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
    });
  } catch (erreur) {
    throw new Refus(`La console ne répond pas (${erreur instanceof Error ? erreur.message : String(erreur)}).`, 503);
  }

  const texte = await reponse.text();
  let donnees: any = null;
  try {
    donnees = texte ? JSON.parse(texte) : {};
  } catch {
    /* un corps illisible se dit plus bas, avec le statut */
  }

  if (!reponse.ok) {
    const message = typeof donnees?.error === 'string' ? donnees.error : `HTTP ${reponse.status}`;
    const detail = lireDetail(donnees?.detail);
    if (reponse.status === 401) {
      throw new Refus(`La console refuse le jeton du serveur MCP : ${message}. CONSOLE_JETON (ici) et MCP_JETON_EMPREINTE (console) ` +
        'doivent venir du même `scripts/jeton-console.mjs`.', 503);
    }
    if (reponse.status >= 500) throw new Refus(`La console a échoué (HTTP ${reponse.status}) : ${message}${detail ? ` — ${detail}` : ''}.`, 503);
    const statut = ([400, 403, 404, 409] as const).find((s) => s === reponse.status) ?? 400;
    throw new Refus(`La console refuse : ${message}${detail ? ` — ${detail}` : ''}`, statut);
  }
  if (donnees === null) throw new Refus(`La console a rendu une réponse illisible (HTTP ${reponse.status}).`, 503);
  return donnees as T;
};
