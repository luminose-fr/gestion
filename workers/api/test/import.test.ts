/**
 * L'outil d'import de Notion (SPEC §14.9.1), sur un export FICTIF. Aucune
 * donnée réelle : ni dans ce fichier, ni dans l'export fabriqué, ni dans les
 * dossiers temporaires qu'il crée — tous hors de l'arbre git.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TestD1, MIGRATIONS_CLIENTS } from './helpers/d1';
import { exportFictif, MAINTENANT, p, bloc } from '../import/essai/export-fictif';
import { transformer, Chevauchement, rapportEnTexte, TABLES, corpsEnMarkdown, type Transformation } from '../import/transformer';
import { SchemaInvalide, type Export } from '../import/lire';
import { enSql, disparues, lignesImportees } from '../import/ecrire';
import { comparer } from '../import/verifier';
import { dossierPrive, cheminPrive, DossierRefuse } from '../import/prive';
import { exporter, API } from '../import/notion';
import { appliquer, argsLocaux, wranglerLocal, lireBase, type Executer } from '../import/appliquer';
import { lireArguments, preparer } from '../import/outil';
import { TYPES } from '../import/correspondance';

const RACINE = resolve(import.meta.dirname, '..', '..', '..');

let temporaires: string[] = [];
/** Un dossier privé de test : dans le dossier temporaire du système, hors de tout dépôt. */
const temporaire = () => {
  const d = mkdtempSync(join(tmpdir(), 'luminose-import-test-'));
  temporaires.push(d);
  return d;
};
afterEach(() => { for (const d of temporaires) rmSync(d, { recursive: true, force: true }); temporaires = []; });

const t0 = () => transformer(exportFictif(), MAINTENANT);
const ligne = (t: Transformation, table: (typeof TABLES)[number], id: string) => t.lignes[table].find((l) => l.id === id);

/** Une base locale de test, et le SQL appliqué comme wrangler le ferait. */
const nouvelleBase = () => new TestD1(MIGRATIONS_CLIENTS);
const appliquerA = (base: TestD1, sql: string) => (base as any).db.exec(sql);
const contenu = (base: TestD1) => Object.fromEntries(TABLES.map((t) => [t, base.query(`SELECT * FROM ${t} ORDER BY id`)]));

// ─── La transformation, règle par règle ─────────────────────────────────────

