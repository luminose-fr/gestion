/**
 * ai/executors.ts — parsing défensif des réponses IA.
 *
 * Ces fonctions sont la frontière entre du texte produit par un modèle et le
 * contenu stocké dans Notion. Une régression ici corrompt du travail éditorial :
 * c'est le meilleur rapport valeur/effort du dépôt, et ça se teste sans réseau.
 */
import { describe, it, expect } from 'vitest';
import {
  extractJsonPayload,
  parseDraftResponse,
  parseAIResponse,
  sanitizeSlidesResponse,
  findSlideLengthIssues,
  appendSignatureSlide,
  SLIDE_TITLE_MAX,
} from '../src/index';

describe('extractJsonPayload', () => {
  it('retire les fences markdown', () => {
    expect(extractJsonPayload('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('tronque le bavardage autour du JSON', () => {
    expect(extractJsonPayload('Voici le résultat :\n{"a":1}\nJ\'espère que ça convient.')).toBe('{"a":1}');
  });

  it('renvoie une chaîne vide sur une entrée vide', () => {
    expect(extractJsonPayload('')).toBe('');
  });
});

describe('parseDraftResponse', () => {
  it('accepte un format connu et renvoie le JSON nettoyé', () => {
    const out = parseDraftResponse('```json\n{"format":"Post Texte","accroche":"x"}\n```');
    expect(JSON.parse(out).format).toBe('Post Texte');
  });

  it('refuse un format inconnu plutôt que de stocker n’importe quoi', () => {
    expect(() => parseDraftResponse('{"format":"Tweet","accroche":"x"}')).toThrow(/Format de sortie invalide/);
  });

  it('refuse une réponse qui n’est pas du JSON', () => {
    expect(() => parseDraftResponse('Bien sûr ! Voici votre post.')).toThrow();
  });

  it('déballe un objet emballé dans un tableau au lieu de le rejeter', () => {
    // Tolérance volontaire : extractJsonPayload tronque entre la première `{`
    // et la dernière `}`, ce qui récupère la réponse d'un modèle qui a emballé
    // son objet. On documente ce comportement pour qu'il ne change pas par accident.
    const out = parseDraftResponse('[{"format":"Post Texte"}]');
    expect(JSON.parse(out)).toEqual({ format: 'Post Texte' });
  });
});

describe('parseAIResponse', () => {
  it('extrait une clé du JSON', () => {
    expect(parseAIResponse('{"message":"bonjour"}', 'message')).toBe('bonjour');
  });

  it('retombe sur une extraction regex si le JSON est cassé', () => {
    expect(parseAIResponse('{"message":"bonjour", oups', 'message')).toBe('bonjour');
  });
});

describe('sanitizeSlidesResponse', () => {
  const raw = JSON.stringify({
    format: 'Carrousel',
    direction_globale: 'à supprimer',
    slides: [
      { numero: 1, titre: 'A', texte: 'a', indication_typo: 'à supprimer', note_composition: 'à supprimer', prompt_dzine: null },
    ],
  });

  it('retire la direction globale et les notes de mise en page', () => {
    const out = JSON.parse(sanitizeSlidesResponse(raw));
    expect(out).not.toHaveProperty('direction_globale');
    expect(out.slides[0]).not.toHaveProperty('indication_typo');
    expect(out.slides[0]).not.toHaveProperty('note_composition');
  });

  it('conserve la trame des slides', () => {
    const out = JSON.parse(sanitizeSlidesResponse(raw));
    expect(out.slides[0]).toMatchObject({ numero: 1, titre: 'A', texte: 'a' });
  });

  it('lève plutôt que de renvoyer du contenu illisible', () => {
    expect(() => sanitizeSlidesResponse('pas du json')).toThrow();
  });
});

describe('contraintes de longueur des slides', () => {
  it('signale un titre trop long', () => {
    const body = JSON.stringify({
      format: 'Carrousel',
      slides: [{ numero: 1, titre: 'x'.repeat(SLIDE_TITLE_MAX + 10), texte: 'ok' }],
    });
    const issues = findSlideLengthIssues(body);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('ne signale rien quand tout tient', () => {
    const body = JSON.stringify({
      format: 'Carrousel',
      slides: [{ numero: 1, titre: 'Court', texte: 'Court aussi.' }],
    });
    expect(findSlideLengthIssues(body)).toEqual([]);
  });
});

describe('appendSignatureSlide', () => {
  it('ajoute la slide de signature en fin de carrousel', () => {
    const body = JSON.stringify({ format: 'Carrousel', slides: [{ numero: 1, titre: 'A', texte: 'a' }] });
    const out = JSON.parse(appendSignatureSlide(body, { titre: 'Florent', texte: 'Psychopraticien' }));
    expect(out.slides).toHaveLength(2);
    expect(out.slides[1].titre).toBe('Florent');
  });
});
