/**
 * Moteur .srt → .fcpxml. Déjà pur avant extraction (aucun import), mais jamais
 * testé : c'est pourtant lui qui produit le fichier ouvert dans Final Cut.
 */
import { describe, it, expect } from 'vitest';
import { parseSrt, regroupSubtitles, wrapText, generateFcpxml, DEFAULT_STYLE, VIDEO_FORMATS } from '../src/index';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Vous connaissez ce petit tube
en paille tressée.

2
00:00:03,500 --> 00:00:06,000
Plus vous tirez, plus ça serre.
`;

describe('parseSrt', () => {
  it('lit les blocs, leurs bornes et leur texte', () => {
    const blocks = parseSrt(SRT);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startMs).toBe(1000);
    expect(blocks[0].endMs).toBe(3500);
    expect(blocks[0].text).toBe('Vous connaissez ce petit tube en paille tressée.');
  });

  it('tolère les fins de ligne Windows', () => {
    expect(parseSrt(SRT.replace(/\n/g, '\r\n'))).toHaveLength(2);
  });

  it('renvoie une liste vide sur une entrée vide', () => {
    expect(parseSrt('')).toEqual([]);
  });
});

describe('regroupSubtitles', () => {
  it('respecte le nombre de mots demandé', () => {
    const out = regroupSubtitles(parseSrt(SRT), 3);
    expect(out.every(b => b.text.split(/\s+/).length <= 3)).toBe(true);
  });

  it('ne perd aucun mot', () => {
    const source = parseSrt(SRT).map(b => b.text).join(' ').split(/\s+/);
    for (const n of [1, 2, 5, 50]) {
      const out = regroupSubtitles(parseSrt(SRT), n).map(b => b.text).join(' ').split(/\s+/);
      expect(out).toEqual(source);
    }
  });

  it('garde des bornes temporelles croissantes', () => {
    const out = regroupSubtitles(parseSrt(SRT), 2);
    for (const b of out) expect(b.endMs).toBeGreaterThan(b.startMs);
    for (let i = 1; i < out.length; i++) expect(out[i].startMs).toBeGreaterThanOrEqual(out[i - 1].startMs);
  });
});

describe('wrapText', () => {
  it('ne coupe jamais un mot', () => {
    for (const line of wrapText('Plus vous tirez plus ça serre', 10).split('\n')) {
      expect(line.trim()).not.toBe('');
    }
  });
});

describe('generateFcpxml', () => {
  const xml = () => generateFcpxml(regroupSubtitles(parseSrt(SRT), 3), DEFAULT_STYLE, VIDEO_FORMATS[0]);

  it('produit un document FCPXML', () => {
    expect(xml()).toMatch(/^<\?xml/);
    expect(xml()).toContain('<fcpxml');
  });

  it('échappe les caractères réservés du XML', () => {
    const blocks = [{ text: 'Tom & « Jerry » <3', startMs: 0, endMs: 1000 }];
    const out = generateFcpxml(blocks as any, DEFAULT_STYLE, VIDEO_FORMATS[0]);
    expect(out).toContain('&amp;');
    expect(out).not.toMatch(/<3/);
  });

  it('place un titre par sous-titre', () => {
    const blocks = regroupSubtitles(parseSrt(SRT), 3);
    const count = (xml().match(/<title /g) || []).length;
    expect(count).toBe(blocks.length);
  });
});
