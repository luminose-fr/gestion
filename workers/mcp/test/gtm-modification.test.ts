/**
 * Google Tag Manager, modifier — décision du 11/10/2026
 * (workers/mcp/decisions/2026-10-11-gtm-modifier.md).
 *
 * Le conteneur simulé ici a un ÉTAT et des EMPREINTES : chaque balise d'un
 * espace porte la sienne, qu'un PUT doit présenter et qu'il renouvelle. Chaque
 * test NORMATIF regarde ce qui part réellement chez Tag Manager — les PUT,
 * leurs chemins, leurs corps, le jeton qui les porte — et ce que le journal a
 * écrit, pas ce que l'outil annonce. Le conteneur est fictif, sur le modèle du
 * conteneur réel lu le 11/10/2026.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  cheminModificationPermis, couperPagesVues, modificationRefusee, modifierBaliseGtm, oublierConteneursGtm, type Balise, type Conteneur,
} from '../src/gtm';
import { appelerOutil, creerEnv as creerEnvBase, simulerFetch, texteDe as texteBrut, type Appel, type EnvFactice } from './aides';
import type { Env } from '../src/env';

const texteDe = (corps: unknown) => texteBrut(corps).replace(/[  ]/g, ' ');

beforeEach(() => { oublierConteneursGtm(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const API = 'https://tagmanager.googleapis.com/tagmanager/v2';
const BASE = `${API}/accounts/6001/containers/7001`;
const LECTURE = 'https://www.googleapis.com/auth/tagmanager.readonly';
const EDITION = 'https://www.googleapis.com/auth/tagmanager.edit.containers';
const GTM = ['ads:lire', 'gtm:ecrire'];

const creerEnv = (surcharges: Partial<Env> = {}): EnvFactice => creerEnvBase({
  GTM_REFRESH_TOKEN: 'refresh-gtm', GTM_ECRITURE_REFRESH_TOKEN: 'refresh-gtm-ecriture', GTM_CONTENEUR: 'GTM-TEST123',
  GTM_ECRITURES_MAX_JOUR: '20', ...surcharges,
});

// ── Un Tag Manager à état, avec empreintes ───────────────────────────────

const AW = '1234567890';
const p = (key: string, value: string) => ({ type: 'template', key, value });
const b = (key: string, value: boolean) => ({ type: 'boolean', key, value: String(value) });
const condition = (type: string, arg0: string, arg1: string) => ({ type, parameter: [p('arg0', arg0), p('arg1', arg1)] });
const ligneConfig = (cle: string, valeur: string) => ({ type: 'map', map: [p('parameter', cle), p('parameterValue', valeur)] });
const config = (...lignes: ReturnType<typeof ligneConfig>[]) => ({ type: 'list', key: 'configSettingsTable', list: lignes });

type Element = Record<string, unknown> & { tagId?: string; name?: string; fingerprint?: string };

const BALISES: Element[] = [
  {
    tagId: '1', name: 'GADS - Rendez-vous', type: 'awct', parentFolderId: '40', notes: 'Posée par Florent.',
    parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_RDV'), b('enableConversionLinker', true)],
    firingTriggerId: ['21'], consentSettings: { consentStatus: 'notNeeded' },
  },
  { tagId: '2', name: 'Balise Google AdWords', type: 'googtag', parameter: [p('tagId', `AW-${AW}`)], firingTriggerId: ['2147479573'] },
  { tagId: '3', name: 'GA - Init', type: 'googtag', parameter: [p('tagId', '{{GA4 ID}}'), config(ligneConfig('send_page_view', 'true'))], firingTriggerId: ['2147479572'] },
  {
    tagId: '4', name: 'GA - Prendre un rendez-vous', type: 'gaawe', parameter: [p('eventName', 'bt_prendre_rendez_vous'), p('measurementIdOverride', 'G-TEST1234')],
    firingTriggerId: ['22'], blockingTriggerId: ['24'],
  },
  { tagId: '5', name: 'Consent Mode', type: 'cvt_K8GSG', parameter: [p('ad_storage', 'denied')], firingTriggerId: ['2147479572'] },
  {
    tagId: '6', name: 'FB GA4 Config', type: 'googtag',
    parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('cookie_flags', 'secure'), ligneConfig('send_page_view', 'true'))], firingTriggerId: ['23'],
  },
  { tagId: '7', name: 'Pixel', type: 'html', parameter: [p('html', '<script>fbq()</script>')], firingTriggerId: ['2147479553'] },
  { tagId: '8', name: 'Conversion Linker', type: 'gclidw', parameter: [], firingTriggerId: ['2147479572'] },
  { tagId: '9', name: 'GADS - Achat', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_ACHAT')], firingTriggerId: ['21'] },
  { tagId: '10', name: 'GADS - Achat (doublon)', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_ACHAT')], firingTriggerId: ['22'] },
  { tagId: '11', name: 'GA - Ancien', type: 'gaawe', paused: true, parameter: [p('eventName', 'ancien'), p('measurementIdOverride', 'G-TEST1234')], firingTriggerId: ['21'] },
  { tagId: '12', name: 'GA - Variable', type: 'googtag', parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('send_page_view', '{{Envoi}}'))], firingTriggerId: ['23'] },
];
const DECLENCHEURS = [
  { triggerId: '21', name: 'Merci rendez-vous', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/merci-rdv')] },
  { triggerId: '22', name: 'Clic RDV', type: 'click', filter: [condition('cssSelector', '{{Click Element}}', '[data-track="bt_prise_rdv"]')] },
  { triggerId: '23', name: 'DOM prêt', type: 'domReady' },
  { triggerId: '24', name: 'Admin', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/admin')] },
  { triggerId: '25', name: 'Merci achat', type: 'pageview', filter: [condition('contains', '{{Page Path}}', '/merci-achat')] },
];
const VARIABLES = [{ variableId: '31', name: 'GA4 ID', type: 'c', parameter: [p('value', 'G-TEST1234')] }];
const INTEGREES = ['Page Path', 'Page URL', 'Event', 'Click Element'];

type EspaceSimule = { workspaceId: string; name: string; balises: Element[]; changements: Record<string, unknown>[] };
type Etat = {
  espaces: EspaceSimule[];
  suivant: number;
  enLigne: Element[];
  /** Appelé après chaque lecture d'une balise seule, la réponse déjà faite : c'est là qu'un autre appel la change. */
  apresLecture?: (balise: Element) => void;
};

