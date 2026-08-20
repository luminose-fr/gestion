/**
 * Les schémas d'entrée sont la frontière de l'API (SPEC §3.1).
 *
 * Ce qu'ils protègent n'est pas la forme des données : c'est la LISTE de ce
 * qu'un client a le droit d'écrire. Un champ qui s'y glisse par accident
 * devient inscriptible depuis le navigateur, sans que rien ne le signale.
 */
import { describe, it, expect } from 'vitest';
import {
  CreateContentSchema, UpdateContentSchema, BatchCreateContentSchema,
  CreateSerieSchema, CreateModelSchema, UpdateModelSchema,
  AppendCoachMessageSchema, UpdateCoachSchema, CreateGenerationSchema,
  ChatRequestSchema, TestModelSchema, SyncQuerySchema,
  ContentSchema, AIModelSchema,
} from '../src/index';

describe('champs réservés au serveur', () => {
  /**
   * `id`, `createdAt`, `updatedAt` et `deletedAt` sont écrits par le Worker et
   * par lui seul (SPEC §2.2). Les laisser passer permettrait à un client de
   * réécrire l'horodatage dont dépend la synchronisation incrémentale, ou de
   * ressusciter une ligne supprimée.
   */
  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt'])(
    'écarte « %s » d’une création de contenu',
    (champ) => {
      const parsed = CreateContentSchema.parse({ title: 'Titre', [champ]: 42 });
      expect(parsed).not.toHaveProperty(champ);
    }
  );

  it.each(['id', 'createdAt', 'updatedAt', 'deletedAt'])(
    'écarte « %s » d’une mise à jour de contenu',
    (champ) => {
      expect(UpdateContentSchema.parse({ [champ]: 42 })).not.toHaveProperty(champ);
    }
  );

  it('écarte les champs serveur d’un modèle', () => {
    const parsed = CreateModelSchema.parse({
      name: 'M', apiCode: 'm', id: 'usurpé', createdAt: 1, deletedAt: 999,
    });
    expect(parsed).toEqual({ name: 'M', apiCode: 'm' });
  });
});

describe('création de contenu', () => {
  it('vaut « Idée » par défaut', () => {
    expect(CreateContentSchema.parse({}).status).toBe('Idée');
  });

  it('accepte les valeurs du vocabulaire éditorial', () => {
    const parsed = CreateContentSchema.parse({
      title: 'Le piège chinois',
      targetFormat: 'Carrousel (Slide par Slide)',
      objectif: 'Recadrage de croyance',
      depth: 'Complète',
      platforms: ['Instagram', 'LinkedIn'],
    });
    expect(parsed.targetFormat).toBe('Carrousel (Slide par Slide)');
    expect(parsed.platforms).toEqual(['Instagram', 'LinkedIn']);
  });

  it.each([
    ['statut', { status: 'Archivé' }],
    ['format', { targetFormat: 'Tweet' }],
    ['objectif', { objectif: 'Viralité' }],
    ['profondeur', { depth: 'Moyenne' }],
    ['plateforme', { platforms: ['TikTok'] }],
    ['verdict', { verdict: 'Excellent' }],
  ])('refuse un %s hors vocabulaire', (_, input) => {
    expect(() => CreateContentSchema.parse(input)).toThrow();
  });

  it('exige une date de publication au format ISO, sans heure', () => {
    expect(CreateContentSchema.parse({ scheduledDate: '2026-08-21' }).scheduledDate).toBe('2026-08-21');
    expect(() => CreateContentSchema.parse({ scheduledDate: '21/08/2026' })).toThrow();
    expect(() => CreateContentSchema.parse({ scheduledDate: '2026-08-21T10:00:00Z' })).toThrow();
  });

  it('accepte null là où la valeur est facultative', () => {
    const parsed = CreateContentSchema.parse({ targetFormat: null, objectif: null, scheduledDate: null });
    expect(parsed.targetFormat).toBeNull();
  });
});

describe('mise à jour partielle', () => {
  it('ne réclame aucun champ', () => {
    expect(UpdateContentSchema.parse({})).toEqual({});
  });

  it('ne renvoie QUE les champs fournis — sinon un PATCH écraserait le reste', () => {
    expect(UpdateContentSchema.parse({ title: 'Nouveau' })).toEqual({ title: 'Nouveau' });
  });

  it('accepte une date d’analyse numérique, refuse une chaîne', () => {
    expect(UpdateContentSchema.parse({ analyzedAt: 1_700_000_000_000 }).analyzedAt).toBe(1_700_000_000_000);
    expect(() => UpdateContentSchema.parse({ analyzedAt: 'hier' })).toThrow();
  });
});

