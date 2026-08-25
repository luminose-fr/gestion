/**
 * FLUX-EDITORIAL.md dit reproduire les personas MOT POUR MOT. Ce test le vérifie.
 *
 * Un document qui décrit des prompts diverge dès la première retouche, et une
 * divergence silencieuse est pire que pas de document du tout : on y croit. Ce
 * test est ce qui rend la promesse tenable — modifier un persona sans reporter
 * le changement dans le document fait échouer la suite, au même titre qu'une
 * golden fixture (règle 5 de CLAUDE.md).
 *
 * Ce qu'il ne vérifie PAS : la prose autour. Elle est écrite à la main et c'est
 * très bien — seules les citations engagent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ANALYSTE_PERSONA, INTERVIEWER_PERSONA, COACH_PERSONA, VERROUILLEUR_PERSONA,
  REDACTEUR_PERSONA, REDACTEUR_ADJUSTMENT_INTRO, ARTISTE_PERSONA,
} from '../src/prompts/index';
import { LECTEUR_FROID_PERSONA } from '../src/prompts/lecteurFroid';
import { ECLATEUR_PERSONA } from '../src/prompts/eclateur';
import { VOICE_RULES } from '../src/voice';
import { AI_ACTION_CATALOG, ATTENDU_FAMILLES, ATTENDU_ORDRE } from '../src/actions';
import { OBJECTIF_REGISTRY } from '../src/objectives';
import { FORMAT_REGISTRY } from '../src/formats';

const DOC = readFileSync(join(import.meta.dirname, '..', '..', '..', 'FLUX-EDITORIAL.md'), 'utf8');

/** Les fins de ligne du document peuvent différer : on compare sur une base stable. */
const normaliser = (texte: string) => texte.replace(/\r\n/g, '\n').trim();

describe('FLUX-EDITORIAL.md cite les personas sans les déformer', () => {
  const PERSONAS: Array<[string, string]> = [
    ['Analyste', ANALYSTE_PERSONA],
    ['Intervieweur', INTERVIEWER_PERSONA],
    ['Coach', COACH_PERSONA],
    ['Verrouilleur', VERROUILLEUR_PERSONA],
    ['Rédacteur', REDACTEUR_PERSONA],
    ['Rédacteur — introduction d’ajustement', REDACTEUR_ADJUSTMENT_INTRO],
    ['Artiste', ARTISTE_PERSONA],
    ['Lecteur froid', LECTEUR_FROID_PERSONA],
    ['Éclateur', ECLATEUR_PERSONA],
  ];

  it.each(PERSONAS)('%s', (_nom, texte) => {
    expect(normaliser(DOC)).toContain(normaliser(texte));
  });

  it('les règles de voix, transverses à tous les personas', () => {
    expect(normaliser(DOC)).toContain(normaliser(VOICE_RULES));
  });
});

describe('FLUX-EDITORIAL.md n’oublie aucune action ni aucun registre', () => {
  /**
   * Ajouter une action au catalogue sans la documenter la rendrait invisible :
   * c'est exactement le genre d'oubli que ce document est censé empêcher.
   */
  it.each(AI_ACTION_CATALOG.map(a => [a.id, a] as const))('l’action %s y figure', (_id, action) => {
    expect(DOC).toContain(action.id);
    expect(DOC).toContain(action.label);
    expect(DOC).toContain(action.persona);
    // La raison de dépenser ou d'économiser sur cette action.
    expect(normaliser(DOC)).toContain(normaliser(action.pourChoisir));
  });

  it.each(ATTENDU_ORDRE.map(cle => [cle] as const))('la famille « %s » y figure', (cle) => {
    const famille = ATTENDU_FAMILLES[cle];
    expect(DOC).toContain(famille.titre);
    expect(normaliser(DOC)).toContain(normaliser(famille.demande));
    expect(normaliser(DOC)).toContain(normaliser(famille.choix));
  });

  it.each(Object.values(OBJECTIF_REGISTRY).map(o => [o.key, o] as const))(
    'l’objectif « %s » et ses règles de CTA y figurent',
    (_key, objectif) => {
      expect(DOC).toContain(objectif.key);
      expect(normaliser(DOC)).toContain(normaliser(objectif.ctaRules));
    },
  );

  it.each(Object.values(FORMAT_REGISTRY).map(f => [f.key, f] as const))(
    'le format « %s » y figure avec son routage',
    (_key, format) => {
      expect(DOC).toContain(format.key);
      expect(DOC).toContain(format.shortKey);
      expect(DOC).toContain(format.editorTab);
    },
  );
});
