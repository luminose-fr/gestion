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

import { composerLeFil, type GenerationDuFil } from '../src/fil';

describe('le fil entier (§13.10)', () => {
  const gen = (id: string, kind: string, createdAt: number, over: Partial<GenerationDuFil> = {}): GenerationDuFil =>
    ({ id, kind, target: null, instruction: null, payload: '{}', createdAt, ...over });
  const CARROUSEL = JSON.stringify({ format: 'Carrousel', slides: [{ texte: 'Vous tenez bon.' }, { texte: 'C’est bien le problème.' }] });
  const relecture = (verdict: string, problemes: any[] = []) => JSON.stringify({
    verdict, lecture_naive: { sujet: 'vouloir tout contrôler épuise' }, problemes,
  });

  it('range le journal, la conversation et les gestes par date, et replie un atelier validé', () => {
    const fil = composerLeFil({
      sorte: 'carrousel', atelierValide: true,
      generations: [gen('d1', 'draft', 30, { target: 'draft', payload: CARROUSEL }), gen('b1', 'brief', 20, { payload: '{"interdits":["a","b"],"questions_ouvertes":[]}' })],
      coach: [{ role: 'user', content: 'TITRE : Contrôler', createdAt: 5 }, { role: 'assistant', content: 'Quel détail ?', createdAt: 6 }, { role: 'user', content: 'Le sac.', createdAt: 7 }],
      gestes: [{ statut: 'Prêt', avant: 'Brouillon', le: 40 }],
    });
    expect(fil.map(e => e.type === 'atelier' ? `atelier:${e.messages}` : `${e.role}`)).toEqual(['atelier:2', 'Verrouilleur', 'Rédacteur', 'Vous']);
    expect((fil[1] as any).texte).toBe('Brief verrouillé : 2 interdits, 0 question ouverte.');
    expect((fil[2] as any).texte).toBe('Brouillon rédigé : 2 slides, 38 caractères.');
    expect((fil[3] as any).texte).toBe('Bon à publier.');
  });

  it('un atelier en cours reste déplié, sans le brief d’ouverture', () => {
    const fil = composerLeFil({
      sorte: 'ecrit', atelierValide: false, generations: [],
      coach: [{ role: 'user', content: 'TITRE : x', createdAt: 1 }, { role: 'assistant', content: 'Une question ?', createdAt: 2 }],
    });
    expect(fil).toHaveLength(1);
    expect(fil[0]).toMatchObject({ role: 'Coach', de: 'ia', texte: 'Une question ?' });
  });

  it('la dernière relecture porte ses corrections ; appliquée, elle porte sa date', () => {
    const aRetoucher = relecture('À retoucher', [
      { localisation: 'Slide 3', probleme: '142 caractères', correction_proposee: 'raccourcir' },
      { probleme: 'le sac arrive tard', correction_proposee: 'nommer le sac en slide 2' },
    ]);
    const avant = composerLeFil({ sorte: 'carrousel', atelierValide: false, coach: [], generations: [
      gen('d1', 'draft', 10, { target: 'draft', payload: CARROUSEL }), gen('c1', 'cold_read', 20, { payload: aRetoucher }),
    ] });
    expect(avant[1]).toMatchObject({ role: 'Lecteur froid', ton: 'alerte', verdict: 'À retoucher, 2 points', points: ['Slide 3 : 142 caractères', 'le sac arrive tard'] });
    expect((avant[1] as any).corrections).toBe('[Slide 3] raccourcir\nnommer le sac en slide 2');

    const apres = composerLeFil({ sorte: 'carrousel', atelierValide: false, coach: [], generations: [
      gen('d1', 'draft', 10, { target: 'draft', payload: CARROUSEL }), gen('c1', 'cold_read', 20, { payload: aRetoucher }),
      gen('a1', 'adjustment', 30, { target: 'draft', payload: CARROUSEL, instruction: buildColdReadApplyInstruction('[Slide 3] raccourcir') }),
      gen('c2', 'cold_read', 40, { payload: relecture('Publiable') }),
    ] });
    const ancienne = apres.find(e => e.id === 'c1') as any;
    expect(ancienne.appliqueeLe).toBe(30);
    expect(ancienne.corrections).toBeNull();
    expect(apres.find(e => e.id === 'a1-demande')).toMatchObject({ role: 'Vous', texte: 'Applique les corrections de la relecture.' });
    expect(apres.find(e => e.id === 'c2')).toMatchObject({ ton: 'succes', verdict: 'Publiable' });
    // L'ajustement est la dernière écriture du brouillon, après une autre : il se défait.
    expect(apres.find(e => e.id === 'a1')).toMatchObject({ revenirPossible: true });
  });

  it('une relecture d’un texte qui a changé depuis n’offre plus ses corrections', () => {
    const fil = composerLeFil({ sorte: 'ecrit', atelierValide: false, coach: [], generations: [
      gen('c1', 'cold_read', 10, { payload: relecture('À retoucher', [{ probleme: 'x', correction_proposee: 'y' }]) }),
      gen('d1', 'draft', 20, { target: 'draft', payload: '{"format":"Post Texte","accroche":"a"}' }),
    ] });
    expect((fil[0] as any).corrections).toBeNull();
  });

  it('l’analyse ouvre le fil, et dit ce qui manque sans dire le verdict', () => {
    const fil = composerLeFil({ sorte: 'ecrit', atelierValide: false, coach: [], generations: [], analyse: {
      analyzedAt: 1, verdict: 'Trop lisse', objectif: 'Notoriété', platforms: ['Instagram'],
      strategicAngle: '**Titre suggéré :** Le piège\n\nUn angle net.', suggestedMetaphor: 'Une poignée de porte', justification: 'Il manque un exemple vécu.',
    } });
    const texte = (fil[0] as any).texte as string;
    expect(texte).toContain('Objectif : Notoriété · Plateformes : Instagram.');
    expect(texte).toContain('Angle : Un angle net.');
    expect(texte).toContain('Ce qui manque : Il manque un exemple vécu.');
    expect(texte).not.toContain('Trop lisse');
  });

  it('le montage et le contrôle du format parlent aussi', () => {
    const fil = composerLeFil({
      sorte: 'video', atelierValide: false, coach: [], generations: [],
      montage: { prises: [{ role: 'principale', deposeeLe: 10, transcriteLe: 20, duree: 108 }], dernierExport: { format: '9:16', version: 'organique', le: Date.parse('2026-10-20T10:00:00Z') } },
      controles: ['séquence 3 trop longue'],
    });
    expect(fil.map(e => (e as any).texte || (e as any).verdict)).toEqual([
      'Prise déposée (1:48).', 'Prise transcrite et calée.', 'Exportée le 20 oct. en 9:16, organique.',
      '1 point à corriger avant de tourner',
    ]);
  });
});
