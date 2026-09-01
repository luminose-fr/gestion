/**
 * L'écart entre ce que le Worker SERT et ce que le dépôt contient.
 *
 * Ce fichier existe à cause d'un mensonge daté du 01/09/2026 : une fiche
 * corrigée depuis la console était bien commitée, n'était pas déployée, et
 * l'écran affichait « Aucun écart connu ». La comparaison portait sur des
 * dates — celle du dernier commit contre celle du dernier run GitHub Actions —
 * or la voie normale de déploiement est `npm run deploy` depuis la VM, qui ne
 * produit aucun run. Faute de point de comparaison, l'expression valait `false`
 * et l'ignorance se rendait comme une bonne nouvelle.
 *
 * La comparaison porte désormais sur les empreintes git, de part et d'autre.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';
import { EMPREINTES } from '../src/genere/corpus';

let env: any;
let token: string;

const CHEMINS = Object.keys(EMPREINTES);
const PREMIER = CHEMINS[0];

beforeEach(async () => {
  env = makeEnv();
  env.GITHUB_TOKEN = 'gh-jeton-de-test';
  token = await createSessionToken(env);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/**
 * Un GitHub de comptoir. `arbre` décrit ce que le dépôt porte ; `null` fait
 * échouer l'appel à l'arbre sans toucher aux deux autres.
 */
const stubGitHub = (
  arbre: { path: string; sha: string }[] | null,
  options: { tronque?: boolean; statutArbre?: number } = {},
) => {
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    if (u.includes('/git/trees/')) {
      if (arbre === null) {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: options.statutArbre ?? 404 });
      }
      return new Response(JSON.stringify({
        truncated: Boolean(options.tronque),
        tree: arbre.map(e => ({ type: 'blob', path: e.path, sha: e.sha })),
      }), { status: 200 });
    }
    if (u.includes('/actions/workflows/')) return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
    if (u.includes('/commits')) return new Response(JSON.stringify([]), { status: 200 });
    return new Response('{}', { status: 200 });
  });
};

/** L'arbre qui correspond EXACTEMENT au corpus embarqué. */
const arbreFidele = () =>
  Object.entries(EMPREINTES).map(([chemin, sha]) => ({ path: `${chemin}.md`, sha }));

const lire = async () => {
  const res = await app.fetch(new Request('https://api.test/api/corpus/deploiement', {
    headers: { 'X-Session-Token': token },
  }), env);
  return { res, body: (await res.json()) as any };
};

describe('écart entre le servi et le commité', () => {
  it('ne signale rien quand les empreintes correspondent', async () => {
    stubGitHub(arbreFidele());
    const { res, body } = await lire();
    expect(res.status).toBe(200);
    expect(body.ecart.comparable).toBe(true);
    expect(body.ecart.differents).toEqual([]);
  });

  /**
   * Le cas de Florent, à la lettre : une fiche commitée depuis la console, pas
   * encore déployée. Elle doit être NOMMÉE — un booléen ne dit pas laquelle
   * rouvrir.
   */
  it('nomme la fiche commitée qui n’est pas encore servie', async () => {
    const arbre = arbreFidele();
    arbre[0] = { path: `${PREMIER}.md`, sha: '0'.repeat(40) };
    stubGitHub(arbre);

    const { body } = await lire();
    expect(body.ecart.comparable).toBe(true);
    expect(body.ecart.differents).toEqual([{ chemin: PREMIER, etat: 'modifie' }]);
  });

  it('distingue une fiche ajoutée d’une fiche supprimée', async () => {
    const arbre = arbreFidele()
      .filter(e => e.path !== `${PREMIER}.md`)
      .concat([{ path: 'socle/toute-neuve.md', sha: '1'.repeat(40) }]);
    stubGitHub(arbre);

    const { body } = await lire();
    const par = Object.fromEntries(body.ecart.differents.map((d: any) => [d.chemin, d.etat]));
    // Absente du dépôt, présente dans le bundle : le déploiement la sert encore.
    expect(par[PREMIER]).toBe('supprime');
    // Présente au dépôt, absente du bundle : elle n'est pas encore servie.
    expect(par['socle/toute-neuve']).toBe('ajoute');
  });

  it('ignore les README, comme le chargeur', async () => {
    stubGitHub(arbreFidele().concat([{ path: 'socle/README.md', sha: '2'.repeat(40) }]));
    const { body } = await lire();
    expect(body.ecart.differents).toEqual([]);
  });

  /**
   * NORMATIF — quand la comparaison est impossible, on le DIT.
   *
   * `comparable: false` avec une liste vide ne doit jamais pouvoir se lire
   * comme « aucun écart » : c'est très exactement la confusion qui a coûté la
   * confiance dans cet écran.
   */
  it('dit qu’il ne sait pas quand le dépôt est injoignable — NORMATIF', async () => {
    stubGitHub(null);
    const { res, body } = await lire();
    expect(res.status).toBe(200);
    expect(body.ecart.comparable).toBe(false);
    expect(body.ecart.raison).toBeTruthy();
    expect(body.ecart.differents).toEqual([]);
  });

  it('refuse de conclure sur un arbre tronqué', async () => {
    stubGitHub(arbreFidele(), { tronque: true });
    const { body } = await lire();
    expect(body.ecart.comparable).toBe(false);
    expect(String(body.ecart.raison)).toContain('tronqué');
  });

  it('sans jeton GitHub, l’écran n’a rien à comparer et le dit', async () => {
    env.GITHUB_TOKEN = undefined;
    const { body } = await lire();
    expect(body.configure).toBe(false);
    expect(body.ecart).toBeNull();
  });
});
