/**
 * Une séance (SPEC §15.4). En tête : la date et l'heure, le type, la personne
 * (qui ouvre sa fiche), le statut et le paiement modifiables sur place, le
 * montant. Actions : Déplacer, Annuler, Remettre à « prévue ». Puis les notes :
 * un seul texte Markdown, pré-rempli de quelques titres, enregistré pendant la
 * frappe (retour de Florent du 27/11/2026, qui remplace la trame en six champs).
 * Dessous, en lecture : les réponses à la réservation, l'histoire du
 * rendez-vous, et, repliée, la copie brute reprise de Notion.
 *
 * Le statut passe par la décision qui lui revient : annuler et remettre à
 * « prévue » ont leurs routes ; réalisée et absent, une simple modification.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, MoveRight } from 'lucide-react';
import { Bouton, Carte, Champ, Etiquette, TitreSection, ecran } from '../ui';
import { ConfirmModal } from '../CommonModals';
import * as Clients from '../../services/clientsService';
import { ErreurClients } from '../../services/clientsService';
import type { EtatPaiement, NotesSeance, StatutSeance } from '../../types-clients';
import { RichTextarea } from '../RichTextarea';
import { MarkdownToolbar } from '../MarkdownToolbar';
import {
  aller, Avis, centimesDepuis, CLASSES_SELECT, euros, EtatLecture, heure, isoDepuis, jourDe, jourEnLettres, messageDe,
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
    'a-jour': notes.version !== null || texte !== (notes.texte ?? MODELE_NOTES) ? 'Enregistré' : undefined,
    'en-attente': 'Modifications en attente…',
    enregistrement: 'Enregistrement…',
    echec: <span className="text-alerte">Pas enregistré.</span>,
    conflit: <span className="text-alerte">Pas enregistré : la note a changé ailleurs.</span>,
  };

  return (
    <div className="space-y-4">
      <Carte densite="contenu" rythme>
        <TitreSection
          as="h3"
          titre="Notes"
          sousTitre={<span aria-live="polite">{ETATS[etat]}</span>}
          action={sms ? <Bouton taille="petit" intention="secondaire" onClick={copier}><Copy /> {copie ? 'Copiée' : 'Copier la réponse SMS'}</Bouton> : undefined}
        />
        <div className="rounded-lg border border-brand-border dark:border-dark-sec-border bg-white dark:bg-dark-bg focus-within:border-brand-main dark:focus-within:border-dark-text">
          <MarkdownToolbar className="rounded-t-lg" />
          <RichTextarea id="notes-seance" ariaLabel="Notes de la séance" value={texte} onChange={saisir} className="w-full min-h-[320px] p-3 text-sm md:text-sm" placeholder="Les notes de la séance…" />
        </div>
        {refus && (
          <Avis ton="erreur">
            {refus}{' '}
            {etat === 'echec' && <Bouton taille="petit" intention="secondaire" onClick={() => { void enregistrer(); }}>Réessayer</Bouton>}
            {etat === 'conflit' && <span>Copiez votre texte avant de recharger la page, pour ne pas le perdre.</span>}
          </Avis>
        )}
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
      <Bouton taille="petit" intention="discrete" onClick={() => window.history.length > 1 ? window.history.back() : aller('agenda')}><ArrowLeft /> Retour</Bouton>

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
