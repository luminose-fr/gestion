/**
 * Réglages → Réservation (SPEC §15.4). Les types (une ligne par type,
 * modifiable), la semaine type (les plages de chaque jour), les dates
 * d'exception à venir (ouvrir une date, la fermer, la rendre à la semaine
 * type), et les réglages — rappels, retenues, liste d'attente — avec leur unité.
 *
 * Ce qui change ici change ce que la réservation en ligne proposera, rien de ce
 * qui est déjà posé.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Bouton, Carte, Champ, CLASSES_SURTITRE, Etiquette, TitreSection } from '../ui';
import * as Clients from '../../services/clientsService';
import type { PlageHoraire, Reservation, TypeReservation } from '../../types-clients';
import { Avis, centimesDepuis, CLASSES_SELECT, EtatLecture, euros, messageDe, useLecture, Vide } from '../Clients/commun';

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const LIEUX: Record<TypeReservation['lieu'], string> = { sur_place: 'Sur place', visio: 'En visio', visio_ou_appel: 'Visio ou téléphone' };

/** Les réglages, leur libellé et leur unité. Une clé inconnue de cette liste s'affiche sous son nom. */
const REGLAGES: Record<string, { libelle: string; unite: string }> = {
  rappel_email_avant_h: { libelle: 'Rappel par e-mail', unite: 'heures avant' },
  rappel_sms_avant_h: { libelle: 'Rappel par SMS', unite: 'heures avant' },
  retenue_carte_h: { libelle: 'Retenue d’une place, par carte', unite: 'heures' },
  retenue_virement_h: { libelle: 'Retenue d’une place, par virement', unite: 'heures' },
  liste_attente_creneau_min_h: { libelle: 'Liste d’attente : un créneau libéré est proposé s’il commence dans', unite: 'heures ou plus' },
  liste_attente_seance_min_h: { libelle: 'Liste d’attente : une personne est prévenue si sa séance est dans', unite: 'heures ou plus' },
  liste_attente_personnes_max: { libelle: 'Liste d’attente : personnes prévenues au plus', unite: 'personnes' },
  commandes_questionnaire_max_jour: { libelle: 'Questionnaires acceptés', unite: 'par 24 heures' },
  emails_max_jour: { libelle: 'E-mails confiés à Make', unite: 'par 24 heures' },
  recus_garde_h: { libelle: 'Garde des reçus de commande', unite: 'heures' },
  ordre_relance_min: { libelle: 'Relance d’un ordre non confirmé', unite: 'minutes' },
  ordre_tentatives_max: { libelle: 'Tentatives d’un ordre avant l’échec', unite: 'tentatives' },
};

