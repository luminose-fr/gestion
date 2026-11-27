/**
 * Une séance (SPEC §15.4). En tête : la date et l'heure, le type, la personne
 * (qui ouvre sa fiche), le statut et le paiement modifiables sur place, le
 * montant. Actions : Déplacer, Annuler, Remettre à « prévue ». Puis les notes,
 * dans l'ordre de la trame, avec un seul bouton Enregistrer ; l'écran dit quand
 * un texte n'est pas enregistré, et le signale avant de le laisser quitter.
 * Dessous, en lecture : les réponses à la réservation, l'histoire du
 * rendez-vous, et, repliée, la copie brute reprise de Notion.
 *
 * Le statut passe par la décision qui lui revient : annuler et remettre à
 * « prévue » ont leurs routes ; réalisée et absent, une simple modification.
 */
import React, { useState } from 'react';
import { ArrowLeft, Copy, MoveRight } from 'lucide-react';
import { Bouton, Carte, Champ, Etiquette, TitreSection, ecran } from '../ui';
import { ConfirmModal } from '../CommonModals';
import * as Clients from '../../services/clientsService';
import { ErreurClients } from '../../services/clientsService';
import type { EtatPaiement, NotesSeance, StatutSeance, TrameSeance } from '../../types-clients';
import {
  aller, Avis, centimesDepuis, CLASSES_SELECT, euros, EtatLecture, heure, isoDepuis, jourDe, jourEnLettres, messageDe,
  MODES, nomComplet, PAIEMENTS, STATUTS, useGardeSaisie, useLecture,
} from './commun';

const TRAME: { champ: keyof TrameSeance; libelle: string; lignes: number }[] = [
  { champ: 'demande', libelle: 'Demande', lignes: 3 },
  { champ: 'objectif', libelle: 'Objectif', lignes: 3 },
  { champ: 'seance', libelle: 'Séance', lignes: 8 },
  { champ: 'travailPersonnel', libelle: 'Travail personnel', lignes: 4 },
  { champ: 'ideesSuite', libelle: 'Idées pour la suite', lignes: 4 },
  { champ: 'reponseSms', libelle: 'Réponse SMS', lignes: 4 },
];

const TRAME_VIDE: TrameSeance = { demande: null, objectif: null, seance: null, travailPersonnel: null, ideesSuite: null, reponseSms: null };
const trameDe = (n: NotesSeance): TrameSeance => ({
  demande: n.demande, objectif: n.objectif, seance: n.seance, travailPersonnel: n.travailPersonnel, ideesSuite: n.ideesSuite, reponseSms: n.reponseSms,
});

const NATURES: Record<string, string> = { creee: 'Créée', deplacee: 'Déplacée', annulee: 'Annulée', retablie: 'Remise à « prévue »' };
const PAR: Record<string, string> = { florent: 'par Florent', personne: 'par la personne', import: 'à l’import' };