describe('Transformer — les clients', () => {
  it('« Nom » → prénom (premier mot) et nom (le reste) ; trois mots ou plus : listé', () => {
    const t = t0();
    expect(ligne(t, 'clients', 'c-emilie')).toMatchObject({ prenom: 'Émilie', nom: 'Martin', nom_recherche: 'emilie martin' });
    expect(ligne(t, 'clients', 'c-trois')).toMatchObject({ prenom: 'Marie', nom: 'Claire Dupont' });
    expect(t.rapport.nomsTroisMots).toEqual(['c-trois']);
  });

  it('la clé par packages/pratique ; deux fiches de même clé : listées ensemble', () => {
    const t = t0();
    expect(ligne(t, 'clients', 'c-emilie')!.cle_client).toBe('emilie.martin@example.org emilie martin');
    expect(ligne(t, 'clients', 'c-double')!.cle_client).toBe('emilie.martin@example.org emilie martin');
    expect(t.rapport.memeCle).toEqual(['c-emilie · c-double']);
  });

  it('une fiche sans adresse : pas de clé, listée ; une adresse invalide : listée', () => {
    const t = t0();
    expect(ligne(t, 'clients', 'c-sans-adresse')!.cle_client).toBeNull();
    expect(t.rapport.sansAdresse).toEqual(['c-sans-adresse']);
    expect(t.rapport.adressesInvalides).toEqual(['c-invalide']);
  });

  it('« France - FR » → FR ; Genre → civilité ; une valeur de liste inconnue : sans elle, et listée', () => {
    const t = t0();
    expect(ligne(t, 'clients', 'c-emilie')).toMatchObject({ pays: 'FR', civilite: 'Mme', origine: 'Internet', date_naissance: '1988-04-12' });
    expect(ligne(t, 'clients', 'c-invalide')!.civilite).toBeNull();
    expect(t.rapport.valeursInconnues).toContain('clients › c-invalide › Genre = Autre');
    expect(t.rapport.valeursInconnues).toContain("evenements › e-passe › Type d'évènement = yoga");
  });

  it('les liens : écrits après les fiches ; un couple des deux côtés ; une relation absente : listée, sans lien', () => {
    const t = t0();
    const liens = Object.fromEntries(t.liens.map((l) => [l.id, l]));
    expect(liens['c-emilie']).toEqual({ id: 'c-emilie', via_professionnel_id: 'pro-cabinet', via_client_id: null, couple_client_id: 'c-paul' });
    expect(liens['c-paul'].couple_client_id).toBe('c-emilie');
    expect(liens['c-sans-adresse'].via_client_id).toBe('c-emilie');
    expect(liens['c-invalide'].via_client_id).toBeNull();
    expect(t.rapport.relationsAbsentes).toContain('clients › c-invalide › Via client');
    // Aucune fiche n'est écrite avec ses liens : l'ordre d'insertion n'importe pas.
    expect(t.lignes.clients.every((l) => !('couple_client_id' in l))).toBe(true);
  });

  it('la personne de confiance : une ligne seulement si l’un de ses champs est rempli', () => {
    const t = t0();
    expect(t.lignes.clients_confiance).toEqual([expect.objectContaining({ id: 'confiance-c-emilie', client_id: 'c-emilie', prenom: 'Personne', telephone: '+33 6 39 98 00 60', nom: null })]);
  });

  it('le corps → la note de la fiche, texte brut, dans l’ordre des blocs', () => {
    expect(ligne(t0(), 'clients_notes', 'note-c-emilie')!.texte).toBe('Texte d’essai — première note.\nQuestionnaire de santé (PDF)\nDocument d’essai');
  });

  it('un lien Drive dont le paragraphe parle de questionnaire → un ancien questionnaire ; un par fichier ; les autres : listés', () => {
    const t = t0();
    expect(t.lignes.questionnaires).toEqual([{
      id: 'drive-FICHIERESSAI0001abc', contexte: 'seance', client_id: 'c-emilie', source: 'import_drive',
      drive_url: 'https://drive.google.com/file/d/FICHIERESSAI0001abc/view',
      created_at: Date.parse('2026-02-10T08:00:00.000Z'), updated_at: Date.parse('2026-02-10T08:00:00.000Z'),
    }]);
    expect(t.rapport.anciensQuestionnaires).toEqual(['drive-FICHIERESSAI0001abc']);
    expect(t.rapport.memeFichierDrive).toEqual(['clients › c-sans-adresse › drive-FICHIERESSAI0001abc']);
    expect(t.rapport.autresLiensDrive).toEqual(['clients › c-emilie']);
  });

  it('une propriété en plus : listée, pas bloquante', () => {
    expect(t0().rapport.proprietesEnPlus).toEqual(['clients › Propriété ajoutée']);
  });
});

