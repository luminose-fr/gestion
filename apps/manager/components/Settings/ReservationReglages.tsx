/**
 * Réglages → Réservation (SPEC §15.4). Quatre cartes, dans l'ordre où l'on
 * s'en sert : les types de rendez-vous, la semaine type, les dates
 * d'exception à venir, et les réglages.
 *
 * Refaite le 27/11/2026 sur le retour de Florent (« semble fonctionner mais
 * UI merdique ») : un type se lit en une ligne et ne s'ouvre en formulaire
 * qu'à « Modifier » ; la fenêtre de réservation se règle en jours, pas en
 * heures ; un jour sans plage dit « Fermé » ; les réglages sont groupés par
 * usage, les garde-fous techniques repliés. Les routes, elles, n'ont pas
 * changé : des heures et des minutes, converties ici.
 *
 * Ce qui change ici change ce que la réservation en ligne proposera, rien de ce
 * qui est déjà posé.
 */
import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Bouton, Carte, Champ, CLASSES_SURTITRE, Etiquette, TitreSection } from '../ui';
import * as Clients from '../../services/clientsService';
import type { PlageHoraire, Reservation, TypeReservation } from '../../types-clients';
import { Avis, centimesDepuis, CLASSES_SELECT, EtatLecture, euros, jourEnLettres, messageDe, Pastille, useLecture, Vide } from '../Clients/commun';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const LIEUX: Record<TypeReservation['lieu'], string> = { sur_place: 'Sur place', visio: 'En visio', visio_ou_appel: 'Visio ou téléphone' };
const NON_ENREGISTRE = <span className="text-alerte">Modifications non enregistrées.</span>;

/** Les réglages, par usage. Une clé inconnue de cette liste va dans les garde-fous, sous son nom. */
const GROUPES: { titre: string; replie?: boolean; reglages: Record<string, { libelle: string; unite: string }> }[] = [
  {
    titre: 'Rappels',
    reglages: {
      rappel_email_avant_h: { libelle: 'Rappel par e-mail', unite: 'h avant' },
      rappel_sms_avant_h: { libelle: 'Rappel par SMS', unite: 'h avant' },
    },
  },
  {
    titre: 'Retenue d’une place, en attendant le paiement',
    reglages: {
      retenue_carte_h: { libelle: 'Par carte', unite: 'h' },
      retenue_virement_h: { libelle: 'Par virement', unite: 'h' },
    },
  },
  {
    titre: 'Liste d’attente',
    reglages: {
      liste_attente_creneau_min_h: { libelle: 'Un créneau libéré est proposé s’il commence dans', unite: 'h ou plus' },
      liste_attente_seance_min_h: { libelle: 'Une personne est prévenue si sa séance est dans', unite: 'h ou plus' },
      liste_attente_personnes_max: { libelle: 'Personnes prévenues, au plus', unite: 'personnes' },
    },
  },
  {
    titre: 'Garde-fous techniques',
    replie: true,
    reglages: {
      commandes_questionnaire_max_jour: { libelle: 'Questionnaires acceptés', unite: 'par 24 h' },
      commandes_reservation_max_jour: { libelle: 'Réservations acceptées', unite: 'par 24 h' },
      emails_max_jour: { libelle: 'E-mails confiés à Make', unite: 'par 24 h' },
      recus_garde_h: { libelle: 'Garde des reçus de commande', unite: 'h' },
      ordre_relance_min: { libelle: 'Relance d’un ordre non confirmé', unite: 'min' },
      ordre_tentatives_max: { libelle: 'Tentatives d’un ordre avant l’échec', unite: 'tentatives' },
    },
  },
];

// ─── Les types ──────────────────────────────────────────────────────────────

