/**
 * La porte publique, côté gestion : ce que gestion fait d'un envoi du site
 * (SPEC §14.5, §14.6 ; contrat §3).
 *
 * **Rien ici ne sait d'où vient l'envoi.** Une fonction reçoit l'envoi tel
 * qu'il est arrivé (`unknown`) et rend une réponse du contrat ; la phase S2b
 * l'enveloppera dans une entrée nommée (`PortePublique`), et la porte servira
 * la réponse. Une panne n'est pas une réponse : la fonction lève, et la porte
 * rendra un 5xx.
 *
 * **La porte n'apprend rien sur personne** (règle 4). Sur tous les chemins qui
 * enregistrent, la même réponse, la même lecture groupée, le même lot — mêmes
 * instructions, dont les conditions décident. Ce qui dépend de qui est la
 * personne — compléter sa fiche — se fait APRÈS la réponse (`suite`).
 */
import {
  OK, invalide, refuser, valider, champPiegeRempli, questionnaire as schemaQuestionnaire,
  type Reponse, type Questionnaire,
} from '@luminose/contrat';
import type { Env } from '../../env';
import { newId } from '../../db';
import { baseClients, clientsReliee } from '../base';
import { secretDesPortes, verifierJeton } from '../jetons';
import { decisionCommande, empreinteDe, lireCommande, reponseAuRejeu, type CommandeVue } from '../commandes';
import { ouvrirAlerte, alerteBorne } from '../alertes';
import { inscrireOrdre } from '../ordres';
import {
  insertionQuestionnaire, rattachementALaSeance, lireMemoireEnvoi, sansQuestionnaireDeCetEnvoi, questionnaireExiste,
  lotCompletionFiche, type QuestionnaireRecu,
} from '../sensible';

/** La réponse à rendre, et ce qui reste à faire après l'avoir rendue (`waitUntil` en S2b). */
export type Reception = { reponse: Reponse; suite: () => Promise<void> };

/** Un point d'accroche pour les tests : changer l'état entre la lecture et le lot. */
export type Crochets = { avantLeLot?: () => Promise<void> };

const RIEN = async () => {};

/** La borne de cette sorte de commande (un réglage). */
const BORNE = 'commandes_questionnaire_max_jour';

/**
 * Un jeton bien formé qui ne vaut jamais rien : vérifié quand l'envoi n'a pas
 * de référence, pour que le chemin sans lien fasse le même calcul que les
 * autres (règle 4).
 */
const JETON_TEMOIN = `e30.${'A'.repeat(43)}`;

