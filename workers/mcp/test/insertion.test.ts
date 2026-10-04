/**
 * L'insertion de mot-clé — décision du 04/10/2026
 * (workers/mcp/decisions/2026-10-04-elements-et-insertion.md).
 *
 * Avec `{KeyWord:texte par défaut}`, c'est le mot-clé qui écrit le titre. Ce
 * qui se vérifie ici : la syntaxe et les casses de Google, la longueur comptée
 * sur le texte par défaut, le rendu par mot-clé — et le filtre déontologique
 * appliqué à chaque rendu, à la création de l'annonce comme à l'ajout d'un
 * mot-clé dans un groupe dont une annonce l'utilise.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CASSES, LIMITES_ANNONCE, aInsertion, analyser, appliquerCasse, longueur, rendre, texteParDefaut } from '../src/insertion';
import { examinerRendus } from '../src/regles';
import { COMPTE, LIRE_ECRIRE, appelerOutil, creerEnv, simulerFetch, texteDe, type Appel, type EnvFactice } from './aides';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

// ── La syntaxe, la casse, la longueur ────────────────────────────────────

describe('la syntaxe de Google, et elle seule', () => {
  it('les cinq casses admises, avec un texte par défaut', () => {
    for (const casse of CASSES) {
      const a = analyser(`{${casse}:Hypnose à Lyon}`);
      expect(a.erreurs, casse).toEqual([]);
      expect(aInsertion(a), casse).toBe(true);
      expect(texteParDefaut(a), casse).toBe('Hypnose à Lyon');
    }
  });

  it('refuse les autres casses, les autres syntaxes, et une insertion sans texte par défaut', () => {
    const refuses: [string, RegExp][] = [
      ['{KEYWORD:Hypnose}', /la casse « KEYWORD » n'est pas admise par Google — keyword, Keyword, KeyWord, KEYWord, KeyWORD/],
      ['{keyWord:Hypnose}', /la casse « keyWord » n'est pas admise/],
      ['{KeyWord}', /il faut un texte par défaut/],
      ['{KeyWord: }', /il faut un texte par défaut/],
      ['{LOCATION(City):Lyon}', /seule l'insertion de mot-clé est admise/],
      ['{=COUNTDOWN("2026/12/01")}', /seule l'insertion de mot-clé est admise/],
      ['Hypnose {KeyWord:Lyon', /accolade ouvrante sans fermante/],
      ['Hypnose } Lyon', /accolade fermante sans ouvrante/],
      ['{KeyWord:{KeyWord:Lyon}}', /accolades imbriquées/],
    ];
    for (const [texte, motif] of refuses) {
      const a = analyser(texte);
      expect(a.erreurs.join(' '), texte).toMatch(motif);
    }
  });

  it('un texte sans accolades est un texte, sans insertion', () => {
    const a = analyser('Psychopraticien à Lyon');
    expect(a).toEqual({ segments: ['Psychopraticien à Lyon'], erreurs: [] });
    expect(aInsertion(a)).toBe(false);
  });

  it('la longueur se compte sur le texte par défaut, en caractères — pas sur la syntaxe', () => {
    const titre = '{KeyWord:Psychopraticien à Lyon} ici';
    expect(longueur(titre)).toBe(36);
    expect(longueur(texteParDefaut(analyser(titre)))).toBe(26);
    // Un caractère accentué compte pour un, comme chez Google.
    expect(longueur('Séance à Lyon')).toBe(13);
  });

  it('la casse de Google, mot par mot', () => {
    const mot = 'HYPNOSE lyon centre';
    expect(appliquerCasse(mot, 'keyword')).toBe('hypnose lyon centre');
    expect(appliquerCasse(mot, 'Keyword')).toBe('Hypnose lyon centre');
    expect(appliquerCasse(mot, 'KeyWord')).toBe('Hypnose Lyon Centre');
    expect(appliquerCasse(mot, 'KEYWord')).toBe('HYPNOSE Lyon Centre');
    expect(appliquerCasse(mot, 'KeyWORD')).toBe('Hypnose LYON CENTRE');
    expect(appliquerCasse('état anxieux', 'KeyWord')).toBe('État Anxieux');
  });

  it('au-delà de la limite, Google affiche le texte par défaut', () => {
    const a = analyser('{KeyWord:Hypnose à Lyon}');
    expect(rendre(a, 'hypnose anxiété', LIMITES_ANNONCE.titre)).toEqual({ texte: 'Hypnose Anxiété', replie: false });
    expect(rendre(a, 'hypnose pour les troubles anxieux', LIMITES_ANNONCE.titre)).toEqual({ texte: 'Hypnose à Lyon', replie: true });
    // Exactement à la limite : le rendu passe.
    expect(rendre(analyser('{keyword:x}'), 'a'.repeat(30), 30)).toEqual({ texte: 'a'.repeat(30), replie: false });
  });
});

describe('le filtre, appliqué à chaque rendu', () => {
  const annonce = {
    titres: ['{KeyWord:Hypnose à Lyon}', 'Séance individuelle', 'Prendre rendez-vous'],
    descriptions: ['Un espace pour déposer ce qui pèse.', 'Première séance : un temps pour se rencontrer.'],
    chemins: ['seances'],
  };

  it('un mot-clé qui écrirait un terme interdit est refusé ; un autre passe', () => {
    const [sage, interdit] = examinerRendus(annonce, ['hypnose anxiété', 'hypnose qui guérit']);
    expect(sage).toMatchObject({ motCle: 'hypnose anxiété', refus: [], avertissements: [] });
    expect(sage.textes).toEqual([{ source: '{KeyWord:Hypnose à Lyon}', texte: 'Hypnose Anxiété', replie: false }]);
    expect(interdit.refus.join(' ')).toMatch(/guéri… \(guérir, guérison\) — dans « Hypnose Qui Guérit »/);
  });

  it('trop long pour le titre, le mot-clé n’y écrit rien : c’est le texte par défaut que le filtre lit', () => {
    const [r] = examinerRendus(annonce, ['guérir de l’anxiété grâce à l’hypnose']);
    expect(r.textes[0]).toMatchObject({ texte: 'Hypnose à Lyon', replie: true });
    expect(r.refus).toEqual([]);
  });

  it('« hypnothérapeute » avertit, ne refuse pas ; et ce que le texte par défaut déclenche n’est pas répété par mot-clé', () => {
    const [r] = examinerRendus(annonce, ['hypnothérapeute lyon']);
    expect(r.refus).toEqual([]);
    expect(r.avertissements.join(' ')).toMatch(/« hypnothérapeute » : l'hypnose est un outil, pas un titre \(socle\/identite\.md\)/);
    const atelier = { ...annonce, titres: [...annonce.titres, 'Atelier du samedi'] };
    expect(examinerRendus(atelier, ['atelier hypnose'])[0].avertissements).toEqual([]);
  });

  it('les refus par combinaison portent sur toute l’annonce, rendu compris', () => {
    const remplace = { ...annonce, descriptions: ['Ne remplace pas un suivi.', 'Première séance : un temps pour se rencontrer.'] };
    expect(examinerRendus(remplace, ['hypnose anxiété'])[0].refus).toEqual([]);
    expect(examinerRendus(remplace, ['médecin hypnose'])[0].refus.join(' ')).toMatch(/remplace \+ médecin ou traitement/);
  });
});

// ── Dans les outils ──────────────────────────────────────────────────────

type Monde = {
  motsCles?: string[];
  annonces?: { id: string; titres: string[]; descriptions: string[] }[];
};

const reponse = (results: unknown[]) => Response.json({ results });

const simulerCompte = (monde: Monde = {}) => simulerFetch(({ url, corps }) => {
  if (url.endsWith(':search')) {
    const q: string = JSON.parse(corps).query;
    if (/FROM ad_group WHERE ad_group\.id = 444$/.test(q)) {
      return reponse([{ adGroup: { name: 'Anxiété', status: 'ENABLED', type: 'SEARCH_STANDARD' }, campaign: { name: 'Troubles anxieux', advertisingChannelType: 'SEARCH' } }]);
    }
    if (/FROM label WHERE label\.name = '\[Claude\]'/.test(q)) return reponse([{ label: { resourceName: `customers/${COMPTE}/labels/42` } }]);
    if (/FROM ad_group_criterion WHERE ad_group\.id = 444 AND ad_group_criterion\.type = 'KEYWORD' AND ad_group_criterion\.negative = FALSE/.test(q)) {
      return reponse((monde.motsCles ?? []).map((text) => ({ adGroupCriterion: { keyword: { text, matchType: 'PHRASE' }, status: 'ENABLED' } })));
    }
    if (/FROM ad_group_ad WHERE ad_group\.id = 444 AND ad_group_ad\.status != 'REMOVED' AND ad_group_ad\.ad\.type = 'RESPONSIVE_SEARCH_AD'$/.test(q)) {
      return reponse((monde.annonces ?? []).map((a) => ({ adGroupAd: { ad: { id: a.id, responsiveSearchAd: {
        headlines: a.titres.map((text) => ({ text })), descriptions: a.descriptions.map((text) => ({ text })), path1: 'seances',
      } } } })));
    }
    throw new Error(`Requête non simulée : ${q}`);
  }
  if (url.endsWith(':mutate')) {
    const c = JSON.parse(corps);
    if (c.validateOnly) return Response.json({});
    const service = url.slice(url.lastIndexOf('/') + 1).replace(':mutate', '');
    return reponse(c.operations.map((_: unknown, i: number) => ({ resourceName: `customers/${COMPTE}/${service}/444~${8000 + i}` })));
  }
  return undefined;
});

const mutations = (appels: Appel[]) => appels.filter((a) => a.url.endsWith(':mutate')).map((a) => JSON.parse(a.corps));
const jetonDe = (corps: any) => /jeton = "([^"]+)"/.exec(texteDe(corps))?.[1];
const apercu = async (env: EnvFactice, outil: string, args: Record<string, unknown>) => texteDe((await appelerOutil(env, outil, args, LIRE_ECRIRE)).corps);

const ANNONCE = {
  groupe: '444',
  titres: ['{KeyWord:Psychopraticien à Lyon}', 'Séance individuelle', 'Prendre rendez-vous'],
  descriptions: ['Un espace pour déposer ce qui pèse.', 'Première séance : un temps pour se rencontrer.'],
  chemin1: 'seances',
  url_finale: 'https://luminose.fr/seances/',
};

describe('ads_annonce_creer — l’insertion de mot-clé', () => {
  it('accepte un titre dont la syntaxe dépasse 30 caractères mais pas le texte par défaut, et l’envoie tel quel', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ motsCles: ['hypnose anxiété'] });
    const t = await apercu(env, 'ads_annonce_creer', ANNONCE);
    expect(t).toMatch(/^APERÇU/);
    const [verification] = mutations(appels);
    expect(verification.operations[0].create.ad.responsiveSearchAd.headlines[0]).toEqual({ text: '{KeyWord:Psychopraticien à Lyon}' });
  });

  it('refuse un texte par défaut trop long, en disant que c’est lui qui est compté', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    const t = await apercu(env, 'ads_annonce_creer', { ...ANNONCE, titres: ['{KeyWord:Psychopraticien à Lyon Part-Dieu}', ...ANNONCE.titres.slice(1)] });
    expect(t).toMatch(/Annonce refusée, rien n’est parti :\n- titre « \{KeyWord:Psychopraticien à Lyon Part-Dieu\} » : 32 caractères affichés \(texte par défaut\) — 30 au plus\./);
    expect(appels).toEqual([]);
  });

  it('une description à insertion : 90 caractères, comptés de même', async () => {
    const env = creerEnv();
    simulerCompte({ motsCles: ['hypnose anxiété'] });
    const longue = `{Keyword:${'a'.repeat(91)}}`;
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, descriptions: [longue, ANNONCE.descriptions[1]] }))
      .toMatch(/description « \{Keyword:a+\} » : 91 caractères affichés \(texte par défaut\) — 90 au plus/);
    const juste = `{Keyword:${'a'.repeat(90)}}`;
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, descriptions: [juste, ANNONCE.descriptions[1]] })).toMatch(/^APERÇU/);
  });

  it('refuse une casse que Google n’admet pas, et toute insertion dans un chemin', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, titres: ['{KEYWORD:Hypnose à Lyon}', ...ANNONCE.titres.slice(1)] }))
      .toMatch(/la casse « KEYWORD » n'est pas admise par Google/);
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, chemin1: '{KeyWord:lyon}' })).toMatch(/Pas d'insertion de mot-clé dans un chemin/);
    expect(appels).toEqual([]);
  });

  it('l’aperçu montre le titre que chaque mot-clé du groupe afficherait, casse appliquée, et les trop longs', async () => {
    const env = creerEnv();
    simulerCompte({ motsCles: ['hypnose anxiété', 'psychopraticien lyon', 'hypnose pour les troubles anxieux'] });
    const t = await apercu(env, 'ads_annonce_creer', ANNONCE);
    expect(t).toMatch(/INSERTION DE MOT-CLÉ — ce que chaque mot-clé du groupe afficherait \(3\) :/);
    expect(t).toMatch(/- « hypnose anxiété » : « Hypnose Anxiété »/);
    expect(t).toMatch(/- « psychopraticien lyon » : « Psychopraticien Lyon »/);
    expect(t).toMatch(/- « hypnose pour les troubles anxieux » : trop long, texte par défaut « Psychopraticien à Lyon »/);
  });

  it('NORMATIF — refusée si un mot-clé du groupe écrirait un titre interdit ; rien ne part', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ motsCles: ['hypnose anxiété', 'hypnose qui guérit'] });
    const t = await apercu(env, 'ads_annonce_creer', ANNONCE);
    expect(t).toMatch(/Annonce refusée : avec l'insertion de mot-clé, ces mots-clés du groupe écriraient un texte interdit/);
    expect(t).toMatch(/- mot-clé « hypnose qui guérit » : guéri… \(guérir, guérison\) — dans « Hypnose Qui Guérit »/);
    expect(t).not.toMatch(/hypnose anxiété/);
    expect(mutations(appels)).toEqual([]);
  });

  it('le même mot-clé, sans insertion dans l’annonce : rien à refuser — le filtre ne lit pas les mots-clés', async () => {
    const env = creerEnv();
    simulerCompte({ motsCles: ['hypnose qui guérit'] });
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, titres: ['Psychopraticien à Lyon', ...ANNONCE.titres.slice(1)] })).toMatch(/^APERÇU/);
  });

  it('« hypnothérapeute » dans un titre rendu : un avertissement, pas un refus', async () => {
    const env = creerEnv();
    simulerCompte({ motsCles: ['hypnothérapeute lyon'] });
    const t = await apercu(env, 'ads_annonce_creer', ANNONCE);
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/AVERTISSEMENTS — à relire avant de valider :\n- mot-clé « hypnothérapeute lyon » : « hypnothérapeute » : l'hypnose est un outil, pas un titre \(socle\/identite\.md\) — titre rendu « Hypnothérapeute Lyon »/);
  });

  it('un groupe sans mot-clé : le texte par défaut, et la promesse que l’ajout sera contrôlé', async () => {
    const env = creerEnv();
    simulerCompte();
    expect(await apercu(env, 'ads_annonce_creer', ANNONCE)).toMatch(/le groupe n'a encore aucun mot-clé : le texte par défaut s'affichera/);
  });

  it('le texte par défaut passe le filtre comme un texte écrit', async () => {
    const env = creerEnv();
    const appels = simulerCompte();
    expect(await apercu(env, 'ads_annonce_creer', { ...ANNONCE, titres: ['{KeyWord:Guérir l’anxiété}', ...ANNONCE.titres.slice(1)] }))
      .toMatch(/Annonce refusée par le filtre déontologique/);
    expect(appels).toEqual([]);
  });

  it('le jeton vaut pour la syntaxe exacte : une autre casse est un autre contenu', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ motsCles: ['hypnose anxiété'] });
    const jeton = jetonDe((await appelerOutil(env, 'ads_annonce_creer', ANNONCE, LIRE_ECRIRE)).corps);
    const autre = { ...ANNONCE, titres: ['{keyword:Psychopraticien à Lyon}', ...ANNONCE.titres.slice(1)], jeton };
    expect(texteDe((await appelerOutil(env, 'ads_annonce_creer', autre, LIRE_ECRIRE)).corps)).toMatch(/diffère de celui de l'aperçu/);
    expect(mutations(appels).filter((m) => !m.validateOnly)).toEqual([]);
  });
});

describe('ads_mots_cles_ajouter — dans un groupe dont une annonce utilise l’insertion', () => {
  const INSERTION = { id: '9001', titres: ['{KeyWord:Hypnose à Lyon}', 'Séance individuelle', 'Prendre rendez-vous'], descriptions: ['Un espace pour déposer ce qui pèse.', 'Sur rendez-vous.'] };
  const SANS = { id: '9002', titres: ['Psychopraticien à Lyon', 'Séance individuelle', 'Prendre rendez-vous'], descriptions: ['Un espace.', 'Sur rendez-vous.'] };
  const mc = (texte: string) => ({ texte, correspondance: 'PHRASE' });

  it('l’aperçu montre le titre que chaque mot-clé ajouté écrirait', async () => {
    const env = creerEnv();
    simulerCompte({ annonces: [INSERTION, SANS] });
    const t = await apercu(env, 'ads_mots_cles_ajouter', { groupe: '444', mots_cles: [mc('hypnose anxiété'), mc('hypnose pour les troubles anxieux')] });
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/INSERTION DE MOT-CLÉ — une annonce du groupe l'utilise ; ce que chaque mot-clé afficherait :/);
    expect(t).toMatch(/- « hypnose anxiété » : « Hypnose Anxiété »/);
    expect(t).toMatch(/- « hypnose pour les troubles anxieux » : trop long, texte par défaut « Hypnose à Lyon »/);
  });

  it('NORMATIF — un mot-clé qui écrirait un titre interdit est refusé, et rien ne part', async () => {
    const env = creerEnv();
    const appels = simulerCompte({ annonces: [INSERTION] });
    const t = await apercu(env, 'ads_mots_cles_ajouter', { groupe: '444', mots_cles: [mc('hypnose anxiété'), mc('hypnose qui soigne')] });
    expect(t).toMatch(/Mots-clés refusés : avec l'insertion de mot-clé d'une annonce du groupe, ils écriraient un texte interdit/);
    expect(t).toMatch(/- mot-clé « hypnose qui soigne » : soign… \(soigner, soignant\) — dans « Hypnose Qui Soigne »/);
    expect(mutations(appels)).toEqual([]);
  });

  it('« hypnothérapeute » : un avertissement dans l’aperçu', async () => {
    const env = creerEnv();
    simulerCompte({ annonces: [INSERTION] });
    const t = await apercu(env, 'ads_mots_cles_ajouter', { groupe: '444', mots_cles: [mc('hypnothérapeute lyon')] });
    expect(t).toMatch(/^APERÇU/);
    expect(t).toMatch(/- mot-clé « hypnothérapeute lyon » : « hypnothérapeute » : l'hypnose est un outil, pas un titre \(socle\/identite\.md\) — titre rendu « Hypnothérapeute Lyon »/);
  });

  it('sans annonce à insertion dans le groupe, rien ne change : les mots-clés ne passent pas au filtre', async () => {
    const env = creerEnv();
    simulerCompte({ annonces: [SANS] });
    const t = await apercu(env, 'ads_mots_cles_ajouter', { groupe: '444', mots_cles: [mc('hypnose qui soigne')] });
    expect(t).toMatch(/^APERÇU/);
    expect(t).not.toMatch(/INSERTION/);
  });

  it('plusieurs annonces à insertion : chaque rendu dit son annonce', async () => {
    const env = creerEnv();
    simulerCompte({ annonces: [INSERTION, { ...INSERTION, id: '9003', titres: ['{keyword:hypnose}', 'Séance individuelle', 'Prendre rendez-vous'] }] });
    const t = await apercu(env, 'ads_mots_cles_ajouter', { groupe: '444', mots_cles: [mc('Hypnose Anxiété')] });
    expect(t).toMatch(/2 annonces du groupe l'utilisent/);
    expect(t).toMatch(/- « hypnose anxiété » \(annonce 9001\) : « Hypnose Anxiété »/);
    expect(t).toMatch(/- « hypnose anxiété » \(annonce 9003\) : « hypnose anxiété »/);
  });
});
