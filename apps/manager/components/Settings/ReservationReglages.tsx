/**
 * Réglages → Pratique (SPEC §15.4 ; refonte, lot 9 ; retours du 28/11/2026,
 * §2.2 à §2.6). Les types de rendez-vous, la semaine type et les dates
 * d'exception, les règles, et les limites de sécurité de la réception.
 *
 * Une règle s'écrit en phrase, le champ dans la phrase, et ses valeurs sont
 * celles d'une liste courte ; une valeur enregistrée hors de la liste reste
 * affichée et conservée (§2.3). Rien ne s'enregistre en haut de carte : une
 * barre apparaît au bas de l'écran quand quelque chose a changé. Les routes,
 * elles, n'ont pas changé d'unité : des heures et des minutes.
 *
 * Ce qui change ici change ce que la réservation en ligne proposera, rien de ce
 * qui est déjà posé.
 */
import React, { useEffect, useState } from 'react';
import { Bouton, Carte, Champ, Etiquette, Pastille, Secondaire, TitreCarte, FOCUS } from '../charte';
import { BarreEnregistrer, ChampSuffixe, Compteur, ListeValeurs, Phrase, Positions, type OptionValeur } from '../charte/reglage';
import * as Clients from '../../services/clientsService';
import type { PlageHoraire, Reservation, TypeReservation } from '../../types-clients';
import { delai, duree, montant as montantEnClair } from '../../lib/format';
import { useGardeQuitter } from '../../lib/garde';
import { centimesDepuis, EtatLecture, jourEnLettres, messageDe, useLecture } from '../Clients/commun';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ─── Les listes de valeurs (§2.3) ───────────────────────────────────────────

