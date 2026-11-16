/**
 * Le prompt d'image (SPEC v2.37) : un nom qui ne désigne aucun outil, et les
 * brouillons d'avant qui se relisent sans rien casser.
 */
import { describe, it, expect } from 'vitest';
import { lirePromptImage, renommerPromptsImage, renommerPromptsImageJson } from '../src/promptImage';
import { AI_ACTIONS } from '../src/actions';
import { FORMAT_REGISTRY } from '../src/formats';
import { PROPORTIONS_IMAGE } from '../src/illustration';
import { TargetFormat } from '../src/domain';

// L'ancien nom, tel que l'écrivaient les brouillons jusqu'au 16/11/2026.
const ANCIEN = 'prompt_dzine';

describe('lirePromptImage', () => {
  it('lit le prompt sous son nom actuel', () => {
    expect(lirePromptImage({ prompt_image: '  A lighthouse at dusk.  ' })).toBe('A lighthouse at dusk.');
  });

  it('lit encore un brouillon d’avant le 16/11/2026', () => {
    expect(lirePromptImage({ [ANCIEN]: 'A lighthouse at dusk.' })).toBe('A lighthouse at dusk.');
  });

  it('préfère le nom actuel quand les deux sont là', () => {
    expect(lirePromptImage({ [ANCIEN]: 'Old.', prompt_image: 'New.' })).toBe('New.');
  });

  it('rend une chaîne vide sans prompt, pour une slide TYPO ou un objet illisible', () => {
    expect(lirePromptImage({ prompt_image: null })).toBe('');
    expect(lirePromptImage(null)).toBe('');
    expect(lirePromptImage('texte')).toBe('');
  });
});

describe('renommerPromptsImage', () => {
  it('renomme à la racine (Post Texte) et dans chaque slide, à la même place', () => {
    const post = renommerPromptsImage({ format: 'Post Texte', visuel: 'v', [ANCIEN]: 'p', cta: 'c' });
    expect(Object.keys(post)).toEqual(['format', 'visuel', 'prompt_image', 'cta']);
    const carrousel = renommerPromptsImage({ slides: [{ numero: 1, [ANCIEN]: null, titre: 't' }] });
    expect(Object.keys(carrousel.slides[0])).toEqual(['numero', 'prompt_image', 'titre']);
  });

  it('écarte l’ancien nom quand le nouveau est déjà là', () => {
    expect(renommerPromptsImage({ [ANCIEN]: 'Old.', prompt_image: 'New.' })).toEqual({ prompt_image: 'New.' });
  });
});

describe('renommerPromptsImageJson', () => {
  it('rend un JSON récent à l’octet près', () => {
    const recent = '{"slides":[{"numero":1,"prompt_image":null}]}';
    expect(renommerPromptsImageJson(recent)).toBe(recent);
  });

  it('rend tel quel un JSON illisible', () => {
    const casse = `{"${ANCIEN}": "a", oups`;
    expect(renommerPromptsImageJson(casse)).toBe(casse);
  });

  it('ne touche pas une valeur qui citerait l’ancien nom', () => {
    const cite = JSON.stringify({ prompt_image: `Le champ s'appelait "${ANCIEN}".` });
    expect(JSON.parse(renommerPromptsImageJson(cite))).toEqual(JSON.parse(cite));
  });
});

describe('un ancien carrousel part vers l’Artiste sous le nom actuel', () => {
  const ancien = JSON.stringify({ slides: [{ numero: 3, type: 'ILLUSTRÉE', [ANCIEN]: 'A lighthouse at dusk.' }] });

  it('ADJUST_IMAGE_PROMPTS', () => {
    const prompt = AI_ACTIONS.ADJUST_IMAGE_PROMPTS.getSystemInstruction(ancien, 'Plus sombre', 3);
    expect(prompt).not.toContain(ANCIEN);
    expect(prompt).toContain('"prompt_image": "A lighthouse at dusk."');
  });

  it('ADJUST_CONTENT, pour un Post Texte d’avant', () => {
    const post = JSON.stringify({ format: 'Post Texte', [ANCIEN]: 'A lighthouse at dusk.' });
    const prompt = AI_ACTIONS.ADJUST_CONTENT.getSystemInstruction(post, 'Raccourcis');
    expect(prompt).not.toContain(ANCIEN);
    expect(prompt).toContain('"prompt_image": "A lighthouse at dusk."');
  });
});

describe('le registre dit quels formats s’illustrent depuis leur prompt (règle n°3)', () => {
  it('le Post Texte et le carrousel, aux proportions de leur grille', () => {
    const illustres = Object.values(FORMAT_REGISTRY).filter(f => f.image).map(f => [f.key, f.image!.proportions]);
    expect(illustres).toEqual([
      [TargetFormat.POST_TEXTE_COURT, ['1:1', '4:5']],
      [TargetFormat.CARROUSEL_SLIDE, ['1:1']],
    ]);
  });

  it('des proportions que la frontière de l’API accepte', () => {
    for (const f of Object.values(FORMAT_REGISTRY)) {
      for (const p of f.image?.proportions ?? []) expect(PROPORTIONS_IMAGE).toContain(p);
    }
  });

  it('les grilles qui le demandent nomment le champ que l’écran lit, et aucun outil', () => {
    const post = FORMAT_REGISTRY[TargetFormat.POST_TEXTE_COURT].promptTemplate;
    expect(post).toContain('"prompt_image"');
    expect(post).not.toMatch(/dzine|chatgpt|midjourney/i);
  });
});
