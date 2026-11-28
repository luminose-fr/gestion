/**
 * Une séance (SPEC §15.4 ; refonte de la console, lot 4). Les notes — un seul
 * texte Markdown, pré-rempli de quelques titres, enregistré pendant la frappe —
 * puis l'écran qui change selon le moment (voir `SeanceView`, plus bas).
 *
 * Le statut passe par la décision qui lui revient : annuler et remettre à
 * « prévue » ont leurs routes ; réalisée et absent, une simple modification.
 */
import { duree as dureeEnClair, montant as montantEnClair } from '../../lib/format';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bouton, Carte, Champ, Choix, Etiquette, Fenetre, FOCUS, Pastille, Repliable, Secondaire, TitreCarte, TitreEcran } from '../charte';
import { Markdown } from '../ui';
import * as Clients from '../../services/clientsService';
import { ErreurClients } from '../../services/clientsService';
import type { EtatPaiement, NotesSeance, SeanceDetaillee, StatutSeance } from '../../types-clients';
import { RichTextarea } from '../RichTextarea';
import { MarkdownToolbar } from '../MarkdownToolbar';
import { PoserRendezVous } from './PoserRendezVous';
import {
  aller, centimesDepuis, euros, EtatLecture, heure, jourDe, jourEnLettres, messageDe,
  MODES, nomComplet, PAIEMENTS, STATUTS, useGardeSaisie, useLecture,
} from './commun';

/**
 * Le modèle d'une note neuve : les titres de l'ancien modèle de page de Notion,
 * que Florent garde ou efface. Rien n'est enregistré tant qu'il n'a rien tapé.
 */
export const MODELE_NOTES = '## Séance\n\n\n## Travail personnel\n\n\n## Idées pour la suite\n\n\n## Réponse SMS\n\n';

/** Le délai entre la dernière frappe et l'enregistrement. */
export const DELAI_ENREGISTREMENT_MS = 1200;

