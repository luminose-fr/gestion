/**
 * ai/formats.ts — le registre comme source unique de vérité.
 *
 * Ce que ces tests protègent : le routage par format (où stocker le résultat,
 * où atterrir après rédaction, qui a droit à la relecture à froid) était
 * autrefois réécrit à la main dans l'éditeur — huit endroits à modifier pour
 * ajouter un format, dont un oubli passait inaperçu. Ces tests garantissent que
 * chaque format déclare tout ce dont l'éditeur a besoin.
 */
import { describe, it, expect } from 'vitest';
import { TargetFormat, TARGET_FORMAT_VALUES } from '../src/domain';
import {
  FORMAT_REGISTRY,
  getFormatDef,
  getStorageField,
  getEditorTab,
  getFormatPromptTemplate,
  supportsColdRead,
  bodyJsonToText,
  parseBodyJson,
  VALID_SHORT_KEYS,
} from '../src/index';

const ALL_FORMATS = Object.values(TargetFormat);

describe('complétude du registre', () => {
  it('couvre tous les TargetFormat', () => {
    expect(Object.keys(FORMAT_REGISTRY).sort()).toEqual([...TARGET_FORMAT_VALUES].sort());
  });

  it.each(ALL_FORMATS)('%s déclare tout ce dont l’éditeur a besoin', (format) => {
    const def = FORMAT_REGISTRY[format];
    expect(def.shortKey).toBeTruthy();
    expect(['body', 'scriptVideo', 'slides']).toContain(def.storageField);
    expect(['atelier', 'brouillon', 'slides', 'postcourt', 'script']).toContain(def.editorTab);
    expect(typeof def.supportsColdRead).toBe('boolean');
    expect(def.promptTemplate.length).toBeGreaterThan(50);
    expect(typeof def.toPlainText).toBe('function');
  });

  it('n’a pas deux formats avec la même clé courte', () => {
    expect(new Set(VALID_SHORT_KEYS).size).toBe(VALID_SHORT_KEYS.length);
  });
});

describe('routage — comportement attendu par l’éditeur', () => {
  it('les deux formats vidéo stockent dans scriptVideo, les autres dans body', () => {
    expect(getStorageField(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe('scriptVideo');
    expect(getStorageField(TargetFormat.SCRIPT_VIDEO_YOUTUBE)).toBe('scriptVideo');
    for (const f of ALL_FORMATS.filter(f => !f.startsWith('Script Vidéo'))) {
      expect(getStorageField(f)).toBe('body');
    }
  });

  it('mène au bon écran après la rédaction', () => {
    expect(getEditorTab(TargetFormat.POST_TEXTE_COURT)).toBe('postcourt');
    expect(getEditorTab(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe('script');
    expect(getEditorTab(TargetFormat.CARROUSEL_SLIDE)).toBe('brouillon');
  });

  it('réserve la relecture à froid aux formats courts et tendus', () => {
    expect(supportsColdRead(TargetFormat.POST_TEXTE_COURT)).toBe(true);
    expect(supportsColdRead(TargetFormat.CARROUSEL_SLIDE)).toBe(true);
    expect(supportsColdRead(TargetFormat.SCRIPT_VIDEO_REEL_SHORT)).toBe(true);
    expect(supportsColdRead(TargetFormat.ARTICLE_LONG_SEO)).toBe(false);
  });

  it('reste prévisible quand le format est absent', () => {
    expect(getStorageField(null)).toBe('body');
    expect(getEditorTab(null)).toBe('brouillon');
    expect(supportsColdRead(null)).toBe(false);
    expect(getFormatPromptTemplate(null)).toBe('');
  });
});

describe('getFormatDef', () => {
  it('résout par valeur d’enum comme par clé courte', () => {
    expect(getFormatDef(TargetFormat.CARROUSEL_SLIDE)?.shortKey).toBe('Carrousel');
    expect(getFormatDef('Carrousel')?.key).toBe(TargetFormat.CARROUSEL_SLIDE);
  });

  it('renvoie undefined sur une entrée inconnue', () => {
    expect(getFormatDef('Tweet')).toBeUndefined();
    expect(getFormatDef(null)).toBeUndefined();
  });
});

describe('lecture du contenu stocké', () => {
  it('tolère la signature markdown concaténée après le JSON', () => {
    const raw = JSON.stringify({ format: 'Post Texte', accroche: 'A', corps: 'B', cta: 'C' })
      + '\n\n_Généré par : GPT-5.2 Pro - le 17/08/2026_';
    expect(parseBodyJson(raw)).toMatchObject({ format: 'Post Texte' });
    expect(bodyJsonToText(raw)).toContain('A');
  });

  it('renvoie le texte brut quand ce n’est pas du JSON', () => {
    expect(bodyJsonToText('Simple note manuelle')).toBe('Simple note manuelle');
  });

  it('respecte une édition manuelle libre', () => {
    const raw = JSON.stringify({ format: 'Post Texte', edited_raw: 'Texte réécrit à la main' });
    expect(bodyJsonToText(raw)).toBe('Texte réécrit à la main');
  });
});
