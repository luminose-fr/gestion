/**
 * L'écriture du corpus depuis la console.
 *
 * Ce qui se joue ici n'est pas « est-ce que ça commite » — GitHub s'en charge —
 * mais **ce qu'on refuse de commiter**. Le parseur de frontmatter est tolérant
 * par conception : un statut mal tapé ne fait échouer aucun test et ne lève
 * aucune erreur, le document part simplement dans les prompts amputé de son
 * statut. `statut: actiff` rendrait Le Seuil proposable sans que rien ne
 * l'annonce. La barrière est donc ici, avant l'entrée dans l'histoire du dépôt.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';
import { DOCUMENTS } from '../src/genere/corpus';

let env: any;
let token: string;
/** Le premier document réel du corpus embarqué — pas un chemin inventé. */
const CHEMIN = DOCUMENTS[0].chemin;

const FICHE = `---
type: fact
statut: actif
revu: 2026-08
---

# Une fiche

Du corps, pour que la fiche en ait un.
`;

beforeEach(async () => {
  env = makeEnv();
  env.GITHUB_TOKEN = 'gh-jeton-de-test';
  token = await createSessionToken(env);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const appel = (chemin: string, init: RequestInit = {}) =>
  app.fetch(new Request(`https://api.test${chemin}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, ...(init.headers ?? {}) },
  }), env);

const json = async (r: Response) => await r.json() as any;

/** Un GitHub de comptoir : rend le fichier, accepte l'écriture, note les appels. */
const stubGitHub = (options: { shaAttendu?: string } = {}) => {
  const appels: Array<{ url: string; method: string; body: any }> = [];
  vi.stubGlobal('fetch', async (url: string, init: any = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    appels.push({ url: u, method: init.method ?? 'GET', body });

    if (init.method === 'PUT') {
      if (options.shaAttendu && body.sha !== options.shaAttendu) {
        return new Response(JSON.stringify({ message: 'does not match' }), { status: 409 });
      }
      return new Response(JSON.stringify({
        content: { sha: 'sha-neuf' }, commit: { sha: 'commit-neuf' },
      }), { status: 200 });
    }
    if (init.method === 'POST') return new Response(null, { status: 204 });

    // Lecture d'un fichier : contenu encodé comme GitHub le fait.
    const octets = new TextEncoder().encode(FICHE);
    let brut = ''; for (const o of octets) brut += String.fromCharCode(o);
    return new Response(JSON.stringify({
      type: 'file', encoding: 'base64', content: btoa(brut), sha: 'sha-courant',
    }), { status: 200 });
  });
  return appels;
};

describe('lire la source', () => {
  it('rend le fichier de GitHub, pas la photo du bundle', async () => {
    const appels = stubGitHub();
    const res = await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`);
    expect(res.status).toBe(200);
    const d = await json(res);
    expect(d.contenu).toContain('# Une fiche');
    expect(d.sha).toBe('sha-courant');
    // La preuve que ça vient bien du dépôt : un appel est parti chez GitHub.
    expect(appels[0].url).toContain('api.github.com/repos/luminose-fr/gestion/contents/');
    expect(appels[0].url).toContain('packages/corpus/content/');
  });

  it('les accents survivent à l’aller-retour base64 — NORMATIF', async () => {
    vi.stubGlobal('fetch', async () => {
      const texte = '---\nstatut: actif\n---\n\n# Cadre déontologique\n\nCœur, âme, ﻿€.\n';
      const octets = new TextEncoder().encode(texte);
      let brut = ''; for (const o of octets) brut += String.fromCharCode(o);
      return new Response(JSON.stringify({ type: 'file', content: btoa(brut), sha: 's' }), { status: 200 });
    });
    const d = await json(await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`));
    expect(d.contenu).toContain('Cadre déontologique');
    expect(d.contenu).toContain('Cœur, âme');
  });

  it('refuse un chemin qui n’est pas dans le corpus', async () => {
    stubGitHub();
    expect((await appel('/api/corpus/source?chemin=socle/inconnu')).status).toBe(404);
  });
});

describe('ce qu’on refuse de commiter — NORMATIF', () => {
  const ecrire = (contenu: string) =>
    appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`, {
      method: 'PUT',
      body: JSON.stringify({ contenu, sha: 'sha-courant' }),
    });

  it('un statut inconnu — le défaut le plus silencieux', async () => {
    stubGitHub();
    const res = await ecrire('---\nstatut: actiff\n---\n\n# Titre\n\nCorps.\n');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('actiff');
  });

  it('un frontmatter disparu', async () => {
    stubGitHub();
    const res = await ecrire('# Titre\n\nCorps sans métadonnées.\n');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('frontmatter');
  });

  it('un corps vide', async () => {
    stubGitHub();
    const res = await ecrire('---\nstatut: actif\n---\n');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/vide/i);
  });

  it('un titre manquant', async () => {
    stubGitHub();
    const res = await ecrire('---\nstatut: actif\n---\n\nDu corps, mais pas de titre.\n');
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('titre');
  });

  it('et rien de tout cela n’atteint GitHub', async () => {
    const appels = stubGitHub();
    await ecrire('---\nstatut: actiff\n---\n\n# Titre\n\nCorps.\n');
    expect(appels.filter(a => a.method === 'PUT')).toEqual([]);
  });
});

