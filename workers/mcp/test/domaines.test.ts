/**
 * Le domaine de chaque outil (src/domaines.ts), et ce qui en dépend : le titre
 * publié, l'ordre de `tools/list`, la page de consentement — et le sens des
 * annotations, que l'app Claude lit pour ranger les outils en « Lecture
 * uniquement » et « Lecture et écriture ».
 *
 * Ce qui fait d'un outil une écriture ne se lit pas dans ses annotations — ce
 * serait vérifier l'annotation par elle-même —, mais dans son comportement :
 * appelé avec la seule lecture, il refuse faute de scope. La règle V8 veut que
 * ce refus vienne avant tout appel au réseau, d'où un appel sans arguments
 * utiles qui suffit presque toujours.
 */
import { describe, expect, it } from 'vitest';
import type { ConsentDescription } from '@cloudflare/workers-oauth-provider';
import { DOMAINES, ORDRE_DOMAINES } from '../src/domaines';
import { SCOPE_LECTURE } from '../src/ecriture';
import { definitionsOutils, outilsParDomaine, trouverOutil } from '../src/outils';
import { pageConsentement } from '../src/pages';
import { Refus } from '../src/refus';
import { ADRESSE, creerEnv } from './aides';

/**
 * Les outils dont les arguments sont vérifiés AVANT le scope — sans réseau,
 * donc sans entorse à V8 : il leur faut des arguments qui passent ce contrôle.
 * Un outil d'écriture ajouté qui manquerait ici ferait échouer le test, en
 * disant lequel.
 *
 * contenus_brouillon_ecrire ouvre sa ligne de journal avant d'appeler la
 * console (V7) : sans `raison`, la ligne ne s'écrit pas et le dit dans les
 * journaux. Le résultat du test n'en dépend pas, sa lisibilité si.
 */
const EXEMPLES: Record<string, Record<string, unknown>> = {
  gtm_declencheur_creer: { nom: 'Essai', type: 'evenement', evenement: 'essai' },
  gtm_evenement_ga4_creer: { evenement: 'essai', declencheurs: ['1'] },
  contenus_brouillon_ecrire: { id: 'a', brouillon: { format: 'Essai' }, raison: 'Essai du domaine' },
};

/** Le message du refus pour défaut de scope, ou `null` si l'outil a passé ce contrôle (quoi qu'il soit arrivé ensuite). */
const refusFauteDeScope = async (nom: string, scopes: string[]): Promise<string | null> => {
  const o = trouverOutil(nom)!;
  try {
    // Le `fetch` de test/setup.ts lève : un outil qui passe le contrôle s'arrête au premier appel sortant.
    await o.executer((EXEMPLES[nom] ?? {}) as never, creerEnv(), { email: ADRESSE, scopes });
    return null;
  } catch (e) {
    return e instanceof Refus && e.status === 403 && /n'est pas accordée/.test(e.message) ? e.message : null;
  }
};

const outils = definitionsOutils();

describe('le domaine de chaque outil', () => {
  it('chaque outil a un domaine connu, et son titre commence par le nom de ce domaine', () => {
    for (const publie of outils) {
      const o = trouverOutil(publie.name)!;
      expect(Object.keys(DOMAINES), publie.name).toContain(o.domaine);
      expect(publie.title, publie.name).toBe(`${DOMAINES[o.domaine].nom} — ${o.title}`);
      // Le même titre pour les clients d'avant `title` (2025-03-26).
      expect(publie.annotations.title, publie.name).toBe(publie.title);
      // Le titre court ne répète pas le domaine : « Tag Manager — Tag Manager — … » se lirait dans l'app.
      expect(o.title.startsWith(DOMAINES[o.domaine].nom), publie.name).toBe(false);
    }
    expect(new Set(outils.map((o) => o.title)).size, 'deux outils ne portent pas le même titre').toBe(outils.length);
  });

  it('tools/list range les outils par domaine, la lecture avant l’écriture', () => {
    const rangs = outils.map((p) => {
      const o = trouverOutil(p.name)!;
      return ORDRE_DOMAINES.indexOf(o.domaine) * 2 + (o.annotations.readOnlyHint ? 0 : 1);
    });
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(rangs.map((r) => Math.floor(r / 2))).size, 'chaque domaine a au moins un outil').toBe(ORDRE_DOMAINES.length);
  });
});

