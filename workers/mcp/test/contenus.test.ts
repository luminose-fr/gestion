/**
 * Les contenus de la console — décision du 03/11/2026
 * (workers/mcp/decisions/2026-11-03-contenus.md).
 *
 * La console est simulée ici, par ses routes et sous leur forme exacte ; ce
 * qu'elle accepte et refuse de ce serveur est testé de son côté
 * (workers/api/test/api-mcp.test.ts). Chaque test NORMATIF regarde ce qui part
 * réellement chez elle — méthode, chemin, jeton, corps — et ce que le journal
 * de ce serveur a écrit.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { vi } from 'vitest';
import { appelerOutil, creerEnv, simulerFetch, texteDe, type Appel, type EnvFactice } from './aides';

afterEach(() => vi.unstubAllGlobals());

const CONSOLE = 'https://gestion.luminose.fr';
const CONTENUS = ['ads:lire', 'contenus:ecrire'];
const JOUR = Date.parse('2026-11-02T10:00:00Z');

type Contenu = Record<string, any>;

const contenu = (id: string, champs: Contenu = {}): Contenu => ({
  id, title: `Titre ${id}`, status: 'Idée', platforms: [], targetFormat: null, objectif: null, depth: null, analyzedAt: null,
  verdict: null, strategicAngle: null, justification: null, suggestedMetaphor: null, notes: '', draft: null, slides: null,
  coachStatus: null, coachBrief: null, serieId: null, angle: null, seriePosition: null, scheduledDate: null,
  createdAt: JOUR, updatedAt: JOUR, deletedAt: null, ...champs,
});

const POST_COURT = { format: 'Post Texte', accroche: 'Et si la peur était une boussole ?', corps: 'Trois lignes.', cta: 'Écrivez-moi.' };

/** Une console de comptoir : ses routes, sous la forme exacte de leurs réponses, et un état qui bouge. */
const simulerConsole = (options: { refus?: { chemin: RegExp; statut: number; corps: unknown } } = {}) => {
  const etat = {
    contenus: new Map<string, Contenu>([
      ['a', contenu('a', { title: 'La peur, une boussole', notes: 'La peur comme information, pas comme ennemie.', updatedAt: JOUR + 3 })],
      ['b', contenu('b', { title: 'Respirer avant de répondre', updatedAt: JOUR + 2 })],
      ['c', contenu('c', { title: 'Le piège chinois', status: 'Brouillon', targetFormat: 'Post Texte (Court)', draft: JSON.stringify(POST_COURT), serieId: 's1', seriePosition: 2, angle: 'Le piège', updatedAt: JOUR + 1 })],
      ['d', contenu('d', { title: 'Ouvrir la série', status: 'Prêt', serieId: 's1', seriePosition: 1, angle: 'L’ouverture' })],
    ]),
    series: new Map<string, Contenu>([['s1', { id: 's1', titre: 'Les pièges de l’anxiété', intention: 'Recadrer', statut: 'en_cours', sourceContentId: null, updatedAt: JOUR }]]),
    generations: [{ id: 'g0', contentId: 'c', kind: 'cold_read', target: null, modelLabel: 'Opus', instruction: null, payload: '{"verdict":"Valide"}', createdAt: JOUR }] as Contenu[],
  };
  const appels = simulerFetch((a: Appel) => {
    if (!a.url.startsWith(CONSOLE)) return undefined;
    const url = new URL(a.url);
    const chemin = url.pathname;
    if (options.refus?.chemin.test(chemin)) return Response.json(options.refus.corps, { status: options.refus.statut });
    const corps = a.corps ? JSON.parse(a.corps) : undefined;
    let m: RegExpExecArray | null;
    if (chemin === '/api/contents' && a.methode === 'GET') return Response.json({ items: [...etat.contenus.values()].sort((x, y) => y.updatedAt - x.updatedAt), syncedAt: JOUR });
    if (chemin === '/api/contents' && a.methode === 'POST') {
      const c = contenu('nouveau-1', { status: 'Idée', ...corps });
      etat.contenus.set(c.id, c);
      return Response.json({ content: c }, { status: 201 });
    }
    if ((m = /^\/api\/contents\/([^/]+)\/generations$/.exec(chemin))) {
      if (a.methode === 'GET') {
        const kind = url.searchParams.get('kind');
        return Response.json({ generations: etat.generations.filter((g) => g.contentId === m![1] && (!kind || g.kind === kind)).slice(0, Number(url.searchParams.get('limit') ?? 50)) });
      }
      const g = { id: `g${etat.generations.length}`, contentId: m[1], ...corps, modelLabel: 'Claude (MCP)', createdAt: JOUR };
      etat.generations.unshift(g);
      etat.contenus.get(m[1])!.draft = corps.payload;
      return Response.json({ generation: g }, { status: 201 });
    }
    if ((m = /^\/api\/contents\/([^/]+)$/.exec(chemin))) {
      const c = etat.contenus.get(m[1]);
      if (!c) return Response.json({ error: 'Contenu introuvable' }, { status: 404 });
      if (a.methode === 'PATCH') {
        Object.assign(c, corps);
        return Response.json({ content: c });
      }
      return Response.json({
        content: c, coachSession: { status: null, formatCible: null, brief: null, validatedAt: null, messages: [] },
        ...(c.targetFormat ? { gabaritBrouillon: 'GRILLE DE PRODUCTION — Post\n{ "format": "Post Texte", "accroche": "…" }' } : {}),
        gestes: [], cout: { appels: 0, tokensEntree: null, tokensSortie: null, usd: null, appelsSansPrix: 0 },
      });
    }
    if (chemin === '/api/series' && a.methode === 'GET') return Response.json({ items: [...etat.series.values()], syncedAt: JOUR });
    if (chemin === '/api/series/regrouper') {
      const s = { id: 's2', titre: corps.titre, intention: corps.intention ?? null, statut: 'en_cours', sourceContentId: null, updatedAt: JOUR };
      etat.series.set(s.id, s);
      const rangees = corps.contenus.map((x: Contenu, i: number) =>
        Object.assign(etat.contenus.get(x.id)!, { serieId: s.id, seriePosition: i + 1, ...(x.angle !== undefined ? { angle: x.angle } : {}) }));
      return Response.json({ serie: s, contents: rangees }, { status: 201 });
    }
    if ((m = /^\/api\/series\/([^/]+)$/.exec(chemin))) {
      return Response.json({
        serie: etat.series.get(m[1]),
        contents: [...etat.contenus.values()].filter((c) => c.serieId === m![1]).sort((x, y) => x.seriePosition - y.seriePosition),
      });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  });
  const versConsole = () => appels.filter((a) => a.url.startsWith(CONSOLE));
  const ecritures = () => versConsole().filter((a) => a.methode !== 'GET').map((a) => ({ methode: a.methode, chemin: new URL(a.url).pathname, corps: JSON.parse(a.corps) }));
  return { etat, appels, versConsole, ecritures };
};

const journal = (env: EnvFactice) => env.DB.db.prepare('SELECT * FROM contenus_ecritures ORDER BY id').all() as Record<string, any>[];

// ── Lire ─────────────────────────────────────────────────────────────────

describe('NORMATIF — lire les contenus, par l’API de la console et avec le jeton du serveur', () => {
  it('contenus_lister : la console appelée avec le jeton du serveur, les filtres appliqués, la série nommée', async () => {
    const env = creerEnv();
    const { versConsole, etat } = simulerConsole();
    const tout = texteDe((await appelerOutil(env, 'contenus_lister', {})).corps);
    expect(tout).toMatch(/^4 contenus sur 4 :/);
    expect(tout).toMatch(/- « Le piège chinois » — Brouillon · Post Texte \(Court\) · série « Les pièges de l’anxiété » n° 2 · modifié le 02\/11\/2026 — id c/);
    for (const a of versConsole()) expect(a.entetes.authorization, a.url).toBe('Bearer jeton-console-de-test');
    expect(versConsole().map((a) => `${a.methode} ${a.url}`).sort()).toEqual([`GET ${CONSOLE}/api/contents`, `GET ${CONSOLE}/api/series`]);

    // Une idée déjà rangée dans une série ne se regroupe pas : « sans_serie » l'écarte.
    etat.contenus.get('d')!.status = 'Idée';
    const idees = texteDe((await appelerOutil(env, 'contenus_lister', { statut: 'Idée', sans_serie: true })).corps);
    expect(idees).toMatch(/^2 contenus sur 4 :/);
    expect(idees).not.toMatch(/Ouvrir la série/);
    expect(idees).toMatch(/« La peur, une boussole » — Idée · format à décider · modifié le 02\/11\/2026 — id a\n  notes : La peur comme information/);
    expect(idees).not.toMatch(/piège/);
    expect(texteDe((await appelerOutil(env, 'contenus_lister', { recherche: 'RESPIRER' })).corps)).toMatch(/^1 contenu sur 4 :/);
    expect(texteDe((await appelerOutil(env, 'contenus_lister', { statut: 'Publié' })).corps)).toMatch(/Aucun contenu ne répond/);
  });

  it('contenus_lire : la fiche, la série dans l’ordre avec ce contenu à son rang, le brouillon, la dernière relecture', async () => {
    const env = creerEnv();
    const { versConsole } = simulerConsole();
    const t = texteDe((await appelerOutil(env, 'contenus_lire', { id: 'c' })).corps);
    expect(t).toMatch(/^« Le piège chinois » — id c\nStatut : Brouillon · format : Post Texte \(Court\)/);
    expect(t).toMatch(/Série « Les pièges de l’anxiété » — Recadrer \(2 publications.*\n1\. « Ouvrir la série » — L’ouverture \(Prêt\)\n2\. « Le piège chinois » ← ce contenu — Le piège \(Brouillon\)/);
    expect(t).toContain(`Brouillon (JSON, tel que l’éditeur le lit) :\n\`\`\`json\n${JSON.stringify(POST_COURT)}\n\`\`\``);
    expect(t).not.toMatch(/Gabarit du format/);
    expect(t).toMatch(/Dernière relecture à froid, le 02\/11\/2026 \(Opus\) :\n\{"verdict":"Valide"\}/);
    expect(versConsole().map((a) => a.url)).toContain(`${CONSOLE}/api/contents/c/generations?kind=cold_read&limit=1`);

    expect(texteDe((await appelerOutil(env, 'contenus_lire', { id: 'c', gabarit: true })).corps)).toMatch(/Gabarit du format « Post Texte \(Court\) »/);
    expect(texteDe((await appelerOutil(env, 'contenus_lire', { id: 'a' })).corps)).toMatch(/Aucun brouillon\.\n\nPas de format : le poser avec contenus_modifier/);
  });

  it('series_lister : titre, statut, nombre de publications', async () => {
    const env = creerEnv();
    simulerConsole();
    expect(texteDe((await appelerOutil(env, 'series_lister', {})).corps))
      .toBe('- « Les pièges de l’anxiété » — en cours · 2 publications — id s1\n  intention : Recadrer');
  });

  it('les refus de la console reviennent en clair ; sans jeton, rien ne part', async () => {
    const env = creerEnv({ CONSOLE_JETON: undefined });
    const { versConsole } = simulerConsole();
    const sans = await appelerOutil(env, 'contenus_lister', {});
    expect(sans.corps.result.isError).toBe(true);
    expect(texteDe(sans.corps)).toMatch(/CONSOLE_JETON absent du Worker MCP : les contenus sont fermés/);
    expect(versConsole()).toEqual([]);

    simulerConsole({ refus: { chemin: /^\/api\/contents$/, statut: 401, corps: { error: 'Non authentifié - jeton du serveur MCP invalide' } } });
    expect(texteDe((await appelerOutil(creerEnv(), 'contenus_lister', {})).corps))
      .toMatch(/La console refuse le jeton du serveur MCP : Non authentifié - jeton du serveur MCP invalide\. CONSOLE_JETON \(ici\) et MCP_JETON_EMPREINTE/);
    simulerConsole({ refus: { chemin: /^\/api\/contents$/, statut: 500, corps: { error: 'Erreur interne', detail: 'D1' } } });
    expect(texteDe((await appelerOutil(creerEnv(), 'contenus_lister', {})).corps)).toMatch(/La console a échoué \(HTTP 500\) : Erreur interne/);
    simulerConsole();
    expect(texteDe((await appelerOutil(creerEnv(), 'contenus_lire', { id: 'inconnu' })).corps)).toMatch(/La console refuse : Contenu introuvable/);
  });
});

// ── Écrire ───────────────────────────────────────────────────────────────

describe('NORMATIF — écrire dans les contenus : la case du consentement, le journal, puis la console', () => {
  it('sans la case « Modifier les contenus », aucune écriture ne part, et rien n’est journalisé', async () => {
    const env = creerEnv();
    const { versConsole } = simulerConsole();
    for (const [outil, args] of [
      ['contenus_creer', { titre: 'x' }], ['contenus_modifier', { id: 'a', titre: 'y' }],
      ['contenus_brouillon_ecrire', { id: 'c', brouillon: POST_COURT, raison: 'essai' }],
      ['series_regrouper', { titre: 'x', contenus: [{ id: 'a' }, { id: 'b' }] }],
    ] as const) {
      const { corps } = await appelerOutil(env, outil, args, ['ads:lire', 'ads:ecrire', 'corpus:ecrire', 'gtm:ecrire']);
      expect(texteDe(corps), outil).toMatch(/L'écriture des contenus n'est pas accordée/);
    }
    expect(versConsole()).toEqual([]);
    expect(journal(env)).toEqual([]);
  });

  it('contenus_creer : la fiche sous les noms de la console, et le journal clos sur l’identifiant créé', async () => {
    const env = creerEnv();
    const { ecritures } = simulerConsole();
    const t = texteDe((await appelerOutil(env, 'contenus_creer', {
      titre: 'Dormir sans lutter', notes: 'Matière', format: 'Post Texte (Court)', plateformes: ['Instagram'], date_prevue: '2026-11-20', angle: 'Lâcher',
    }, CONTENUS)).corps);
    expect(ecritures()).toEqual([{ methode: 'POST', chemin: '/api/contents', corps: {
      title: 'Dormir sans lutter', notes: 'Matière', targetFormat: 'Post Texte (Court)', platforms: ['Instagram'], scheduledDate: '2026-11-20', angle: 'Lâcher',
    } }]);
    expect(t).toBe('FAIT — écriture n° 1 du journal. Contenu créé : « Dormir sans lutter » (Idée, Post Texte (Court)) — id nouveau-1.');
    expect(journal(env).map((l) => [l.outil, l.contenu_vise, l.issue, l.ressources, l.auteur, l.jeton_empreinte]))
      .toEqual([['contenus_creer', 'nouveau', 'ok', '["nouveau-1"]', 'florent@luminose.fr', null]]);
  });

  it('contenus_modifier : seuls les champs donnés partent ; le journal garde la fiche d’avant ; rien de changé, rien ne part', async () => {
    const env = creerEnv();
    const { ecritures } = simulerConsole();
    const t = texteDe((await appelerOutil(env, 'contenus_modifier', { id: 'a', statut: 'Brouillon', format: 'Post Texte (Court)', angle: null, titre: 'La peur, une boussole' }, CONTENUS)).corps);
    expect(ecritures()).toEqual([{ methode: 'PATCH', chemin: '/api/contents/a', corps: {
      title: 'La peur, une boussole', status: 'Brouillon', targetFormat: 'Post Texte (Court)', angle: null,
    } }]);
    expect(t).toBe('FAIT — écriture n° 1 du journal. Fiche de « La peur, une boussole » modifiée :\n- statut : « Idée » → « Brouillon »\n- format : — → « Post Texte (Court) »');
    expect(JSON.parse(journal(env)[0].contenu).avant).toEqual({ status: 'Idée', targetFormat: null });

    expect(texteDe((await appelerOutil(env, 'contenus_modifier', { id: 'a', statut: 'Brouillon' }, CONTENUS)).corps)).toMatch(/^RIEN À FAIRE/);
    expect(texteDe((await appelerOutil(env, 'contenus_modifier', { id: 'a' }, CONTENUS)).corps)).toMatch(/Rien à modifier/);
    expect(ecritures()).toHaveLength(1);
    expect(journal(env)).toHaveLength(1);
  });

  it('contenus_brouillon_ecrire : le JSON au journal des générations, avec sa raison', async () => {
    const env = creerEnv();
    const { ecritures, etat } = simulerConsole();
    const nouveau = { ...POST_COURT, accroche: 'La peur ne ment pas.' };
    const t = texteDe((await appelerOutil(env, 'contenus_brouillon_ecrire', { id: 'c', brouillon: nouveau, raison: 'Accroche resserrée' }, CONTENUS)).corps);
    expect(ecritures()).toEqual([{ methode: 'POST', chemin: '/api/contents/c/generations', corps: {
      kind: 'draft', target: 'draft', apply: true, modelLabel: 'Claude (MCP)', instruction: 'Accroche resserrée', payload: JSON.stringify(nouveau),
    } }]);
    expect(etat.contenus.get('c')!.draft).toBe(JSON.stringify(nouveau));
    expect(t).toMatch(/^FAIT — écriture n° 1 du journal\. Brouillon écrit, signé Claude \(MCP\) au journal du contenu \(génération g1\) : « Accroche resserrée »\./);
    expect(t).toMatch(/l’historique du brouillon ramène le précédent/);
    expect(journal(env)[0]).toMatchObject({ outil: 'contenus_brouillon_ecrire', contenu_vise: 'c', issue: 'ok', ressources: '["c","g1"]' });

    // Un texte passe tel quel.
    await appelerOutil(env, 'contenus_brouillon_ecrire', { id: 'c', brouillon: '{"format":"Post Texte"}', raison: 'Texte brut' }, CONTENUS);
    expect(ecritures()[1].corps.payload).toBe('{"format":"Post Texte"}');
  });

  it('un refus de la console revient en clair, et le journal le garde', async () => {
    const env = creerEnv();
    simulerConsole({ refus: { chemin: /\/generations$/, statut: 400, corps: { error: 'Brouillon refusé : il est au format « Carrousel (Slide par Slide) », le contenu attend « Post Texte (Court) ».' } } });
    const { corps } = await appelerOutil(env, 'contenus_brouillon_ecrire', { id: 'c', brouillon: { format: 'Carrousel' }, raison: 'Essai' }, CONTENUS);
    expect(corps.result.isError).toBe(true);
    expect(texteDe(corps)).toBe('La console refuse : Brouillon refusé : il est au format « Carrousel (Slide par Slide) », le contenu attend « Post Texte (Court) ».');
    expect(journal(env).map((l) => [l.issue, l.erreur])).toEqual([['erreur', texteDe(corps)]]);
  });

  it('une entrée refusée par la console revient avec le détail de ce qu’elle admet', async () => {
    const env = creerEnv();
    simulerConsole({ refus: { chemin: /^\/api\/contents$/, statut: 400, corps: {
      error: 'Entrée invalide', detail: [{ path: ['objectif'], message: 'Invalid option: expected one of "Notoriété"|"Recadrage de croyance"' }],
    } } });
    expect(texteDe((await appelerOutil(env, 'contenus_creer', { titre: 'x', objectif: 'Vendre' }, CONTENUS)).corps))
      .toBe('La console refuse : Entrée invalide — objectif : Invalid option: expected one of "Notoriété"|"Recadrage de croyance"');
  });

  it('series_regrouper : les idées dans l’ordre donné, angles compris, et le journal sur la série et ses idées', async () => {
    const env = creerEnv();
    const { ecritures } = simulerConsole();
    const t = texteDe((await appelerOutil(env, 'series_regrouper', {
      titre: 'Apprivoiser la peur', intention: 'Recadrer la peur', contenus: [{ id: 'b', angle: 'Ouvrir' }, { id: 'a' }],
    }, CONTENUS)).corps);
    expect(ecritures()).toEqual([{ methode: 'POST', chemin: '/api/series/regrouper', corps: {
      titre: 'Apprivoiser la peur', intention: 'Recadrer la peur', contenus: [{ id: 'b', angle: 'Ouvrir' }, { id: 'a' }],
    } }]);
    expect(t).toBe('FAIT — écriture n° 1 du journal. Série « Apprivoiser la peur » créée — id s2 :\n1. « Respirer avant de répondre » — Ouvrir\n2. « La peur, une boussole »');
    expect(journal(env)[0]).toMatchObject({ outil: 'series_regrouper', contenu_vise: 'série', issue: 'ok', ressources: '["s2","b","a"]' });
  });

  it('V9 — le plafond des contenus est le sien : atteint, ou illisible, rien ne part', async () => {
    const env = creerEnv({ CONTENUS_ECRITURES_MAX_JOUR: '1' });
    const { ecritures } = simulerConsole();
    expect(texteDe((await appelerOutil(env, 'contenus_creer', { titre: 'un' }, CONTENUS)).corps)).toMatch(/^FAIT/);
    expect(texteDe((await appelerOutil(env, 'contenus_creer', { titre: 'deux' }, CONTENUS)).corps))
      .toMatch(/Plafond atteint : 1 écritures sur les dernières 24 heures \(CONTENUS_ECRITURES_MAX_JOUR = 1\)\. Rien n'est parti\./);
    expect(ecritures()).toHaveLength(1);

    const ferme = creerEnv({ CONTENUS_ECRITURES_MAX_JOUR: undefined });
    expect(texteDe((await appelerOutil(ferme, 'contenus_creer', { titre: 'trois' }, CONTENUS)).corps))
      .toMatch(/CONTENUS_ECRITURES_MAX_JOUR absent ou illisible/);
    expect(ecritures()).toHaveLength(1);
  });

  it('les entrées hostiles n’atteignent pas la console', async () => {
    const env = creerEnv();
    const { versConsole } = simulerConsole();
    for (const [outil, args] of [
      ['contenus_lire', { id: '../settings/providers' }], ['contenus_lire', { id: 'a?x=1' }],
      ['contenus_modifier', { id: 'a', titre: 'Autre', brouillon: '{}' }], ['contenus_modifier', { id: 'a', titre: 'Autre', draft: '{}' }],
      ['contenus_creer', { titre: 'x', serieId: 's1' }], ['contenus_modifier', { id: 'a', date_prevue: '20/11/2026' }],
      ['series_regrouper', { titre: 'x', contenus: [{ id: 'a' }] }],
    ] as const) {
      const { corps } = await appelerOutil(env, outil, args as Record<string, unknown>, CONTENUS);
      expect(corps.result.isError, `${outil} ${JSON.stringify(args)}`).toBe(true);
    }
    expect(versConsole()).toEqual([]);
  });
});
