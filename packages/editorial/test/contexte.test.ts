/**
 * Qui reçoit quoi du corpus.
 *
 * `FEUILLE_PAR_ACTION` est une table écrite à la main, et une table écrite à la
 * main dérive : une action ajoutée au flux sans ligne ici ne recevrait rien,
 * silencieusement — le pire des deux mondes, puisque `feuillePour` rend `null`
 * aussi bien pour « décidé » que pour « oublié ». Ces tests suppriment
 * l'ambiguïté : ce qui ne reçoit rien doit être ÉCRIT comme ne recevant rien.
 */
import { describe, it, expect } from 'vitest';
import { AI_ACTION_CATALOG, AI_ACTIONS } from '../src/actions';
import { FEUILLE_PAR_ACTION, feuillePour, actionConnue } from '../src/contexte';

/** Les actions qui existent dans le code sans être au catalogue du flux. */
const HORS_CATALOGUE = ['GENERATE_INTERVIEW'];

describe('la table des feuilles de salle', () => {
  it('couvre TOUTES les actions du catalogue — NORMATIF', () => {
    const manquantes = AI_ACTION_CATALOG
      .map(a => a.id)
      .filter(id => !Object.prototype.hasOwnProperty.call(FEUILLE_PAR_ACTION, id));
    expect(manquantes).toEqual([]);
  });

  it('ne contient aucune action fantôme', () => {
    const connues = [...AI_ACTION_CATALOG.map(a => a.id), ...HORS_CATALOGUE];
    const orphelines = Object.keys(FEUILLE_PAR_ACTION).filter(id => !connues.includes(id));
    expect(orphelines).toEqual([]);
  });

  it('nomme la même chose que AI_ACTIONS', () => {
    const inconnues = Object.keys(FEUILLE_PAR_ACTION)
      .filter(id => !Object.prototype.hasOwnProperty.call(AI_ACTIONS, id));
    expect(inconnues).toEqual([]);
  });
});

describe('ce qui ne reçoit rien — NORMATIF', () => {
  /**
   * Décidé le 26/08/2026. Le Lecteur froid juge « comme un inconnu le
   * découvrirait » : lui donner le corpus, c'est lui retirer précisément ce
   * qui fait sa valeur. L'Artiste est à l'essai — sans feuille, on verra si
   * les prompts d'image en souffrent.
   */
  it.each(['COLD_READ', 'GENERATE_CARROUSEL_SLIDES', 'ADJUST_DZINE_PROMPTS'])(
    '%s ne reçoit rien, et c\'est écrit',
    (action) => {
      expect(Object.prototype.hasOwnProperty.call(FEUILLE_PAR_ACTION, action)).toBe(true);
      expect(feuillePour(action)).toBeNull();
    },
  );
});

describe('ce qui reçoit', () => {
  it.each(['ANALYZE_BATCH', 'COACH_CHAT', 'LOCK_BRIEF', 'DRAFT_CONTENT', 'ADJUST_CONTENT', 'PLAN_SERIES'])(
    '%s reçoit au moins un chemin',
    (action) => {
      const chemins = feuillePour(action);
      expect(chemins).not.toBeNull();
      expect(chemins!.length).toBeGreaterThan(0);
    },
  );

  it('la stratégie ne va QU\'au plan de série — NORMATIF', () => {
    const avecStrategie = Object.entries(FEUILLE_PAR_ACTION)
      .filter(([, chemins]) => (chemins ?? []).some(c => c.startsWith('strategie')))
      .map(([id]) => id);
    expect(avecStrategie).toEqual(['PLAN_SERIES']);
  });

  it('aucun chemin ne pointe vers l\'inbox ni le répertoire', () => {
    const suspects = Object.values(FEUILLE_PAR_ACTION)
      .flatMap(c => c ?? [])
      .filter(c => c.startsWith('inbox') || c.startsWith('repertoire') || c.startsWith('outils'));
    expect(suspects).toEqual([]);
  });
});

describe('feuillePour et actionConnue', () => {
  it('une action inconnue ne reçoit rien plutôt que de jeter', () => {
    expect(feuillePour('CE_QUI_N_EXISTE_PAS')).toBeNull();
    expect(actionConnue('CE_QUI_N_EXISTE_PAS')).toBe(false);
  });

  it('ne se laisse pas berner par les propriétés d\'Object', () => {
    expect(actionConnue('toString')).toBe(false);
    expect(actionConnue('constructor')).toBe(false);
    expect(feuillePour('constructor')).toBeNull();
  });
});