describe('commiter', () => {
  it('écrit, et annonce qu’il reste à déployer', async () => {
    const appels = stubGitHub();
    const res = await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`, {
      method: 'PUT',
      body: JSON.stringify({ contenu: FICHE, sha: 'sha-courant', message: 'Le Seuil repasse actif' }),
    });
    expect(res.status).toBe(200);
    const d = await json(res);
    expect(d.commit).toBe('commit-neuf');
    // Le commit ne déploie rien : l'écran doit pouvoir le dire.
    expect(d.deploiementRequis).toBe(true);

    const put = appels.find(a => a.method === 'PUT')!;
    expect(put.body.message).toBe('Le Seuil repasse actif');
    expect(put.body.branch).toBe('main');
  });

  it('ajoute le saut de ligne final — sinon tous les diffs à venir le portent', async () => {
    const appels = stubGitHub();
    await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`, {
      method: 'PUT',
      body: JSON.stringify({ contenu: '---\nstatut: actif\n---\n\n# Titre\n\nSans saut final.', sha: 'x' }),
    });
    const put = appels.find(a => a.method === 'PUT')!;
    expect(atob(put.body.content).endsWith('\n')).toBe(true);
  });

  /**
   * Le cas qui justifie de lire la source sur GitHub plutôt que dans le
   * bundle : entre l'ouverture de la fiche et l'enregistrement, quelqu'un —
   * ou soi-même, depuis un autre appareil — a commité. Écraser serait pire
   * que refuser.
   */
  it('refuse d’écraser un commit survenu entre-temps — NORMATIF', async () => {
    stubGitHub({ shaAttendu: 'sha-courant' });
    const res = await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`, {
      method: 'PUT',
      body: JSON.stringify({ contenu: FICHE, sha: 'sha-perime' }),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatch(/a changé sur GitHub/i);
  });
});

describe('déploiement', () => {
  it('lance le workflow avec des entrées en chaînes', async () => {
    const appels = stubGitHub();
    const res = await appel('/api/corpus/deploiement', {
      method: 'POST', body: JSON.stringify({ cible: 'api' }),
    });
    expect(res.status).toBe(200);
    const post = appels.find(a => a.method === 'POST')!;
    expect(post.url).toContain('/actions/workflows/deploiement.yml/dispatches');
    expect(post.body.inputs.cible).toBe('api');
    // L'API refuse un booléen JSON sur une entrée de workflow_dispatch.
    expect(post.body.inputs.repetition).toBe('false');
  });
});

/**
 * La garantie qui compte le plus : une fonctionnalité en plus ne doit jamais
 * pouvoir emporter celles d'avant. Sans jeton, la LECTURE du corpus marche
 * exactement comme avant, et seule l'écriture se tait — en le disant.
 */
describe('sans jeton GitHub — NORMATIF', () => {
  beforeEach(() => { env.GITHUB_TOKEN = undefined; });

  it('lire le corpus continue de fonctionner', async () => {
    expect((await appel('/api/corpus')).status).toBe(200);
    expect((await appel('/api/corpus/documents')).status).toBe(200);
    expect((await appel(`/api/corpus/document?chemin=${encodeURIComponent(CHEMIN)}`)).status).toBe(200);
    expect((await appel('/api/corpus/contexte/noyau')).status).toBe(200);
    expect((await appel('/api/corpus/feuille/DRAFT_CONTENT')).status).toBe(200);
  });

  it('l’état de déploiement le dit au lieu d’échouer', async () => {
    const res = await appel('/api/corpus/deploiement');
    expect(res.status).toBe(200);
    expect((await json(res)).configure).toBe(false);
  });

  it('écrire est refusé avec la marche à suivre', async () => {
    const res = await appel(`/api/corpus/source?chemin=${encodeURIComponent(CHEMIN)}`, {
      method: 'PUT', body: JSON.stringify({ contenu: FICHE, sha: 'x' }),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toContain('GITHUB_TOKEN');
  });
});