/** Le texte sous le titre « Réponse SMS », jusqu'au titre suivant ; vide s'il n'y en a pas. */
export const reponseSmsDe = (texte: string): string => {
  const m = /^#{1,3}\s*R[ée]ponse SMS\s*$/im.exec(texte);
  if (!m) return '';
  const suite = texte.slice(m.index + m[0].length);
  const fin = suite.search(/^#{1,3}\s/m);
  return (fin < 0 ? suite : suite.slice(0, fin)).trim();
};

const NATURES: Record<string, string> = { creee: 'Créée', deplacee: 'Déplacée', annulee: 'Annulée', retablie: 'Remise à « prévue »' };
const PAR: Record<string, string> = { florent: 'par Florent', personne: 'par la personne', import: 'à l’import' };

type EtatNotes = 'a-jour' | 'en-attente' | 'enregistrement' | 'echec' | 'conflit';

/**
 * Les notes : un seul texte Markdown, enregistré pendant la frappe, un court
 * délai après la dernière touche. La version lue part avec chaque écriture
 * (règle 7) : si la note a changé ailleurs, le 409 arrête l'enregistrement et
 * le texte saisi reste à l'écran. En quittant l'écran, ce qui attend part tout
 * de suite ; l'avertissement ne vient que si un enregistrement est en cours,
 * attend encore, ou a échoué.
 */
export const NotesDeSeance: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireNotesSeance(id), [id]);
  const [texte, setTexte] = useState('');
  const [etat, setEtat] = useState<EtatNotes>('a-jour');
  const [refus, setRefus] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  // Ce que l'enregistrement lit au moment où il part : le texte courant, la
  // version, et s'il faut repartir parce qu'on a tapé pendant le précédent.
  const courant = useRef({ texte: '', version: null as number | null, enregistre: '', enVol: false, aRefaire: false, arrete: false });
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monte = useRef(true);

  // Les notes lues deviennent la saisie DANS le rendu qui les reçoit, pas dans un effet :
  // un effet passerait après une première frappe, et l'effacerait.
  const [luesDe, setLuesDe] = useState<NotesSeance | null>(null);
  if (lecture.phase === 'prete' && luesDe !== lecture.donnees) {
    const n = lecture.donnees;
    const initial = n.texte ?? (n.version === null ? MODELE_NOTES : '');
    setLuesDe(n);
    setTexte(initial);
    setEtat('a-jour');
    setRefus(null);
    courant.current = { texte: initial, version: n.version, enregistre: n.texte ?? initial, enVol: false, aRefaire: false, arrete: false };
  }

  const enregistrer = useCallback(async () => {
    const c = courant.current;
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
    if (c.arrete) return;
    if (c.enVol) { c.aRefaire = true; return; }
    if (c.texte === c.enregistre) { if (monte.current) setEtat('a-jour'); return; }
    const envoye = c.texte;
    c.enVol = true;
    if (monte.current) { setEtat('enregistrement'); setRefus(null); }
    try {
      const r = await Clients.ecrireNotesSeance(id, envoye.trim() ? envoye : null, c.version);
      c.version = r.version;
      c.enregistre = envoye;
      c.enVol = false;
      if (c.aRefaire || c.texte !== envoye) { c.aRefaire = false; void enregistrer(); return; }
      if (monte.current) setEtat('a-jour');
    } catch (e) {
      c.enVol = false;
      c.aRefaire = false;
      const conflit = e instanceof ErreurClients && e.statut === 409;
      // Un 409 dit que la note a changé ailleurs : on n'écrase rien, on s'arrête.
      if (conflit) c.arrete = true;
      if (monte.current) {
        setEtat(conflit ? 'conflit' : 'echec');
        setRefus(e instanceof ErreurClients ? e.message : messageDe(e));
      }
    }
  }, [id]);

  const saisir = (valeur: string) => {
    setTexte(valeur);
    courant.current.texte = valeur;
    if (courant.current.arrete) return;
    setEtat((e) => (e === 'enregistrement' ? e : 'en-attente'));
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { void enregistrer(); }, DELAI_ENREGISTREMENT_MS);
  };

  // En quittant l'écran (une autre adresse de la console) : ce qui attend part tout de suite.
  // `monte` repasse à vrai à chaque montage : le mode strict de React démonte et remonte une fois.
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
      if (minuteur.current) void enregistrer();
    };
  }, [enregistrer]);

  // L'onglet qui passe à l'arrière-plan (téléphone verrouillé, autre application) : idem.
  useEffect(() => {
    const cache = () => { if (document.visibilityState === 'hidden' && minuteur.current) void enregistrer(); };
    document.addEventListener('visibilitychange', cache);
    return () => document.removeEventListener('visibilitychange', cache);
  }, [enregistrer]);

  useGardeSaisie(etat === 'en-attente' || etat === 'enregistrement' || etat === 'echec' || etat === 'conflit', {
    // Pour une autre adresse de la console, seul un échec retient : ce qui attend part au démontage.
    adresse: etat === 'echec' || etat === 'conflit',
  });

  if (lecture.phase !== 'prete') return <EtatLecture lecture={lecture} titre="Lecture des notes" />;
  const notes = lecture.donnees;
  const sms = reponseSmsDe(texte);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(sms);
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    } catch { /* le presse-papiers peut être refusé : le texte reste sélectionnable */ }
  };

  const ETATS: Record<EtatNotes, React.ReactNode> = {
    'a-jour': notes.version !== null || texte !== (notes.texte ?? MODELE_NOTES) ? '✓ Enregistré' : undefined,
    'en-attente': 'Modifications en attente…',
    enregistrement: 'Enregistrement…',
    echec: <span className="font-semibold text-sens-erreur">× Pas enregistré.</span>,
    conflit: <span className="font-semibold text-sens-erreur">× Pas enregistré : la note a changé ailleurs.</span>,
  };

  return (
    <div className="flex flex-col gap-4">
      <Carte as="section" aria-label="Notes de la séance" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-bord px-4 py-2.5">
          <TitreCarte className="flex-1">Notes</TitreCarte>
          <span role="status" aria-live="polite" className="text-secondaire text-second">{ETATS[etat]}</span>
          {sms && <Bouton taille="petit" intention="borde" onClick={copier}>{copie ? 'Copiée' : 'Copier la réponse SMS'}</Bouton>}
        </div>
        <MarkdownToolbar className="border-b border-bord" />
        <RichTextarea id="notes-seance" ariaLabel="Notes de la séance" value={texte} onChange={saisir} className="w-full min-h-[320px] px-4 py-3 text-champ-tel" placeholder="Les notes de la séance…" />
        <p className="border-t border-bord px-4 py-2 text-secondaire text-second">Les titres sont proposés : gardez-les ou effacez-les.</p>
        {refus && (
          <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-bord px-4 py-2.5 text-secondaire text-sens-erreur">
            <span>{refus}</span>
            {etat === 'echec' && <Bouton taille="petit" intention="borde" onClick={() => { void enregistrer(); }}>Réessayer</Bouton>}
            {etat === 'conflit' && <span>Copiez votre texte avant de recharger la page, pour ne pas le perdre.</span>}
          </div>
        )}
      </Carte>

      {notes.reponses.length > 0 && (
        <Carte className="px-4 py-3">
          <Repliable titre="Réponses données à la réservation" resume={`${notes.reponses.length} réponse${notes.reponses.length > 1 ? 's' : ''}`}>
            <dl className="flex flex-col gap-2">
              {notes.reponses.map((r) => (
                <div key={r.rang}>
                  <dt className="text-secondaire text-second">{r.question}</dt>
                  <dd className="whitespace-pre-wrap">{r.reponse || '—'}</dd>
                </div>
              ))}
            </dl>
          </Repliable>
        </Carte>
      )}

      {notes.importNotion && (
        <Carte className="px-4 py-3">
          <Repliable titre="Copie reprise de l’ancien outil" resume="en lecture seule">
            <p className="whitespace-pre-wrap text-secondaire text-second">{notes.importNotion}</p>
          </Repliable>
        </Carte>
      )}
    </div>
  );
};