/** Une ligne de type : modifiée sur place, enregistrée d'un geste. */
const LigneType: React.FC<{ type: TypeReservation; onEnregistre: () => void }> = ({ type, onEnregistre }) => {
  const initial = {
    dureeMin: String(type.dureeMin), margeApresMin: String(type.margeApresMin), pasMin: String(type.pasMin), lieu: type.lieu,
    montant: String(type.montantCentimes / 100).replace('.', ','), fenetreDebutH: String(type.fenetreDebutH), fenetreFinH: String(type.fenetreFinH),
    reservableEnLigne: type.reservableEnLigne, actif: type.actif, ordre: String(type.ordre),
  };
  const [s, setS] = useState(initial);
  const [refus, setRefus] = useState<string | null>(null);
  const modifie = JSON.stringify(s) !== JSON.stringify(initial);
  const nombre = (cle: 'dureeMin' | 'margeApresMin' | 'pasMin' | 'fenetreDebutH' | 'fenetreFinH' | 'ordre', label: string) => (
    <Champ id={`type-${type.id}-${cle}`} label={label} type="number" min={0} value={s[cle]} onChange={(e) => setS((x) => ({ ...x, [cle]: (e.target as HTMLInputElement).value }))} />
  );
  const enregistrer = async () => {
    const montant = centimesDepuis(s.montant);
    if (montant === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
    setRefus(null);
    try {
      await Clients.modifierType(type.id, {
        dureeMin: Number(s.dureeMin), margeApresMin: Number(s.margeApresMin), pasMin: Number(s.pasMin), lieu: s.lieu,
        montantCentimes: montant, fenetreDebutH: Number(s.fenetreDebutH), fenetreFinH: Number(s.fenetreFinH),
        reservableEnLigne: s.reservableEnLigne, actif: s.actif, ordre: Number(s.ordre),
      });
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    }
  };
  return (
    <div className="py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-main dark:text-white">{type.libelle} <span className="text-xs font-normal text-brand-main dark:text-dark-text">· {type.cle} · {euros(type.montantCentimes)}</span></p>
        <Bouton taille="petit" intention="principale" disabled={!modifie} onClick={enregistrer}>Enregistrer</Bouton>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {nombre('dureeMin', 'Durée (min)')}
        {nombre('margeApresMin', 'Marge après (min)')}
        {nombre('pasMin', 'Pas (min)')}
        <Champ id={`type-${type.id}-montant`} label="Montant (€)" inputMode="decimal" value={s.montant} onChange={(e) => setS((x) => ({ ...x, montant: (e.target as HTMLInputElement).value }))} />
        {nombre('fenetreDebutH', 'Fenêtre : dès (h)')}
        {nombre('fenetreFinH', 'Fenêtre : jusqu’à (h)')}
        <div>
          <Etiquette as="label" htmlFor={`type-${type.id}-lieu`} className="mb-1">Lieu</Etiquette>
          <select id={`type-${type.id}-lieu`} className={CLASSES_SELECT} value={s.lieu} onChange={(e) => setS((x) => ({ ...x, lieu: e.target.value as TypeReservation['lieu'] }))}>
            {(Object.keys(LIEUX) as TypeReservation['lieu'][]).map((l) => <option key={l} value={l}>{LIEUX[l]}</option>)}
          </select>
        </div>
        {nombre('ordre', 'Ordre')}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-brand-main dark:text-white">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.reservableEnLigne} onChange={(e) => setS((x) => ({ ...x, reservableEnLigne: e.target.checked }))} /> Réservable en ligne</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.actif} onChange={(e) => setS((x) => ({ ...x, actif: e.target.checked }))} /> Actif</label>
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </div>
  );
};

/** Des plages modifiables : début et fin, ajouter, retirer. */
const Plages: React.FC<{ plages: PlageHoraire[]; onChange: (p: PlageHoraire[]) => void; prefixe: string }> = ({ plages, onChange, prefixe }) => (
  <div className="space-y-2">
    {plages.map((p, i) => (
      <div key={i} className="flex items-end gap-2">
        <Champ id={`${prefixe}-${i}-debut`} label={i === 0 ? 'De' : undefined} aria-label="De" type="time" value={p.debut} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, debut: (e.target as HTMLInputElement).value } : x)))} />
        <Champ id={`${prefixe}-${i}-fin`} label={i === 0 ? 'À' : undefined} aria-label="À" type="time" value={p.fin} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, fin: (e.target as HTMLInputElement).value } : x)))} />
        <Bouton taille="petit" intention="discrete" aria-label="Retirer cette plage" onClick={() => onChange(plages.filter((_, j) => j !== i))}><Trash2 /></Bouton>
      </div>
    ))}
    <Bouton taille="petit" intention="secondaire" onClick={() => onChange([...plages, { debut: '09:30', fin: '11:30' }])}><Plus /> Une plage</Bouton>
  </div>
);

const Semaine: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const initiale = () => JOURS.map((_, i) => reservation.semaine.filter((h) => h.jour === i + 1).map(({ debut, fin }) => ({ debut, fin })));
  const [jours, setJours] = useState<PlageHoraire[][]>(initiale);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { setJours(initiale()); }, [reservation]);
  const modifie = JSON.stringify(jours) !== JSON.stringify(initiale());
  const enregistrer = async () => {
    setRefus(null);
    try {
      await Clients.remplacerSemaine(jours.flatMap((plages, i) => plages.map((p) => ({ jour: i + 1, ...p }))));
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    }
  };
  return (
    <Carte densite="contenu" rythme>
      <TitreSection as="h3" titre="La semaine type" sousTitre="Un seul horaire pour tous les types." action={<Bouton taille="petit" intention="principale" disabled={!modifie} onClick={enregistrer}>Enregistrer</Bouton>} />
      <div className="grid gap-4 sm:grid-cols-2">
        {JOURS.map((nom, i) => (
          <div key={nom}>
            <p className="mb-1 text-sm font-semibold text-brand-main dark:text-white">{nom}</p>
            <Plages prefixe={`semaine-${i}`} plages={jours[i]} onChange={(p) => setJours((j) => j.map((x, k) => (k === i ? p : x)))} />
          </div>
        ))}
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </Carte>
  );
};