/** Une empreinte par espace, par balise, par version : « w100-9-0 », puis « w100-9-1 » après un PUT. */
const copier = (w: string, balises: Element[]) => balises.map((x) => ({ ...structuredClone(x), fingerprint: `w${w}-${x.tagId}-0` }));

const nouvelEtat = (): Etat => {
  const enLigne = structuredClone(BALISES);
  return { espaces: [{ workspaceId: '3', name: 'Default Workspace', balises: copier('3', enLigne), changements: [] }], suivant: 100, enLigne };
};

const SCOPES: Record<string, string> = { 'refresh-gtm': LECTURE, 'refresh-gtm-ecriture': EDITION };

const simulerGtm = (etat: Etat = nouvelEtat()) => {
  const appels = simulerFetch(({ url, methode, corps }) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const refresh = new URLSearchParams(corps).get('refresh_token') ?? '';
      return Response.json({ access_token: refresh.replace('refresh-', 'acces-'), expires_in: 3599, scope: SCOPES[refresh] });
    }
    if (!url.startsWith(API)) return undefined;
    if (url === `${API}/accounts/containers:lookup?tagId=GTM-TEST123`) {
      return Response.json({ accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123', name: 'luminose.fr' });
    }
    const local = url.startsWith(BASE) ? url.slice(BASE.length) : '';
    const lien = (w: string, quoi = '') => `https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/${w}${quoi}`;
    // Ce que Tag Manager ajoute à une balise qu'il rend : de quoi vérifier que le serveur ne le renvoie pas.
    const servir = (w: string, x: Element) => ({
      ...structuredClone(x), path: `accounts/6001/containers/7001/workspaces/${w}/tags/${x.tagId}`,
      accountId: '6001', containerId: '7001', workspaceId: w, tagManagerUrl: lien(w, `/tags/${x.tagId}`),
    });
    if (local === '/versions:live') {
      return Response.json({
        containerVersionId: '38', name: 'Octobre', trigger: DECLENCHEURS, variable: VARIABLES, builtInVariable: INTEGREES.map((name) => ({ name })),
        tag: etat.enLigne.map((x) => ({ ...structuredClone(x), path: `accounts/6001/containers/7001/versions/38/tags/${x.tagId}`, fingerprint: `v${x.tagId}` })),
      });
    }
    if (local === '/workspaces' && methode === 'GET') {
      return Response.json({ workspace: etat.espaces.map((e) => ({ workspaceId: e.workspaceId, name: e.name, tagManagerUrl: lien(e.workspaceId) })) });
    }
    if (local === '/workspaces' && methode === 'POST') {
      const w = String(etat.suivant++);
      etat.espaces.push({ workspaceId: w, name: JSON.parse(corps).name, balises: copier(w, etat.enLigne), changements: [] });
      return Response.json({ workspaceId: w, name: JSON.parse(corps).name, tagManagerUrl: lien(w) });
    }
    const m = /^\/workspaces\/(\d+)\/(tags|triggers|variables|built_in_variables|status)(?:\/(\d+))?(?:\?fingerprint=(.+))?$/.exec(local);
    const espace = m && etat.espaces.find((e) => e.workspaceId === m[1]);
    if (m && espace) {
      const [, w, quoi, id, empreinte] = m;
      if (quoi === 'status' && methode === 'GET') return Response.json({ workspaceChange: espace.changements });
      if (!id && methode === 'GET') {
        if (quoi === 'tags') return Response.json({ tag: espace.balises.map((x) => servir(w, x)) });
        if (quoi === 'triggers') return Response.json({ trigger: DECLENCHEURS });
        if (quoi === 'variables') return Response.json({ variable: VARIABLES });
        return Response.json({ builtInVariable: INTEGREES.map((name) => ({ name })) });
      }
      const i = espace.balises.findIndex((x) => x.tagId === id);
      if (quoi === 'tags' && id && i >= 0 && methode === 'GET' && !empreinte) {
        const reponse = Response.json(servir(w, espace.balises[i]));
        etat.apresLecture?.(espace.balises[i]);
        return reponse;
      }
      if (quoi === 'tags' && id && i >= 0 && methode === 'PUT' && empreinte) {
        const actuelle = espace.balises[i];
        if (actuelle.fingerprint !== empreinte) {
          return Response.json({ error: { code: 400, message: 'Fingerprint mismatch', status: 'INVALID_ARGUMENT' } }, { status: 400 });
        }
        const rang = Number(String(actuelle.fingerprint).split('-').at(-1)) + 1;
        espace.balises[i] = { ...JSON.parse(corps), tagId: id, fingerprint: `w${w}-${id}-${rang}` };
        return Response.json(servir(w, espace.balises[i]));
      }
    }
    return Response.json({ error: { code: 404, message: `inconnu : ${methode} ${url.slice(API.length)}`, status: 'NOT_FOUND' } }, { status: 404 });
  });
  return { appels, etat };
};