describe('création en lot', () => {
  it('accepte un plan de série', () => {
    const parsed = BatchCreateContentSchema.parse({
      items: [{ title: 'A', angle: 'a' }, { title: 'B', angle: 'b' }],
    });
    expect(parsed.items).toHaveLength(2);
  });

  it('refuse un lot vide', () => {
    expect(() => BatchCreateContentSchema.parse({ items: [] })).toThrow();
  });

  it('plafonne le lot — un plan de série n’a pas cinquante entrées', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ title: `T${i}` }));
    expect(() => BatchCreateContentSchema.parse({ items })).toThrow();
  });

  it('rejette tout le lot si un seul élément est invalide', () => {
    expect(() => BatchCreateContentSchema.parse({
      items: [{ title: 'Valide' }, { title: 'X', status: 'Archivé' }],
    })).toThrow();
  });
});

describe('séries et modèles', () => {
  it('exige un titre de série', () => {
    expect(CreateSerieSchema.parse({ titre: 'Sujet' }).titre).toBe('Sujet');
    expect(() => CreateSerieSchema.parse({ intention: 'sans titre' })).toThrow();
  });

  it('exige nom ET code API pour un modèle', () => {
    expect(() => CreateModelSchema.parse({ name: 'Sans code' })).toThrow();
    expect(() => CreateModelSchema.parse({ apiCode: 'sans-nom' })).toThrow();
  });

  it('borne la qualité rédactionnelle entre 1 et 5', () => {
    expect(UpdateModelSchema.parse({ textQuality: 3 }).textQuality).toBe(3);
    for (const hors of [0, 6, 2.5]) {
      expect(() => UpdateModelSchema.parse({ textQuality: hors })).toThrow();
    }
  });
});

describe('Coach et générations', () => {
  it('n’admet que les rôles user et assistant', () => {
    expect(AppendCoachMessageSchema.parse({ role: 'user', content: 'x' }).role).toBe('user');
    expect(() => AppendCoachMessageSchema.parse({ role: 'system', content: 'x' })).toThrow();
  });

  it('n’admet que les deux statuts de session', () => {
    expect(UpdateCoachSchema.parse({ status: 'validated' }).status).toBe('validated');
    expect(() => UpdateCoachSchema.parse({ status: 'en cours' })).toThrow();
  });

  it('n’admet que les natures de génération connues', () => {
    expect(CreateGenerationSchema.parse({ kind: 'draft', modelLabel: 'M', payload: '{}' }).kind).toBe('draft');
    expect(() => CreateGenerationSchema.parse({ kind: 'brainstorm', modelLabel: 'M', payload: '{}' })).toThrow();
  });

  it('n’admet comme cible que les colonnes réellement visables', () => {
    expect(CreateGenerationSchema.parse({ kind: 'draft', target: 'slides', modelLabel: 'M', payload: '{}' }).target).toBe('slides');
    expect(() => CreateGenerationSchema.parse({ kind: 'draft', target: 'notes', modelLabel: 'M', payload: '{}' })).toThrow();
  });

  it('exige un libellé de modèle — la provenance ne peut pas être vide', () => {
    expect(() => CreateGenerationSchema.parse({ kind: 'draft', modelLabel: '', payload: '{}' })).toThrow();
  });
});

describe('appels IA', () => {
  it('exige au moins un message', () => {
    expect(() => ChatRequestSchema.parse({ modelId: 'm', messages: [] })).toThrow();
  });

  it('refuse un rôle système dans les messages — il passe par `system`', () => {
    expect(() => ChatRequestSchema.parse({
      modelId: 'm', messages: [{ role: 'system', content: 'x' }],
    })).toThrow();
  });

  it('route vers 1min.ai par défaut lors d’un test de code', () => {
    expect(TestModelSchema.parse({ apiCode: 'gpt-5.6-sol' }).provider).toBe('onemin');
  });

  it('refuse un code vide', () => {
    expect(() => TestModelSchema.parse({ apiCode: '' })).toThrow();
  });
});

describe('synchronisation', () => {
  it('convertit le paramètre since, qui arrive en chaîne dans l’URL', () => {
    expect(SyncQuerySchema.parse({ since: '1700000000000' }).since).toBe(1_700_000_000_000);
  });

  it('accepte l’absence de since — c’est la synchronisation complète', () => {
    expect(SyncQuerySchema.parse({}).since).toBeUndefined();
  });

  it.each(['hier', '-1', '3.5'])('refuse un since invalide : %s', (valeur) => {
    expect(() => SyncQuerySchema.parse({ since: valeur })).toThrow();
  });
});

describe('entités renvoyées', () => {
  it('décrit un contenu complet', () => {
    const parsed = ContentSchema.parse({
      id: 'c1', status: 'Idée', createdAt: 1, updatedAt: 2,
    });
    expect(parsed.title).toBe('');
    expect(parsed.platforms).toEqual([]);
    expect(parsed.draft).toBeNull();
    expect(parsed.deletedAt).toBeNull();
  });

  it('fait de onemin l’adaptateur par défaut d’un modèle', () => {
    const parsed = AIModelSchema.parse({ id: 'm', name: 'M', apiCode: 'c', createdAt: 1, updatedAt: 2 });
    expect(parsed.provider).toBe('onemin');
    expect(parsed.isDefault).toBe(false);
  });
});
