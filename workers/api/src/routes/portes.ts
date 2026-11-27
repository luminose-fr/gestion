/**
 * Les portes, vues de la console (SPEC §14.5) — `/api/portes`.
 *
 * Une ligne d'état pour Réglages, et l'interrupteur de la porte publique.
 * Session de la console ; fermée au serveur MCP (sa liste ne s'allonge pas) ;
 * 409 sans la liaison `CLIENTS`, rien dans les journaux (règle 2).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Contexte } from '../env';
import { baseClients } from '../clients/base';
import { etatDesPortes, poserInterrupteur } from '../clients/portes/etat';

export const portes = new Hono<Contexte>();

/** Une instruction. */
portes.get('/', async (c) => c.json(await etatDesPortes(baseClients(c.env), Date.now())));

const Interrupteur = z.strictObject({ ouverte: z.boolean() });

/** Deux instructions : poser, puis relire l'état que l'écran affichera. */
portes.put('/interrupteur', async (c) => {
  const { ouverte } = Interrupteur.parse(await c.req.json());
  const db = baseClients(c.env);
  const maintenant = Date.now();
  await poserInterrupteur(db, ouverte, maintenant);
  return c.json(await etatDesPortes(db, maintenant));
});