describe('Transformer — les séances', () => {
  it('le type par la table de correspondance ; un libellé inconnu : sans type, listé avec son nombre', () => {
    const t = t0();
    expect(ligne(t, 'seances', 's-1')!.type_seance_id).toBe(TYPES.seance_distance.id);
    expect(ligne(t, 'seances', 's-2')!.type_seance_id).toBeNull();
    expect(t.rapport.typesInconnus).toEqual(['s-2']);
    expect(t.rapport.libellesInconnus).toEqual(['Séance mystère : 1']);
    expect(ligne(t, 'seances', 's-1')!.libelle_importe).toBe('Séance 1 (Séance à distance)');
  });

  it('« Date » → début et durée ; sans fin : la durée du type, et listée ; occupe_jusqua avec la marge', () => {
    const t = t0();
    expect(ligne(t, 'seances', 's-1')).toMatchObject({ debut: Date.parse('2026-10-05T07:30:00Z'), duree_min: 90, occupe_jusqua: Date.parse('2026-10-05T09:00:00Z') });
    expect(ligne(t, 'seances', 's-2')!.duree_min).toBe(60);
    expect(t.rapport.sansFin).toEqual(['s-2']);
  });

  it('statut et paiement → les valeurs du modèle ; origine import, agenda écrit, pas de mouvement', () => {
    const t = t0();
    expect(ligne(t, 'seances', 's-1')).toMatchObject({ statut: 'realisee', etat_paiement: 'payee', clic_annonce: 'gclid-essai' });
    expect(ligne(t, 'seances', 's-3')).toMatchObject({ statut: 'prevue', etat_paiement: 'a_payer', liste_attente: 1 });
    const sql = enSql(t);
    expect(sql).toMatch(/INSERT INTO seances \(revision, agenda_etat, origine, liens_version,[^)]*\) VALUES \(0, 'ecrit', 'import', 1,/);
    expect(sql).not.toMatch(/seances_mouvements/);
  });

  it('une relation « un seul » qui en porte plusieurs : aucun lien choisi, listée', () => {
    const t = t0();
    expect(ligne(t, 'seances', 's-3')!.client_id).toBeNull();
    expect(t.rapport.relationsMultiples).toEqual(['seances › s-3 › Clients']);
  });

  it('euros → centimes ; une ligne de paiement par référence Stancer, avec la facture Qonto', () => {
    const t = t0();
    expect(ligne(t, 'seances', 's-1')!.montant_centimes).toBe(8000);
    expect(t.lignes.paiements).toEqual([expect.objectContaining({
      id: 'paiement-s-1', seance_id: 's-1', prestataire: 'stancer', reference: 'pi_essai_1', montant_centimes: 8000,
      statut: 'reussi', facture_qonto_id: 'facture-essai-1', test: 0,
    })]);
  });

  it('deux séances de même référence de paiement : aucun paiement écrit, listées ; payée sans Stancer : comptée', () => {
    const t = t0();
    expect(t.rapport.paiementsMemeReference).toEqual(['s-5 · s-6']);
    expect(t.rapport.payeesSansStancer).toEqual(['s-4']);
  });

  it('le corps → les notes de la séance : un seul texte, entier, titres gardés, et sa copie brute', () => {
    const t = t0();
    expect(ligne(t, 'seances_notes', 'notes-s-1')).toMatchObject({
      demande: null, objectif: null, travail_personnel: null, idees_suite: null, reponse_sms: null,
      seance: [
        '## Demande', '', 'Texte d’essai — demande', '',
        '## Séance', 'Texte d’essai — séance', '',
        '## Travail personnel', 'Texte d’essai — travail', '',
        '## Idées pour la suite', 'Texte d’essai — idées', '',
        '## Réponse SMS', 'Texte d’essai — SMS',
      ].join('\n'),
    });
    expect(String(ligne(t, 'seances_notes', 'notes-s-1')!.import_notion)).toContain('Réponse SMS\nTexte d’essai — SMS');
    expect(ligne(t, 'seances_notes', 'notes-s-2')).toMatchObject({ seance: 'Texte d’essai sans trame', import_notion: 'Texte d’essai sans trame' });
  });

  it('le corps en Markdown : titres, listes, citations ; vide → rien', () => {
    expect(corpsEnMarkdown([
      bloc('a', 'heading_1', 'Un'), bloc('b', 'bulleted_list_item', 'point'), bloc('c', 'numbered_list_item', 'étape'),
      bloc('d', 'quote', 'citation'), bloc('e', 'heading_3', 'Trois'), bloc('f', 'paragraph', 'texte'),
    ])).toBe('# Un\n- point\n1. étape\n> citation\n\n## Trois\ntexte');
    expect(corpsEnMarkdown([])).toBeNull();
  });

  it('deux séances passées qui se chevauchent : reprises telles quelles', () => {
    const t = t0();
    expect(t.lignes.seances.map((s) => s.id)).toEqual(expect.arrayContaining(['s-5', 's-6']));
  });

  const ajouterSeance = (exp: Export, id: string, debut: string, fin: string, libelle = 'Séance') => {
    const modele = exp.bases.seances.pages.find((x) => x.id === 's-4')!;
    exp.bases.seances.pages.push({
      ...modele, id,
      properties: { ...modele.properties, Name: p.titre(`Séance 9 (${libelle})`) as any, Date: p.date(debut, fin) as any, 'État paiement': p.choix('A payer') as any },
    });
  };

  it('deux séances prévues à venir qui se chevauchent : arrêt avant d’écrire, les deux identifiants nommés', () => {
    const exp = exportFictif();
    ajouterSeance(exp, 's-conflit', '2027-02-01T10:30:00.000+01:00', '2027-02-01T12:00:00.000+01:00');
    expect(() => transformer(exp, MAINTENANT)).toThrow(Chevauchement);
    try { transformer(exp, MAINTENANT); } catch (e) { expect((e as Chevauchement).paires).toEqual([['s-3', 's-conflit']]); }
  });

  it('…par leur seule marge aussi', () => {
    const exp = exportFictif();
    // Un breathwork de 105 minutes à 15 h : sa marge court jusqu'à 17 h. Une séance à 16 h 50 la chevauche.
    ajouterSeance(exp, 's-breathwork', '2027-02-01T15:00:00.000+01:00', '2027-02-01T16:45:00.000+01:00', 'Séance de breathwork holotropique');
    ajouterSeance(exp, 's-apres', '2027-02-01T16:50:00.000+01:00', '2027-02-01T18:20:00.000+01:00');
    expect(() => transformer(exp, MAINTENANT)).toThrow(/s-breathwork ↔ s-apres/);
  });
});

