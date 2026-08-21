/**
 * Export complet de la base (SPEC §9.4).
 *
 * Time Travel plafonne à 7 jours sur le plan gratuit : ce n'est pas un filet
 * suffisant. Cette route produit un JSON téléchargeable de toutes les tables —
 * **lignes supprimées comprises**. Une sauvegarde ne trie pas ce qui mérite
 * d'être gardé : c'est justement une ligne effacée par erreur qu'on vient y
 * rechercher.
 *
 * 1 batch de 6 lectures : borné, indépendant du volume (SPEC §3.6).
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import {
  now, rowToContent, rowToSerie, rowToModel, rowToGeneration, rowToCoachMessage,
} from '../db';

export const exportRoute = new Hono<{ Bindings: Env }>();

/** Nom de fichier daté : un export sans date est un export qu'on n'ose pas restaurer. */
const filename = (ts: number) => `luminose-export-${new Date(ts).toISOString().slice(0, 10)}.json`;

exportRoute.get('/', async (c) => {
  const results = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM contents ORDER BY created_at ASC'),
    c.env.DB.prepare('SELECT * FROM series ORDER BY created_at ASC'),
    c.env.DB.prepare('SELECT * FROM ai_models ORDER BY created_at ASC'),
    c.env.DB.prepare('SELECT * FROM generations ORDER BY created_at ASC, rowid ASC'),
    c.env.DB.prepare('SELECT * FROM coach_messages ORDER BY created_at ASC, rowid ASC'),
    c.env.DB.prepare('SELECT * FROM app_settings ORDER BY key ASC'),
  ]);

  const rows = (index: number): any[] => (results[index]?.results ?? []) as any[];
  const ts = now();

  const payload = {
    exportedAt: ts,
    /** Version du FORMAT d'export, pas de l'application : un restaurateur doit savoir ce qu'il lit. */
    formatVersion: 1,
    contents: rows(0).map(rowToContent),
    series: rows(1).map(rowToSerie),
    models: rows(2).map(rowToModel),
    generations: rows(3).map(rowToGeneration),
    coachMessages: rows(4).map(rowToCoachMessage),
    settings: rows(5).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at })),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename(ts)}"`,
    },
  });
});
