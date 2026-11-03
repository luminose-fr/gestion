/**
 * La veille des modèles (SPEC §5.7). Ce qui compte : proposer la génération
 * suivante d'un modèle suivi, et JAMAIS une variante — un « -mini » proposé
 * comme mise à jour d'un « Pro » ferait descendre le flux en gamme sans bruit.
 */
import { describe, it, expect } from 'vitest';
import { comparerVersions, decomposerCode, nomDeVersion, nouvellesVersions } from '../src/veille';

const suivi = (apiCode: string, id = apiCode) => ({ id, name: apiCode, apiCode });
const publie = (id: string, creeLe: number | null = null) => ({ id, name: id, creeLe });

describe('decomposerCode', () => {
  it.each([
    ['claude-opus-4-5-20251101', 'claude-opus-#', [4, 5]],
    ['claude-opus-4-5', 'claude-opus-#', [4, 5]],
    ['anthropic/claude-opus-4.5', 'anthropic/claude-opus-#', [4, 5]],
    ['gpt-5.2-pro', 'gpt-#-pro', [5, 2]],
    ['moonshotai/kimi-k2.6', 'moonshotai/kimi-k-#', [2, 6]],
    ['z-ai/glm-5.2:free', 'z-ai/glm-#', [5, 2]],
    ['google/gemini-2.5-flash-preview-09-2025', 'google/gemini-#-flash', [2, 5]],
    ['qwen/qwen3-235b-a22b-2507', 'qwen/qwen-#', [3]],
    ['deepseek/deepseek-chat-v3-0324', 'deepseek/deepseek-chat-v-#', [3]],
    ['mistralai/mistral-large-2411', 'mistralai/mistral-large-#', [2411]],
    ['meta-llama/llama-3.1-70b-instruct', 'meta-llama/llama-#-instruct', [3, 1]],
    ['openai/gpt-image-2', 'openai/gpt-image-#', [2]],
  ])('%s', (code, squelette, version) => {
    expect(decomposerCode(code)).toEqual({ squelette, version });
  });

  it('un code sans numéro ne se compare à rien', () => {
    expect(decomposerCode('~anthropic/claude-opus-latest')).toBeNull();
    expect(decomposerCode('openai/gpt-oss-120b')).toBeNull();
  });
});

describe('comparerVersions', () => {
  it('compare des nombres, pas des chaînes', () => {
    expect(comparerVersions([5, 10], [5, 9])).toBeGreaterThan(0);
    expect(comparerVersions([5], [4, 5])).toBeGreaterThan(0);
    expect(comparerVersions([5], [5, 0])).toBe(0);
  });
});

describe('nouvellesVersions', () => {
  it('propose la génération suivante, la plus haute seulement', () => {
    const r = nouvellesVersions(
      [suivi('claude-opus-4-5', 'm1')],
      [publie('claude-opus-4-1-20250805'), publie('claude-opus-4-5-20251101'), publie('claude-opus-5-20260601'), publie('claude-opus-5-5-20261015')],
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ apiCode: 'claude-opus-5-5-20261015', remplace: { id: 'm1' } });
  });

  it('ne propose jamais une variante comme une mise à jour', () => {
    const r = nouvellesVersions(
      [suivi('gpt-5.2-pro')],
      [publie('gpt-5.5-mini'), publie('gpt-5.5'), publie('gpt-6-nano')],
    );
    expect(r).toEqual([]);
  });

  it('se tait quand le catalogue porte déjà la version la plus haute', () => {
    const r = nouvellesVersions(
      [suivi('claude-opus-4-5'), suivi('claude-opus-5-5')],
      [publie('claude-opus-5-20260601'), publie('claude-opus-5-5-20261015')],
    );
    expect(r).toEqual([]);
  });

  it('compte depuis la tête de lignée du catalogue, une proposition par lignée', () => {
    const r = nouvellesVersions(
      [suivi('anthropic/claude-opus-4.5', 'vieux'), suivi('anthropic/claude-opus-5', 'tete')],
      [publie('anthropic/claude-opus-5.5')],
    );
    expect(r).toHaveLength(1);
    expect(r[0].remplace.id).toBe('tete');
  });

  it('préfère la variante payante à version égale', () => {
    const r = nouvellesVersions([suivi('z-ai/glm-5.2')], [publie('z-ai/glm-5.5:free'), publie('z-ai/glm-5.5')]);
    expect(r.map(p => p.apiCode)).toEqual(['z-ai/glm-5.5']);
  });

  it('une proposition écartée ne revient pas ; une plus récente, si', () => {
    const publies = [publie('gpt-5.5-pro')];
    expect(nouvellesVersions([suivi('gpt-5.2-pro')], publies, new Set(['gpt-5.5-pro']))).toEqual([]);
    const plus = nouvellesVersions([suivi('gpt-5.2-pro')], [...publies, publie('gpt-6-pro')], new Set(['gpt-5.5-pro']));
    expect(plus.map(p => p.apiCode)).toEqual(['gpt-6-pro']);
  });

  it('suit aussi les modèles d’image', () => {
    const r = nouvellesVersions([suivi('google/gemini-3-pro-image')], [publie('google/gemini-3.5-pro-image'), publie('google/gemini-3.5-flash-image')]);
    expect(r.map(p => p.apiCode)).toEqual(['google/gemini-3.5-pro-image']);
  });
});

/**
 * 1min.ai ne publie que des codes. « Mettre à jour » écrit le nom proposé dans
 * la fiche : « gpt-5.5-pro » à la place de « GPT-5.2 Pro » serait une régression.
 */
describe('nomDeVersion', () => {
  it('remplace le numéro dans le nom d’avant', () => {
    expect(nomDeVersion('GPT-5.2 Pro', [5, 2], [5, 5])).toBe('GPT-5.5 Pro');
    expect(nomDeVersion('Claude Opus 4.5', [4, 5], [5])).toBe('Claude Opus 5');
    expect(nomDeVersion('Kimi K2.6', [2, 6], [3])).toBe('Kimi K3');
  });

  it('ne devine pas quand le numéro n’est pas écrit tel quel', () => {
    expect(nomDeVersion('Mon modèle de rédaction', [5, 2], [5, 5])).toBeNull();
    // « 5.2 » ne se confond pas avec « 15.2 » ni avec « 5.21 ».
    expect(nomDeVersion('Truc 15.2', [5, 2], [5, 5])).toBeNull();
    expect(nomDeVersion('Truc 5.21', [5, 2], [5, 5])).toBeNull();
  });

  it('sert seulement quand la source ne donne pas de nom', () => {
    const suivis = [{ id: 'm1', name: 'GPT-5.2 Pro', apiCode: 'gpt-5.2-pro' }];
    expect(nouvellesVersions(suivis, [publie('gpt-5.5-pro')])[0].name).toBe('GPT-5.5 Pro');
    expect(nouvellesVersions(suivis, [{ id: 'gpt-5.5-pro', name: 'GPT‑5.5 Pro (nouveau)', creeLe: null }])[0].name)
      .toBe('GPT‑5.5 Pro (nouveau)');
  });
});