const versGtm = (appels: Appel[]) => appels.filter((a) => a.url.startsWith(API));
const ecritures = (appels: Appel[]) => versGtm(appels).filter((a) => a.methode !== 'GET');
const puts = (appels: Appel[]) => versGtm(appels).filter((a) => a.methode === 'PUT');
const jetonDe = (corps: unknown) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];
const lignesGtm = (env: EnvFactice) => env.DB.db.prepare('SELECT * FROM gtm_ecritures ORDER BY id').all() as Record<string, unknown>[];
const claude = (etat: Etat) => etat.espaces.find((e) => e.name === '[Claude]');
const baliseDe = (e: EspaceSimule | undefined, id: string) => e?.balises.find((x) => x.tagId === id);

const apercuPuisExecution = async (env: EnvFactice, outil: string, args: Record<string, unknown>, scopes = GTM) => {
  const apercu = await appelerOutil(env, outil, args, scopes);
  const execution = await appelerOutil(env, outil, { ...args, jeton: jetonDe(apercu.corps) }, scopes);
  return { apercu: apercu.corps, execution: execution.corps };
};

const PAUSE = { balise: '9', raison: 'Doublon de la balise n° 10.' };
const C: Conteneur = { accountId: '6001', containerId: '7001', publicId: 'GTM-TEST123' };
const ESPACE = { workspaceId: '100', name: '[Claude]' };

// ── Les verrous ──────────────────────────────────────────────────────────

