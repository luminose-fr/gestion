/**
 * La page d'essai (SPEC §14.5) : servie en recette seulement, sur l'hôte du
 * site et à sa racine seulement ; son code ne touche pas au stockage du
 * navigateur, et retire le jeton de l'adresse avant tout appel.
 */
import { describe, it, expect } from 'vitest';
import porte, { type Env } from '../src/index';
import { SCRIPT, pageDEssai } from '../src/essai/page';

const SITE = 'https://essai-recette.luminose.fr';
const PORTE = 'https://api-recette.luminose.fr';
const env = (extra: Partial<Env> = {}): Env => ({ ENVIRONNEMENT: 'recette', ORIGINE_SITE: SITE, ORIGINE_PORTE: PORTE, ...extra });
const appeler = (url: string, methode = 'GET', e = env()) => porte.fetch(new Request(url, { method: methode }), e);

describe('où la page est servie', () => {
  it('GET / sur l’hôte du site, en recette : la page, avec une CSP qui n’ouvre que la porte', async () => {
    const r = await appeler(`${SITE}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Security-Policy')).toContain(`connect-src ${PORTE}`);
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    const html = await r.text();
    expect(html).toContain('Page d’essai — recette');
    expect(html).toContain(JSON.stringify(PORTE));
  });

  it.each([
    ['une autre adresse du site', `${SITE}/autre`, 'GET'],
    ['la racine en POST', `${SITE}/`, 'POST'],
    ['une adresse de la porte sur l’hôte du site', `${SITE}/v1/questionnaires`, 'POST'],
    ['l’essai sur l’hôte du site', `${SITE}/v1/essai`, 'POST'],
    ['la racine de la porte', `${PORTE}/`, 'GET'],
  ])('%s : 404, corps vide', async (_nom, url, methode) => {
    const r = await appeler(url, methode);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('');
  });

  it.each([['production', 'production'], ['sans environnement', undefined]])('hors recette (%s) : 404', async (_nom, environnement) => {
    const r = await appeler(`${SITE}/`, 'GET', env({ ENVIRONNEMENT: environnement }));
    expect(r.status).toBe(404);
  });
});

describe('son code', () => {
  it('ne touche ni localStorage, ni sessionStorage, ni les cookies, ni IndexedDB', () => {
    for (const interdit of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) expect(SCRIPT).not.toContain(interdit);
  });

  it('retire le jeton de l’adresse et de l’historique avant tout fetch', () => {
    const retrait = SCRIPT.indexOf('history.replaceState');
    expect(retrait).toBeGreaterThan(-1);
    const premierFetch = SCRIPT.search(/\bfetch\s*\(/);
    const premierAppel = SCRIPT.search(/\bouvrir\(\);|\bappeler\(/);
    expect(premierFetch).toBeGreaterThan(retrait);
    expect(premierAppel).toBeGreaterThan(retrait);
  });

  it('fabrique la clé par crypto.getRandomValues, 32 caractères de [A-Za-z0-9_-]', () => {
    expect(SCRIPT).toContain('crypto.getRandomValues(new Uint8Array(32))');
    expect(SCRIPT).toContain("const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';");
    expect(SCRIPT).toContain('ALPHABET[o % 64]');
  });

  it('une identité fictive : des adresses en example.org, aucun numéro de téléphone', () => {
    const html = pageDEssai(PORTE);
    for (const adresse of html.match(/[\w.+-]+@[\w.-]+/g) ?? []) expect(adresse).toMatch(/@example\.org$/);
    expect(html).not.toMatch(/(\+33|0[67])[\s.]?\d{1,2}([\s.]?\d{2}){3}/);
  });

  it('l’origine de la porte est encodée, pas injectée telle quelle', () => {
    expect(pageDEssai('https://x.example.org"</script><script>alert(1)')).not.toContain('</script><script>alert(1)');
  });
});