const O = (...o: OptionValeur[]) => o;
const OPTIONS = {
  rappel: O([0, 'pas de rappel'], [12, '12 heures'], [24, '1 jour'], [48, '2 jours'], [72, '3 jours'], [168, '1 semaine']),
  carte: O([1, '1 heure'], [2, '2 heures'], [6, '6 heures'], [12, '12 heures'], [24, '1 jour']),
  virement: O([24, '1 jour'], [48, '2 jours'], [72, '3 jours'], [120, '5 jours'], [168, '7 jours'], [336, '14 jours']),
  attente: O([12, '12 heures'], [24, '1 jour'], [48, '2 jours'], [72, '3 jours'], [168, '1 semaine']),
  relance: O([5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']),
  garde: O([168, '7 jours'], [336, '14 jours'], [720, '30 jours'], [2160, '90 jours']),
  duree: O([20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [75, '1 h 15'], [90, '1 h 30'], [105, '1 h 45'], [120, '2 h'], [150, '2 h 30'], [180, '3 h']),
  marge: O([0, 'aucun'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min']),
  pas: O([15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']),
  delaiMin: O([2, '2 heures'], [6, '6 heures'], [12, '12 heures'], [24, '1 jour'], [48, '2 jours'], [168, '1 semaine'], [336, '2 semaines'], [504, '3 semaines']),
  horizon: O([720, '1 mois'], [1464, '2 mois'], [2184, '3 mois'], [4392, '6 mois'], [8760, '1 an']),
};
const enHeures = (h: number) => delai(h);
const enJoursPleins = (h: number) => delai(h, { retenue: true });

// Un seul libellé par lieu, partout (§2.6 : la liste disait « En visio », le formulaire « Visio ou téléphone »).
export const LIEUX: Record<TypeReservation['lieu'], string> = { sur_place: 'Sur place', visio: 'En visio', visio_ou_appel: 'Visio ou téléphone' };

// ─── L'état des réglages : ce qui a changé, l'enregistrer, l'annuler ───────

const useReglages = (reservation: Reservation, cles: readonly string[], onEnregistre: () => void) => {
  const lus = () => Object.fromEntries(cles.map((k) => [k, Number(reservation.reglages[k] ?? 0)]));
  const [s, setS] = useState<Record<string, number>>(lus);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { setS(lus()); }, [reservation]);
  const changes = cles.filter((k) => k in reservation.reglages && s[k] !== Number(reservation.reglages[k]));
  useGardeQuitter(changes.length > 0);
  return {
    valeur: (k: string) => s[k] ?? 0,
    poser: (k: string) => (v: number) => { setRefus(null); setS((x) => ({ ...x, [k]: v })); },
    modifie: (k: string) => changes.includes(k),
    existe: (k: string) => k in reservation.reglages,
    barre: (
      <BarreEnregistrer modifications={changes.length} enCours={enCours} refus={refus}
        onAnnuler={() => { setS(lus()); setRefus(null); }}
        onEnregistrer={async () => {
          setEnCours(true);
          try { await Clients.modifierReglages(Object.fromEntries(changes.map((k) => [k, s[k]]))); onEnregistre(); }
          catch (e) { setRefus(messageDe(e)); }
          finally { setEnCours(false); }
        }} />
    ),
  };
};
type EtatReglages = ReturnType<typeof useReglages>;

const Liste: React.FC<{ r: EtatReglages; cle: string; libelle: string; options: readonly OptionValeur[]; horsListe?: (v: number) => string }> =
  ({ r, cle, libelle, options, horsListe = enHeures }) => (
    <ListeValeurs id={`reglage-${cle}`} libelle={libelle} valeur={r.valeur(cle)} options={options} horsListe={horsListe} onChange={r.poser(cle)} modifie={r.modifie(cle)} />
  );

/** L'exemple d'un rappel, sur une séance d'un lundi à 9 h. */
const exempleRappel = (heures: number, lundi: Date) => {
  if (heures === 0) return null;
  const d = new Date(lundi.getTime() - heures * 3_600_000);
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })} à ${d.getHours()} h`;
};
const lundiProchain = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 7);
  d.setHours(9, 0, 0, 0);
  return d;
};

const SectionPhrases: React.FC<{ titre: string; children: React.ReactNode }> = ({ titre, children }) => (
  <Carte as="section" className="px-5 py-4">
    <TitreCarte className="mb-1">{titre}</TitreCarte>
    {children}
  </Carte>
);

// ─── Les règles ─────────────────────────────────────────────────────────────

const CLES_REGLES = ['rappel_email_avant_h', 'rappel_sms_avant_h', 'retenue_carte_h', 'retenue_virement_h',
  'liste_attente_creneau_min_h', 'liste_attente_seance_min_h', 'liste_attente_personnes_max'] as const;

const Regles: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const r = useReglages(reservation, CLES_REGLES, onEnregistre);
  const lundi = lundiProchain();
  const exMail = exempleRappel(r.valeur('rappel_email_avant_h'), lundi);
  const exSms = exempleRappel(r.valeur('rappel_sms_avant_h'), lundi);
  return (
    <div className="flex flex-col gap-5">
      <SectionPhrases titre="Rappels">
        <Phrase>Un e-mail de rappel part <Liste r={r} cle="rappel_email_avant_h" libelle="Délai du rappel par e-mail" options={OPTIONS.rappel} /> avant la séance.</Phrase>
        <Phrase>Un SMS de rappel part <Liste r={r} cle="rappel_sms_avant_h" libelle="Délai du rappel par SMS" options={OPTIONS.rappel} /> avant la séance.</Phrase>
        <Secondaire className="pt-1">
          Exemple, pour une séance le {lundi.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à 9 h :{' '}
          {exMail ? `e-mail le ${exMail}` : 'pas d’e-mail'}, {exSms ? `SMS le ${exSms}` : 'pas de SMS'}.
        </Secondaire>
      </SectionPhrases>
      <SectionPhrases titre="Place retenue en attendant le paiement">
        <Phrase>Par carte, la place reste retenue <Liste r={r} cle="retenue_carte_h" libelle="Place retenue, par carte" options={OPTIONS.carte} />.</Phrase>
        <Phrase>Par virement, la place reste retenue <Liste r={r} cle="retenue_virement_h" libelle="Place retenue, par virement" options={OPTIONS.virement} horsListe={enJoursPleins} />.</Phrase>
        <Secondaire className="pt-1">Passé ce délai sans paiement, la place est libérée.</Secondaire>
      </SectionPhrases>
      <SectionPhrases titre="Liste d’attente">
        <Phrase>Un créneau libéré est proposé s’il commence dans <Liste r={r} cle="liste_attente_creneau_min_h" libelle="Délai minimum d’un créneau libéré" options={OPTIONS.attente} /> ou plus.</Phrase>
        <Phrase>Une personne est prévenue si sa séance est dans <Liste r={r} cle="liste_attente_seance_min_h" libelle="Délai minimum avant la séance de la personne prévenue" options={OPTIONS.attente} /> ou plus.</Phrase>
        <Phrase>Au plus <Compteur id="reglage-liste_attente_personnes_max" libelle="Nombre maximum de personnes prévenues" min={1} max={100} valeur={r.valeur('liste_attente_personnes_max')} onChange={r.poser('liste_attente_personnes_max')} modifie={r.modifie('liste_attente_personnes_max')} /> personnes sont prévenues.</Phrase>
      </SectionPhrases>
      {r.barre}
    </div>
  );
};

// ─── Les limites de sécurité (sous Réception du site) ──────────────────────

const CLES_LIMITES = ['commandes_questionnaire_max_jour', 'commandes_reservation_max_jour', 'emails_max_jour',
  'ordre_relance_min', 'ordre_tentatives_max', 'recus_garde_h'] as const;

const Limites: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const r = useReglages(reservation, CLES_LIMITES, onEnregistre);
  const quota = (cle: string, libelle: string) => r.existe(cle) && (
    <Phrase className="justify-between">
      <label htmlFor={`reglage-${cle}`}>{libelle}</label>
      <Compteur id={`reglage-${cle}`} libelle={`${libelle} acceptés par 24 heures`} min={0} max={10_000} valeur={r.valeur(cle)} onChange={r.poser(cle)} modifie={r.modifie(cle)} />
    </Phrase>
  );
  return (
    <>
      <details className="group rounded-carte border border-bord bg-surface shadow-carte">
        <summary className={cx('flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-charte [&::-webkit-details-marker]:hidden', FOCUS)}>
          <span aria-hidden="true" className="size-[7px] flex-none -rotate-45 border-b-[1.6px] border-r-[1.6px] border-second transition-transform duration-[var(--duree)] group-open:rotate-45" />
          <span className="flex-1 font-semibold text-texte">Limites de sécurité</span>
          <span className="hidden text-secondaire text-second sm:inline">À ne toucher qu’en cas d’abus</span>
        </summary>
        <div className="divide-y divide-bord px-5 pb-4">
          <div className="pb-2">
            <Etiquette as="h3" className="pb-1 pt-2">Acceptés par 24 heures</Etiquette>
            {quota('commandes_questionnaire_max_jour', 'Questionnaires de santé')}
            {quota('commandes_reservation_max_jour', 'Réservations')}
            {quota('emails_max_jour', 'E-mails confiés à Make')}
          </div>
          <div className="pb-2">
            <Etiquette as="h3" className="pb-1 pt-4">Ordres non confirmés</Etiquette>
            <Phrase>
              Relancer un ordre après <Liste r={r} cle="ordre_relance_min" libelle="Relancer après" options={OPTIONS.relance} horsListe={duree} />,
              et le déclarer en échec après <Compteur id="reglage-ordre_tentatives_max" libelle="Tentatives avant l’échec" min={1} max={50} valeur={r.valeur('ordre_tentatives_max')} onChange={r.poser('ordre_tentatives_max')} modifie={r.modifie('ordre_tentatives_max')} /> tentatives.
            </Phrase>
          </div>
          <div>
            <Etiquette as="h3" className="pb-1 pt-4">Conservation</Etiquette>
            <Phrase>Garder les reçus de commande pendant <Liste r={r} cle="recus_garde_h" libelle="Durée de conservation des reçus" options={OPTIONS.garde} horsListe={enJoursPleins} />.</Phrase>
          </div>
        </div>
      </details>
      {r.barre}
    </>
  );
};

// ─── Les types ──────────────────────────────────────────────────────────────

type Proposition = 'site' | 'console' | 'archive';
const PROPOSITIONS: { valeur: Proposition; nom: string; aide: string }[] = [
  { valeur: 'site', nom: 'Sur le site et dans la console', aide: 'Réservable en ligne.' },
  { valeur: 'console', nom: 'Dans la console seulement', aide: 'Vous seul pouvez le poser. La réservation en ligne disparaît.' },
  { valeur: 'archive', nom: 'Archivé', aide: 'Plus proposé nulle part. Les rendez-vous passés le gardent.' },
];
const propositionDe = (t: Pick<TypeReservation, 'actif' | 'reservableEnLigne'>): Proposition =>
  !t.actif ? 'archive' : t.reservableEnLigne ? 'site' : 'console';
const PASTILLE: Record<Proposition, React.ReactNode> = {
  site: <Pastille ton="succes">Sur le site</Pastille>,
  console: <Pastille>Console seulement</Pastille>,
  archive: <Pastille>Archivé</Pastille>,
};

const resumeType = (t: TypeReservation) => [
  duree(t.dureeMin), montantEnClair(t.montantCentimes), LIEUX[t.lieu].toLowerCase(),
  t.actif && t.reservableEnLigne ? `se réserve de ${delai(t.fenetreDebutH)} à ${delai(t.fenetreFinH)} à l’avance` : null,
].filter(Boolean).join(' · ');

const LIBELLE = 'text-secondaire font-medium text-second';

/** Le formulaire d'un type, ouvert dans sa ligne (§2.6). */
const FormulaireType: React.FC<{ type: TypeReservation; onFermer: () => void; onEnregistre: () => void }> = ({ type, onFermer, onEnregistre }) => {
  const initial = {
    libelle: type.libelle, dureeMin: type.dureeMin, margeApresMin: type.margeApresMin, pasMin: type.pasMin, lieu: type.lieu,
    montant: String(type.montantCentimes / 100).replace('.', ','), fenetreDebutH: type.fenetreDebutH, fenetreFinH: type.fenetreFinH,
    proposition: propositionDe(type),
  };
  const [s, setS] = useState(initial);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const changes = (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => s[k] !== initial[k]);
  const mod = (k: keyof typeof initial) => changes.includes(k);
  const poser = <K extends keyof typeof initial>(k: K) => (v: (typeof initial)[K]) => { setRefus(null); setS((x) => ({ ...x, [k]: v })); };
  useGardeQuitter(changes.length > 0);
  const p = `type-${type.id}`;

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const centimes = centimesDepuis(s.montant);
    if (centimes === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
    if (!s.libelle.trim()) { setRefus('Le type a besoin d’un nom.'); return; }
    if (s.fenetreFinH <= s.fenetreDebutH) { setRefus('L’horizon doit être plus loin que le délai minimum.'); return; }
    setEnCours(true);
    try {
      await Clients.modifierType(type.id, {
        libelle: s.libelle.trim(), dureeMin: s.dureeMin, margeApresMin: s.margeApresMin, pasMin: s.pasMin, lieu: s.lieu,
        montantCentimes: centimes, fenetreDebutH: s.fenetreDebutH, fenetreFinH: s.fenetreFinH,
        actif: s.proposition !== 'archive', reservableEnLigne: s.proposition === 'site',
      });
      onEnregistre();
      onFermer();
    } catch (err) { setRefus(messageDe(err)); setEnCours(false); }
  };

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-5 pb-5 pl-12 pr-5 pt-1 font-charte">
      <Champ id={`${p}-libelle`} label="Nom affiché" value={s.libelle} onChange={(e) => poser('libelle')(e.target.value)}
        className={cx('max-w-[420px]', mod('libelle') && '[&_input]:!border-marque')} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1"><label htmlFor={`${p}-duree`} className={LIBELLE}>Durée</label>
          <ListeValeurs id={`${p}-duree`} libelle="Durée" valeur={s.dureeMin} options={OPTIONS.duree} horsListe={duree} onChange={poser('dureeMin')} modifie={mod('dureeMin')} className="w-36" /></div>
        <div className="flex flex-col gap-1"><label htmlFor={`${p}-marge`} className={LIBELLE}>Temps libre après</label>
          <ListeValeurs id={`${p}-marge`} libelle="Temps libre après" valeur={s.margeApresMin} options={OPTIONS.marge} horsListe={duree} onChange={poser('margeApresMin')} modifie={mod('margeApresMin')} className="w-36" /></div>
        <div className="flex flex-col gap-1"><label htmlFor={`${p}-montant`} className={LIBELLE}>Montant</label>
          <ChampSuffixe id={`${p}-montant`} suffixe="€" inputMode="decimal" value={s.montant} onChange={(e) => poser('montant')(e.target.value)} modifie={mod('montant')} /></div>
        <Secondaire className="pb-2.5">0 € s’affiche « offert ».</Secondaire>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`${p}-lieu`} className={LIBELLE}>Lieu</span>
        <Positions libelleId={`${p}-lieu`} valeur={s.lieu} onChange={poser('lieu')}
          options={(Object.keys(LIEUX) as TypeReservation['lieu'][]).map((l) => ({ valeur: l, libelle: LIEUX[l] }))} />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className={cx(LIBELLE, 'pb-1.5')}>Où ce type est proposé</legend>
        {PROPOSITIONS.map((o) => {
          const choisi = s.proposition === o.valeur;
          return (
            <label key={o.valeur} className={cx('flex cursor-pointer items-start gap-2.5 rounded-controle px-3 py-2', choisi && 'bg-surface')}>
              <input type="radio" name={`${p}-proposition`} checked={choisi} onChange={() => poser('proposition')(o.valeur)} className="mt-1 accent-marque" />
              <span className="flex flex-col"><span className={choisi ? 'font-semibold' : 'font-medium'}>{o.nom}</span><Secondaire>{o.aide}</Secondaire></span>
            </label>
          );
        })}
      </fieldset>
      {s.proposition === 'site' && (
        <div className="flex flex-col gap-0.5 rounded-carte border border-bord bg-surface px-4 py-3">
          <Etiquette as="h3" className="pb-1">Réservation sur le site</Etiquette>
          <Phrase>
            Se réserve au moins <ListeValeurs id={`${p}-min`} libelle="Délai minimum de réservation" valeur={s.fenetreDebutH} options={OPTIONS.delaiMin} horsListe={enHeures} onChange={poser('fenetreDebutH')} modifie={mod('fenetreDebutH')} /> à l’avance,
            et au plus <ListeValeurs id={`${p}-max`} libelle="Horizon de réservation" valeur={s.fenetreFinH} options={OPTIONS.horizon} horsListe={enJoursPleins} onChange={poser('fenetreFinH')} modifie={mod('fenetreFinH')} /> à l’avance.
          </Phrase>
          <Phrase>Les créneaux proposés commencent toutes les <ListeValeurs id={`${p}-pas`} libelle="Intervalle entre deux créneaux" valeur={s.pasMin} options={OPTIONS.pas} horsListe={duree} onChange={poser('pasMin')} modifie={mod('pasMin')} />.</Phrase>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx('min-w-60 flex-1 text-secondaire', refus ? 'font-semibold text-sens-erreur' : 'text-second')}>
          {refus ? `× ${refus}` : `${changes.length ? `${changes.length} modification${changes.length > 1 ? 's' : ''}. ` : ''}Les rendez-vous déjà posés gardent leur durée et leur montant.`}
        </span>
        <Bouton intention="borde" onClick={onFermer} disabled={enCours}>Annuler</Bouton>
        <Bouton type="submit" disabled={enCours || changes.length === 0}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
      </div>
    </form>
  );
};

const Poignee: React.FC<{ nom: string; onMonter: () => void; onDescendre: () => void }> = ({ nom, onMonter, onDescendre }) => (
  <button type="button" aria-label={`Changer l’ordre : ${nom}`} title="Glisser, ou ⌥↑ ⌥↓"
    onKeyDown={(e) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); onMonter(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onDescendre(); }
    }}
    className={cx('flex h-9 w-7 flex-none cursor-grab items-center justify-center rounded-controle text-second hover:bg-survole active:cursor-grabbing', FOCUS)}>
    <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.3" /><circle cx="9" cy="3" r="1.3" /><circle cx="3" cy="8" r="1.3" /><circle cx="9" cy="8" r="1.3" /><circle cx="3" cy="13" r="1.3" /><circle cx="9" cy="13" r="1.3" /></svg>
  </button>
);

const Types: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const [ordre, setOrdre] = useState(() => reservation.types.map((t) => t.id));
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { setOrdre(reservation.types.map((t) => t.id)); }, [reservation]);
  const types = ordre.map((id) => reservation.types.find((t) => t.id === id)).filter((t): t is TypeReservation => !!t);

  /** L'ordre se pose tout de suite : un glissé n'a pas d'« Enregistrer ». Refusé, la liste revient. */
  const ranger = async (ids: string[]) => {
    setOrdre(ids);
    setRefus(null);
    try { await Clients.ordonnerTypes(ids); onEnregistre(); }
    catch (e) { setRefus(messageDe(e)); setOrdre(reservation.types.map((t) => t.id)); }
  };
  /** Place `id` au rang `vers` de la liste. */
  const deplacer = (id: string, vers: number) => {
    if (vers < 0 || vers >= ordre.length) return;
    const sans = ordre.filter((x) => x !== id);
    void ranger([...sans.slice(0, vers), id, ...sans.slice(vers)]);
  };

  return (
    <div className="flex flex-col gap-3">
      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      <Carte className="overflow-hidden">
        {types.map((t, i) => {
          const estOuvert = ouvert === t.id;
          return (
            <div key={t.id} data-type={t.cle}
              className={cx(i > 0 && 'border-t border-bord', estOuvert && 'bg-survole', glisse === t.id && 'opacity-50')}
              onDragOver={(e) => { if (glisse && glisse !== t.id) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); if (glisse && glisse !== t.id) deplacer(glisse, i); setGlisse(null); }}>
              <div className="flex items-center gap-2.5 py-2.5 pl-2 pr-4"
                draggable={!estOuvert} onDragStart={(e) => { setGlisse(t.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setGlisse(null)}>
                <Poignee nom={t.libelle} onMonter={() => deplacer(t.id, i - 1)} onDescendre={() => deplacer(t.id, i + 1)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-texte">{t.libelle}</span>
                  <Secondaire className="truncate">{resumeType(t)}</Secondaire>
                </span>
                {PASTILLE[propositionDe(t)]}
                {!estOuvert && <Bouton intention="borde" taille="petit" onClick={() => setOuvert(t.id)} aria-label={`Modifier ${t.libelle}`}>Modifier</Bouton>}
              </div>
              {estOuvert && <FormulaireType type={t} onFermer={() => setOuvert(null)} onEnregistre={onEnregistre} />}
            </div>
          );
        })}
      </Carte>
    </div>
  );
};

// ─── Les plages horaires ────────────────────────────────────────────────────

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Des plages sur une ligne : début, fin, retirer ; et « Une plage » au bout. */
const Plages: React.FC<{ plages: PlageHoraire[]; onChange: (p: PlageHoraire[]) => void; prefixe: string; nom: string }> = ({ plages, onChange, prefixe, nom }) => (
  <div className="flex flex-wrap items-center gap-2">
    {plages.length === 0 && <span className="text-second">Fermé</span>}
    {plages.map((p, i) => (
      <span key={i} className="flex items-center gap-1.5">
        <Champ id={`${prefixe}-${i}-debut`} label={`${nom}, plage ${i + 1} : de`} masquerLabel type="time" className="w-28" value={p.debut} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, debut: e.target.value } : x)))} />
        <span className="text-second">à</span>
        <Champ id={`${prefixe}-${i}-fin`} label={`${nom}, plage ${i + 1} : à`} masquerLabel type="time" className="w-28" value={p.fin} onChange={(e) => onChange(plages.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))} />
        <Bouton intention="souligne" taille="petit" aria-label={`Retirer la plage ${i + 1} (${nom})`} onClick={() => onChange(plages.filter((_, j) => j !== i))}>×</Bouton>
      </span>
    ))}
    <Bouton intention="souligne" taille="petit" aria-label={`Ajouter une plage (${nom})`} onClick={() => onChange([...plages, plages.length ? { debut: '14:00', fin: '18:00' } : { debut: '09:30', fin: '12:30' }])}>+ Une plage</Bouton>
  </div>
);

const Semaine: React.FC<{ reservation: Reservation; onEnregistre: () => void }> = ({ reservation, onEnregistre }) => {
  const initiale = () => JOURS.map((_, i) => reservation.semaine.filter((h) => h.jour === i + 1).map(({ debut, fin }) => ({ debut, fin })));
  const [semaine, setSemaine] = useState<PlageHoraire[][]>(initiale);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { setSemaine(initiale()); }, [reservation]);
  const lus = initiale();
  const change = (i: number) => JSON.stringify(semaine[i]) !== JSON.stringify(lus[i]);
  const changes = JOURS.filter((_, i) => change(i)).length;
  useGardeQuitter(changes > 0);
  return (
    <>
      <Carte as="section" className="px-5 py-4">
        <TitreCarte>La semaine type</TitreCarte>
        <Secondaire>Un seul horaire pour tous les types.</Secondaire>
        <div className="mt-2 divide-y divide-bord">
          {JOURS.map((nom, i) => (
            <div key={nom} className="grid gap-2 py-2 sm:grid-cols-[7rem_1fr] sm:items-center">
              <p className={cx('font-semibold', change(i) ? 'text-marque' : 'text-texte')}>{nom}</p>
              <Plages prefixe={`semaine-${i}`} nom={nom} plages={semaine[i]} onChange={(p) => { setRefus(null); setSemaine((j) => j.map((x, k) => (k === i ? p : x))); }} />
            </div>
          ))}
        </div>
      </Carte>
      <BarreEnregistrer modifications={changes} enCours={enCours} refus={refus}
        onAnnuler={() => { setSemaine(initiale()); setRefus(null); }}
        onEnregistrer={async () => {
          setEnCours(true);
          try { await Clients.remplacerSemaine(semaine.flatMap((plages, i) => plages.map((p) => ({ jour: i + 1, ...p })))); onEnregistre(); }
          catch (e) { setRefus(messageDe(e)); }
          finally { setEnCours(false); }
        }} />
    </>
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
    <Carte as="section" className="px-5 py-4">
      <TitreCarte>Les dates d’exception à venir</TitreCarte>
      <Secondaire>Une date posée remplace la semaine type ce jour-là ; sans plage, la journée est fermée. Fermer des jours se fait aussi depuis l’Agenda.</Secondaire>
      {reservation.dates.length === 0 ? <Secondaire className="py-3">Aucune exception à venir.</Secondaire> : (
        <ul className="mt-2 divide-y divide-bord">
          {reservation.dates.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-semibold first-letter:uppercase">{jourEnLettres(`${d.date}T12:00:00+01:00`)}</span>
                {' · '}{d.plages.length === 0 ? 'fermée' : d.plages.map((p) => `${p.debut}–${p.fin}`).join(', ')}
              </span>
              <Bouton intention="souligne" taille="petit" onClick={() => void agir(() => Clients.rendreDateALaSemaine(d.date))}>Rendre à la semaine type</Bouton>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-3 border-t border-bord pt-3">
        <p className="font-semibold">Poser une exception</p>
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-center">
          <Champ id="exception-date" label="Date de l’exception" masquerLabel type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Plages prefixe="exception" nom="Exception" plages={plages} onChange={setPlages} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {plages.length === 0
            ? <Bouton disabled={!date} onClick={() => void agir(() => Clients.poserDate(date, []))}>Fermer cette date</Bouton>
            : <Bouton disabled={!date} onClick={() => void agir(() => Clients.poserDate(date, plages))}>Ouvrir avec ces plages</Bouton>}
        </div>
      </div>
      {refus && <p role="alert" className="mt-2 text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
    </Carte>
  );
};

// ─── L'écran ────────────────────────────────────────────────────────────────

/**
 * Une partie des réglages de la réservation : types de rendez-vous ; horaires
 * habituels et dates d'exception ; règles ; limites de sécurité, sous
 * Réception du site.
 */
export type PartieReservation = 'types' | 'horaires' | 'regles' | 'gardefous';

export const ReservationReglages: React.FC<{ partie: PartieReservation }> = ({ partie }) => {
  const lecture = useLecture(() => Clients.lireReservation(), []);
  if (lecture.phase !== 'prete') return <EtatLecture lecture={lecture} />;
  const r = lecture.donnees;
  const relire = () => void lecture.recharger();
  if (partie === 'horaires') return <div className="flex flex-col gap-5"><Semaine reservation={r} onEnregistre={relire} /><Dates reservation={r} onEnregistre={relire} /></div>;
  if (partie === 'regles') return <Regles reservation={r} onEnregistre={relire} />;
  if (partie === 'gardefous') return <Limites reservation={r} onEnregistre={relire} />;
  return <Types reservation={r} onEnregistre={relire} />;
};

export default ReservationReglages;