// ─── La dernière fois ───────────────────────────────────────────────────────

/** Les notes de la séance précédente, lues à l'ouverture seulement : repliées, elles ne coûtent rien. */
const DerniereFois: React.FC<{ id: string; debut: string }> = ({ id, debut }) => {
  const [notes, setNotes] = useState<string | null | undefined>(undefined);
  const [refus, setRefus] = useState<string | null>(null);
  const ouvrir = (e: React.SyntheticEvent<HTMLElement>) => {
    if (!(e.currentTarget as HTMLDetailsElement).open || notes !== undefined) return;
    Clients.lireNotesSeance(id)
      .then((n) => setNotes(n.texte ?? n.importNotion ?? null))
      .catch((err) => setRefus(messageDe(err)));
  };
  return (
    <Carte className="px-4 py-3">
      <details onToggle={ouvrir} className="group">
        <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-2 md:min-h-10 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
          <span aria-hidden="true" className="mx-1 size-[7px] flex-none -rotate-45 border-b-[1.6px] border-r-[1.6px] border-second transition-transform duration-[var(--duree)] group-open:rotate-45" />
          <span className="font-semibold">La dernière fois</span>
          <span className="truncate text-secondaire text-second">· {jourEnLettres(debut)}</span>
        </summary>
        <div className="pt-2">
          {refus ? <p className="text-secondaire text-sens-erreur">{refus}</p>
            : notes === undefined ? <p className="text-secondaire text-second">Lecture des notes…</p>
              : notes === null ? <p className="text-secondaire text-second">Pas de notes pour cette séance.</p>
                : <Markdown texte={notes} />}
          <a href={`#agenda/${encodeURIComponent(id)}`} className="mt-2 inline-block text-secondaire font-semibold text-marque underline-offset-[3px] hover:underline">Ouvrir cette séance</a>
        </div>
      </details>
    </Carte>
  );
};

// ─── Terminer la séance ─────────────────────────────────────────────────────

