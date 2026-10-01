/**
 * Le protocole, dans ses deux époques, et la porte qui le garde.
 *
 * Claude.ai, Claude Code et l'inspecteur MCP ne passent pas tous à la même
 * révision au même moment : le serveur doit répondre juste à un client
 * 2026-07-28 comme à un client qui ouvre encore par `initialize`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ADRESSE, ORIGINE, appeler, creerEnv, jetonValide, requeteModerne, simulerFetch, texteDe } from './aides';

afterEach(() => { vi.unstubAllGlobals(); });

const heritee = (jeton: string, corps: Record<string, unknown>, version: string | null = '2025-06-18') => ({
  method: 'POST',
  headers: {
    Authorization: `Bearer ${jeton}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(version ? { 'MCP-Protocol-Version': version } : {}),
  },
  body: JSON.stringify({ jsonrpc: '2.0', ...corps }),
});

describe('la porte', () => {
  it('répond 401 sans jeton, avec l’adresse des métadonnées — c’est ce qui déclenche la connexion côté Claude', async () => {
    const env = creerEnv();
    const init = requeteModerne('', 'tools/list');
    const reponse = await appeler(env, '/mcp', { ...init, headers: { ...init.headers, Origin: 'http://localhost:6274' } });
    expect(reponse.status).toBe(401);
    expect(reponse.headers.get('WWW-Authenticate'))
      .toMatch(`resource_metadata="${ORIGINE}/.well-known/oauth-protected-resource/mcp"`);
    // L'inspecteur MCP, dans un navigateur, doit pouvoir lire cet en-tête.
    expect(reponse.headers.get('Access-Control-Expose-Headers')).toMatch(/WWW-Authenticate/);
  });

  it('refuse un jeton inconnu, expiré, ou dont l’adresse n’est plus autorisée', async () => {
    const env = creerEnv();
    const inconnu = await appeler(env, '/mcp', requeteModerne('jeton-invente', 'tools/list'));
    expect(inconnu.status).toBe(401);
    expect(inconnu.headers.get('WWW-Authenticate')).toMatch(/error="invalid_token"/);

    const jeton = await jetonValide(env);
    vi.useFakeTimers({ now: Date.now() + 3_601_000 });
    try {
      expect((await appeler(env, '/mcp', requeteModerne(jeton, 'tools/list'))).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }

    const autre = creerEnv();
    const jetonAutre = await jetonValide(autre);
    expect((await appeler(autre, '/mcp', requeteModerne(jetonAutre, 'tools/list'))).status).toBe(200);
    autre.ALLOWED_EMAIL = 'quelquun@luminose.fr';
    expect((await appeler(autre, '/mcp', requeteModerne(jetonAutre, 'tools/list'))).status).toBe(401);
  });

  it('refuse tout si ALLOWED_EMAIL n’est pas posé', async () => {
    const env = creerEnv({ ALLOWED_EMAIL: undefined });
    const jeton = await jetonValide(env, ADRESSE);
    expect((await appeler(env, '/mcp', requeteModerne(jeton, 'tools/list'))).status).toBe(401);
  });

  it('ne sert ni flux GET ni fermeture de session', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    for (const method of ['GET', 'DELETE']) {
      const reponse = await appeler(env, '/mcp', { method, headers: { Authorization: `Bearer ${jeton}` } });
      expect(reponse.status, method).toBe(405);
      expect(reponse.headers.get('Allow')).toBe('POST');
    }
  });

  it('valide Origin : Claude, l’inspecteur local et les appels sans navigateur passent, le reste non', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    const avecOrigine = (origine: string) => {
      const init = requeteModerne(jeton, 'tools/list');
      return appeler(env, '/mcp', { ...init, headers: { ...init.headers, Origin: origine } });
    };
    expect((await avecOrigine('https://evil.example')).status).toBe(403);
    expect((await avecOrigine('https://claude.ai.evil.example')).status).toBe(403);
    expect((await avecOrigine('https://claude.ai')).status).toBe(200);
    expect((await avecOrigine('http://localhost:6274')).status).toBe(200);
    expect((await avecOrigine(ORIGINE)).status).toBe(200);
  });

  it('répond au préflight CORS de l’inspecteur', async () => {
    const reponse = await appeler(creerEnv(), '/mcp', {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:6274', 'Access-Control-Request-Method': 'POST' },
    });
    expect(reponse.status).toBe(204);
    expect(reponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:6274');
  });
});

describe('époque moderne (2026-07-28)', () => {
  it('server/discover annonce les versions, les capacités et le serveur', async () => {
    const env = creerEnv();
    const reponse = await appeler(env, '/mcp', requeteModerne(await jetonValide(env), 'server/discover'));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('Mcp-Session-Id')).toBeNull();
    const { result } = await reponse.json() as any;
    expect(result.resultType).toBe('complete');
    expect(result.supportedVersions).toEqual(['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('luminose-google-ads');
    expect(result.instructions).toMatch(/Claude prépare, Florent publie/);
  });

  it('tools/list publie les outils de lecture puis d’écriture, sans dialecte explicite', async () => {
    const env = creerEnv();
    const reponse = await appeler(env, '/mcp', requeteModerne(await jetonValide(env), 'tools/list'));
    const { result } = await reponse.json() as any;

    // Les outils d'écriture figurent même sans le scope : ils refusent à l'appel, en disant pourquoi.
    expect(result.tools.map((t: { name: string }) => t.name))
      .toEqual(['ads_lister_comptes', 'ads_requete', 'ads_negatifs_ajouter', 'ads_mettre_en_pause']);
    for (const outil of result.tools) {
      expect(outil.inputSchema.type).toBe('object');
      expect(outil.inputSchema.$schema).toBeUndefined();
      expect(outil.annotations.readOnlyHint).toBe(outil.name === 'ads_lister_comptes' || outil.name === 'ads_requete');
      expect(outil.annotations.destructiveHint).toBe(false);
    }
    const requete = result.tools[1];
    expect(requete.inputSchema.required).toEqual(['requete']);
    expect(Object.keys(requete.inputSchema.properties)).toEqual(['requete', 'compte']);
    // Les exemples GAQL sont ce qui évite au modèle d'inventer des champs.
    expect(requete.description).toMatch(/FROM campaign WHERE segments\.date DURING LAST_30_DAYS/);
    expect(requete.description).toMatch(/FROM search_term_view/);
  });

  it('n’emploie pas le mot « action », réservé aux actions IA du catalogue', async () => {
    const env = creerEnv();
    const reponse = await appeler(env, '/mcp', requeteModerne(await jetonValide(env), 'tools/list'));
    const { result } = await reponse.json() as any;
    expect(JSON.stringify(result.tools)).not.toMatch(/action/i);
  });

  it('tools/call exécute un outil et marque le résultat complet', async () => {
    const env = creerEnv();
    simulerFetch(({ url }) => (url.includes(':search') ? Response.json({ results: [{ campaign: { id: '1' } }] }) : undefined));
    const reponse = await appeler(env, '/mcp', requeteModerne(await jetonValide(env), 'tools/call', {
      name: 'ads_requete', arguments: { requete: 'SELECT campaign.id FROM campaign' },
    }));
    const corps = await reponse.json() as any;
    expect(corps.result.resultType).toBe('complete');
    expect(texteDe(corps)).toMatch(/^1 ligne\(s\)/);
  });

  it('accepte un Mcp-Name encodé en base64', async () => {
    const env = creerEnv();
    const init = requeteModerne(await jetonValide(env), 'tools/call', { name: 'ads_lister_comptes', arguments: {} });
    simulerFetch();
    const reponse = await appeler(env, '/mcp', {
      ...init, headers: { ...init.headers, 'Mcp-Name': `=?base64?${btoa('ads_lister_comptes')}?=` },
    });
    expect(reponse.status).toBe(200);
  });

  it('refuse les en-têtes qui contredisent le corps (HeaderMismatch, -32020)', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    const variantes: Record<string, string>[] = [
      { 'MCP-Protocol-Version': '2025-11-25' },
      { 'Mcp-Method': 'tools/call' },
    ];
    for (const entetes of variantes) {
      const init = requeteModerne(jeton, 'tools/list');
      const reponse = await appeler(env, '/mcp', { ...init, headers: { ...init.headers, ...entetes } });
      expect(reponse.status).toBe(400);
      expect((await reponse.json() as any).error.code).toBe(-32020);
    }

    const appel = requeteModerne(jeton, 'tools/call', { name: 'ads_requete', arguments: { requete: 'SELECT campaign.id FROM campaign' } });
    const nomFaux = await appeler(env, '/mcp', { ...appel, headers: { ...appel.headers, 'Mcp-Name': 'ads_lister_comptes' } });
    expect(nomFaux.status).toBe(400);
    expect((await nomFaux.json() as any).error.code).toBe(-32020);
  });

  it('refuse une version inconnue en listant celles qu’il sert (-32022)', async () => {
    const env = creerEnv();
    const init = requeteModerne(await jetonValide(env), 'tools/list');
    const corps = JSON.parse(init.body);
    corps.params._meta['io.modelcontextprotocol/protocolVersion'] = '2099-01-01';
    const reponse = await appeler(env, '/mcp', {
      ...init, headers: { ...init.headers, 'MCP-Protocol-Version': '2099-01-01' }, body: JSON.stringify(corps),
    });
    expect(reponse.status).toBe(400);
    const { error } = await reponse.json() as any;
    expect(error.code).toBe(-32022);
    expect(error.data).toEqual({ supported: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'], requested: '2099-01-01' });
  });

  it('refuse une requête sans capacités client (-32602, 400)', async () => {
    const env = creerEnv();
    const init = requeteModerne(await jetonValide(env), 'tools/list');
    const corps = JSON.parse(init.body);
    delete corps.params._meta['io.modelcontextprotocol/clientCapabilities'];
    const reponse = await appeler(env, '/mcp', { ...init, body: JSON.stringify(corps) });
    expect(reponse.status).toBe(400);
    expect((await reponse.json() as any).error.code).toBe(-32602);
  });

  it('répond 404 à une méthode inconnue, et -32602 à un outil inconnu', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    const methode = await appeler(env, '/mcp', requeteModerne(jeton, 'resources/list'));
    expect(methode.status).toBe(404);
    expect((await methode.json() as any).error.code).toBe(-32601);

    const outil = await appeler(env, '/mcp', requeteModerne(jeton, 'tools/call', { name: 'ads_modifier', arguments: {} }));
    expect((await outil.json() as any).error.code).toBe(-32602);
  });
});

describe('époque héritée (initialize)', () => {
  it('répond à initialize dans la version demandée, sans ouvrir de session', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    const reponse = await appeler(env, '/mcp', heritee(jeton, {
      id: 0, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } },
    }, null));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('Mcp-Session-Id')).toBeNull();
    const { result } = await reponse.json() as any;
    expect(result.protocolVersion).toBe('2025-06-18');
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(result.serverInfo.name).toBe('luminose-google-ads');
  });

  it('propose sa dernière version héritée à un client qui en demande une inconnue', async () => {
    const env = creerEnv();
    const reponse = await appeler(env, '/mcp', heritee(await jetonValide(env), {
      id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} },
    }, null));
    expect((await reponse.json() as any).result.protocolVersion).toBe('2025-11-25');
  });

  it('accuse réception des notifications par un 202 sans corps', async () => {
    const env = creerEnv();
    const reponse = await appeler(env, '/mcp', heritee(await jetonValide(env), { method: 'notifications/initialized' }));
    expect(reponse.status).toBe(202);
    expect(await reponse.text()).toBe('');
  });

  it('sert tools/list et tools/call sans les champs de l’époque moderne', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    simulerFetch(({ url }) => (url.includes(':search') ? Response.json({ results: [] }) : undefined));

    const liste = await (await appeler(env, '/mcp', heritee(jeton, { id: 1, method: 'tools/list' }))).json() as any;
    expect(liste.result.tools).toHaveLength(4);
    expect(liste.result.resultType).toBeUndefined();

    // Un client 2025-03-26 n'envoie pas d'en-tête de version.
    const appel = await (await appeler(env, '/mcp', heritee(jeton, {
      id: 2, method: 'tools/call', params: { name: 'ads_requete', arguments: { requete: 'SELECT campaign.id FROM campaign' } },
    }, null))).json() as any;
    expect(appel.result.resultType).toBeUndefined();
    expect(texteDe(appel)).toMatch(/^0 ligne\(s\)/);
  });

  it('refuse les lots et le JSON illisible', async () => {
    const env = creerEnv();
    const jeton = await jetonValide(env);
    const lot = await appeler(env, '/mcp', { ...heritee(jeton, {}), body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]) });
    expect(lot.status).toBe(400);
    expect((await lot.json() as any).error.code).toBe(-32600);

    const illisible = await appeler(env, '/mcp', { ...heritee(jeton, {}), body: '{' });
    expect(illisible.status).toBe(400);
    expect((await illisible.json() as any).error.code).toBe(-32700);
  });
});
