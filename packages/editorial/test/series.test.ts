/**
 * Les Séries — plan de publication et anti-répétition.
 *
 * L'anti-répétition (SPEC §6.4) est NORMATIVE : le Rédacteur reçoit les
 * TITRES et les ANGLES des contenus frères, jamais leur texte. C'est ce que
 * ces tests vérifient — sans quoi le prompt croîtrait avec la série et
 * finirait par noyer la consigne.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSerieContextSection, buildPlanSeriesPayload, normalizePlanEntry,
  isPlanEntryUsable, isPlanEntryCreatable, emptyPlanEntry, SERIE_SOURCE_MAX,
} from '../src/series';
import { parsePlanSeriesResponse } from '../src/executors';
import { TargetFormat, Objectif } from '../src/domain';

const SERIE = {
  titre: 'La respiration holotropique, sans folklore',
  intention: 'Lever les peurs sur la pratique',
};

describe('contexte de série (anti-répétition)', () => {
  it('porte le sujet et l’intention de la série', () => {
    const section = buildSerieContextSection(SERIE);
    expect(section).toContain('La respiration holotropique, sans folklore');
    expect(section).toContain('Lever les peurs sur la pratique');
  });

  it('dit explicitement quand l’intention manque', () => {
    expect(buildSerieContextSection({ titre: 'Un thème' })).toContain('non précisée');
  });

  it('n’inclut le texte du pilier que si la série en a un', () => {
    expect(buildSerieContextSection(SERIE)).not.toContain('CONTENU PILIER');
    expect(buildSerieContextSection({ ...SERIE, sourceText: 'Le texte du pilier.' }))
      .toContain('Le texte du pilier.');
  });

  it('coupe un pilier trop long plutôt que de noyer la consigne', () => {
    const section = buildSerieContextSection({ ...SERIE, sourceText: 'a'.repeat(SERIE_SOURCE_MAX + 500) });
    expect(section).toContain('texte coupé');
    expect(section.length).toBeLessThan(SERIE_SOURCE_MAX + 2000);
  });

  it('liste les frères par titre et angle', () => {
    const section = buildSerieContextSection({
      ...SERIE,
      freres: [
        { titre: 'Perdre le contrôle', angle: 'La peur de lâcher prise.' },
        { titre: 'Sans angle', angle: null },
      ],
    });
    expect(section).toContain('« Perdre le contrôle » — La peur de lâcher prise.');
    expect(section).toContain('« Sans angle » — angle non précisé');
  });

  /** LE test normatif : le texte d'un frère n'a aucun chemin jusqu'au prompt. */
  it('ne laisse passer AUCUN texte de contenu frère', () => {
    const brouillonDuFrere = 'Accroche interdite, corps interdit, CTA interdit.';
    const section = buildSerieContextSection({
      ...SERIE,
      // On force la main : même en glissant le brouillon dans l'objet, il ne
      // ressort pas — la fonction ne lit que le titre et l'angle.
      freres: [{ titre: 'Perdre le contrôle', angle: 'La peur.', draft: brouillonDuFrere } as any],
    });
    expect(section).not.toContain(brouillonDuFrere);
  });

  /**
   * Ce qui transforme un ensemble en progression : le contenu courant est
   * rendu À SA PLACE dans la liste ordonnée, pas à part.
   */
  it('situe le contenu courant dans la progression', () => {
    const section = buildSerieContextSection({
      ...SERIE,
      position: 2,
      titreCourant: 'Perdre le contrôle',
      freres: [
        { titre: 'Ce que le cadre rend possible', angle: 'Le rôle du praticien.', position: 3 },
        { titre: 'Pas besoin d’y croire', angle: 'Le fantasme new-age.', position: 1 },
      ],
    });
    const lignes = section.split('\n').filter(l => /^\s*[▶ ]?\s*\d\./.test(l));
    expect(lignes[0]).toContain('Pas besoin d’y croire');
    expect(lignes[1]).toContain('CELLE QUE TU ÉCRIS MAINTENANT');
    expect(lignes[2]).toContain('Ce que le cadre rend possible');
    expect(section).toContain('Ce qui précède est déjà dit');
  });

  it('dit que le territoire est libre quand la série est vide', () => {
    expect(buildSerieContextSection(SERIE)).toContain('territoire est libre');
  });
});

