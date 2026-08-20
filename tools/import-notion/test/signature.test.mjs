/**
 * Analyse des signatures — la partie délicate de la migration.
 *
 * Une signature est concaténée après le JSON du brouillon. Mal la reconnaître
 * a deux conséquences opposées, aussi mauvaises l'une que l'autre :
 *   • trop stricte → elle reste collée au contenu, et le JSON ne parse plus ;
 *   • trop large   → elle mord dans le contenu, qui perd sa fin.
 *
 * Les quatre formes testées ici sont celles RÉELLEMENT présentes dans
 * l'export, recensées exhaustivement avant d'écrire le motif.
 */
import { describe, it, expect } from 'vitest';
import { splitSignature, parseFrenchDate, sql } from '../import.mjs';

const JSON_BODY = '{\n  "format": "Carrousel",\n  "slides": []\n}';

describe('formes rencontrées dans l’export', () => {
  it('« Généré par », avec italiques', () => {
    const { clean, signature } = splitSignature(`${JSON_BODY}\n\n_Généré par : Claude Fable 5 - le 18/08/2026 13:45:31_`);
    expect(clean).toBe(JSON_BODY);
    expect(signature.modelLabel).toBe('Claude Fable 5');
    expect(signature.verb).toBe('Généré');
  });

  it('« Généré par », sans italiques', () => {
    const { clean, signature } = splitSignature(`${JSON_BODY}\n\nGénéré par : Claude Opus 4.7 - le 08/06/2026 10:34:04`);
    expect(clean).toBe(JSON_BODY);
    expect(signature.modelLabel).toBe('Claude Opus 4.7');
  });

  it('« Ajusté par », avec cadratin', () => {
    const { clean, signature } = splitSignature(`${JSON_BODY}\n\nAjusté par : Claude Opus 4.8 — le 03/07/2026 15:33:40`);
    expect(clean).toBe(JSON_BODY);
    expect(signature.verb).toBe('Ajusté');
    expect(signature.modelLabel).toBe('Claude Opus 4.8');
  });

  it('en-tête avec contexte intermédiaire', () => {
    const { signature } = splitSignature(`${JSON_BODY}\n\nGénéré par : Claude Opus 4.5 - Contexte par défaut - le 23/03/2026 09:10:16`);
    expect(signature.modelLabel).toBe('Claude Opus 4.5');
  });

  it('« Prompts ajustés (slide 6) par » — la forme qui avait cassé un JSON', () => {
    const raw = `${JSON_BODY}\n\nPrompts ajustés (slide 6) par : Claude Opus 4.6 - Contexte par défaut - le 21/05/2026 23:30:06`;
    const { clean, signature } = splitSignature(raw);
    expect(clean).toBe(JSON_BODY);
    expect(() => JSON.parse(clean)).not.toThrow();
    expect(signature.verb).toBe('Ajusté');
    expect(signature.modelLabel).toBe('Claude Opus 4.6');
  });
});

describe('ce qu’il ne faut PAS toucher', () => {
  it('laisse intact un contenu sans signature', () => {
    const { clean, signature } = splitSignature(JSON_BODY);
    expect(clean).toBe(JSON_BODY);
    expect(signature).toBeNull();
  });

  it('ignore une signature EN MILIEU de texte', () => {
    // Le cas des sessions Coach : l'angle stratégique y est recopié avec la
    // sienne. La retirer casserait la conversation.
    const raw = `Voici l'angle :\n\n_Généré par : Claude Fable 5 - le 17/08/2026 09:35:56_\n\nMÉTAPHORE : le piège chinois`;
    const { clean, signature } = splitSignature(raw);
    expect(clean).toBe(raw);
    expect(signature).toBeNull();
  });

  it('ne mord pas dans une phrase se terminant par deux points', () => {
    const raw = 'Le texte pose une question : pourquoi ?';
    expect(splitSignature(raw).signature).toBeNull();
  });
});

describe('dates françaises', () => {
  it('convertit jj/mm/aaaa hh:mm:ss', () => {
    const ms = parseFrenchDate('Claude - le 18/08/2026 13:45:31');
    const d = new Date(ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);   // août
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(13);
  });

  it('renvoie null si aucune date', () => {
    expect(parseFrenchDate('Claude Fable 5')).toBeNull();
  });
});

describe('échappement SQL', () => {
  it('double les apostrophes', () => {
    expect(sql("L'angle")).toBe("'L''angle'");
  });

  it('préserve les guillemets JSON', () => {
    expect(sql('{"a":"b"}')).toBe(`'{"a":"b"}'`);
  });

  it('distingue null, nombres et booléens', () => {
    expect(sql(null)).toBe('NULL');
    expect(sql(42)).toBe('42');
    expect(sql(true)).toBe('1');
  });
});
