/**
 * La carte de la métaphore, du brief au Lecteur froid, et les questions qu'un
 * « Go » laisserait sans réponse (SPEC §13.10). Le cas d'école est réel : le
 * Reel « Un meilleur sparadrap », 28/10/2026.
 */
import { describe, it, expect } from 'vitest';
import { carteDuBrief, carteLue, confronterLesCartes, horsImageDuBrief } from '../src/metaphore';
import { questionsDuMessage, questionsEnSuspens } from '../src/atelier';
import { composerLeFil, type GenerationDuFil } from '../src/fil';

const BRIEF = {
  sujet_reel: 'Mieux contrôler ses émotions ne passe pas par mieux les retenir.',
  metaphore: {
    image: 'La digue colmatée au sparadrap, et la vanne qui s’ouvre sur un bassin.',
    carte: [
      { element: 'L’eau', realite: 'Ce que vous ressentez : colère, peur, chagrin.' },
      { element: 'La digue', realite: 'La retenue : tout ce qu’on fait pour ne pas sentir.' },
      { element: 'Les fuites', realite: 'L’émotion qui sort quand même, n’importe où.' },
      { element: 'Le sparadrap', realite: 'Les moyens de mieux retenir : serrer les dents.' },
      { element: 'La vanne', realite: 'Laisser venir l’émotion, un peu, à son rythme.' },
      { element: '', realite: 'une ligne sans élément ne se montre pas' },
    ],
    hors_image: ['L’armure (« blindé »)', 'Apprendre à nager'],
  },
  interdits: ['« Accepter que la digue cède »'],
  questions_ouvertes: ['La phrase exacte entendue en première séance.'],
};

const RELECTURE = {
  verdict: 'Publiable',
  lecture_naive: {
    sujet: 'Retenir ses émotions ne marche pas.',
    carte_percue: [
      { element: 'la digue fissurée', represente: 'le fait de tout retenir' },
      { element: 'les sparadraps', represente: 'les pansements temporaires' },
      { element: 'l’amygdale derrière la digue', represente: 'je ne sais pas' },
    ],
  },
  problemes: [],
};

describe('la carte du brief', () => {
  it('se lit ligne à ligne, sans ce qui est vide', () => {
    expect(carteDuBrief(BRIEF).map(l => l.element)).toEqual(['L’eau', 'La digue', 'Les fuites', 'Le sparadrap', 'La vanne']);
    expect(horsImageDuBrief(BRIEF)).toEqual(['L’armure (« blindé »)', 'Apprendre à nager']);
  });

  it('un brief d’avant la carte, ou illisible, n’en a pas', () => {
    expect(carteDuBrief({ metaphore: { image: 'la digue', limites: '…' } })).toEqual([]);
    expect(carteDuBrief(null)).toEqual([]);
    expect(carteLue({ lecture_naive: { sujet: 'x' } })).toEqual([]);
  });
});

describe('ce qu’on voulait dire, en face de ce qu’un inconnu a compris', () => {
  const lignes = confronterLesCartes(carteDuBrief(BRIEF), carteLue(RELECTURE));

  it('apparie les éléments par leurs mots, pluriel compris, dans l’ordre de la carte', () => {
    expect(lignes.find(l => l.element === 'La digue')).toEqual({ element: 'La digue', voulu: 'La retenue : tout ce qu’on fait pour ne pas sentir.', compris: 'le fait de tout retenir' });
    expect(lignes.find(l => l.element === 'Le sparadrap')?.compris).toBe('les pansements temporaires');
  });

  it('garde ce que l’inconnu n’a pas relevé, et met en fin l’image que la carte ignore', () => {
    expect(lignes.find(l => l.element === 'La vanne')?.compris).toBeNull();
    expect(lignes[lignes.length - 1]).toEqual({ element: 'l’amygdale derrière la digue', voulu: null, compris: 'je ne sais pas' });
  });
});

describe('les questions du Coach qu’un « Go » laisserait sans réponse', () => {
  // La fin du message du Coach du 4 oct., tel qu'il est en base.
  const TRAME = [
    '**Phrase finale face caméra**',
    '« La question n\'est pas de savoir comment tenir la digue plus longtemps. C\'est : combien de temps encore voulez-vous la tenir à bout de bras ? »',
    '',
    '| Dans l\'image | Ce que c\'est, en vrai |',
    '| --- | --- |',
    '| La digue | Ce qui retient ? |',
    '',
    'Questions : gardez-vous ce titre tel quel, ou cherche-t-on une version dans la digue (par exemple « Si vous venez chercher du sparadrap… ») ? Et quelle phrase exacte entendez-vous le plus souvent en première séance ? C\'est elle qui doit ouvrir le Reel.',
  ].join('\n');

  it('retient les deux questions, ni la réplique citée ni la carte', () => {
    expect(questionsDuMessage(TRAME)).toEqual([
      'gardez-vous ce titre tel quel, ou cherche-t-on une version dans la digue (par exemple « Si vous venez chercher du sparadrap… ») ?',
      'Et quelle phrase exacte entendez-vous le plus souvent en première séance ?',
    ]);
  });

  it('ne compte que le dernier message, et seulement si Florent n’y a pas répondu', () => {
    const atelier = [{ role: 'user', content: 'TITRE : …' }, { role: 'assistant', content: TRAME }];
    expect(questionsEnSuspens(atelier)).toHaveLength(2);
    expect(questionsEnSuspens([...atelier, { role: 'user', content: 'Je veux mieux contrôler mes émotions.' }])).toEqual([]);
    expect(questionsEnSuspens([])).toEqual([]);
  });
});

describe('dans le fil', () => {
  const gen = (id: string, kind: string, createdAt: number, payload: unknown): GenerationDuFil =>
    ({ id, kind, target: kind === 'draft' ? 'draft' : null, instruction: null, payload: JSON.stringify(payload), createdAt });

  it('le brief se déplie sur sa carte, ses interdits et ses questions ouvertes', () => {
    const [bulle] = composerLeFil({ sorte: 'video', atelierValide: false, coach: [], generations: [gen('b1', 'brief', 10, BRIEF)] });
    expect(bulle).toMatchObject({ role: 'Verrouilleur', texte: 'Brief verrouillé : 1 interdit, 1 question ouverte.' });
    expect((bulle as any).brief).toMatchObject({
      horsImage: ['L’armure (« blindé »)', 'Apprendre à nager'],
      interdits: ['« Accepter que la digue cède »'],
      questions: ['La phrase exacte entendue en première séance.'],
    });
    expect((bulle as any).brief.carte).toHaveLength(5);
  });

  it('la relecture confronte sa lecture à la carte du brief sur lequel le texte a été écrit', () => {
    const fil = composerLeFil({
      sorte: 'video', atelierValide: false, coach: [],
      generations: [gen('b1', 'brief', 10, BRIEF), gen('c1', 'cold_read', 30, RELECTURE)],
    });
    const relue = fil.find(e => e.type === 'bulle' && e.role === 'Lecteur froid') as any;
    expect(relue.carte.find((l: any) => l.element === 'La digue')?.compris).toBe('le fait de tout retenir');
  });

  it('une relecture d’avant la carte n’a pas de tableau', () => {
    const [relue] = composerLeFil({ sorte: 'video', atelierValide: false, coach: [], generations: [gen('c1', 'cold_read', 30, { verdict: 'Publiable', lecture_naive: { sujet: 'x' } })] });
    expect((relue as any).carte).toBeUndefined();
  });
});