describe('charge utile de l’Éclateur', () => {
  it('reprend la forme attendue par ses règles de sortie', () => {
    const payload = buildPlanSeriesPayload({
      titre: SERIE.titre,
      intention: '   ',
      sourceText: null,
      freres: [{ titre: 'Déjà prévu', angle: '  Un angle  ' }],
      nombreSouhaite: 6,
    });
    expect(payload).toEqual({
      sujet: SERIE.titre,
      intention: null,
      contenu_source: null,
      contenus_existants: [{ titre: 'Déjà prévu', angle: 'Un angle', position: null }],
      nombre_souhaite: 6,
    });
  });

  it('coupe le pilier au même plafond qu’à la rédaction', () => {
    const payload = buildPlanSeriesPayload({
      titre: SERIE.titre, sourceText: 'a'.repeat(SERIE_SOURCE_MAX + 100), nombreSouhaite: 3,
    });
    expect(payload.contenu_source).toHaveLength(SERIE_SOURCE_MAX);
  });
});

describe('lignes de plan', () => {
  it('une ligne vide n’est pas exploitable', () => {
    expect(isPlanEntryUsable(emptyPlanEntry())).toBe(false);
    expect(isPlanEntryUsable({ ...emptyPlanEntry(), titre: 'Un titre' })).toBe(true);
  });

  /**
   * Deux notions, et la distinction n'est pas cosmétique : `usable` filtre la
   * réponse de l'Éclateur, `creatable` garde le bouton de création. Confondre
   * les deux ferait DISPARAÎTRE du plan les lignes sans format, au lieu de
   * demander à Florent de les compléter.
   */
  it('exige un format pour devenir un contenu, pas pour rester au plan', () => {
    const sansFormat = { ...emptyPlanEntry(), titre: 'Un titre' };
    expect(isPlanEntryUsable(sansFormat)).toBe(true);
    expect(isPlanEntryCreatable(sansFormat)).toBe(false);

    const complet = { ...sansFormat, format: TargetFormat.POST_TEXTE_COURT };
    expect(isPlanEntryCreatable(complet)).toBe(true);

    // Un format sans titre ne fait pas une ligne pour autant.
    expect(isPlanEntryCreatable({ ...emptyPlanEntry(), format: TargetFormat.NEWSLETTER })).toBe(false);
  });

  it('ramène à null un format ou un objectif hors vocabulaire', () => {
    const entry = normalizePlanEntry({
      titre: ' Un titre ', angle: 'Un angle',
      format: 'Post LinkedIn', objectif: 'Vendre', justification: 'Parce que',
      notes: '  La matière  ',
    });
    expect(entry).toEqual({
      titre: 'Un titre', angle: 'Un angle',
      format: null, objectif: null, justification: 'Parce que',
      notes: 'La matière',
    });
  });

  it('conserve un format et un objectif du vocabulaire', () => {
    const entry = normalizePlanEntry({
      titre: 'T', format: TargetFormat.CARROUSEL_SLIDE, objectif: Objectif.EDUCATION,
    });
    expect(entry.format).toBe(TargetFormat.CARROUSEL_SLIDE);
    expect(entry.objectif).toBe(Objectif.EDUCATION);
  });
});

describe('parsing du plan', () => {
  const plan = [
    { titre: 'A', angle: 'Angle A', format: TargetFormat.POST_TEXTE_COURT, objectif: Objectif.EDUCATION, justification: 'J' },
    { titre: 'B', angle: 'Angle B', format: TargetFormat.CARROUSEL_SLIDE, objectif: Objectif.CONFIANCE, justification: 'J' },
  ];

  it('lit un tableau JSON nu', () => {
    expect(parsePlanSeriesResponse(JSON.stringify(plan))).toHaveLength(2);
  });

  it('survit aux balises markdown et au bavardage autour', () => {
    const noisy = 'Voici le plan :\n```json\n' + JSON.stringify(plan) + '\n```\nBonne rédaction !';
    const entries = parsePlanSeriesResponse(noisy);
    expect(entries.map(e => e.titre)).toEqual(['A', 'B']);
  });

  it('écarte les lignes sans titre au lieu de tout rejeter', () => {
    const entries = parsePlanSeriesResponse(JSON.stringify([...plan, { angle: 'orpheline' }]));
    expect(entries).toHaveLength(2);
  });

  it('refuse une réponse qui n’est pas un tableau', () => {
    expect(() => parsePlanSeriesResponse('{"titre":"A"}')).toThrow(/tableau/i);
  });

  it('refuse un plan vide — mieux vaut une erreur qu’un tableau muet', () => {
    expect(() => parsePlanSeriesResponse('[]')).toThrow(/exploitable/i);
    expect(() => parsePlanSeriesResponse('')).toThrow();
  });
});