/** Les notes : la trame, un seul Enregistrer, et la version lue qui part avec le texte (règle 7). */
export const NotesDeSeance: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireNotesSeance(id), [id]);
  const [trame, setTrame] = useState<TrameSeance>(TRAME_VIDE);
  const [version, setVersion] = useState<number | null>(null);
  const [lue, setLue] = useState<TrameSeance>(TRAME_VIDE);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [copie, setCopie] = useState(false);

  // Les notes lues deviennent la saisie DANS le rendu qui les reçoit, pas dans un effet :
  // un effet passerait après une première frappe, et l'effacerait.
  const [luesDe, setLuesDe] = useState<NotesSeance | null>(null);
  if (lecture.phase === 'prete' && luesDe !== lecture.donnees) {
    setLuesDe(lecture.donnees);
    setTrame(trameDe(lecture.donnees));
    setLue(trameDe(lecture.donnees));
    setVersion(lecture.donnees.version);
  }

  const modifiee = TRAME.some(({ champ }) => (trame[champ] ?? '') !== (lue[champ] ?? ''));
  useGardeSaisie(modifiee);

  if (lecture.phase !== 'prete') return <EtatLecture lecture={lecture} titre="Lecture des notes" />;
  const notes = lecture.donnees;

  const enregistrer = async () => {
    setEnCours(true);
    setRefus(null);
    try {
      const propre = Object.fromEntries(TRAME.map(({ champ }) => [champ, trame[champ]?.trim() ? trame[champ] : null])) as TrameSeance;
      const r = await Clients.ecrireNotesSeance(id, propre, version);
      setVersion(r.version);
      setLue(trame);
    } catch (e) {
      // Un 409 dit que la note a changé ailleurs : le texte saisi reste à l'écran.
      setRefus(e instanceof ErreurClients ? e.message : messageDe(e));
    } finally {
      setEnCours(false);
    }
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(trame.reponseSms ?? '');
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch { /* le presse-papiers peut être refusé : le texte reste sélectionnable */ }
  };

  return (
    <div className="space-y-4">
      <Carte densite="contenu" rythme>
        <TitreSection
          as="h3"
          titre="Notes"
          sousTitre={modifiee ? <span className="text-alerte">Un texte n’est pas enregistré.</span> : undefined}
          action={<Bouton taille="petit" intention="principale" onClick={enregistrer} disabled={enCours || !modifiee}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>}
        />
        {TRAME.map(({ champ, libelle, lignes }, i) => (
          <div key={champ}>
            <Champ
              multiligne id={`notes-${champ}`} label={libelle} rows={lignes} autoFocus={i === 0}
              value={trame[champ] ?? ''}
              onChange={(e) => setTrame((t) => ({ ...t, [champ]: (e.target as HTMLTextAreaElement).value }))}
            />
            {champ === 'reponseSms' && (
              <div className="mt-1 flex justify-end">
                <Bouton taille="petit" intention="secondaire" onClick={copier} disabled={!trame.reponseSms}><Copy /> {copie ? 'Copiée' : 'Copier'}</Bouton>
              </div>
            )}
          </div>
        ))}
        {refus && <Avis ton="erreur">{refus}</Avis>}
        <div className="flex justify-end">
          <Bouton intention="principale" onClick={enregistrer} disabled={enCours || !modifiee}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
        </div>
      </Carte>

      {notes.reponses.length > 0 && (
        <Carte densite="contenu" rythme>
          <TitreSection as="h3" titre="Réponses données à la réservation" />
          <dl className="space-y-2">
            {notes.reponses.map((r) => (
              <div key={r.rang}>
                <dt className="text-xs text-brand-main dark:text-dark-text">{r.question}</dt>
                <dd className="text-sm text-brand-main dark:text-white whitespace-pre-wrap">{r.reponse || '—'}</dd>
              </div>
            ))}
          </dl>
        </Carte>
      )}

      {notes.importNotion && (
        <Carte densite="contenu">
          <details>
            <summary className="text-sm font-semibold text-brand-main dark:text-white cursor-pointer">Copie brute reprise de Notion</summary>
            <p className="mt-3 text-sm text-brand-main dark:text-dark-text whitespace-pre-wrap">{notes.importNotion}</p>
          </details>
        </Carte>
      )}
    </div>
  );
};

type Decision = null | 'annuler';