const jours = (h: number) => String(Math.round((h / 24) * 10) / 10).replace('.', ',');
const heuresDepuisJours = (j: string) => {
  const n = Number(j.replace(',', '.'));
  return j.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 24) : null;
};
const duree = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`);

/** Un type : une ligne qui se lit, et un formulaire qui ne s'ouvre qu'à « Modifier ». */
const LigneType: React.FC<{ type: TypeReservation; onEnregistre: () => void }> = ({ type, onEnregistre }) => {
  const initial = {
    dureeMin: String(type.dureeMin), margeApresMin: String(type.margeApresMin), pasMin: String(type.pasMin), lieu: type.lieu,
    montant: String(type.montantCentimes / 100).replace('.', ','), debutJours: jours(type.fenetreDebutH), finJours: jours(type.fenetreFinH),
    reservableEnLigne: type.reservableEnLigne, actif: type.actif, ordre: String(type.ordre),
  };
  const [ouvert, setOuvert] = useState(false);
  const [s, setS] = useState(initial);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const modifie = JSON.stringify(s) !== JSON.stringify(initial);
  const prefixe = `type-${type.id}`;
  const nombre = (cle: 'dureeMin' | 'margeApresMin' | 'pasMin' | 'ordre', label: string) => (
    <Champ id={`${prefixe}-${cle}`} label={label} type="number" min={0} value={s[cle]} onChange={(e) => setS((x) => ({ ...x, [cle]: (e.target as HTMLInputElement).value }))} />
  );

  const enregistrer = async () => {
    const montant = centimesDepuis(s.montant);
    const debut = heuresDepuisJours(s.debutJours);
    const fin = heuresDepuisJours(s.finJours);
    if (montant === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
    if (debut === null || fin === null) { setRefus('La fenêtre se règle en jours : un nombre, 0 ou plus.'); return; }
    setRefus(null);
    setEnCours(true);
    try {
      await Clients.modifierType(type.id, {
        dureeMin: Number(s.dureeMin), margeApresMin: Number(s.margeApresMin), pasMin: Number(s.pasMin), lieu: s.lieu,
        montantCentimes: montant, fenetreDebutH: debut, fenetreFinH: fin,
        reservableEnLigne: s.reservableEnLigne, actif: s.actif, ordre: Number(s.ordre),
      });
      setOuvert(false);
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    } finally {
      setEnCours(false);
    }
  };

  const resume = [
    duree(type.dureeMin), euros(type.montantCentimes), LIEUX[type.lieu],
    type.reservableEnLigne ? `réservable de ${jours(type.fenetreDebutH)} à ${jours(type.fenetreFinH)} jours avant` : null,
  ].filter(Boolean).join(' · ');

  if (!ouvert) {
    return (
      <div className="flex items-start justify-between gap-3 py-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-brand-main dark:text-white">
            {type.libelle}
            {!type.actif && <Pastille libelle="Inactif" ton="neutre" />}
            {type.actif && !type.reservableEnLigne && <Pastille libelle="Pas en ligne" ton="neutre" />}
          </p>
          <p className="text-xs text-brand-main dark:text-dark-text">{resume}</p>
        </div>
        <Bouton taille="petit" intention="secondaire" onClick={() => { setS(initial); setOuvert(true); }} aria-label={`Modifier ${type.libelle}`}><Pencil /> Modifier</Bouton>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-3">
      <TitreSection as="h4" titre={type.libelle} sousTitre={modifie ? NON_ENREGISTRE : undefined} />
      <fieldset className="space-y-2">
        <legend className={`mb-2 ${CLASSES_SURTITRE}`}>Le rendez-vous</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {nombre('dureeMin', 'Durée (min)')}
          {nombre('margeApresMin', 'Marge après (min)')}
          <Champ id={`${prefixe}-montant`} label="Montant (€)" inputMode="decimal" value={s.montant} onChange={(e) => setS((x) => ({ ...x, montant: (e.target as HTMLInputElement).value }))} />
          <div>
            <Etiquette as="label" htmlFor={`${prefixe}-lieu`} className="mb-1">Lieu</Etiquette>
            <select id={`${prefixe}-lieu`} className={CLASSES_SELECT} value={s.lieu} onChange={(e) => setS((x) => ({ ...x, lieu: e.target.value as TypeReservation['lieu'] }))}>
              {(Object.keys(LIEUX) as TypeReservation['lieu'][]).map((l) => <option key={l} value={l}>{LIEUX[l]}</option>)}
            </select>
          </div>
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={`mb-2 ${CLASSES_SURTITRE}`}>La réservation en ligne</legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Champ id={`${prefixe}-debut`} label="Au plus tôt (jours)" aide="Dans combien de jours, au moins." inputMode="decimal" value={s.debutJours} onChange={(e) => setS((x) => ({ ...x, debutJours: (e.target as HTMLInputElement).value }))} />
          <Champ id={`${prefixe}-fin`} label="Au plus tard (jours)" aide="Dans combien de jours, au plus." inputMode="decimal" value={s.finJours} onChange={(e) => setS((x) => ({ ...x, finJours: (e.target as HTMLInputElement).value }))} />
          {nombre('pasMin', 'Créneaux tous les (min)')}
          {nombre('ordre', 'Rang dans la liste')}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-brand-main dark:text-white">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.reservableEnLigne} onChange={(e) => setS((x) => ({ ...x, reservableEnLigne: e.target.checked }))} /> Réservable en ligne</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.actif} onChange={(e) => setS((x) => ({ ...x, actif: e.target.checked }))} /> Actif</label>
        </div>
      </fieldset>
      {refus && <Avis ton="erreur">{refus}</Avis>}
      <div className="flex justify-end gap-2">
        <Bouton taille="petit" intention="discrete" onClick={() => { setS(initial); setRefus(null); setOuvert(false); }}>Annuler</Bouton>
        <Bouton taille="petit" intention="principale" disabled={!modifie || enCours} onClick={enregistrer}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
      </div>
    </div>
  );
};

// ─── Les plages horaires ────────────────────────────────────────────────────

/** Des plages sur une ligne : début, fin, retirer ; et « Une plage » au bout. */
const Plages: React.FC<{ plages: PlageHoraire[]; onChange: (p: PlageHoraire[]) => void; prefixe: string; nom: string }> = ({ plages, onChange, prefixe, nom }) => (
  <div className="flex flex-wrap items-center gap-2">
    {plages.length === 0 && <span className="text-sm text-brand-main dark:text-dark-text">Fermé</span>}
    {plages.map((p, i) => (
      <span key={i} className="flex items-center gap-1">
        <Champ id={`${prefixe}-${i}-debut`} aria-label={`${nom}, plage ${i + 1} : de`} type="time" className="w-28" value={p.debut} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, debut: (e.target as HTMLInputElement).value } : x)))} />
        <span className="text-xs text-brand-main dark:text-dark-text">à</span>
        <Champ id={`${prefixe}-${i}-fin`} aria-label={`${nom}, plage ${i + 1} : à`} type="time" className="w-28" value={p.fin} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, fin: (e.target as HTMLInputElement).value } : x)))} />
        <Bouton taille="petit" intention="discrete" aria-label={`Retirer la plage ${i + 1} (${nom})`} onClick={() => onChange(plages.filter((_, j) => j !== i))}><Trash2 /></Bouton>
      </span>
    ))}
    <Bouton taille="petit" intention="discrete" aria-label={`Ajouter une plage (${nom})`} onClick={() => onChange([...plages, plages.length ? { debut: '14:00', fin: '18:00' } : { debut: '09:30', fin: '12:30' }])}><Plus /> Une plage</Bouton>
  </div>
);

const Semaine: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const initiale = () => JOURS.map((_, i) => reservation.semaine.filter((h) => h.jour === i + 1).map(({ debut, fin }) => ({ debut, fin })));
  const [semaine, setSemaine] = useState<PlageHoraire[][]>(initiale);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { setSemaine(initiale()); }, [reservation]);
  const modifie = JSON.stringify(semaine) !== JSON.stringify(initiale());
  const enregistrer = async () => {
    setRefus(null);
    try {
      await Clients.remplacerSemaine(semaine.flatMap((plages, i) => plages.map((p) => ({ jour: i + 1, ...p }))));
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    }
  };
  return (
    <Carte densite="contenu" rythme>
      <TitreSection
        as="h3" titre="La semaine type"
        sousTitre={modifie ? NON_ENREGISTRE : 'Un seul horaire pour tous les types.'}
        action={<Bouton taille="petit" intention="principale" disabled={!modifie} onClick={enregistrer}>Enregistrer</Bouton>}
      />
      <div className="divide-y divide-brand-border dark:divide-dark-sec-border">
        {JOURS.map((nom, i) => (
          <div key={nom} className="grid gap-2 py-2 sm:grid-cols-[7rem_1fr] sm:items-center">
            <p className="text-sm font-semibold text-brand-main dark:text-white">{nom}</p>
            <Plages prefixe={`semaine-${i}`} nom={nom} plages={semaine[i]} onChange={(p) => setSemaine((j) => j.map((x, k) => (k === i ? p : x)))} />
          </div>
        ))}
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </Carte>
  );
};

const Dates: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const [date, setDate] = useState('');
  const [plages, setPlages] = useState<PlageHoraire[]>([]);
  const [refus, setRefus] = useState<string | null>(null);
  const agir = async (action: () => Promise<unknown>) => {
    setRefus(null);
    try { await action(); setDate(''); setPlages([]); onEnregistre(); } catch (e) { setRefus(messageDe(e)); }
  };
  return (
    <Carte densite="contenu" rythme>
      <TitreSection as="h3" titre="Les dates d’exception à venir" sousTitre="Une date posée remplace la semaine type ce jour-là ; sans plage, la journée est fermée." />
      {reservation.dates.length === 0 ? <Vide>Aucune exception à venir.</Vide> : (
        <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
          {reservation.dates.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm text-brand-main dark:text-white">
                <span className="font-semibold first-letter:uppercase">{jourEnLettres(`${d.date}T12:00:00+01:00`)}</span>
                {' · '}{d.plages.length === 0 ? 'fermée' : d.plages.map((p) => `${p.debut}–${p.fin}`).join(', ')}
              </span>
              <Bouton taille="petit" intention="discrete" onClick={() => void agir(() => Clients.rendreDateALaSemaine(d.date))}>Rendre à la semaine type</Bouton>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 border-t border-brand-border dark:border-dark-sec-border pt-3">
        <p className="text-sm font-semibold text-brand-main dark:text-white">Poser une exception</p>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
          <Champ id="exception-date" aria-label="Date de l’exception" type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
          <Plages prefixe="exception" nom="Exception" plages={plages} onChange={setPlages} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {plages.length === 0
            ? <Bouton taille="petit" intention="principale" disabled={!date} onClick={() => void agir(() => Clients.poserDate(date, []))}>Fermer cette date</Bouton>
            : <Bouton taille="petit" intention="principale" disabled={!date} onClick={() => void agir(() => Clients.poserDate(date, plages))}>Ouvrir avec ces plages</Bouton>}
        </div>
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </Carte>
  );
};

// ─── Les réglages ───────────────────────────────────────────────────────────

const Reglages: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const initial = () => Object.fromEntries(Object.entries(reservation.reglages).map(([k, v]) => [k, String(v)]));
  const [s, setS] = useState<Record<string, string>>(initial);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { setS(initial()); }, [reservation]);
  // L'interrupteur de la porte a sa route et sa confirmation (Réglages → Base des clients) : il n'est pas ici.
  const cles = Object.keys(reservation.reglages).filter((k) => k !== 'porte_publique_ouverte');
  const changes = cles.filter((k) => s[k] !== String(reservation.reglages[k]));
  const connues = new Set(GROUPES.flatMap((g) => Object.keys(g.reglages)));
  const groupes = GROUPES.map((g, i) => ({
    ...g,
    cles: [...Object.keys(g.reglages).filter((k) => cles.includes(k)), ...(i === GROUPES.length - 1 ? cles.filter((k) => !connues.has(k)) : [])],
  })).filter((g) => g.cles.length > 0);

  const enregistrer = async () => {
    setRefus(null);
    try {
      await Clients.modifierReglages(Object.fromEntries(changes.map((k) => [k, Number(s[k])])));
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    }
  };

  const ligne = (k: string, def?: { libelle: string; unite: string }) => (
    <div key={k} className="flex items-center justify-between gap-3 py-2">
      <label htmlFor={`reglage-${k}`} className="text-sm text-brand-main dark:text-white">{def?.libelle ?? k}</label>
      <span className="flex shrink-0 items-center gap-2">
        {/* La largeur va à une enveloppe : la classe du champ porte déjà w-full. */}
        <span className="w-24"><Champ id={`reglage-${k}`} type="number" min={0} className="text-right" value={s[k] ?? ''} onChange={(e) => setS((x) => ({ ...x, [k]: (e.target as HTMLInputElement).value }))} /></span>
        <span className="w-20 text-xs text-brand-main dark:text-dark-text">{def?.unite ?? ''}</span>
      </span>
    </div>
  );

  return (
    <Carte densite="contenu" rythme>
      <TitreSection
        as="h3" titre="Les réglages"
        sousTitre={changes.length ? NON_ENREGISTRE : undefined}
        action={<Bouton taille="petit" intention="principale" disabled={changes.length === 0} onClick={enregistrer}>Enregistrer</Bouton>}
      />
      {groupes.map((g) => {
        const corps = <div className="divide-y divide-brand-border dark:divide-dark-sec-border">{g.cles.map((k) => ligne(k, g.reglages[k]))}</div>;
        return g.replie ? (
          <details key={g.titre} className="pt-2">
            <summary className={`cursor-pointer ${CLASSES_SURTITRE}`}>{g.titre}</summary>
            <div className="mt-2">{corps}</div>
          </details>
        ) : (
          <section key={g.titre} className="pt-2">
            <p className={CLASSES_SURTITRE}>{g.titre}</p>
            {corps}
          </section>
        );
      })}
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </Carte>
  );
};

export const ReservationReglages: React.FC = () => {
  const lecture = useLecture(() => Clients.lireReservation(), []);
  if (lecture.phase !== 'prete') return <EtatLecture lecture={lecture} />;
  const r = lecture.donnees;
  const relire = () => void lecture.recharger();
  return (
    <div className="space-y-4">
      <Carte densite="contenu">
        <TitreSection as="h3" titre="Les types de rendez-vous" sousTitre="Ce que la réservation en ligne propose, type par type." />
        <div className="divide-y divide-brand-border dark:divide-dark-sec-border">
          {r.types.map((t) => <LigneType key={`${t.id}-${t.dureeMin}-${t.montantCentimes}-${t.actif}-${t.fenetreDebutH}-${t.fenetreFinH}`} type={t} onEnregistre={relire} />)}
        </div>
      </Carte>
      <Semaine reservation={r} onEnregistre={relire} />
      <Dates reservation={r} onEnregistre={relire} />
      <Reglages reservation={r} onEnregistre={relire} />
    </div>
  );
};

export default ReservationReglages;