describe('NORMATIF — Tag Manager, modifier : les verrous', () => {
  it('sans la case « Tag Manager » du consentement, chaque outil refuse avant tout appel', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [nom, args] of [
      ['gtm_mettre_en_pause', PAUSE], ['gtm_declencheurs_ajouter', { balise: '1', declencheurs: ['25'], raison: 'Essai.' }],
      ['gtm_pages_vues_couper', { balise: '6', raison: 'Essai.' }],
    ] as const) {
      const { corps } = await appelerOutil(env, nom, args, ['ads:lire', 'ads:ecrire', 'corpus:ecrire']);
      expect(texteDe(corps), nom).toMatch(/L'écriture dans Tag Manager n'est pas accordée à cette connexion/);
    }
    expect(versGtm(appels)).toEqual([]);
  });

  it('l’aperçu ne fait que lire : aucun PUT, aucun journal ; il montre la balise telle qu’elle est, et ce qui changerait', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM);
    const t = texteDe(corps);
    expect(t).toMatch(/^APERÇU — rien n'a été modifié : Tag Manager n'a été que lu\./);
    expect(t).toMatch(/Mise en pause d’une balise dans un espace de travail « \[Claude\] », ouvert à l'exécution depuis la dernière version du conteneur \(vérifié sur la version en ligne n° 38 « Octobre »\) :/);
    expect(t).toMatch(/### « GADS - Achat » \(n° 9\) — Conversion Google Ads \(awct\)\n- Déclenchée par : « Merci rendez-vous »/);
    expect(t).toMatch(/- EN PAUSE : elle ne part plus, sur aucun de ses déclencheurs\. Elle n’est pas supprimée\./);
    expect(t).toMatch(/- notes : s’y ajoute « \[Claude\] Mise en pause — Doublon de la balise n° 10\. »\./);
    expect(ecritures(appels)).toEqual([]);
    expect(versGtm(appels).every((a) => a.methode === 'GET' && a.entetes.authorization === 'Bearer acces-gtm')).toBe(true);
    expect(lignesGtm(env)).toEqual([]);
    expect(claude(etat)).toBeUndefined();
  });

  it('la première exécution ouvre l’espace, relit la balise dans l’espace, et la renvoie entière avec son empreinte — jeton d’écriture, journal avant', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    const { execution } = await apercuPuisExecution(env, 'gtm_mettre_en_pause', PAUSE);
    const t = texteDe(execution);
    expect(t).toMatch(/^FAIT — écriture n° 1 du journal de Tag Manager\.\n\nEspace de travail « \[Claude\] » ouvert \(n° 100\)/);
    expect(t).toMatch(/Balise « GADS - Achat » \(n° 9\) mise en pause dans l’espace\./);
    expect(t).toMatch(/Rien n'est publié\./);

    expect(ecritures(appels).map((a) => [a.methode, a.url])).toEqual([
      ['POST', `${BASE}/workspaces`],
      ['PUT', `${BASE}/workspaces/100/tags/9?fingerprint=w100-9-0`],
    ]);
    // La balise est relue dans l'espace « [Claude] » juste avant le PUT, avec le jeton de lecture.
    const relue = versGtm(appels).findIndex((a) => a.methode === 'GET' && a.url === `${BASE}/workspaces/100/tags/9`);
    expect(relue).toBeGreaterThan(versGtm(appels).findIndex((a) => a.methode === 'POST'));
    expect(versGtm(appels)[relue].entetes.authorization).toBe('Bearer acces-gtm');
    const [put] = puts(appels);
    expect(put.entetes.authorization).toBe('Bearer acces-gtm-ecriture');
    // Entière, sans ce que Tag Manager tient à jour : ni chemin, ni empreinte, ni identifiants.
    expect(JSON.parse(put.corps)).toEqual({
      name: 'GADS - Achat', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_ACHAT')], firingTriggerId: ['21'],
      paused: true, notes: '[Claude] Mise en pause — Doublon de la balise n° 10.',
    });

    expect(baliseDe(claude(etat), '9')).toMatchObject({ paused: true, fingerprint: 'w100-9-1' });
    // Rien dans l'espace de Florent, rien en ligne.
    expect(baliseDe(etat.espaces[0], '9')!.paused).toBeUndefined();
    expect(etat.enLigne.find((x) => x.tagId === '9')!.paused).toBeUndefined();

    const [ligne] = lignesGtm(env);
    expect(ligne).toMatchObject({ outil: 'gtm_mettre_en_pause', conteneur: 'GTM-TEST123', auteur: 'florent@luminose.fr', issue: 'ok' });
    // Le journal garde la balise d'avant, entière : elle se rétablit à la main.
    const contenu = JSON.parse(ligne.contenu as string);
    expect(contenu).toMatchObject({ espace: 'à créer', entite: 'modification', nature: 'pause', balise: '9', corps: { paused: true } });
    expect(contenu.avant).toEqual({ name: 'GADS - Achat', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_ACHAT')], firingTriggerId: ['21'] });
    expect(JSON.parse(ligne.ressources as string)).toEqual([
      'https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/100',
      'https://tagmanager.google.com/#/container/accounts/6001/containers/7001/workspaces/100/tags/9',
    ]);
  });

  it('les notes de Florent restent, une ligne s’y ajoute ; le reste de la balise — dossier, consentement — part tel quel', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', { balise: '1', raison: 'Remplacée par la balise du 11/10.' });
    expect(JSON.parse(puts(appels)[0].corps)).toEqual({
      name: 'GADS - Rendez-vous', type: 'awct', parentFolderId: '40',
      parameter: [p('conversionId', AW), p('conversionLabel', 'LIBELLE_RDV'), b('enableConversionLinker', true)],
      firingTriggerId: ['21'], consentSettings: { consentStatus: 'notNeeded' }, paused: true,
      notes: 'Posée par Florent.\n[Claude] Mise en pause — Remplacée par la balise du 11/10.',
    });
  });

  it('ensuite, l’espace « [Claude] » sert tel quel : la modification suivante y relit la balise, avec sa nouvelle empreinte', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', PAUSE);
    const { apercu, execution } = await apercuPuisExecution(env, 'gtm_declencheurs_ajouter', { balise: '9', declencheurs: ['25'], raison: 'La page de remerciement d’achat.' });
    expect(texteDe(apercu)).toMatch(/Ajout de déclencheur à une balise dans l'espace de travail « \[Claude\] » \(n° 100\) :\n\n### « GADS - Achat » \(n° 9\) — Conversion Google Ads \(awct\) — EN PAUSE/);
    expect(texteDe(apercu)).toMatch(/La balise est en pause : elle ne partira sur aucun déclencheur/);
    expect(texteDe(execution)).toMatch(/^FAIT — écriture n° 2 du journal de Tag Manager\.\n\nBalise « GADS - Achat » \(n° 9\) : déclencheur n° 25 ajouté dans l’espace\./);
    expect(ecritures(appels).map((a) => [a.methode, a.url])).toEqual([
      ['POST', `${BASE}/workspaces`],
      ['PUT', `${BASE}/workspaces/100/tags/9?fingerprint=w100-9-0`],
      ['PUT', `${BASE}/workspaces/100/tags/9?fingerprint=w100-9-1`],
    ]);
    expect(baliseDe(claude(etat), '9')).toMatchObject({
      paused: true, firingTriggerId: ['21', '25'],
      notes: '[Claude] Mise en pause — Doublon de la balise n° 10.\n[Claude] Déclencheur ajouté : n° 25 — La page de remerciement d’achat.',
    });
    expect(etat.espaces.filter((e) => e.name === '[Claude]')).toHaveLength(1);
  });

  it('la balise a changé entre l’aperçu et l’exécution — dans l’espace, ou par une version publiée : refus, rien ne part, rien n’est journalisé', async () => {
    // Dans l'espace « [Claude] » : Florent y a changé un paramètre.
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', { balise: '10', raison: 'Essai.' });
    const jeton = jetonDe((await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    baliseDe(claude(etat), '9')!.parameter = [p('conversionId', AW), p('conversionLabel', 'CORRIGE')];
    const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/Le contenu diffère de celui de l'aperçu — d'autres arguments, ou la balise n° 9 a changé depuis : rien n'est parti/);
    expect(puts(appels)).toHaveLength(1);
    expect(lignesGtm(env)).toHaveLength(1);

    // Sans espace à l'aperçu : une version publiée depuis change la balise.
    const env2 = creerEnv();
    const s = simulerGtm();
    const jeton2 = jetonDe((await appelerOutil(env2, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    s.etat.enLigne.find((x) => x.tagId === '9')!.firingTriggerId = ['22'];
    const refus = await appelerOutil(env2, 'gtm_mettre_en_pause', { ...PAUSE, jeton: jeton2 }, GTM);
    expect(texteDe(refus.corps)).toMatch(/la balise n° 9 a changé depuis : rien n'est parti/);
    expect(ecritures(s.appels)).toEqual([]);
    expect(claude(s.etat)).toBeUndefined();
  });

  it('la garde ne dépend pas de l’appelant : la balise relue au moment d’écrire n’est plus celle de l’aperçu — refus, aucun PUT, journal en erreur', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', { balise: '10', raison: 'Essai.' });
    const jeton = jetonDe((await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    // La balise change entre la lecture de l'outil et la relecture de la couche D.
    let lectures = 0;
    etat.apresLecture = (x) => { if (x.tagId === '9' && ++lectures === 1) x.parameter = [p('conversionId', AW), p('conversionLabel', 'CORRIGE')]; };
    const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/^ÉCHEC — écriture n° 2 : La balise n° 9 de l'espace « \[Claude\] » n'est plus celle de l'aperçu \(la modification change autre chose que paused et les notes\) : rien n'est parti\. Refaites un aperçu\. Rien n'a été modifié dans l'espace\./);
    expect(puts(appels)).toHaveLength(1);
    expect(lignesGtm(env).map((l) => l.issue)).toEqual(['ok', 'erreur']);
  });

  it('l’empreinte : une balise changée entre la relecture et l’envoi, Tag Manager la refuse — ÉCHEC dit, journal en erreur', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', { balise: '10', raison: 'Essai.' });
    const jeton = jetonDe((await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    let lectures = 0;
    etat.apresLecture = (x) => { if (x.tagId === '9' && ++lectures === 2) x.fingerprint = 'w100-9-7'; };
    const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    expect(texteDe(corps)).toMatch(/^ÉCHEC — écriture n° 2 : Tag Manager refuse la modification \(Fingerprint mismatch\)\. Rien n'a été modifié dans l'espace\./);
    expect(puts(appels).at(-1)!.url).toBe(`${BASE}/workspaces/100/tags/9?fingerprint=w100-9-0`);
    expect(baliseDe(claude(etat), '9')!.paused).toBeUndefined();
    expect(lignesGtm(env).map((l) => l.issue)).toEqual(['ok', 'erreur']);
    // Le jeton a servi, même pour un échec : un nouvel essai passe par un nouvel aperçu.
    etat.apresLecture = undefined;
    const rejoue = await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    expect(texteDe(rejoue.corps)).toMatch(/Ce jeton d'aperçu a déjà servi/);
    expect(puts(appels)).toHaveLength(2);
  });

  it('un jeton ne vaut que pour ses arguments, une fois, et pour son outil', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const jeton = jetonDe((await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    for (const args of [{ ...PAUSE, balise: '10' }, { ...PAUSE, raison: 'Autre raison.' }]) {
      const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', { ...args, jeton }, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/diffère de celui de l'aperçu/);
    }
    const voisin = await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '9', raison: PAUSE.raison, jeton }, GTM);
    expect(texteDe(voisin.corps)).toMatch(/Jeton d'aperçu invalide pour cet outil/);
    expect(ecritures(appels)).toEqual([]);
    await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    // Rejoué, il ne ferait rien de plus : la balise relue est déjà en pause, et le refus vient avant le journal.
    const rejoue = await appelerOutil(env, 'gtm_mettre_en_pause', { ...PAUSE, jeton }, GTM);
    expect(texteDe(rejoue.corps)).toMatch(/« GADS - Achat » est déjà en pause : rien à faire/);
    expect(puts(appels)).toHaveLength(1);
  });

  it('de bout en bout, rien que des GET, des POST pour ouvrir l’espace et des PUT avec empreinte sur des balises de « [Claude] »', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    await apercuPuisExecution(env, 'gtm_mettre_en_pause', PAUSE);
    await apercuPuisExecution(env, 'gtm_declencheurs_ajouter', { balise: '1', declencheurs: ['25'], raison: 'Essai.' });
    await apercuPuisExecution(env, 'gtm_pages_vues_couper', { balise: '6', raison: 'Doublon de GA - Init.' });
    expect(lignesGtm(env).map((l) => l.issue)).toEqual(['ok', 'ok', 'ok']);
    expect(versGtm(appels).filter((a) => !['GET', 'POST', 'PUT'].includes(a.methode))).toEqual([]);
    expect(versGtm(appels).filter((a) => a.methode === 'POST').map((a) => a.url)).toEqual([`${BASE}/workspaces`]);
    expect(puts(appels)).toHaveLength(3);
    for (const a of puts(appels)) expect(cheminModificationPermis(a.url.slice(API.length), C, ESPACE), a.url).toBe(true);
  });
});

// ── Les tables fermées ───────────────────────────────────────────────────

describe('NORMATIF — G13 : une balise de « [Claude] », avec son empreinte', () => {
  const base = '/accounts/6001/containers/7001/workspaces';

  it('un PUT sur une balise de l’espace « [Claude] », empreinte comprise', () => {
    expect(cheminModificationPermis(`${base}/100/tags/9?fingerprint=w100-9-0`, C, ESPACE)).toBe(true);
    expect(cheminModificationPermis(`${base}/100/tags/9?fingerprint=1696512345678`, C, ESPACE)).toBe(true);
  });

  it('rien d’autre : ni sans empreinte, ni un déclencheur, ni une variable, ni l’espace de Florent, ni un autre conteneur', () => {
    for (const chemin of [
      `${base}/100/tags/9`, `${base}/100/tags/9?fingerprint=`, `${base}/100/tags/9?fingerprint=a&x=1`, `${base}/100/tags/9:revert?fingerprint=1`,
      `${base}/100/triggers/21?fingerprint=1`, `${base}/100/variables/31?fingerprint=1`, `${base}/100?fingerprint=1`, `${base}/100/tags?fingerprint=1`,
      `${base}/3/tags/9?fingerprint=1`, `${base}/100/../3/tags/9?fingerprint=1`, '/accounts/6001/containers/7002/workspaces/100/tags/9?fingerprint=1',
    ]) expect(cheminModificationPermis(chemin, C, ESPACE), chemin).toBe(false);
    expect(cheminModificationPermis(`${base}/3/tags/9?fingerprint=1`, C, { workspaceId: '3', name: 'Default Workspace' })).toBe(false);
    expect(cheminModificationPermis(`${base}/100/tags/9?fingerprint=1`, C)).toBe(false);
  });

  it('modifierBaliseGtm, appelée directement : hors de « [Claude] », rien ne se lit ni ne part ; un corps qui change autre chose, rien ne part', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    etat.espaces.push({ workspaceId: '100', name: '[Claude]', balises: copier('100', etat.enLigne), changements: [] });
    const avant = baliseDe(claude(etat), '9') as Balise;
    const { fingerprint: _f, tagId: _t, ...corps } = avant;
    await expect(modifierBaliseGtm(env, C, { workspaceId: '3', name: 'Default Workspace' }, '9', 'pause', { ...corps, paused: true, notes: '[Claude] x' }))
      .rejects.toThrow(/Écriture refusée par la couche D/);
    expect(versGtm(appels)).toEqual([]);
    await expect(modifierBaliseGtm(env, C, ESPACE, '9', 'pause', { ...corps, paused: true, name: 'Autre', notes: '[Claude] x' }))
      .rejects.toThrow(/n'est plus celle de l'aperçu \(la modification change autre chose que paused et les notes\)/);
    expect(puts(appels)).toEqual([]);
    // Et la forme juste part, avec le jeton d'écriture et l'empreinte relue.
    await modifierBaliseGtm(env, C, ESPACE, '9', 'pause', { ...corps, paused: true, notes: '[Claude] x' });
    expect(puts(appels).map((a) => [a.url, a.entetes.authorization])).toEqual([[`${BASE}/workspaces/100/tags/9?fingerprint=w100-9-0`, 'Bearer acces-gtm-ecriture']]);
  });
});

describe('NORMATIF — G14 à G17 : la table fermée des différences', () => {
  const awct: Balise = { tagId: '9', fingerprint: 'w1', name: 'GADS - X', type: 'awct', parameter: [p('conversionId', AW), p('conversionLabel', 'L')], firingTriggerId: ['21'], blockingTriggerId: ['24'], notes: 'n' };
  const { tagId: _t, fingerprint: _f, ...corps } = awct;
  const googtag: Balise = { name: 'G', type: 'googtag', parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('cookie_flags', 'secure'), ligneConfig('send_page_view', 'true'))], firingTriggerId: ['23'] };
  const noter = (o: Record<string, unknown>, avant?: string) => ({ ...o, notes: `${avant ? `${avant}\n` : ''}[Claude] raison` });

  it('ce que les outils construisent passe', () => {
    expect(modificationRefusee('pause', awct, noter({ ...corps, paused: true }, 'n'))).toBeNull();
    expect(modificationRefusee('declencheurs', awct, noter({ ...corps, firingTriggerId: ['21', '25', '2147479553'] }, 'n'))).toBeNull();
    expect(modificationRefusee('pages_vues', googtag, noter({ ...googtag, parameter: couperPagesVues(googtag.parameter!) }))).toBeNull();
  });

  it('une seule chose change, dans le seul sens permis, et les notes ne font que s’allonger d’une ligne « [Claude] … »', () => {
    for (const [quoi, nature, stockee, apres, raison] of [
      ['rétablir', 'pause', { ...awct, paused: true }, noter({ ...corps, paused: false }, 'n'), /déjà en pause/],
      ['une pause qui n’en est pas une', 'pause', awct, noter({ ...corps }, 'n'), /une pause met paused à true/],
      ['une pause en texte', 'pause', awct, noter({ ...corps, paused: 'true' }, 'n'), /une pause met paused à true/],
      ['pause et autre chose', 'pause', awct, noter({ ...corps, paused: true, name: 'Autre' }, 'n'), /change autre chose que paused/],
      ['pause d’une balise HTML', 'pause', { ...awct, type: 'html' }, noter({ ...corps, type: 'html', paused: true }, 'n'), /une balise html ne se met pas en pause/],
      ['pause d’un modèle', 'pause', { ...awct, type: 'cvt_K8GSG' }, noter({ ...corps, type: 'cvt_K8GSG', paused: true }, 'n'), /cvt_K8GSG ne se met pas en pause/],
      ['pause de la balise Google', 'pause', googtag, noter({ ...googtag, paused: true }), /googtag ne se met pas en pause/],
      ['retirer un déclencheur', 'declencheurs', awct, noter({ ...corps, firingTriggerId: ['25'] }, 'n'), /on en ajoute, on n'en retire pas/],
      ['rien d’ajouté', 'declencheurs', awct, noter({ ...corps }, 'n'), /de 1 à 5 déclencheurs ajoutés/],
      ['initialisation', 'declencheurs', awct, noter({ ...corps, firingTriggerId: ['21', '2147479572'] }, 'n'), /un déclencheur d'initialisation/],
      ['bloquant', 'declencheurs', awct, noter({ ...corps, firingTriggerId: ['21', '24'] }, 'n'), /un déclencheur qui bloque la balise/],
      ['en double', 'declencheurs', awct, noter({ ...corps, firingTriggerId: ['21', '25', '25'] }, 'n'), /un déclencheur en double/],
      ['déclencheur sur du HTML', 'declencheurs', { ...awct, type: 'html' }, noter({ ...corps, type: 'html', firingTriggerId: ['21', '25'] }, 'n'), /une balise html ne reçoit pas de déclencheur/],
      ['déclencheurs et pause', 'declencheurs', awct, noter({ ...corps, firingTriggerId: ['21', '25'], paused: true }, 'n'), /change autre chose que firingTriggerId/],
      ['send_page_view à true', 'pages_vues', { ...googtag, parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('send_page_view', 'false'))] },
        noter({ ...googtag, parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('send_page_view', 'true'))] }), /rien à couper/],
      ['un autre paramètre', 'pages_vues', googtag, noter({ ...googtag, parameter: [p('tagId', 'G-AUTRE999'), ...couperPagesVues(googtag.parameter!).slice(1)] }), /send_page_view passe à false, et rien d'autre/],
      ['pages vues ailleurs', 'pages_vues', awct, noter({ ...corps }, 'n'), /n'existe que dans une balise Google/],
      ['notes remplacées', 'pause', awct, { ...corps, paused: true, notes: '[Claude] raison' }, /celles de la balise restent/],
      ['notes sans marque', 'pause', awct, { ...corps, paused: true, notes: 'n\nraison' }, /une ligne « \[Claude\] … »/],
      ['notes sur deux lignes', 'pause', awct, { ...corps, paused: true, notes: 'n\n[Claude] a\nb' }, /une ligne « \[Claude\] … »/],
      ['balisage dans les notes', 'pause', awct, { ...corps, paused: true, notes: 'n\n[Claude] <script>' }, /sans balisage/],
      ['champ tenu par Tag Manager', 'pause', awct, noter({ ...corps, paused: true, fingerprint: 'w9' }, 'n'), /champ tenu par Tag Manager dans le corps : fingerprint/],
    ] as const) expect(modificationRefusee(nature, stockee as Balise, apres), quoi).toMatch(raison);
  });

  it('couper send_page_view : la ligne passe à false, ou s’ajoute ; rien d’autre ne bouge, l’ordre non plus', () => {
    expect(couperPagesVues([p('tagId', 'G-X')])).toEqual([p('tagId', 'G-X'), config(ligneConfig('send_page_view', 'false'))]);
    expect(couperPagesVues([config(ligneConfig('a', '1')), p('tagId', 'G-X')]))
      .toEqual([config(ligneConfig('a', '1'), ligneConfig('send_page_view', 'false')), p('tagId', 'G-X')]);
    expect(couperPagesVues([config(ligneConfig('send_page_view', 'true'), ligneConfig('a', '1'))]))
      .toEqual([config(ligneConfig('send_page_view', 'false'), ligneConfig('a', '1'))]);
  });
});

// ── Les outils ───────────────────────────────────────────────────────────

describe('gtm_mettre_en_pause', () => {
  it('des balises de mesure seulement — jamais la balise Google, le linker, du HTML ni un modèle ; ni deux fois, ni une inconnue', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [balise, raison] of [
      ['3', /« GA - Init » \(googtag\) ne se met pas en pause par ce serveur : la balise Google porte la configuration/],
      ['8', /« Conversion Linker » \(gclidw\) ne se met pas en pause .* le linker garde le clic d’origine/],
      ['7', /« Pixel » \(html\) ne se met pas en pause .* un bandeau de consentement se cache souvent/],
      ['5', /« Consent Mode » \(cvt_K8GSG\) ne se met pas en pause .* le mode Consentement du conteneur en est un/],
      ['11', /« GA - Ancien » est déjà en pause : rien à faire/],
      ['99', /Balise n° 99 introuvable dans la version en ligne n° 38 « Octobre »/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', { balise, raison: 'Essai.' }, GTM);
      expect(texteDe(corps), balise).toMatch(raison);
    }
    expect(ecritures(appels)).toEqual([]);
  });

  it('dit quand c’est la seule balise active d’une conversion, et quand un autre espace modifie la même balise', async () => {
    const env = creerEnv();
    const etat = nouvelEtat();
    etat.espaces[0].changements = [{ changeStatus: 'updated', tag: { tagId: '1', name: 'GADS - Rendez-vous' } }];
    simulerGtm(etat);
    const seule = texteDe((await appelerOutil(env, 'gtm_mettre_en_pause', { balise: '1', raison: 'Essai.' }, GTM)).corps);
    expect(seule).toMatch(/ATTENTION — c’est la seule balise active de la conversion AW-1234567890\/LIBELLE_RDV : publiée, la pause l’arrête/);
    expect(seule).toMatch(/ATTENTION — l'espace « Default Workspace » \(n° 3\) modifie aussi cette balise, sans l'avoir publiée/);
    // Le doublon a une autre balise active pour la même conversion : rien à dire.
    const doublon = texteDe((await appelerOutil(env, 'gtm_mettre_en_pause', PAUSE, GTM)).corps);
    expect(doublon).toMatch(/^APERÇU/);
    expect(doublon).not.toMatch(/ATTENTION/);
  });

  it('la raison est exigée, en une phrase sans balisage', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const args of [{ balise: '9' }, { balise: '9', raison: '<b>x</b>' }, { balise: '9', raison: 'a\nb' }]) {
      const { corps } = await appelerOutil(env, 'gtm_mettre_en_pause', args, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(/^Arguments invalides pour gtm_mettre_en_pause/);
    }
    expect(versGtm(appels)).toEqual([]);
  });
});

describe('gtm_declencheurs_ajouter', () => {
  it('ajoute à la suite, écarte ce qui y est déjà, et nomme chaque déclencheur', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const { apercu } = await apercuPuisExecution(env, 'gtm_declencheurs_ajouter', { balise: '1', declencheurs: ['25', '21', '25'], raison: 'La page de remerciement d’achat.' });
    const t = texteDe(apercu);
    expect(t).toMatch(/- s’ajoute : « Merci achat » \(Vue de page \(pageview\) — \{\{Page Path\}\} contient « \/merci-achat »\)/);
    expect(t).toMatch(/- déjà là, écarté : « Merci rendez-vous »/);
    expect(t).toMatch(/- notes : s’y ajoute « \[Claude\] Déclencheur ajouté : n° 25 — La page de remerciement d’achat\. »/);
    expect(JSON.parse(puts(appels)[0].corps)).toMatchObject({ firingTriggerId: ['21', '25'], notes: 'Posée par Florent.\n[Claude] Déclencheur ajouté : n° 25 — La page de remerciement d’achat.' });
  });

  it('refuse ce qui y est déjà, ce qui la bloque, l’initialisation, l’inconnu, et les balises que ce serveur ne crée pas ; avertit pour « All Pages »', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [args, raison] of [
      [{ balise: '1', declencheurs: ['21'] }, /« GADS - Rendez-vous » part déjà sur n° 21 : rien à ajouter/],
      [{ balise: '4', declencheurs: ['24'] }, /n° 24 bloque « GA - Prendre un rendez-vous »/],
      [{ balise: '1', declencheurs: ['2147479573'] }, /« Initialization - All Pages » : réservé aux balises de configuration/],
      [{ balise: '1', declencheurs: ['77'] }, /Déclencheur\(s\) introuvable\(s\) dans la version en ligne n° 38 « Octobre » : n° 77/],
      [{ balise: '7', declencheurs: ['21'] }, /« Pixel » \(html\) : ce serveur n’ajoute de déclencheur qu’à une conversion Google Ads \(awct\) ou à un événement GA4 \(gaawe\)/],
      [{ balise: '3', declencheurs: ['21'] }, /« GA - Init » \(googtag\) : ce serveur n’ajoute de déclencheur qu’à/],
      [{ balise: '1', declencheurs: ['2147479553'] }, /ATTENTION — « All Pages » : cette conversion compterait chaque page vue du site/],
      [{ balise: '4', declencheurs: ['2147479553'] }, /^APERÇU(?![\s\S]*All Pages » : cette conversion)/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_declencheurs_ajouter', { ...args, raison: 'Essai.' }, GTM);
      expect(texteDe(corps), JSON.stringify(args)).toMatch(raison);
    }
    expect(ecritures(appels)).toEqual([]);
  });
});