/** La date à Paris, `AAAA-MM-JJ`. */
const jourAParis = (instant: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(instant);

/** Ce que la lecture groupée a vu. */
type Etat = { ouverte: boolean; commande: CommandeVue | null; memoire: { empreinte: string | null } | null; accordConnu: boolean };

/**
 * UN aller-retour, le même sur tous les chemins, référence ou non : l'interrupteur,
 * la commande de cette clé, le questionnaire de cet envoi, le texte de l'accord.
 * Le rattachement ne s'y lit pas : il se décide dans le lot.
 */
const lire = async (db: D1Database, cle: string, versionAccord: number): Promise<Etat> => {
  const [reglage, commande, memoire, accord] = await db.batch([
    db.prepare("SELECT valeur FROM reglages WHERE cle = 'porte_publique_ouverte'"),
    lireCommande(db, 'publique', cle),
    lireMemoireEnvoi(db, cle),
    db.prepare("SELECT 1 AS connu FROM textes_versions WHERE cle = 'accord_conservation' AND version = ?1").bind(versionAccord),
  ]);
  const premiere = <T>(r: D1Result) => (r.results?.[0] as T | undefined) ?? null;
  return {
    // Un réglage absent ferme la porte : c'est l'ouverture qui se déclare.
    ouverte: Number(premiere<{ valeur: number }>(reglage)?.valeur ?? 0) === 1,
    commande: premiere<CommandeVue>(commande),
    memoire: premiere<{ empreinte: string | null }>(memoire),
    accordConnu: premiere(accord) !== null,
  };
};

/** Une clé déjà vue — par sa commande, ou, après la purge, par le questionnaire qui garde son envoi. */
const rejeu = (etat: Etat, empreinte: string): Reponse | null => {
  if (etat.commande) return reponseAuRejeu(etat.commande, empreinte);
  if (etat.memoire) return etat.memoire.empreinte === empreinte ? OK : invalide();
  return null;
};

const nombreDeOui = (q: Questionnaire) => q.reponses.filter((r) => r.reponse.trim().toLowerCase() === 'oui').length;

/**
 * Recevoir un questionnaire de santé (contrat §3.2, SPEC §14.6.1).
 *
 * Deux allers-retours à la base sur le chemin qui enregistre — la lecture
 * groupée, puis le lot —, trois quand la décision n'a rien écrit, quatre quand
 * c'est la borne (son alerte).
 */
export const questionnaire = async (env: Env, envoi: unknown, maintenant: number, crochets: Crochets = {}): Promise<Reception> => {
  // 1. Le contrat. Le champ piège rempli : une erreur visible, sans champ nommé.
  if (champPiegeRempli(envoi)) return { reponse: invalide(), suite: RIEN };
  const v = valider(schemaQuestionnaire, envoi);
  if (!v.valide) return { reponse: v.refus, suite: RIEN };
  const q = v.donnees;

  // 2. Sans secret ni base, rien ne peut s'enregistrer : une panne. Un code, jamais une valeur (règle 7).
  if (!secretDesPortes(env)) throw new Error('incident: portes_secret_absent');
  if (!clientsReliee(env)) throw new Error('incident: base_non_reliee');
  const db = baseClients(env);

  const empreinte = await empreinteDe(env, q);
  const jeton = await verifierJeton(env, q.reference ?? JETON_TEMOIN, 'questionnaire', maintenant);

  const etat = await lire(db, q.cle, q.accord.version);
  // 3. Coupée, la porte ne rend rien d'autre — même à une clé déjà vue.
  if (!etat.ouverte) return { reponse: refuser('ferme'), suite: RIEN };
  // 4. Une clé déjà vue : son reçu, ou invalide.
  const deja = rejeu(etat, empreinte);
  if (deja) return { reponse: deja, suite: RIEN };
  if (!etat.accordConnu) return { reponse: invalide(['accord.version']), suite: RIEN };

  const id = newId();
  const recu: QuestionnaireRecu = {
    id,
    envoiId: q.cle,
    envoiEmpreinte: empreinte,
    contexte: q.contexte,
    version: q.version,
    versionFormulaire: q.version_formulaire,
    // 6. Seul un jeton valable désigne une séance ; la base dira, dans le lot,
    // si elle est encore à cette version et sans questionnaire.
    seanceCandidate: jeton?.objet ?? null,
    liensVersion: jeton?.version ?? null,
    evenementCandidat: q.evenement ?? null,
    identite: JSON.stringify(q.identite),
    coordonnees: q.coordonnees ? JSON.stringify(q.coordonnees) : null,
    confiance: q.confiance ? JSON.stringify(q.confiance) : null,
    reponses: JSON.stringify({ questions: q.reponses, informations: q.informations ?? '' }),
    nbOui: nombreDeOui(q),
    dateNaissanceEnvoi: q.coordonnees?.date_naissance ?? null,
    accordVersion: q.accord.version,
    jourReception: jourAParis(maintenant),
    commandeId: newId(),
  };
  const objet = { objetType: 'questionnaire', objetId: id };

  await crochets.avantLeLot?.();

  // 7. Un seul lot, de même forme sur tous les chemins ; la commande décide (5 : la borne y est).
  const resultats = await db.batch([
    decisionCommande(db, {
      id: recu.commandeId, porte: 'publique', cle: q.cle, sorte: 'questionnaire', ...objet,
      empreinte, recu: OK, borne: BORNE,
    }, maintenant, sansQuestionnaireDeCetEnvoi('?3')),
    insertionQuestionnaire(db, recu, maintenant),
    rattachementALaSeance(db, recu, maintenant),
    inscrireOrdre(db, {
      sorte: 'message.email', modeleCle: 'questionnaire_accuse', ...objet, prevuLe: maintenant, cleUnicite: `accuse:${id}`,
    }, maintenant, questionnaireExiste('?5')),
    ouvrirAlerte(db, { sorte: 'a_rapprocher', ...objet }, maintenant, questionnaireExiste('?4', "q.rattachement = 'a_rapprocher'")),
    ouvrirAlerte(db, { sorte: 'a_revoir', ...objet }, maintenant, questionnaireExiste('?4', 'q.a_revoir = 1')),
    ouvrirAlerte(db, { sorte: 'second_questionnaire', ...objet }, maintenant,
      questionnaireExiste('?4', "q.rattachement = 'a_rapprocher' AND q.seance_id IS NOT NULL")),
  ]);

  if (resultats[0].meta.changes === 1) {
    // 8 et 9. La même réponse partout ; la fiche se complète après.
    return { reponse: OK, suite: () => completerLaFiche(db, id, maintenant) };
  }

  // La décision n'a rien écrit : la lecture dit pourquoi.
  const apres = await lire(db, q.cle, q.accord.version);
  const vu = rejeu(apres, empreinte);
  if (vu) return { reponse: vu, suite: RIEN };
  await alerteBorne(db, BORNE, maintenant).run();
  return { reponse: refuser('trop_de_demandes'), suite: RIEN };
};

/**
 * Compléter la fiche (§14.6.1, point 10) : en un lot, sans rien toucher de ce
 * qui est rempli. Rejouée, elle ne change rien ; jamais jouée — le Worker s'est
 * arrêté —, le passage planifié la reprend.
 */
export const completerLaFiche = async (db: D1Database, questionnaireId: string, maintenant: number): Promise<void> => {
  await db.batch(lotCompletionFiche(db, questionnaireId, maintenant));
};
