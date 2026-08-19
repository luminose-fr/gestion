/**
 * GOLDEN FIXTURES — SPEC §4.1 (règle 5 de CLAUDE.md).
 *
 * Chaque fichier de test/fixtures/ contient le prompt système EXACT que le
 * modèle recevra pour une action donnée. C'est le seul endroit où on le voit
 * en entier, personas, règles de voix, grille de format et règles CTA
 * assemblés.
 *
 * Toute évolution d'un persona fait diverger ces fichiers. Les régénérer :
 *
 *     npm test -w packages/editorial -- -u
 *
 * **La revue du diff de fixture EST la revue du changement.** Un persona qu'on
 * modifie sans regarder le prompt composé, c'est un changement qu'on n'a pas lu.
 */
import { describe, it, expect } from 'vitest';
import { AI_ACTIONS } from '../src/actions';
import { TargetFormat, Objectif } from '../src/domain';

const fixture = (name: string) => `./fixtures/${name}.txt`;

describe('prompts composés', () => {
  it('ANALYZE_BATCH', async () => {
    await expect(AI_ACTIONS.ANALYZE_BATCH.getSystemInstruction())
      .toMatchFileSnapshot(fixture('analyze-batch'));
  });

  it('COACH_CHAT', async () => {
    await expect(AI_ACTIONS.COACH_CHAT.getSystemInstruction())
      .toMatchFileSnapshot(fixture('coach-chat'));
  });

  it('LOCK_BRIEF', async () => {
    await expect(AI_ACTIONS.LOCK_BRIEF.getSystemInstruction())
      .toMatchFileSnapshot(fixture('lock-brief'));
  });

  // La rédaction est le cas le plus riche : persona + voix + grille de format
  // + règles CTA de l'objectif. Une fixture par format, car c'est le format qui
  // change le plus la sortie.
  const FORMATS: Array<[string, TargetFormat]> = [
    ['post-court', TargetFormat.POST_TEXTE_COURT],
    ['article', TargetFormat.ARTICLE_LONG_SEO],
    ['reel', TargetFormat.SCRIPT_VIDEO_REEL_SHORT],
    ['youtube', TargetFormat.SCRIPT_VIDEO_YOUTUBE],
    ['carrousel', TargetFormat.CARROUSEL_SLIDE],
    ['newsletter', TargetFormat.NEWSLETTER],
    ['prompt-image', TargetFormat.PROMPT_IMAGE],
  ];

  it.each(FORMATS)('DRAFT_CONTENT — %s', async (name, format) => {
    await expect(
      AI_ACTIONS.DRAFT_CONTENT.getSystemInstruction(undefined, format, Objectif.RECADRAGE)
    ).toMatchFileSnapshot(fixture(`draft-${name}`));
  });

  // Un second objectif sur le même format : isole les règles CTA du reste.
  it('DRAFT_CONTENT — post court, objectif Conversion', async () => {
    await expect(
      AI_ACTIONS.DRAFT_CONTENT.getSystemInstruction(
        undefined, TargetFormat.POST_TEXTE_COURT, Objectif.CONVERSION
      )
    ).toMatchFileSnapshot(fixture('draft-post-court-conversion'));
  });

  it('COLD_READ', async () => {
    await expect(
      AI_ACTIONS.COLD_READ.getSystemInstruction(
        undefined, TargetFormat.POST_TEXTE_COURT, Objectif.RECADRAGE, '(contenu relu)'
      )
    ).toMatchFileSnapshot(fixture('cold-read'));
  });

  it('ADJUST_CONTENT', async () => {
    await expect(
      AI_ACTIONS.ADJUST_CONTENT.getSystemInstruction(undefined, '{"format":"Post Texte"}', 'Raccourcis l\'intro')
    ).toMatchFileSnapshot(fixture('adjust-content'));
  });

  it('GENERATE_CARROUSEL_SLIDES', async () => {
    await expect(
      AI_ACTIONS.GENERATE_CARROUSEL_SLIDES.getSystemInstruction(undefined, 'Le piège chinois', '{"slides":[]}')
    ).toMatchFileSnapshot(fixture('carrousel-slides'));
  });

  it('ADJUST_DZINE_PROMPTS', async () => {
    await expect(
      AI_ACTIONS.ADJUST_DZINE_PROMPTS.getSystemInstruction(undefined, '{"slides":[]}', 'Plus sombre', 3)
    ).toMatchFileSnapshot(fixture('adjust-dzine-prompts'));
  });
});