describe('Transformer — les évènements et les professionnels', () => {
  it('une inscription par personne, confirmée, origine import, identifiant dérivé ; une relation absente : listée', () => {
    const t = t0();
    expect(t.lignes.inscriptions.map((i) => i.id).sort()).toEqual(['inscription-e-avenir-c-paul', 'inscription-e-passe-c-emilie']);
    expect(ligne(t, 'inscriptions', 'inscription-e-avenir-c-paul')).toMatchObject({ statut: 'confirmee', origine: 'import' });
    expect(t.rapport.relationsAbsentes).toContain('evenements › e-avenir › Clients');
  });

  it('un évènement à venir sans prix : listé « prix à saisir » ; le prix reste vide', () => {
    const t = t0();
    expect(t.rapport.evenementsSansPrix).toEqual(['e-avenir']);
    expect(ligne(t, 'evenements', 'e-avenir')).toMatchObject({ prix_centimes: null, publie: 1, questionnaire_requis: 1, places_totales: 3, html_programme: '<p>Texte d’essai</p>' });
  });

  it('les professionnels : catégories et courriers en listes', () => {
    expect(ligne(t0(), 'professionnels', 'pro-cabinet')).toMatchObject({ categories: '["Médecin généraliste"]', courriers: '["Mai 2025"]', connu: 1 });
  });

  it('le rapport désigne les lignes par leur identifiant, jamais par un nom ou une adresse', () => {
    const texte = rapportEnTexte(t0().rapport);
    expect(texte).toContain('c-trois');
    for (const personnel of ['Émilie', 'Martin', 'Marie', 'example.org', '+33']) expect(texte).not.toContain(personnel);
  });
});

describe('Le schéma d’abord', () => {
  it('une propriété attendue absente : arrêt, nommée, rien de rendu', () => {
    const exp = exportFictif();
    delete exp.bases.seances.schema['Statut'];
    expect(() => transformer(exp, MAINTENANT)).toThrow(/propriété attendue absente : seances › Statut/);
  });

  it('un type que l’outil ne sait pas lire : arrêt, nommé', () => {
    const exp = exportFictif();
    exp.bases.clients.schema['Ville'] = { type: 'button' };
    expect(() => transformer(exp, MAINTENANT)).toThrow(SchemaInvalide);
    expect(() => transformer(exp, MAINTENANT)).toThrow(/clients › Ville \(button\)/);
  });

  it('le type se lit dans le schéma, jamais sur la page', () => {
    const exp = exportFictif();
    // Le schéma dit « nombre » ; la valeur de la page est lue comme un nombre, puis rendue en texte.
    exp.bases.clients.schema['Code postal'] = { type: 'number' };
    exp.bases.clients.pages[0].properties['Code postal'] = { type: 'number', number: 75000 } as any;
    expect(ligne(transformer(exp, MAINTENANT), 'clients', 'c-emilie')!.code_postal).toBe('75000');
  });
});

describe('La table des types reprend 0002_reference.sql', () => {
  it('identifiants, durées, marges et montants', () => {
    const base = nouvelleBase();
    const enBase = base.query('SELECT id, cle, duree_min, marge_apres_min, montant_centimes FROM types_seance');
    expect(Object.fromEntries(enBase.map((r: any) => [r.cle, { id: r.id, dureeMin: r.duree_min, margeApresMin: r.marge_apres_min, montantCentimes: r.montant_centimes }]))).toEqual(TYPES);
  });
});

// ─── Écrire, appliquer, rejouer ─────────────────────────────────────────────