/** Sept jours plus tard, même heure : la date du suivant, `AAAA-MM-JJ`. */
const septJoursApres = (iso: string) => {
  const d = new Date(`${jourDe(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
};

/**
 * Trois gestes, dans l'ordre (03, §3.2) : réalisée (ou absente), puis
 * l'encaissement demandé explicitement, puis « Poser le suivant », pré-rempli.
 * Une absence reste à payer, en rouge : tant qu'elle n'est pas réglée,
 * Florent ne reprend pas la personne (décision du 28/11/2026).
 */
const Terminer: React.FC<{
  s: SeanceDetaillee; enCours: boolean; agir: (a: () => Promise<unknown>) => Promise<boolean>; onSuivant: () => void;
}> = ({ s, enCours, agir, onSuivant }) => {
  const [reporte, setReporte] = useState(false);
  const etape1 = s.statut === 'realisee' || s.statut === 'absent';
  const etape2 = etape1 && (s.etatPaiement !== 'a_payer' || reporte);
  const Numero: React.FC<{ fait: boolean; n: number }> = ({ fait, n }) => (
    <span aria-hidden="true" className={`flex size-6 flex-none items-center justify-center rounded-full border text-etiquette font-semibold ${fait ? 'border-sens-succes bg-sens-succes-fond text-sens-succes' : 'border-bord text-second'}`}>{fait ? '✓' : n}</span>
  );
  return (
    <Carte as="section" aria-label="Terminer la séance" id="terminer" className="overflow-hidden">
      <div className="px-4 py-3">
        <TitreCarte>Terminer la séance</TitreCarte>
        <Secondaire>Trois gestes, dans l’ordre. Chacun s’ouvre quand le précédent est fait.</Secondaire>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-bord px-4 py-3">
        <Numero fait={etape1} n={1} />
        {etape1 ? (
          <>
            <span className="flex-1">{s.statut === 'absent' ? 'Personne absente' : 'Séance réalisée'}</span>
            <Bouton taille="petit" intention="souligne" disabled={enCours} onClick={() => void agir(() => Clients.remettreAPrevue(s.id))}>Revenir</Bouton>
          </>
        ) : (
          <>
            <span className="flex-1">La séance a-t-elle eu lieu ?</span>
            <Bouton taille="petit" disabled={enCours} onClick={() => void agir(() => Clients.modifierSeance(s.id, { statut: 'realisee' }))}>Séance réalisée</Bouton>
            <Bouton taille="petit" intention="borde" disabled={enCours} onClick={() => void agir(() => Clients.modifierSeance(s.id, { statut: 'absent' }))}>Absente</Bouton>
          </>
        )}
      </div>
      <div className={`flex flex-col gap-2 border-t border-bord px-4 py-3 ${etape1 ? '' : 'opacity-50'}`}>
        <div className="flex items-center gap-3">
          <Numero fait={etape2} n={2} />
          <span className="flex-1">Encaissement · {montantEnClair(s.montantCentimes)}</span>
          {etape2 && <span className="text-secondaire text-second">{PAIEMENTS[s.etatPaiement].libelle}</span>}
        </div>
        {etape1 && !etape2 && (
          <div className="flex flex-wrap gap-2 pl-9">
            <Bouton taille="petit" disabled={enCours} onClick={() => void agir(() => Clients.modifierSeance(s.id, { etatPaiement: 'payee' }))}>Payée maintenant</Bouton>
            <Bouton taille="petit" intention="borde" disabled={enCours} onClick={() => void agir(() => Clients.modifierSeance(s.id, { etatPaiement: 'attente_especes' }))}>En attente d’espèces</Bouton>
            {s.statut !== 'absent' && <Bouton taille="petit" intention="borde" disabled={enCours} onClick={() => void agir(() => Clients.modifierSeance(s.id, { etatPaiement: 'offerte' }))}>Offerte</Bouton>}
            <Bouton taille="petit" intention="souligne" onClick={() => setReporte(true)}>Pas encore payée : à encaisser</Bouton>
          </div>
        )}
      </div>
      <div className={`flex flex-wrap items-center gap-3 border-t border-bord px-4 py-3 ${etape2 ? '' : 'opacity-50'}`}>
        <Numero fait={false} n={3} />
        <span className="min-w-0 flex-1">
          <span className="block">Poser le suivant</span>
          <span className="block text-secondaire text-second">{jourEnLettres(`${septJoursApres(s.debut)}T12:00:00+01:00`)}, {heure(s.debut)} · même type</span>
        </span>
        <Bouton taille="petit" intention={etape2 ? 'plein' : 'borde'} disabled={!etape2 || !s.personne.clientId} onClick={onSuivant}>Poser le suivant</Bouton>
      </div>
    </Carte>
  );
};

// ─── La séance ──────────────────────────────────────────────────────────────

const QUESTIONNAIRE: Record<'relu' | 'non_relu' | 'pas_recu', { ton: 'succes' | 'alerte' | 'neutre'; libelle: string }> = {
  relu: { ton: 'succes', libelle: 'Relu' },
  non_relu: { ton: 'alerte', libelle: 'Non relu' },
  pas_recu: { ton: 'neutre', libelle: 'Pas reçu' },
};

const LIEUX: Record<string, string> = { sur_place: 'en séance, à Villefranche-de-Lauragais', visio: 'en visio', appel: 'au téléphone' };

type Decision = null | 'annuler';

/**
 * Une séance (SPEC §15.4 ; refonte, lot 4 — maquettes Seance, SeanceEntretien,
 * SeanceApres). L'écran change selon le moment : AVANT (la séance à venir),
 * ENTRETIEN (un entretien préalable : la provenance en tête, « Compléter la
 * fiche »), APRÈS (une séance passée à clore : « Terminer la séance »). Les
 * notes, un seul texte Markdown enregistré pendant la frappe, sont au centre.
 */
export const SeanceView: React.FC<{ id: string }> = ({ id }) => {
  const lecture = useLecture(() => Clients.lireSeance(id), [id]);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [decision, setDecision] = useState<Decision>(null);
  const [fenetre, setFenetre] = useState<null | 'deplacer' | 'suivant'>(null);
  const [montant, setMontant] = useState<string | null>(null);
  // « Terminer la séance » reste à l'écran une fois ouvert : encaisser la fait sortir du moment
  // « après », mais « Poser le suivant » doit rester à portée.
  const [terminerVu, setTerminerVu] = useState(false);

  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;
  const s = lecture.donnees;
  const maintenant = Date.now();
  const passee = Date.parse(s.fin) <= maintenant;
  const entretien = s.nature === 'rencontre';
  const apres = passee && (s.statut === 'prevue' || ((s.statut === 'realisee' || s.statut === 'absent') && s.etatPaiement === 'a_payer'));
  if (apres && !terminerVu) setTerminerVu(true);
  const terminer = apres || terminerVu;
  const dette = s.statut === 'absent' && (s.etatPaiement === 'a_payer' || s.etatPaiement === 'attente_especes');

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

  const typeLibelle = s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu';
  const resume = [dureeEnClair(s.dureeMin), s.mode ? MODES[s.mode].toLowerCase() : null, montantEnClair(s.montantCentimes)].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <a href="#agenda" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }}
        className={`self-start rounded-controle text-secondaire text-second hover:text-texte ${FOCUS}`}>‹ Agenda</a>

      {entretien && (
        <Carte className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
          <Etiquette>D’où vient la personne</Etiquette>
          <span className="font-semibold">{s.provenance ?? 'Provenance inconnue'}</span>
        </Carte>
      )}

      <header className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <TitreEcran>
            {s.personne.clientId
              ? <a href={`#clients/${encodeURIComponent(s.personne.clientId)}`} className="underline-offset-4 hover:underline">{nomComplet(s.personne)}</a>
              : nomComplet(s.personne)}
            {' · '}{typeLibelle}
          </TitreEcran>
          <p className="mt-1 text-second">
            <span className="first-letter:uppercase inline-block">{jourEnLettres(s.debut)}</span>, {heure(s.debut)} – {heure(s.fin)}{s.mode ? ` · ${LIEUX[s.mode] ?? MODES[s.mode]}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {s.statut === 'prevue' && passee ? <Pastille ton="alerte">Passée, restée « prévue »</Pastille>
              : s.statut === 'prevue' ? <Pastille>Prévue</Pastille>
                : s.statut === 'realisee' ? <Pastille ton="succes">Réalisée</Pastille>
                  : s.statut === 'absent' ? <Pastille ton="erreur">Absente</Pastille>
                    : <Pastille ton="erreur">Annulée</Pastille>}
            {dette ? <Pastille ton="erreur">À régulariser avant toute nouvelle séance</Pastille>
              : s.etatPaiement === 'payee' ? <Pastille ton="succes">Payée</Pastille>
                : s.etatPaiement === 'offerte' ? <Pastille signe="">Offerte</Pastille>
                  : s.etatPaiement === 'annulee' ? null
                    : <Pastille ton="alerte">{PAIEMENTS[s.etatPaiement].libelle}</Pastille>}
            <span className="text-secondaire text-second tabular-nums">{montantEnClair(s.montantCentimes)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className={`flex h-11 cursor-pointer list-none items-center rounded-controle border border-marque px-4 font-semibold text-marque hover:bg-actif md:h-10 [&::-webkit-details-marker]:hidden ${FOCUS}`}>Autres actions</summary>
            <div role="menu" className="absolute right-0 z-20 mt-1 flex min-w-[220px] flex-col rounded-carte border border-bord bg-surface p-1 shadow-fenetre">
              {s.statut !== 'prevue' && <Bouton role="menuitem" intention="souligne" className="justify-start" disabled={enCours} onClick={() => void agir(() => Clients.remettreAPrevue(id))}>Remettre à « prévue »</Bouton>}
              {s.statut === 'prevue' && <Bouton role="menuitem" intention="souligne" className="justify-start" onClick={() => setDecision('annuler')}>Annuler la séance</Bouton>}
            </div>
          </details>
          {s.statut === 'prevue' && <Bouton intention="borde" onClick={() => setFenetre('deplacer')}>Déplacer</Bouton>}
          {entretien && s.personne.clientId && !apres && (
            <a href={`#clients/${encodeURIComponent(s.personne.clientId)}`} className={`inline-flex h-11 items-center rounded-controle bg-marque px-4 font-semibold text-sur-marque hover:bg-marque-survol md:h-10 ${FOCUS}`}>Compléter la fiche</a>
          )}
          {apres && <Bouton onClick={() => document.getElementById('terminer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Terminer la séance</Bouton>}
        </div>
      </header>

      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <NotesDeSeance id={id} />
          <Carte className="px-4 py-3">
            <Repliable titre="Histoire du rendez-vous" resume={`${s.mouvements.length} mouvement${s.mouvements.length > 1 ? 's' : ''}`} ouvert>
              <ul className="flex flex-col gap-1.5">
                {s.mouvements.map((m) => (
                  <li key={m.id} className="text-secondaire">
                    <span className="font-semibold">{NATURES[m.nature] ?? m.nature}</span> <span className="text-second">{PAR[m.par] ?? ''}, le {jourEnLettres(m.le)}</span>
                    {m.nature === 'deplacee' && m.ancienDebut && m.nouveauDebut && <span className="text-second"> : {jourEnLettres(m.ancienDebut)} {heure(m.ancienDebut)} → {jourEnLettres(m.nouveauDebut)} {heure(m.nouveauDebut)}</span>}
                  </li>
                ))}
              </ul>
            </Repliable>
          </Carte>
        </div>

        <aside className="flex flex-col gap-4">
          {terminer && <Terminer s={s} enCours={enCours} agir={agir} onSuivant={() => setFenetre('suivant')} />}

          <Carte className="flex flex-col gap-2 px-4 py-3">
            <TitreCarte>Questionnaire de santé</TitreCarte>
            {s.questionnaire
              ? <div><Pastille ton={QUESTIONNAIRE[s.questionnaire].ton}>{QUESTIONNAIRE[s.questionnaire].libelle}</Pastille></div>
              : <Secondaire>Pas demandé pour ce type de séance.</Secondaire>}
            {s.questionnaireId && (
              <a href={`#clients/questionnaire/${encodeURIComponent(s.questionnaireId)}`} className={`inline-flex h-8 items-center self-start rounded-controle border border-marque px-3 text-secondaire font-semibold text-marque hover:bg-actif ${FOCUS}`}>Voir le questionnaire</a>
            )}
          </Carte>

          {s.precedente && <DerniereFois id={s.precedente.id} debut={s.precedente.debut} />}

          <Carte className="px-4 py-3">
            <Repliable titre="Statut, paiement et montant" resume={resume}>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Choix id="seance-statut" label="Statut" value={s.statut} disabled={enCours} onChange={(e) => changerStatut(e.target.value as StatutSeance)}>
                    {(Object.keys(STATUTS) as StatutSeance[]).map((k) => <option key={k} value={k}>{STATUTS[k].libelle}</option>)}
                  </Choix>
                  <Choix id="seance-paiement" label="Paiement" value={s.etatPaiement} disabled={enCours}
                    onChange={(e) => void agir(() => Clients.modifierSeance(id, { etatPaiement: e.target.value as EtatPaiement }))}>
                    {(Object.keys(PAIEMENTS) as EtatPaiement[]).map((k) => <option key={k} value={k}>{PAIEMENTS[k].libelle}</option>)}
                  </Choix>
                </div>
                {montant === null ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-second">Montant</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{montantEnClair(s.montantCentimes)}</span>
                      <Bouton taille="petit" intention="souligne" onClick={() => setMontant(String(s.montantCentimes / 100))}>Modifier</Bouton>
                    </span>
                  </div>
                ) : (
                  <form className="flex items-end gap-2" onSubmit={(e) => {
                    e.preventDefault();
                    const c = centimesDepuis(montant);
                    if (c === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
                    void agir(() => Clients.modifierSeance(id, { montantCentimes: c })).then((ok) => { if (ok) setMontant(null); });
                  }}>
                    <Champ id="seance-montant" label="Montant (€)" inputMode="decimal" value={montant} autoFocus className="flex-1" onChange={(e) => setMontant(e.target.value)} />
                    <Bouton intention="souligne" onClick={() => setMontant(null)}>Annuler</Bouton>
                    <Bouton type="submit" disabled={enCours}>Enregistrer</Bouton>
                  </form>
                )}
                {s.agendaEtat !== 'ecrit' && <Secondaire>Ce rendez-vous n’est pas écrit dans l’agenda Google.</Secondaire>}
              </div>
            </Repliable>
          </Carte>
        </aside>
      </div>

      {fenetre === 'deplacer' && (
        <PoserRendezVous deplacer={s} onFermer={() => setFenetre(null)}
          onPose={() => { setFenetre(null); void lecture.recharger(); }} />
      )}
      {fenetre === 'suivant' && s.personne.clientId && (
        <PoserRendezVous
          fiche={{ id: s.personne.clientId, prenom: s.personne.prenom ?? '', nom: s.personne.nom ?? '' }}
          date={septJoursApres(s.debut)} heureInitiale={heure(s.debut)} typeInitial={s.type?.id}
          onFermer={() => setFenetre(null)}
          onPose={(nouvelle) => { setFenetre(null); aller(`agenda/${encodeURIComponent(nouvelle)}`); }}
        />
      )}

      <Fenetre ouverte={decision === 'annuler'} titre="Annuler cette séance ?" onFermer={() => setDecision(null)}
        actions={<>
          <Bouton intention="souligne" onClick={() => setDecision(null)}>Garder la séance</Bouton>
          <Bouton onClick={() => { setDecision(null); void agir(() => Clients.annulerSeance(id)); }}>Annuler la séance</Bouton>
        </>}>
        <p>Elle reste dans l’histoire de la fiche, et son créneau se libère. Aucun message ne part.</p>
      </Fenetre>
    </div>
  );
};

export default SeanceView;
