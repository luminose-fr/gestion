/**
 * Le fil mis en phrases (SPEC §13.7) : la ligne que la liste Conversations
 * affiche sous chaque titre. Qui a parlé, ce qu'il a dit — et le plus récent
 * des faits, montage compris.
 */
import { describe, it, expect } from 'vitest';
import { resumerLeFait, dernierFait, momentDuFait, type FaitDuFil } from '../src/fil';
import { buildColdReadApplyInstruction } from '../src/coldRead';

const fait = (champs: Partial<FaitDuFil>): FaitDuFil => ({ source: 'journal', nature: 'draft', texte: null, le: 1, ...champs });

describe('qui parle, et ce qu’il dit', () => {
  it('le Coach, et Florent — sauf le brief d’ouverture, que l’outil compose', () => {
    expect(resumerLeFait(fait({ source: 'coach', nature: 'assistant', texte: '« Quel **détail** rend ce basculement vrai ? »' }), 'ecrit'))
      .toEqual({ role: 'Coach', texte: '« Quel détail rend ce basculement vrai ? »' });
    expect(resumerLeFait(fait({ source: 'coach', nature: 'user', texte: 'Applique les deux.' }), 'ecrit')).toEqual({ role: 'Vous', texte: 'Applique les deux.' });
    expect(resumerLeFait(fait({ source: 'coach', nature: 'user', texte: 'TITRE : Le piège\nNOTES : …' }), 'ecrit')).toEqual({ role: 'Vous', texte: 'Atelier ouvert.' });
  });

  it('les rôles du journal', () => {
    expect(resumerLeFait(fait({ nature: 'analysis' }), 'ecrit')).toEqual({ role: 'Analyste', texte: 'Idée préparée.' });
    expect(resumerLeFait(fait({ nature: 'brief' }), 'ecrit')).toEqual({ role: 'Verrouilleur', texte: 'Brief verrouillé.' });
    expect(resumerLeFait(fait({ nature: 'draft' }), 'ecrit')).toEqual({ role: 'Rédacteur', texte: 'Brouillon rédigé.' });
    expect(resumerLeFait(fait({ nature: 'draft' }), 'video')).toEqual({ role: 'Rédacteur', texte: 'Script rédigé.' });
    expect(resumerLeFait(fait({ nature: 'slides' }), 'carrousel')).toEqual({ role: 'Artiste', texte: 'Slides produites.' });
    expect(resumerLeFait(fait({ nature: 'plan_series' }), 'ecrit')).toEqual({ role: 'Éclateur', texte: 'Plan de série posé.' });
  });

  it('une relecture dit son verdict et le sujet perçu', () => {
    expect(resumerLeFait(fait({ nature: 'cold_read', verdict: 'Publiable', texte: 'vouloir tout contrôler épuise' }), 'carrousel'))
      .toEqual({ role: 'Lecteur froid', texte: 'Publiable. Sujet perçu : vouloir tout contrôler épuise' });
  });

  it('un ajustement dit ce qu’on a demandé, et reconnaît les corrections de la relecture', () => {
    expect(resumerLeFait(fait({ nature: 'adjustment', texte: 'Raccourcis la slide 3' }), 'carrousel'))
      .toEqual({ role: 'Rédacteur', texte: 'Ajusté : Raccourcis la slide 3' });
    expect(resumerLeFait(fait({ nature: 'adjustment', texte: buildColdReadApplyInstruction('[Slide 3] raccourcir') }), 'carrousel').texte)
      .toBe('Corrections de la relecture appliquées.');
  });

  it('les gestes de Florent', () => {
    expect(resumerLeFait(fait({ source: 'geste', nature: 'Prêt', avant: 'Brouillon' }), 'ecrit').texte).toBe('Bon à publier.');
    expect(resumerLeFait(fait({ source: 'geste', nature: 'Prêt', avant: 'Brouillon' }), 'video').texte).toBe('Prête à tourner.');
    expect(resumerLeFait(fait({ source: 'geste', nature: 'Publié', avant: 'Prêt' }), 'ecrit').texte).toBe('Publié.');
    expect(resumerLeFait(fait({ source: 'geste', nature: 'Brouillon', avant: 'Prêt' }), 'ecrit').texte).toBe('Repassé en écriture.');
    expect(resumerLeFait(fait({ source: 'geste', nature: 'Brouillon', avant: 'Idée' }), 'ecrit').texte).toBe('Mis en chantier.');
  });

  it('le montage', () => {
    expect(resumerLeFait(fait({ source: 'montage', nature: 'prise', duree: 108 }), 'video')).toEqual({ role: 'Montage', texte: 'Prise déposée (1:48).' });
    expect(resumerLeFait(fait({ source: 'montage', nature: 'export', format: '9:16', version: 'organique' }), 'video'))
      .toEqual({ role: 'Sortie', texte: 'Exportée en 9:16, organique.' });
  });
});

describe('le dernier fait', () => {
  const montage = {
    prises: [{ role: 'principale', deposeeLe: 100, transcriteLe: 200, duree: 60 }],
    dernierExport: { format: '4:5', version: 'publicite', le: 300 },
  };

  it('le montage l’emporte quand il est plus récent que le fil', () => {
    expect(dernierFait(fait({ le: 250 }), montage)).toMatchObject({ source: 'montage', nature: 'export' });
    expect(dernierFait(fait({ le: 350 }), montage)).toMatchObject({ source: 'journal' });
    expect(dernierFait(null, { prises: montage.prises, dernierExport: null })).toMatchObject({ nature: 'transcription' });
    expect(dernierFait(null, null)).toBeNull();
  });
});

describe('le moment d’un fait', () => {
  const MAINTENANT = Date.parse('2026-10-27T15:00:00Z');
  it('l’heure aujourd’hui, « hier », sinon le jour', () => {
    expect(momentDuFait(Date.parse('2026-10-27T09:42:00Z'), MAINTENANT)).toBe('10:42');
    expect(momentDuFait(Date.parse('2026-10-26T09:00:00Z'), MAINTENANT)).toBe('hier');
    expect(momentDuFait(Date.parse('2026-10-20T09:00:00Z'), MAINTENANT)).toBe('20 oct.');
  });
});