describe('Écrire et appliquer', () => {
  it('jamais INSERT OR REPLACE', () => {
    expect(enSql(t0())).not.toMatch(/OR\s+REPLACE/i);
  });

  it('deux imports de suite : la même base, table par table', () => {
    const base = nouvelleBase();
    const t = t0();
    appliquerA(base, enSql(t));
    const une = contenu(base);
    appliquerA(base, enSql(t0()));
    expect(contenu(base)).toEqual(une);
    expect(Object.values(une).every((lignes) => Array.isArray(lignes))).toBe(true);
    expect((une.clients as any[]).length).toBe(6);
  });

  it('une fiche réimportée garde ses séances, ses notes, et ce que gestion lui a ajouté', () => {
    const base = nouvelleBase();
    appliquerA(base, enSql(t0()));
    base.query(`INSERT INTO seances (id, client_id, type_seance_id, debut, duree_min, occupe_jusqua, statut, etat_paiement, origine, created_at, updated_at)
      VALUES ('posee-dans-gestion', 'c-emilie', '${TYPES.seance.id}', 1, 90, 2, 'realisee', 'payee', 'console', 0, 0)`);
    appliquerA(base, enSql(t0()));
    expect(base.query("SELECT id FROM seances WHERE client_id = 'c-emilie' ORDER BY id").map((r: any) => r.id)).toEqual(['posee-dans-gestion', 's-1', 's-2']);
    expect(base.query("SELECT COUNT(*) AS n FROM seances_notes")[0].n).toBe(2);
  });

  it('un second import depuis un export modifié : Notion met à jour, gestion garde ce qu’il a saisi', () => {
    const base = nouvelleBase();
    const premiere = t0();
    appliquerA(base, enSql(premiere));
    // Saisi dans gestion entre les deux imports : un prix, un type attribué à la main.
    base.query("UPDATE evenements SET prix_centimes = 16000 WHERE id = 'e-avenir'");
    base.query(`UPDATE seances SET type_seance_id = '${TYPES.seance.id}' WHERE id = 's-2'`);
    const reference = base.query("SELECT reference FROM inscriptions WHERE id = 'inscription-e-avenir-c-paul'")[0].reference;

    const exp = exportFictif();
    exp.bases.clients.pages[0].properties['Ville'] = p.texte('Autre ville d’essai') as any;
    exp.bases.evenements.pages[1].properties['Clients'] = p.relation(['page-absente']) as any;
    const seconde = transformer(exp, MAINTENANT);
    seconde.rapport.disparues.push(...disparues(lignesImportees(premiere), seconde));
    appliquerA(base, enSql(seconde));

    expect(base.query("SELECT ville FROM clients WHERE id = 'c-emilie'")[0].ville).toBe('Autre ville d’essai');
    expect(base.query("SELECT prix_centimes FROM evenements WHERE id = 'e-avenir'")[0].prix_centimes).toBe(16000);
    expect(base.query("SELECT type_seance_id FROM seances WHERE id = 's-2'")[0].type_seance_id).toBe(TYPES.seance.id);
    // La relation a disparu de Notion : la ligne reste confirmée, sa référence inchangée, et elle est listée.
    expect(base.query("SELECT statut, reference FROM inscriptions WHERE id = 'inscription-e-avenir-c-paul'")[0]).toEqual({ statut: 'confirmee', reference });
    expect(seconde.rapport.disparues).toEqual(['inscriptions › inscription-e-avenir-c-paul']);
  });

  it('une inscription prise dans gestion pour la même fiche l’emporte sur celle de Notion', () => {
    const base = nouvelleBase();
    appliquerA(base, enSql(t0()));
    base.query("UPDATE inscriptions SET statut = 'annulee' WHERE id = 'inscription-e-avenir-c-paul'");
    base.query(`INSERT INTO inscriptions (id, evenement_id, client_id, statut, reference, origine, created_at, updated_at)
      VALUES ('prise-dans-gestion', 'e-avenir', 'c-paul', 'confirmee', 'REF-GESTION', 'console', 0, 0)`);
    expect(() => appliquerA(base, enSql(t0()))).not.toThrow();
    expect(base.query("SELECT statut FROM inscriptions WHERE id = 'inscription-e-avenir-c-paul'")[0].statut).toBe('annulee');
  });
});

