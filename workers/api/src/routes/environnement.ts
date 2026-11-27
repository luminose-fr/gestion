/**
 * Où l'on est (SPEC §14.8) — `GET /api/environnement`.
 *
 * Sert au bandeau de la console (« Recette », « Local ») et à la ligne d'état
 * de Réglages. Aucune requête métier : seule reste la lecture de révocation que
 * toute route protégée paie (§7). Fermée au serveur MCP, comme tout ce qui
 * n'est pas sur sa liste (acces-mcp.ts).
 */
import { Hono } from 'hono';
import type { Contexte } from '../env';
import { nomEnvironnement } from '../environnement';
import { clientsReliee } from '../clients/base';

export const environnement = new Hono<Contexte>();

environnement.get('/', (c) => c.json({ nom: nomEnvironnement(c.env), clientsReliee: clientsReliee(c.env) }));