describe('NORMATIF — gtm_pages_vues_couper : jamais la dernière', () => {
  it('coupe send_page_view de l’une, nomme celle qui continue, et ne touche à rien d’autre', async () => {
    const env = creerEnv();
    const { appels, etat } = simulerGtm();
    const { apercu, execution } = await apercuPuisExecution(env, 'gtm_pages_vues_couper', { balise: '6', raison: 'Doublon de GA - Init.' });
    const t = texteDe(apercu);
    expect(t).toMatch(/Aujourd’hui, 2 balises Google envoient une page vue à G-TEST1234 : là où elles partent toutes, GA4 compte chaque page 2 fois\./);
    expect(t).toMatch(/- send_page_view = false : « FB GA4 Config » garde sa configuration/);
    expect(t).toMatch(/- les pages vues continuent de partir de : « GA - Init » \(n° 3\), déclenchée par « Consent Initialization - All Pages »\./);
    expect(texteDe(execution)).toMatch(/Balise « FB GA4 Config » \(n° 6\) : send_page_view coupé dans l’espace ; les pages vues partent de « GA - Init »\./);
    expect(JSON.parse(puts(appels)[0].corps)).toEqual({
      name: 'FB GA4 Config', type: 'googtag', firingTriggerId: ['23'],
      parameter: [p('tagId', 'G-TEST1234'), config(ligneConfig('cookie_flags', 'secure'), ligneConfig('send_page_view', 'false'))],
      notes: '[Claude] send_page_view coupé — Doublon de GA - Init.',
    });
    // La dernière ne se coupe pas : « GA - Variable » ne compte pas, sa valeur ne se lit qu'au chargement.
    const derniere = await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '3', raison: 'Essai.' }, GTM);
    expect(texteDe(derniere.corps)).toMatch(/« GA - Init » est la seule balise Google qui envoie avec certitude les pages vues à G-TEST1234 dans l'espace de travail « \[Claude\] » \(100\) : coupée, GA4 n’en compterait plus aucune/);
    expect(baliseDe(claude(etat), '3')!.parameter).toEqual(BALISES[2].parameter);
  });

  it('deux coupes préparées ensemble, sur les deux balises : la seconde est refusée à l’exécution', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    const a = jetonDe((await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '3', raison: 'Essai.' }, GTM)).corps);
    const b6 = jetonDe((await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '6', raison: 'Essai.' }, GTM)).corps);
    expect(a && b6).toBeTruthy();
    expect(texteDe((await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '6', raison: 'Essai.', jeton: b6 }, GTM)).corps)).toMatch(/^FAIT/);
    const second = await appelerOutil(env, 'gtm_pages_vues_couper', { balise: '3', raison: 'Essai.', jeton: a }, GTM);
    expect(texteDe(second.corps)).toMatch(/« GA - Init » est la seule balise Google qui envoie avec certitude les pages vues/);
    expect(puts(appels).map((x) => x.url)).toEqual([`${BASE}/workspaces/100/tags/6?fingerprint=w100-6-0`]);
    expect(lignesGtm(env)).toHaveLength(1);
  });

  it('refuse ce qui n’est pas une balise Google GA4, ce qui n’envoie rien, et une valeur qui passe par une variable', async () => {
    const env = creerEnv();
    const { appels } = simulerGtm();
    for (const [balise, raison] of [
      ['4', /« GA - Prendre un rendez-vous » \(gaawe\) n’est pas une balise Google : send_page_view n’existe que là/],
      ['2', /« Balise Google AdWords » ne configure pas GA4 \(AW-1234567890\)/],
      ['12', /send_page_view de « GA - Variable » passe par une variable/],
    ] as const) {
      const { corps } = await appelerOutil(env, 'gtm_pages_vues_couper', { balise, raison: 'Essai.' }, GTM);
      expect(texteDe(corps), balise).toMatch(raison);
    }
    expect(ecritures(appels)).toEqual([]);
  });
});