describe('Vérifier', () => {
  const enBase = (base: TestD1) => Object.fromEntries(TABLES.map((t) => [t, base.query(`SELECT * FROM ${t}`)])) as any;

  it('zéro écart après un import, valeurs recalculées comprises', () => {
    const base = nouvelleBase();
    appliquerA(base, enSql(t0()));
    expect(comparer(t0(), exportFictif(), enBase(base), MAINTENANT)).toEqual([]);
  });

  it('un champ modifié à la main → un écart, désigné sans sa valeur', () => {
    const base = nouvelleBase();
    appliquerA(base, enSql(t0()));
    base.query("UPDATE clients SET telephone = 'REPERE-VALEUR' WHERE id = 'c-emilie'");
    base.query("DELETE FROM inscriptions WHERE id = 'inscription-e-passe-c-emilie'");
    const ecarts = comparer(t0(), exportFictif(), enBase(base), MAINTENANT);
    expect(ecarts).toEqual(expect.arrayContaining([
      { table: 'clients', id: 'c-emilie', champ: 'telephone' },
      { table: 'inscriptions', id: 'inscription-e-passe-c-emilie', champ: '(ligne absente)' },
      { table: 'evenements', id: 'e-passe', champ: '(places libres ≠ Notion)' },
    ]));
    expect(JSON.stringify(ecarts)).not.toContain('REPERE');
  });
});

// ─── Le dossier privé ───────────────────────────────────────────────────────

describe('NORMATIF — aucune sortie dans un arbre git', () => {
  it('le dossier du dépôt : refusé', () => {
    expect(() => dossierPrive(join(RACINE, 'workers', 'api', '.wrangler', 'import'))).toThrow(DossierRefuse);
    expect(() => dossierPrive(RACINE)).toThrow(DossierRefuse);
  });

  it('un autre arbre git : refusé', () => {
    const autre = temporaire();
    mkdirSync(join(autre, '.git'));
    expect(() => dossierPrive(join(autre, 'sorties'))).toThrow(/arbre git/);
  });

  it('un lien symbolique qui mène au dépôt : refusé, pour le dossier comme pour un fichier', () => {
    const d = temporaire();
    symlinkSync(join(RACINE, 'workers'), join(d, 'vers-le-depot'));
    expect(() => dossierPrive(join(d, 'vers-le-depot', 'import'))).toThrow(DossierRefuse);
    const prive = join(d, 'prive');
    dossierPrive(prive);
    symlinkSync(join(RACINE, 'workers', 'api', 'import-piege.sql'), join(prive, 'import.sql'));
    expect(() => cheminPrive(prive, 'import.sql')).toThrow(DossierRefuse);
    for (const nom of ['export.json', 'rapport.md', '.export.json.partiel']) expect(() => cheminPrive(prive, nom)).not.toThrow();
  });

  it('chaque sortie de « preparer » refuse un lien vers le dépôt', () => {
    const d = temporaire();
    writeFileSync(join(d, 'export.json'), JSON.stringify(exportFictif()));
    symlinkSync(join(RACINE, 'workers', 'api', 'rapport-piege.md'), join(d, 'rapport.md'));
    expect(() => preparer(d, MAINTENANT)).toThrow(DossierRefuse);
    expect(existsSync(join(RACINE, 'workers', 'api', 'rapport-piege.md'))).toBe(false);
  });

  it('un dossier hors de tout dépôt : créé, droits réservés à l’utilisateur', () => {
    const d = join(temporaire(), 'a', 'b');
    dossierPrive(d);
    expect(readdirSync(join(d, '..'))).toEqual(['b']);
    expect(spawnSync('stat', process.platform === 'darwin' ? ['-f', '%Lp', d] : ['-c', '%a', d], { encoding: 'utf8' }).stdout.trim()).toBe('700');
  });

  it('« preparer » écrit le SQL et le rapport dans le dossier privé, et nulle part ailleurs', () => {
    const d = temporaire();
    writeFileSync(join(d, 'export.json'), JSON.stringify(exportFictif()));
    preparer(d, MAINTENANT);
    expect(readdirSync(d).sort()).toEqual(['.transformation.json', 'export.json', 'import.sql', 'rapport.md']);
  });
});

// ─── L'export, contre un Notion simulé ──────────────────────────────────────

