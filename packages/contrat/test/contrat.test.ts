/**
 * Le contrat en schémas : ses exemples passent, ce qui sort du contrat est
 * refusé, et un refus ne recopie rien de l'envoi (SPEC §14.2, règle 7).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  questionnaire, confirmation, messageEmail, reponse, valider, champPiegeRempli, LONGUEURS, MOTIFS,
  dateAvecDecalage, dateSansHeure, cle,
} from '../src/index.ts';

const EXEMPLES = join(import.meta.dirname, '..', 'exemples');
const exemple = (nom: string) => JSON.parse(readFileSync(join(EXEMPLES, nom), 'utf8'));
const SCHEMAS = { questionnaire, confirmation, 'message-email': messageEmail, reponse } as const;

describe('les exemples du contrat sont des fixtures', () => {
  const fichiers = readdirSync(EXEMPLES).filter((f) => f.endsWith('.json'));

  it('chaque exemple a son schéma', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(8);
    for (const f of fichiers) expect(Object.keys(SCHEMAS).some((s) => f.startsWith(s)), f).toBe(true);
  });

  it.each(fichiers)('%s passe son schéma', (f) => {
    const schema = Object.entries(SCHEMAS).find(([s]) => f.startsWith(s))![1];
    const r = schema.safeParse(exemple(f));
    expect(r.error?.issues ?? []).toEqual([]);
  });

  it('des identités fictives : adresses en example.org', () => {
    for (const f of fichiers) {
      for (const adresse of readFileSync(join(EXEMPLES, f), 'utf8').match(/[\w.+-]+@[\w.-]+/g) ?? []) {
        expect(adresse, f).toMatch(/@example\.org$/);
      }
    }
  });
});

const REPERE = 'Repère-Zéphyrin';
const base = () => exemple('questionnaire-seance.json');

describe('le questionnaire (contrat §3.2)', () => {
  it('un champ inconnu est refusé, sans que son nom soit recopié', () => {
    const r = valider(questionnaire, { ...base(), [REPERE]: REPERE, identite: { ...base().identite, [`${REPERE}@example.org`]: 1 } });
    expect(r.valide).toBe(false);
    if (r.valide) return;
    expect(r.refus).toEqual({ ok: false, motif: 'invalide', champs: ['champ_inconnu', 'identite.champ_inconnu'] });
    expect(JSON.stringify(r.refus)).not.toContain('Repère');
  });

  it('une longueur dépassée : le nom du champ, pas sa valeur', () => {
    const r = valider(questionnaire, { ...base(), identite: { ...base().identite, prenom: REPERE.repeat(10) } });
    expect(r).toEqual({ valide: false, refus: { ok: false, motif: 'invalide', champs: ['identite.prenom'] } });
  });

  it('une réponse trop longue se nomme sans sa position', () => {
    const reponses = [...base().reponses, { cle: 'x', libelle: 'L', reponse: 'r'.repeat(LONGUEURS.reponse + 1) }];
    const r = valider(questionnaire, { ...base(), reponses });
    expect(r.valide || r.refus.champs).toEqual(['reponses.reponse']);
    const trop = Array.from({ length: LONGUEURS.reponses + 1 }, (_, i) => ({ cle: `q${i}`, libelle: 'L', reponse: 'non' }));
    expect(valider(questionnaire, { ...base(), reponses: trop }).valide).toBe(false);
  });

  it('declaration: false, accord refusé ou sans version : refusés', () => {
    expect(valider(questionnaire, { ...base(), declaration: false })).toMatchObject({ refus: { champs: ['declaration'] } });
    expect(valider(questionnaire, { ...base(), accord: { accepte: false, version: 1 } })).toMatchObject({ refus: { champs: ['accord.accepte'] } });
    expect(valider(questionnaire, { ...base(), accord: { accepte: true } })).toMatchObject({ refus: { champs: ['accord.version'] } });
  });

  it('jamais une référence ET un évènement', () => {
    expect(valider(questionnaire, { ...base(), evenement: 'essai-evenement' })).toMatchObject({ refus: { champs: ['evenement'] } });
    const { reference: _r, ...sans } = base();
    expect(valider(questionnaire, sans).valide).toBe(true);
  });

  it('une adresse e-mail invalide se nomme, sans être recopiée', () => {
    const r = valider(questionnaire, { ...base(), identite: { ...base().identite, email: REPERE } });
    expect(r).toEqual({ valide: false, refus: { ok: false, motif: 'invalide', champs: ['identite.email'] } });
  });

  it('un envoi qui n’est pas un objet : invalide, sans champ', () => {
    for (const envoi of [null, 'texte', 42, [base()]]) {
      expect(valider(questionnaire, envoi)).toEqual({ valide: false, refus: { ok: false, motif: 'invalide', champs: [] } });
    }
  });

  it('le champ piège : lu sur l’envoi brut', () => {
    expect(champPiegeRempli(base())).toBe(false);
    expect(champPiegeRempli({ ...base(), site_web: '' })).toBe(false);
    expect(champPiegeRempli({ ...base(), site_web: 'https://example.org' })).toBe(true);
    expect(champPiegeRempli(null)).toBe(false);
  });

  it('la clé d’envoi : 16 à 64 caractères sûrs', () => {
    expect(cle.safeParse('a'.repeat(16)).success).toBe(true);
    expect(cle.safeParse('a'.repeat(15)).success).toBe(false);
    expect(cle.safeParse('a'.repeat(65)).success).toBe(false);
    expect(cle.safeParse('abc/def+ghi=jklmno').success).toBe(false);
  });
});

describe('les briques de date', () => {
  it('une date sans heure, réelle', () => {
    expect(dateSansHeure.safeParse('1988-04-12').success).toBe(true);
    expect(dateSansHeure.safeParse('2026-02-30').success).toBe(false);
    expect(dateSansHeure.safeParse('12/04/1988').success).toBe(false);
  });

  it('une date avec son décalage', () => {
    expect(dateAvecDecalage.safeParse('2026-12-17T09:30:00+01:00').success).toBe(true);
    expect(dateAvecDecalage.safeParse('2026-12-17T09:30:00Z').success).toBe(true);
    expect(dateAvecDecalage.safeParse('2026-12-17T09:30:00').success).toBe(false);
  });
});

describe('Make (contrat §4)', () => {
  it('un échec sans motif est refusé', () => {
    expect(valider(confirmation, { ordre: 'o1', issue: 'echec' })).toMatchObject({ refus: { champs: ['motif'] } });
    expect(valider(confirmation, { ordre: 'o1', issue: 'fait' }).valide).toBe(true);
  });

  it('un motif est un code, pas un texte', () => {
    expect(valider(confirmation, { ordre: 'o1', issue: 'echec', motif: `${REPERE} a refusé` }).valide).toBe(false);
  });

  it('les refus de la porte : la liste fermée', () => {
    expect(MOTIFS).toEqual(['creneau_pris', 'hors_fenetre', 'journee_complete', 'code_invalide', 'lien_invalide', 'invalide', 'trop_de_demandes', 'ferme']);
    expect(reponse.safeParse({ ok: false, motif: 'perdu' }).success).toBe(false);
  });
});
