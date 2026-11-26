/**
 * La base des clients, vue de la console (SPEC §14.5) — `/api/clients`.
 *
 * Dans la phase S1, une seule route : l'état de la base, que Réglages affiche.
 * Sans liaison `CLIENTS`, 409 et le message du refus dans `error`, rien dans
 * les journaux (règle 2). Fermée au serveur MCP (règle du §14.5).
 */
import { Hono } from 'hono';
import type { Contexte } from '../env';
import { baseClients } from '../clients/base';
import type { EtatBaseClients } from '../clients/db';

export const clients = new Hono<Contexte>();

/** Les trois effectifs en UNE instruction : trois sous-comptages, un aller-retour. */
clients.get('/etat', async (c) => {
  const ligne = await baseClients(c.env).prepare(`
    SELECT
      (SELECT COUNT(*) FROM clients) AS fiches,
      (SELECT COUNT(*) FROM seances) AS seances,
      (SELECT COUNT(*) FROM evenements WHERE deleted_at IS NULL) AS evenements`).first<EtatBaseClients>();
  const etat: EtatBaseClients = {
    fiches: Number(ligne?.fiches ?? 0),
    seances: Number(ligne?.seances ?? 0),
    evenements: Number(ligne?.evenements ?? 0),
  };
  return c.json(etat);
});