describe('Exporter (Notion simulé)', () => {
  const CLE = 'secret_CLE-NOTION-DE-TEST-REPERE';
  const BASES = { clients: 'b-cl', seances: 'b-se', evenements: 'b-ev', professionnels: 'b-pr' };
  const pageNotion = (id: string) => ({ object: 'page', id, created_time: '2026-01-01T00:00:00.000Z', last_edited_time: '2026-01-02T00:00:00.000Z', properties: { Nom: { type: 'title', title: [] } } });

  const simuler = (options: { panne?: string; limite?: boolean } = {}) => {
    const appels: string[] = [];
    let limite = options.limite ?? false;
    const f = vi.fn(async (url: string, init: RequestInit) => {
      const chemin = url.slice(API.length);
      appels.push(`${init.method} ${chemin}`);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CLE}`);
      if (options.panne && chemin.includes(options.panne)) return new Response('{}', { status: 500 });
      if (limite) { limite = false; return new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }); }
      if (/^\/databases\/[^/]+$/.test(chemin)) return Response.json({ properties: { Nom: { id: 'title', type: 'title', title: {} } } });
      if (chemin.endsWith('/query')) {
        const corps = JSON.parse(String(init.body));
        // Deux pages de résultats : la pagination doit aller au bout.
        return corps.start_cursor
          ? Response.json({ results: [pageNotion(`${chemin.split('/')[2]}-p2`)], has_more: false, next_cursor: null })
          : Response.json({ results: [pageNotion(`${chemin.split('/')[2]}-p1`)], has_more: true, next_cursor: 'curseur-2' });
      }
      if (chemin.startsWith('/blocks/')) {
        const id = chemin.split('/')[2];
        return Response.json({ results: id.startsWith('blk') ? [] : [{ ...bloc(`blk-${id}`, 'paragraph', 'Texte d’essai'), has_children: true }], has_more: false });
      }
      return new Response('{}', { status: 404 });
    });
    return { f, appels };
  };

  it('lit les quatre schémas, toutes les pages, et le corps des Clients et des Séances — enfants compris', async () => {
    const d = temporaire();
    const { f, appels } = simuler();
    const attentes: number[] = [];
    const fichier = await exporter({ cle: CLE, bases: BASES, fetch: f as any, attendre: async (ms) => { attentes.push(ms); } }, d, '2026-11-27T11:00:00Z');
    const exp = JSON.parse(readFileSync(fichier, 'utf8')) as Export;
    expect(exp.bases.clients.pages.map((x) => x.id)).toEqual(['b-cl-p1', 'b-cl-p2']);
    expect(exp.bases.clients.pages[0].blocs![0].children).toEqual([]);
    expect(exp.bases.evenements.pages[0].blocs).toBeUndefined();
    expect(exp.bases.seances.schema.Nom.type).toBe('title');
    expect(appels.filter((a) => a.startsWith('POST'))).toHaveLength(8);
    // Une attente entre deux requêtes : la limite de débit de Notion.
    expect(attentes.length).toBe(appels.length - 1);
  });

  it('un 429 : attend ce que Notion demande, puis reprend', async () => {
    const d = temporaire();
    const { f } = simuler({ limite: true });
    const attentes: number[] = [];
    await exporter({ cle: CLE, bases: BASES, fetch: f as any, attendre: async (ms) => { attentes.push(ms); } }, d, 'x');
    expect(attentes).toContain(2000);
  });

  it('une erreur arrête tout, sans fichier partiel, et sans recopier la clé', async () => {
    const d = temporaire();
    const { f } = simuler({ panne: '/databases/b-ev/query' });
    await expect(exporter({ cle: CLE, bases: BASES, fetch: f as any, attendre: async () => {} }, d, 'x')).rejects.toThrow(/Notion a répondu 500/);
    expect(readdirSync(d)).toEqual([]);
    try { await exporter({ cle: CLE, bases: BASES, fetch: f as any, attendre: async () => {} }, d, 'x'); } catch (e) { expect(String(e)).not.toContain('REPERE'); }
  });

  it('la clé n’apparaît dans aucune sortie', async () => {
    const d = temporaire();
    const { f } = simuler();
    await exporter({ cle: CLE, bases: BASES, fetch: f as any, attendre: async () => {} }, d, 'x');
    for (const nom of readdirSync(d)) expect(readFileSync(join(d, nom), 'utf8')).not.toContain('REPERE');
  });
});

// ─── La cible : la base locale, et elle seule ───────────────────────────────

describe('NORMATIF — aucune façon de viser une base distante', () => {
  it('les arguments de wrangler : --local et le dossier privé, jamais --remote', () => {
    const d = temporaire();
    const args = argsLocaux(d);
    expect(args).toEqual(['--env', 'local', '--local', '--persist-to', join(dossierPrive(d), 'base')]);
    expect(args).not.toContain('--remote');
  });

  it.each([['--remote'], ['--remote=true'], ['--env', 'production'], ['--env=recette']])('la commande refuse %s', (...opt) => {
    expect(() => lireArguments(['appliquer', ...opt])).toThrow(/locale/);
  });

  it('même avec le bon nom et le bon identifiant de base, wrangler ne reçoit jamais --remote', () => {
    expect(() => wranglerLocal(['d1', 'execute', 'luminose-clients', '--remote', '--command', 'SELECT 1'])).toThrow(/distante/);
  });

  it('aucun appel réseau pendant l’application (fetch piégé)', () => {
    const piege = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('appel réseau'); });
    const d = temporaire();
    writeFileSync(join(d, 'import.sql'), enSql(t0()));
    const recus: string[][] = [];
    const executer: Executer = (args) => { recus.push(args); return { ok: true, sortie: '' }; };
    appliquer(d, 'import.sql', executer);
    expect(piege).not.toHaveBeenCalled();
    expect(recus.every((a) => a.includes('--local') && !a.includes('--remote'))).toBe(true);
  });
});

// ─── Avec le vrai wrangler, quand il est là (sur la VM) ─────────────────────

const WRANGLER = existsSync(join(RACINE, 'node_modules', '.bin', 'wrangler')) && process.platform === 'linux';

describe.skipIf(!WRANGLER)('Appliquer avec wrangler, base locale du dossier privé', () => {
  it('tout ou rien : une erreur au milieu laisse la base d’avant ; puis l’import, puis zéro écart', () => {
    const d = temporaire();
    const t = t0();
    const sql = enSql(t);
    // D'abord un fichier qui échoue au milieu : une instruction impossible entre deux bonnes.
    const lignes = sql.trim().split('\n');
    writeFileSync(join(d, 'casse.sql'), [...lignes.slice(0, 5), "INSERT INTO clients (id) VALUES ('sans-prenom');", ...lignes.slice(5)].join('\n'));
    expect(() => appliquer(d, 'casse.sql')).toThrow(/restée telle qu’elle était/);
    expect(lireBase(d).clients).toEqual([]);
    writeFileSync(join(d, 'import.sql'), sql);
    appliquer(d, 'import.sql');
    const base = lireBase(d);
    expect(base.clients).toHaveLength(6);
    expect(comparer(t, exportFictif(), base, MAINTENANT)).toEqual([]);
    // Rejoué : la même base.
    appliquer(d, 'import.sql');
    expect(lireBase(d)).toEqual(base);
  }, 180_000);
});

describe('La commande, telle que node la lance', () => {
  // `node` retire les types sans les traduire : une syntaxe que seul TypeScript comprend casserait la commande.
  const outil = (...args: string[]) => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'import', 'outil.ts'), ...args], { encoding: 'utf8' });

  it('« preparer » sur l’export fictif : le SQL et le rapport dans le dossier privé', () => {
    const d = temporaire();
    writeFileSync(join(d, 'export.json'), JSON.stringify(exportFictif()));
    const r = outil('preparer', '--dossier', d);
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(d)).toEqual(expect.arrayContaining(['import.sql', 'rapport.md']));
  });

  it('refuse --remote, et un dossier dans le dépôt', () => {
    expect(outil('appliquer', '--remote').stderr).toMatch(/locale/);
    const r = outil('preparer', '--dossier', join(RACINE, 'tmp-import'));
    expect(r.stderr).toMatch(/arbre git/);
    expect(existsSync(join(RACINE, 'tmp-import'))).toBe(false);
  });
});

describe('packages/pratique reste sans dépendance', () => {
  it('aucune dépendance d’exécution', () => {
    const manifeste = JSON.parse(readFileSync(join(RACINE, 'packages', 'pratique', 'package.json'), 'utf8'));
    expect(manifeste.dependencies ?? {}).toEqual({});
  });
});

beforeEach(() => { vi.restoreAllMocks(); });
