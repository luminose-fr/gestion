/**
 * Le résumé des feuilles de salle — ce que l'écran Carte affiche.
 *
 * POURQUOI CETTE ROUTE MÉRITE SES TESTS. L'écran Carte est de la
 * documentation, et une documentation qui recopie des chiffres les fige au
 * jour où elle a été écrite. Ces chiffres-ci sont composés à la demande : ce
 * qui doit être vérifié, c'est qu'ils portent bien sur le corpus embarqué et
 * sur la table des feuilles, et pas sur une liste tenue à part qui pourrait
 * dériver des deux.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { createSessionToken } from '../src/auth';
import { makeEnv } from './helpers/d1';
import { FEUILLE_PAR_ACTION } from '@luminose/editorial';

let env: any;
let token: string;

beforeEach(async () => {
  env = makeEnv();
  token = await createSessionToken(env);
});

const feuilles = async () => {
  const res = await app.fetch(
    new Request('https://api.test/api/corpus/feuilles', {
      headers: { 'X-Session-Token': token },
    }),
    env,
  );
  expect(res.status).toBe(200);
  return (await res.json() as any).feuilles as Array<{
    action: string; chemins: string[] | null; neRecoitRien: boolean;
    taille: number; documents: number;
  }>;
};

/**
 * Le vocabulaire des statuts a UN propriétaire : la garde qui refuse un statut
 * inconnu au commit. L'écran Carte le documente, et le lit ici plutôt que de
 * tenir sa propre liste — sinon un septième statut entrerait dans le corpus
 * sans jamais apparaître dans la documentation.
 */
describe('GET /api/corpus — le vocabulaire', () => {
  it('rend la liste des statuts que le composeur sait interpréter', async () => {
    const res = await app.fetch(
      new Request('https://api.test/api/corpus', { headers: { 'X-Session-Token': token } }),
      env,
    );
    expect(res.status).toBe(200);
    const corps = await res.json() as any;
    expect(corps.statuts).toEqual(
      ['actif', 'active', 'suspendu', 'termine', 'candidat', 'volontairement-absent'],
    );
  });

  it('tout statut employé par le corpus embarqué figure dans cette liste — NORMATIF', async () => {
    const res = await app.fetch(
      new Request('https://api.test/api/corpus', { headers: { 'X-Session-Token': token } }),
      env,
    );
    const { statuts } = await res.json() as any;
    const { DOCUMENTS } = await import('../src/genere/corpus');
    for (const d of DOCUMENTS) {
      const s = d.meta.statut;
      if (s === undefined) continue;
      expect(statuts, `${d.chemin} porte un statut hors vocabulaire`).toContain(String(s));
    }
  });
});

describe('GET /api/corpus/feuilles', () => {
  it('rend une entrée par action de la table, ni plus ni moins', async () => {
    const f = await feuilles();
    expect(f.map(x => x.action).sort()).toEqual(Object.keys(FEUILLE_PAR_ACTION).sort());
  });

  /**
   * Le piège que cette route existe pour éviter : servir neuf fois jusqu'à
   * 30 000 caractères de texte pour n'en afficher que la longueur.
   */
  it('ne transporte pas le texte des feuilles', async () => {
    const f = await feuilles();
    for (const x of f) expect(x).not.toHaveProperty('texte');
  });

  it('un rôle qui ne reçoit rien le DIT, au lieu de rendre une feuille vide', async () => {
    const f = await feuilles();
    const froid = f.find(x => x.action === 'COLD_READ')!;
    expect(froid.neRecoitRien).toBe(true);
    expect(froid.chemins).toBeNull();
    expect(froid.taille).toBe(0);
  });

  /**
   * La décision du 13/09/2026 : l'Artiste reçoit la direction artistique. Une
   * feuille vide ici voudrait dire qu'il est reparti chercher sa charte dans
   * son propre prompt — et c'est comme ça qu'il a peint aux couleurs du Seuil.
   */
  it('toute action qui reçoit des chemins reçoit des caractères — NORMATIF', async () => {
    const f = await feuilles();
    for (const x of f.filter(x => !x.neRecoitRien)) {
      expect(x.documents, `${x.action} ne retient aucun document`).toBeGreaterThan(0);
      expect(x.taille, `${x.action} rend une feuille vide`).toBeGreaterThan(0);
    }
  });

  it('les chiffres sont ceux de la table, pas d’une liste tenue à part', async () => {
    const f = await feuilles();
    for (const x of f) {
      expect(x.chemins).toEqual(FEUILLE_PAR_ACTION[x.action]);
    }
  });
});
