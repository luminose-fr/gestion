/**
 * Les professionnels (SPEC §15.3) — `/api/professionnels`. Suppression
 * logique : une fiche qui désignait un professionnel retiré garde son lien.
 */
import { z } from 'zod';
import { baseClients } from '../clients/base';
import { newId } from '../db';
import { Refus } from '../refus';
import { listeProfessionnels, creerProfessionnel, modifierProfessionnel, supprimerProfessionnel } from '../clients/professionnels';
import { famille, corps, texte, iso, emailFacultatif } from './clients-commun';

export const professionnels = famille();

const INTROUVABLE = 'Ce professionnel n’existe pas.';

const liste = (v: unknown): string[] => {
  try {
    const l = JSON.parse(String(v ?? '[]'));
    return Array.isArray(l) ? l.map(String) : [];
  } catch {
    return [];
  }
};

professionnels.get('/', async (c) => c.json({
  professionnels: (await listeProfessionnels(baseClients(c.env))).map((p) => ({
    id: p.id, nom: p.nom, categories: liste(p.categories), specialisation: p.specialisation, adresse: p.adresse,
    codePostal: p.code_postal, ville: p.ville, telephone: p.telephone, email: p.email, siteWeb: p.site_web,
    note: p.note, connu: Number(p.connu) === 1, courriers: liste(p.courriers), personnesRecues: Number(p.personnes_recues),
    modifieLe: iso(p.updated_at as number),
  })),
}));

const etiquettes = z.array(z.string().trim().min(1).max(80)).max(60);
const CHAMPS = {
  nom: z.string().trim().min(1).max(200).optional(),
  categories: etiquettes.optional(),
  specialisation: texte(200).optional(),
  adresse: texte(200).optional(),
  codePostal: texte(12).optional(),
  ville: texte(80).optional(),
  telephone: texte(30).optional(),
  email: emailFacultatif.optional(),
  siteWeb: texte(300).optional(),
  note: texte(10_000).optional(),
  connu: z.boolean().optional(),
  courriers: etiquettes.optional(),
};

professionnels.post('/', async (c) => {
  const champs = await corps(c, z.strictObject({ ...CHAMPS, nom: z.string().trim().min(1).max(200) }));
  const id = newId();
  await creerProfessionnel(baseClients(c.env), id, champs, Date.now());
  return c.json({ id }, 201);
});

professionnels.patch('/:id', async (c) => {
  const champs = await corps(c, z.strictObject(CHAMPS));
  if (!(await modifierProfessionnel(baseClients(c.env), c.req.param('id'), champs, Date.now()))) throw new Refus(INTROUVABLE, 404);
  return c.json({ id: c.req.param('id') });
});

professionnels.delete('/:id', async (c) => {
  if (!(await supprimerProfessionnel(baseClients(c.env), c.req.param('id'), Date.now()))) throw new Refus(INTROUVABLE, 404);
  return c.json({ id: c.req.param('id') });
});
