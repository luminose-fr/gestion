/**
 * La mémoire de la relecture à froid (SPEC §3.5.2).
 *
 * Ce que ces tests protègent : le 24/08/2026, un carrousel a été relu quatre
 * fois sans jamais sortir. Deux fois de suite, le Lecteur froid a condamné à la
 * passe N+1 la phrase qu'il avait lui-même dictée à la passe N. La mémoire des
 * passes est ce qui casse cette oscillation — et elle ne tient qu'à un en-tête
 * d'instruction reconnu dans le journal.
 */
import { describe, it, expect } from 'vitest';
import {
  COLD_READ_APPLY_PREFIX,
  buildColdReadApplyInstruction,
  isColdReadApplyInstruction,
  stripColdReadApplyPrefix,
  buildColdReadHistorySection,
} from '../src/coldRead';

describe("l'en-tête des corrections appliquées", () => {
  it('se compose et se relit', () => {
    const instruction = buildColdReadApplyInstruction('[slide 5] Raccourcir.');
    expect(isColdReadApplyInstruction(instruction)).toBe(true);
    expect(stripColdReadApplyPrefix(instruction)).toBe('[slide 5] Raccourcir.');
  });

  /**
   * Le journal de production porte déjà cet en-tête, au caractère près. Le
   * changer rendrait muettes les passes déjà enregistrées — la mémoire
   * repartirait de zéro sur les contenus qui en ont le plus besoin.
   */
  it('reconnaît les instructions déjà en base', () => {
    const dejaEnBase =
      "Applique ces corrections issues d'une relecture à froid, sans rien changer d'autre :\n" +
      '[slide 2 (et slide 3)] Slide 2, remplacer la dernière phrase.';
    expect(COLD_READ_APPLY_PREFIX).toBe(
      "Applique ces corrections issues d'une relecture à froid, sans rien changer d'autre :"
    );
    expect(isColdReadApplyInstruction(dejaEnBase)).toBe(true);
    expect(stripColdReadApplyPrefix(dejaEnBase)).toBe('[slide 2 (et slide 3)] Slide 2, remplacer la dernière phrase.');
  });

  it('ignore un ajustement demandé à la main par Florent', () => {
    expect(isColdReadApplyInstruction("Raccourcis l'intro.")).toBe(false);
    expect(isColdReadApplyInstruction(null)).toBe(false);
    expect(isColdReadApplyInstruction(undefined)).toBe(false);
  });
});

describe('la section rendue au Lecteur froid', () => {
  it('est VIDE à la première relecture — le prompt reste celui d’avant', () => {
    expect(buildColdReadHistorySection([])).toBe('');
    expect(buildColdReadHistorySection(['', '   '])).toBe('');
  });

  it('compte la passe en cours, pas les passes passées', () => {
    expect(buildColdReadHistorySection(['a'])).toContain('relecture n°2');
    expect(buildColdReadHistorySection(['a', 'b', 'c'])).toContain('relecture n°4');
  });

  it('rend les corrections dans l’ordre où elles ont été appliquées', () => {
    const section = buildColdReadHistorySection(['première correction', 'seconde correction']);
    expect(section).toContain('--- Passe 1, appliquée telle quelle ---\npremière correction');
    expect(section).toContain('--- Passe 2, appliquée telle quelle ---\nseconde correction');
    expect(section.indexOf('première correction')).toBeLessThan(section.indexOf('seconde correction'));
  });

  /**
   * Sans cette règle, la section ne servirait à rien : le modèle saurait ce
   * qu'il a demandé, et le rejetterait quand même.
   */
  it('porte la règle qui empêche de défaire sa propre correction', () => {
    const section = buildColdReadHistorySection(['[slide 5] Remplacer le texte.']);
    expect(section).toContain('PIRE que ce qu\'elle remplaçait');
    expect(section).toContain('ne se rouvre pas sous un autre nom');
    expect(section).toContain('Publiable');
  });
});