describe('une lecture est annotée comme telle, une écriture aussi', () => {
  it.each(outils.map((o) => o.name))('%s', async (nom) => {
    const o = trouverOutil(nom)!;
    const domaine = DOMAINES[o.domaine];
    const refus = await refusFauteDeScope(nom, [SCOPE_LECTURE]);

    if (refus === null) {
      // Sans aucun scope d'écriture, l'outil est allé plus loin : c'est une lecture.
      expect(o.annotations.readOnlyHint, `${nom} lit sans scope d’écriture : readOnlyHint doit valoir true`).toBe(true);
      return;
    }

    expect(o.annotations.readOnlyHint, `${nom} exige un scope d’écriture : readOnlyHint doit valoir false`).toBe(false);
    // Le refus nomme la case de SON domaine, telle que la page l'affiche.
    expect(refus).toContain(`« ${domaine.ecriture.libelle} »`);
    // Les cases des autres domaines n'y suffisent pas…
    const autres = ORDRE_DOMAINES.filter((c) => c !== o.domaine).map((c) => DOMAINES[c].ecriture.scope);
    expect(await refusFauteDeScope(nom, [SCOPE_LECTURE, ...autres]), `${nom} : une autre case l’ouvre`).not.toBeNull();
    // … la sienne, si : le domaine déclaré est bien celui que l'outil exige.
    expect(await refusFauteDeScope(nom, [SCOPE_LECTURE, domaine.ecriture.scope]), `${nom} : sa case ne l’ouvre pas`).toBeNull();
  });
});

describe('la page de consentement', () => {
  const description: ConsentDescription = {
    clientId: 'https://claude.ai/oauth/client-de-test',
    clientName: 'Claude',
    clientDomain: 'claude.ai',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    redirectHost: 'claude.ai',
    redirectIsLoopback: false,
  } as ConsentDescription;

  const html = async (demandes: string[]) =>
    (await pageConsentement({ description, demandes, jeton: 'n', cookie: 'c=1' }).text());

  /** Le texte d'une balise sans ses entités : les titres y sont échappés. */
  const desechapper = (t: string) => t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  it('un groupe par domaine, dans l’ordre, et dans chacun la lecture puis l’écriture, avec leurs outils', async () => {
    const page = await html([SCOPE_LECTURE]);
    const groupes = [...page.matchAll(/<fieldset>([\s\S]*?)<\/fieldset>/g)].map((m) => m[1]);
    expect(groupes).toHaveLength(ORDRE_DOMAINES.length);

    const parDomaine = outilsParDomaine();
    ORDRE_DOMAINES.forEach((cle, i) => {
      const d = DOMAINES[cle];
      const g = groupes[i];
      expect(desechapper(/<legend>(.*?)<\/legend>/.exec(g)![1])).toBe(d.intitule);
      const [lecture, ecriture] = [...g.matchAll(/<div class="acces">([\s\S]*?)<\/div>/g)].map((m) => m[1]);
      const titres = (bloc: string) => [...bloc.matchAll(/<li>(.*?)<\/li>/g)].map((m) => desechapper(m[1]));

      expect(lecture).toMatch(/Lecture/);
      expect(lecture).toMatch(/<input type="checkbox" checked disabled>/);
      expect(titres(lecture)).toEqual(parDomaine[i].lecture);

      expect(ecriture).toMatch(/Écriture/);
      expect(ecriture).toContain(`name="${d.ecriture.champ}" value="1"`);
      expect(desechapper(ecriture)).toContain(d.ecriture.libelle);
      expect(titres(ecriture)).toEqual(parDomaine[i].ecriture);
    });

    // Chaque outil y figure une fois, et un seul : la page ne peut ni en oublier, ni en inventer.
    const tous = groupes.flatMap((g) => [...g.matchAll(/<li>(.*?)<\/li>/g)].map((m) => desechapper(m[1])));
    expect(tous.sort()).toEqual(outils.map((o) => trouverOutil(o.name)!.title).sort());
  });

  it('seule la case d’écriture demandée arrive cochée', async () => {
    const page = await html([SCOPE_LECTURE, DOMAINES.gtm.ecriture.scope]);
    for (const cle of ORDRE_DOMAINES) {
      const { champ } = DOMAINES[cle].ecriture;
      expect(page.includes(`name="${champ}" value="1" checked`), champ).toBe(cle === 'gtm');
    }
  });
});