export const SeanceView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireSeance(id), [id]);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [deplacement, setDeplacement] = useState<{ date: string; heure: string } | null>(null);
  const [montant, setMontant] = useState<string | null>(null);

  if (lecture.phase !== 'prete') return <div className={ecran('liste')}><EtatLecture lecture={lecture} /></div>;
  const s = lecture.donnees;

  const agir = async (action: () => Promise<unknown>) => {
    setEnCours(true);
    setRefus(null);
    try {
      await action();
      await lecture.recharger();
      return true;
    } catch (e) {
      setRefus(messageDe(e));
      return false;
    } finally {
      setEnCours(false);
    }
  };

  const changerStatut = (statut: StatutSeance) => {
    if (statut === s.statut) return;
    if (statut === 'annulee') { setDecision('annuler'); return; }
    if (statut === 'prevue') { void agir(() => Clients.remettreAPrevue(id)); return; }
    void agir(() => Clients.modifierSeance(id, { statut }));
  };

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <Bouton taille="petit" intention="discrete" onClick={() => window.history.length > 1 ? window.history.back() : aller('seances')}><ArrowLeft /> Retour</Bouton>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
        <div className="space-y-4">
          <Carte densite="contenu" rythme>
            <div>
              <h2 className="text-lg font-bold text-brand-main dark:text-white first-letter:uppercase">{jourEnLettres(s.debut)}</h2>
              <p className="text-sm text-brand-main dark:text-dark-text tabular-nums">{heure(s.debut)}–{heure(s.fin)} · {s.dureeMin} min</p>
              <p className="mt-1 text-sm text-brand-main dark:text-white">
                {s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}{s.mode && ` · ${MODES[s.mode]}`}
              </p>
              <p className="mt-1 text-sm">
                {s.personne.clientId
                  ? <a className="font-semibold text-brand-main dark:text-white underline hover:no-underline" href={`#clients/${encodeURIComponent(s.personne.clientId)}`}>{nomComplet(s.personne)}</a>
                  : <span className="text-brand-main dark:text-white">{nomComplet(s.personne)} <span className="text-xs text-alerte">· à rapprocher</span></span>}
              </p>
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div>
                <Etiquette as="label" htmlFor="seance-statut" className="mb-1">Statut</Etiquette>
                <select id="seance-statut" className={CLASSES_SELECT} value={s.statut} disabled={enCours} onChange={(e) => changerStatut(e.target.value as StatutSeance)}>
                  {(Object.keys(STATUTS) as StatutSeance[]).map((k) => <option key={k} value={k}>{STATUTS[k].libelle}</option>)}
                </select>
              </div>
              <div>
                <Etiquette as="label" htmlFor="seance-paiement" className="mb-1">Paiement</Etiquette>
                <select id="seance-paiement" className={CLASSES_SELECT} value={s.etatPaiement} disabled={enCours}
                  onChange={(e) => void agir(() => Clients.modifierSeance(id, { etatPaiement: e.target.value as EtatPaiement }))}>
                  {(Object.keys(PAIEMENTS) as EtatPaiement[]).map((k) => <option key={k} value={k}>{PAIEMENTS[k].libelle}</option>)}
                </select>
              </div>
            </div>

            {montant === null ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-brand-main dark:text-dark-text">Montant</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-main dark:text-white tabular-nums">{euros(s.montantCentimes)}</span>
                  <Bouton taille="petit" intention="discrete" onClick={() => setMontant(String(s.montantCentimes / 100))}>Modifier</Bouton>
                </span>
              </div>
            ) : (
              <form className="flex items-end gap-2" onSubmit={(e) => {
                e.preventDefault();
                const c = centimesDepuis(montant);
                if (c === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
                void agir(() => Clients.modifierSeance(id, { montantCentimes: c })).then((ok) => { if (ok) setMontant(null); });
              }}>
                <Champ id="seance-montant" label="Montant (€)" inputMode="decimal" value={montant} autoFocus classNameEnveloppe="flex-1" onChange={(e) => setMontant((e.target as HTMLInputElement).value)} />
                <Bouton type="button" intention="discrete" onClick={() => setMontant(null)}>Annuler</Bouton>
                <Bouton type="submit" intention="principale" disabled={enCours}>Enregistrer</Bouton>
              </form>
            )}

            <div className="flex flex-wrap gap-2">
              {s.statut === 'prevue' && (
                <Bouton taille="petit" intention="secondaire" onClick={() => setDeplacement({ date: jourDe(s.debut), heure: heure(s.debut) })}><MoveRight /> Déplacer</Bouton>
              )}
              {s.statut === 'prevue' && <Bouton taille="petit" intention="secondaire" ton="erreur" onClick={() => setDecision('annuler')}>Annuler la séance</Bouton>}
              {s.statut !== 'prevue' && <Bouton taille="petit" intention="secondaire" onClick={() => void agir(() => Clients.remettreAPrevue(id))} disabled={enCours}>Remettre à « prévue »</Bouton>}
            </div>

            {deplacement && (
              <form className="space-y-3" onSubmit={(e) => {
                e.preventDefault();
                void agir(() => Clients.deplacerSeance(id, isoDepuis(deplacement.date, deplacement.heure), s.revision)).then((ok) => { if (ok) setDeplacement(null); });
              }}>
                <div className="grid gap-3 grid-cols-2">
                  <Champ id="deplacer-date" label="Nouvelle date" type="date" value={deplacement.date} autoFocus onChange={(e) => setDeplacement({ ...deplacement, date: (e.target as HTMLInputElement).value })} />
                  <Champ id="deplacer-heure" label="Nouvelle heure" type="time" step={300} value={deplacement.heure} onChange={(e) => setDeplacement({ ...deplacement, heure: (e.target as HTMLInputElement).value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Bouton type="button" taille="petit" intention="discrete" onClick={() => setDeplacement(null)}>Annuler</Bouton>
                  <Bouton type="submit" taille="petit" intention="principale" disabled={enCours}>Déplacer</Bouton>
                </div>
              </form>
            )}

            {refus && <Avis ton="erreur">{refus}</Avis>}
            {s.agendaEtat === 'a_ecrire' && <p className="text-xs text-brand-main dark:text-dark-text">Ce rendez-vous n’est pas écrit dans l’agenda Google.</p>}
          </Carte>

          <Carte densite="contenu" rythme>
            <TitreSection as="h3" titre="Histoire du rendez-vous" />
            <ul className="space-y-1.5">
              {s.mouvements.map((m) => (
                <li key={m.id} className="text-sm text-brand-main dark:text-dark-text">
                  <span className="font-semibold text-brand-main dark:text-white">{NATURES[m.nature] ?? m.nature}</span> {PAR[m.par] ?? ''}, le {jourEnLettres(m.le)}
                  {m.nature === 'deplacee' && m.ancienDebut && m.nouveauDebut && <> : {jourEnLettres(m.ancienDebut)} {heure(m.ancienDebut)} → {jourEnLettres(m.nouveauDebut)} {heure(m.nouveauDebut)}</>}
                </li>
              ))}
            </ul>
          </Carte>
        </div>

        <NotesDeSeance id={id} />
      </div>

      <ConfirmModal
        isOpen={decision === 'annuler'}
        onClose={() => setDecision(null)}
        onConfirm={() => void agir(() => Clients.annulerSeance(id))}
        title="Annuler cette séance ?"
        message="Elle reste dans l’histoire de la fiche, et son créneau se libère. Aucun message ne part."
        confirmLabel="Annuler la séance"
        isDestructive
      />
    </div>
  );
};

export default SeanceView;