const Dates: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const [date, setDate] = useState('');
  const [plages, setPlages] = useState<PlageHoraire[]>([{ debut: '09:30', fin: '11:30' }]);
  const [refus, setRefus] = useState<string | null>(null);
  const agir = async (action: () => Promise<unknown>) => {
    setRefus(null);
    try { await action(); onEnregistre(); } catch (e) { setRefus(messageDe(e)); }
  };
  return (
    <Carte densite="contenu" rythme>
      <TitreSection as="h3" titre="Les dates d’exception à venir" sousTitre="Une date posée remplace la semaine type ce jour-là ; sans plage, la journée est fermée." />
      {reservation.dates.length === 0 ? <Vide>Aucune exception à venir.</Vide> : (
        <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
          {reservation.dates.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm text-brand-main dark:text-white">
                <span className="font-semibold tabular-nums">{d.date}</span> · {d.plages.length === 0 ? 'fermée' : d.plages.map((p) => `${p.debut}–${p.fin}`).join(', ')}
              </span>
              <Bouton taille="petit" intention="discrete" onClick={() => void agir(() => Clients.rendreDateALaSemaine(d.date))}>Rendre à la semaine type</Bouton>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t border-brand-border dark:border-dark-sec-border pt-3">
        <Champ id="exception-date" label="Date" type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
        <Plages prefixe="exception" plages={plages} onChange={setPlages} />
        <div className="flex flex-wrap justify-end gap-2">
          <Bouton taille="petit" intention="secondaire" disabled={!date} onClick={() => void agir(() => Clients.poserDate(date, []))}>Fermer cette date</Bouton>
          <Bouton taille="petit" intention="principale" disabled={!date || plages.length === 0} onClick={() => void agir(() => Clients.poserDate(date, plages))}>Ouvrir avec ces plages</Bouton>
        </div>
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
    </Carte>
  );
};

const Reglages: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const initial = () => Object.fromEntries(Object.entries(reservation.reglages).map(([k, v]) => [k, String(v)]));
  const [s, setS] = useState<Record<string, string>>(initial);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { setS(initial()); }, [reservation]);
  // L'interrupteur de la porte a sa route et sa confirmation (Réglages → Base des clients) : il n'est pas ici.
  const cles = Object.keys(reservation.reglages).filter((k) => k !== 'porte_publique_ouverte');
  const changes = cles.filter((k) => s[k] !== String(reservation.reglages[k]));
  const enregistrer = async () => {
    setRefus(null);
    try {
      await Clients.modifierReglages(Object.fromEntries(changes.map((k) => [k, Number(s[k])])));
      onEnregistre();
    } catch (e) {
      setRefus(messageDe(e));
    }
  };
  return (
    <Carte densite="contenu" rythme>
      <TitreSection as="h3" titre="Les réglages" action={<Bouton taille="petit" intention="principale" disabled={changes.length === 0} onClick={enregistrer}>Enregistrer</Bouton>} />
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className={`py-1 ${CLASSES_SURTITRE}`}>Réglage</th><th className={`py-1 ${CLASSES_SURTITRE}`}>Valeur</th></tr></thead>
        <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
          {cles.map((k) => (
            <tr key={k}>
              <td className="py-2 pr-3 text-brand-main dark:text-white"><label htmlFor={`reglage-${k}`}>{REGLAGES[k]?.libelle ?? k}</label></td>
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <Champ id={`reglage-${k}`} type="number" min={0} className="w-24" value={s[k] ?? ''} onChange={(e) => setS((x) => ({ ...x, [k]: (e.target as HTMLInputElement).value }))} />
                  <span className="text-xs text-brand-main dark:text-dark-text">{REGLAGES[k]?.unite ?? ''}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <TitreSection as="h3" titre="Les types" sousTitre="La clé d’un type ne change pas. La fenêtre se compte en heures écoulées : 504 h = 21 jours." />
        <div className="divide-y divide-brand-border dark:divide-dark-sec-border">
          {r.types.map((t) => <LigneType key={`${t.id}-${t.dureeMin}-${t.montantCentimes}-${t.actif}`} type={t} onEnregistre={relire} />)}
        </div>
      </Carte>
      <Semaine reservation={r} onEnregistre={relire} />
      <Dates reservation={r} onEnregistre={relire} />
      <Reglages reservation={r} onEnregistre={relire} />
    </div>
  );
};

export default ReservationReglages;
