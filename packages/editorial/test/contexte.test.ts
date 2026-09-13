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
   * Décidé le 26/08/2026, et toujours vrai : le Lecteur froid juge « comme un
   * inconnu le découvrirait ». Lui donner le corpus, c'est lui retirer
   * précisément ce qui fait sa valeur.
   *
   * Il est désormais SEUL dans ce cas. L'Artiste y figurait « à l'essai » — cet
   * essai s'est conclu le 13/09/2026, voir ci-dessous.
   */
  it('COLD_READ ne reçoit rien, et c\'est écrit', () => {
    expect(Object.prototype.hasOwnProperty.call(FEUILLE_PAR_ACTION, 'COLD_READ')).toBe(true);
    expect(feuillePour('COLD_READ')).toBeNull();
  });

  it('le Lecteur froid est le seul rôle sans feuille — NORMATIF', () => {
    const sansFeuille = Object.entries(FEUILLE_PAR_ACTION)
      .filter(([id, chemins]) => chemins === null && id !== 'GENERATE_INTERVIEW')
      .map(([id]) => id);
    expect(sansFeuille).toEqual(['COLD_READ']);
  });
});

describe('l\'Artiste reçoit la direction artistique — NORMATIF', () => {
  /**
   * Décision du 13/09/2026, qui renverse l'essai du 26/08.
   *
   * Privé de feuille, le persona s'était fabriqué sa propre charte, écrite en
   * dur dans le prompt — et elle a dérivé jusqu'à annoncer comme « palette de
   * marque » deux couleurs appartenant au Seuil, une offre suspendue. Ce test
   * empêche le retour en arrière silencieux : retirer la feuille sans retirer
   * ce test fait échouer la suite.
   */
  it.each(['GENERATE_CARROUSEL_SLIDES', 'ADJUST_DZINE_PROMPTS'])(
    '%s reçoit la fiche de direction artistique',
    (action) => {
      expect(feuillePour(action)).toEqual(['voix/direction-artistique']);
    },
  );

  it('et rien d\'autre : l\'Artiste ne touche pas au texte', () => {
    for (const action of ['GENERATE_CARROUSEL_SLIDES', 'ADJUST_DZINE_PROMPTS']) {
      const chemins = feuillePour(action) ?? [];
      // Ni socle, ni voix au complet : il traduit des intentions visuelles,
      // il n'écrit pas et ne propose aucune offre.
      expect(chemins.filter(c => c.startsWith('socle'))).toEqual([]);
      expect(chemins).not.toContain('voix');
    }
  });
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

  /**
   * NORMATIF — les règles de voix ne partent jamais deux fois.
   *
   * Les personas embarquent `VOICE_RULES`. Servir le bloc `voix` en entier
   * ajouterait la fiche source au même prompt : près de 3 900 caractères
   * facturés en double à chaque rédaction, sans rien apporter.
   */
  it('aucune feuille ne sert les règles de voix — NORMATIF', () => {
    const doublons = Object.entries(FEUILLE_PAR_ACTION)
      .filter(([, chemins]) => (chemins ?? []).some(
        c => c === 'voix' || c.startsWith('voix/regles-de-voix'),
      ))
      .map(([id]) => id);
    expect(doublons).toEqual([]);
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
