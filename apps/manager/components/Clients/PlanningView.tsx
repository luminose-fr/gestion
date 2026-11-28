/**
 * L'Agenda (refonte de la console, lot 5 ; maquettes Agenda, AgendaMois,
 * FermerJours, TelAgenda). Décision de Florent du 28/11/2026 : la semaine en
 * colonnes de cartes, pas une grille horaire.
 *
 * Semaine et Mois ; chaque jour dit s'il est fermé et combien de créneaux de
 * séance restent libres dans les horaires. « Fermer des jours… » vit ici, sur
 * le calendrier, plus dans Réglages : c'est ce qui change une date (01, §3,
 * règle 5). « Poser un rendez-vous » est l'action principale.
 *
 * L'adresse porte la vue et le lundi affiché : `#agenda/semaine/2026-12-14`,
 * `#agenda/mois/2026-12-01`. Des dates, jamais une personne. L'écran
 * Calendly a été retiré le 28/11/2026 (décision de Florent : la réservation
 * passe par le site et gestion) ; `#agenda/calendly` mène à la semaine.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bouton, Carte, Champ, Etiquette, Fenetre, FOCUS, Onglets, Pastille, Secondaire } from '../charte';
import * as Clients from '../../services/clientsService';
import type { JourAgenda, Seance } from '../../types-clients';
import { aller, aujourdhui, EtatLecture, heure, jourDe, lundiDe, messageDe, nomComplet, plusJours, useLecture } from './commun';
import { PoserRendezVous } from './PoserRendezVous';


export type VuePlanning = 'semaine' | 'mois';

const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const enLettres = (date: string, f: Intl.DateTimeFormat) => f.format(new Date(`${date}T12:00:00Z`));

/** Le premier du mois, et les bornes de la grille : du lundi d'avant au dimanche d'après. */
const grilleDuMois = (premier: string) => {
  const d = new Date(`${premier}T12:00:00Z`);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
  return { debut: lundiDe(premier), fin: plusJours(lundiDe(dernier), 6) };
};
const moisVoisin = (premier: string, n: number) => {
  const d = new Date(`${premier}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)).toISOString().slice(0, 10);
};

const parJour = (seances: Seance[]) => {
  const jours = new Map<string, Seance[]>();
  for (const s of seances) jours.set(jourDe(s.debut), [...(jours.get(jourDe(s.debut)) ?? []), s]);
  return jours;
};

const libresEnClair = (j: JourAgenda | undefined) =>
  !j || j.ferme || j.libres === null ? null : j.libres === 0 ? 'complet' : `${j.libres} libre${j.libres > 1 ? 's' : ''}`;

// ─── Une séance dans une colonne ────────────────────────────────────────────

const PastilleStatut: React.FC<{ s: Seance }> = ({ s }) =>
  s.statut === 'realisee' ? <Pastille ton="succes">Réalisée</Pastille>
    : s.statut === 'annulee' ? <Pastille ton="erreur">Annulée</Pastille>
      : s.statut === 'absent' ? <Pastille ton="erreur">Absente</Pastille>
        : <Pastille>Prévue</Pastille>;

const PastillePaiement: React.FC<{ s: Seance }> = ({ s }) =>
  s.etatPaiement === 'payee' ? <Pastille ton="succes">Payé</Pastille>
    : s.etatPaiement === 'offerte' ? <Pastille signe="">Offert</Pastille>
      : s.etatPaiement === 'annulee' ? null
        : s.statut === 'annulee' ? null
          // À venir, rien n'est encore dû : « à encaisser » ne se dit qu'après la séance.
          : s.statut === 'prevue' ? null
            : <Pastille ton={s.statut === 'absent' ? 'erreur' : 'alerte'}>À encaisser</Pastille>;

const CarteSeance: React.FC<{ s: Seance }> = ({ s }) => (
  <a href={`#agenda/${encodeURIComponent(s.id)}`} className={`block rounded-carte border border-bord bg-surface px-3 py-2 shadow-carte hover:bg-survole ${FOCUS}`}>
    {/* L'heure, puis la personne en entier : dans une colonne de jour, un nom coupé ne se lit plus. */}
    <span className={`block ${s.statut === 'annulee' ? 'text-second line-through' : ''}`}>
      <span className="font-semibold tabular-nums">{heure(s.debut)}</span> {nomComplet(s.personne)}
    </span>
    <span className="block text-secondaire text-second">{s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}</span>
    <span className="mt-1.5 flex flex-wrap gap-1"><PastilleStatut s={s} /><PastillePaiement s={s} /></span>
  </a>
);

const JourFerme: React.FC<{ j: JourAgenda; onOuvrir: (date: string) => void }> = ({ j, onOuvrir }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Pastille ton="neutre" signe="×">Jour fermé</Pastille>
    {j.exception && <Bouton taille="petit" intention="souligne" onClick={() => onOuvrir(j.date)}>Ouvrir ce jour</Bouton>}
  </div>
);

// ─── La semaine ─────────────────────────────────────────────────────────────

const Semaine: React.FC<{ lundi: string; seances: Seance[]; jours: Map<string, JourAgenda>; onOuvrir: (date: string) => void }> = ({ lundi, seances, jours, onOuvrir }) => {
  const parDate = parJour(seances);
  const auj = aujourdhui();
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {JOURS_COURTS.map((nom, i) => {
        const date = plusJours(lundi, i);
        const duJour = parDate.get(date) ?? [];
        const j = jours.get(date);
        const libres = libresEnClair(j);
        return (
          <section key={date} aria-label={enLettres(date, JOUR_COURT)}
            className={`flex min-w-0 flex-col gap-2 rounded-carte border p-2 ${date === auj ? 'border-marque bg-survole' : j?.ferme ? 'border-bord bg-bas' : 'border-bord'}`}>
            <div className="flex items-baseline justify-between gap-2 px-1">
              <span className="font-semibold">{nom} {Number(date.slice(8))}</span>
              <span className="text-secondaire text-second">{[date === auj ? 'aujourd’hui' : null, libres].filter(Boolean).join(' · ')}</span>
            </div>
            {duJour.map((s) => <CarteSeance key={s.id} s={s} />)}
            {j?.ferme && <JourFerme j={j} onOuvrir={onOuvrir} />}
          </section>
        );
      })}
    </div>
  );
};

// ─── Le mois ────────────────────────────────────────────────────────────────

const Mois: React.FC<{ premier: string; debut: string; fin: string; seances: Seance[]; jours: Map<string, JourAgenda> }> = ({ premier, debut, fin, seances, jours }) => {
  const parDate = parJour(seances);
  const moisAffiche = premier.slice(0, 7);
  const auj = aujourdhui();
  const cases: string[] = [];
  for (let d = debut; d <= fin; d = plusJours(d, 1)) cases.push(d);
  return (
    <Carte as="div" className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-bord">
        {JOURS_COURTS.map((j) => <Etiquette key={j} className="px-2 py-2">{j}</Etiquette>)}
      </div>
      <div className="grid grid-cols-7">
        {cases.map((date) => {
          const j = jours.get(date);
          const hors = date.slice(0, 7) !== moisAffiche;
          return (
            <div key={date} className={`min-h-24 border-b border-r border-bord p-1.5 ${j?.ferme || hors ? 'bg-bas' : ''}`}>
              <p className="flex items-baseline justify-between gap-1">
                <span className={`text-secondaire font-semibold tabular-nums ${date === auj ? 'rounded-full bg-marque px-1.5 text-sur-marque' : hors ? 'text-second' : ''}`}>{Number(date.slice(8))}</span>
                {j?.ferme ? <span className="text-etiquette text-second">fermé</span>
                  : !hors && libresEnClair(j) ? <span className="text-etiquette text-second">{libresEnClair(j)}</span> : null}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {(parDate.get(date) ?? []).map((s) => (
                  <li key={s.id}>
                    <a href={`#agenda/${encodeURIComponent(s.id)}`} title={`${nomComplet(s.personne)} — ${s.type?.libelle ?? ''}`}
                      className={`block truncate rounded-controle px-1 text-secondaire hover:bg-survole ${s.statut === 'annulee' ? 'text-second line-through' : ''} ${FOCUS}`}>
                      <span className="tabular-nums">{heure(s.debut)}</span> {s.personne.prenom ?? '—'}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Carte>
  );
};

// ─── Fermer des jours ───────────────────────────────────────────────────────

/** Fermer des jours : une plage de dates, les séances déjà prévues dessus — fermer ne les annule pas. */
export const FermerJours: React.FC<{ onFermer: () => void; onFait: () => void }> = ({ onFermer, onFait }) => {
  const [du, setDu] = useState(aujourdhui());
  const [au, setAu] = useState(aujourdhui());
  const [prevues, setPrevues] = useState<Seance[] | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const valide = /^\d{4}-\d{2}-\d{2}$/.test(du) && /^\d{4}-\d{2}-\d{2}$/.test(au) && au >= du;
  const nbJours = valide ? Math.round((Date.parse(`${au}T12:00:00Z`) - Date.parse(`${du}T12:00:00Z`)) / 86_400_000) + 1 : 0;

  useEffect(() => {
    if (!valide || nbJours > 62) { setPrevues(null); return; }
    let vivant = true;
    Clients.seancesDeLaPeriode(du, au)
      .then((r) => { if (vivant) setPrevues(r.seances.filter((s) => s.statut === 'prevue')); })
      .catch(() => { if (vivant) setPrevues(null); });
    return () => { vivant = false; };
  }, [du, au, valide, nbJours]);

  const fermer = async () => {
    setEnCours(true);
    setRefus(null);
    try {
      // Une date après l'autre : c'est la route des dates d'exception, telle qu'elle est.
      for (let d = du; d <= au; d = plusJours(d, 1)) await Clients.poserDate(d, []);
      onFait();
    } catch (e) { setRefus(messageDe(e)); setEnCours(false); }
  };

  return (
    <Fenetre ouverte titre="Fermer des jours" onFermer={() => { if (!enCours) onFermer(); }}
      actions={<>
        <Bouton intention="souligne" onClick={onFermer} disabled={enCours}>Ne rien fermer</Bouton>
        <Bouton onClick={() => void fermer()} disabled={!valide || nbJours > 62 || enCours}>
          {enCours ? 'Fermeture…' : nbJours > 1 ? `Fermer ces ${nbJours} jours` : 'Fermer ce jour'}
        </Bouton>
      </>}>
      <div className="flex flex-col gap-4 font-charte text-courant">
        <Secondaire>Aucune réservation ne sera possible sur le site pendant ces jours.</Secondaire>
        <div className="grid grid-cols-2 gap-3">
          <Champ id="fermer-du" label="Du" type="date" value={du} onChange={(e) => { setDu(e.target.value); if (e.target.value > au) setAu(e.target.value); }} autoFocus />
          <Champ id="fermer-au" label="Au" type="date" value={au} min={du} onChange={(e) => setAu(e.target.value)} />
        </div>
        {nbJours > 62 && <p className="text-secondaire text-sens-erreur">× 62 jours au plus à la fois.</p>}
        {prevues && prevues.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-bord pt-3">
            <p className="flex flex-wrap items-center gap-2">
              <Pastille ton="alerte">{prevues.length} séance{prevues.length > 1 ? 's' : ''} déjà prévue{prevues.length > 1 ? 's' : ''}</Pastille>
              <Secondaire>Fermer les jours ne les annule pas.</Secondaire>
            </p>
            {prevues.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-32 flex-none text-secondaire tabular-nums">{enLettres(jourDe(s.debut), JOUR_COURT)}, {heure(s.debut)}</span>
                <span className="min-w-0 flex-1 truncate">{nomComplet(s.personne)}</span>
                <a href={`#agenda/${encodeURIComponent(s.id)}`} className={`text-secondaire text-marque underline underline-offset-[3px] ${FOCUS}`}>Ouvrir</a>
              </div>
            ))}
          </div>
        )}
        {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      </div>
    </Fenetre>
  );
};

// ─── L'écran ────────────────────────────────────────────────────────────────

/**
 * `poser` : l'adresse `#agenda/poser`, où mène le « + » de l'iPhone (refonte,
 * lot 2) — la semaine en cours, la fenêtre déjà ouverte. La fermer rend
 * l'adresse de l'agenda, pour qu'un « retour » ne la rouvre pas.
 */
export const PlanningView: React.FC<{ vue: VuePlanning; date?: string; poser?: boolean }> = ({ vue, date, poser = false }) => {
  const [rdv, setRdv] = useState(poser);
  const [fermer, setFermer] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  useEffect(() => { if (poser) setRdv(true); }, [poser]);
  const fermerRdv = () => { setRdv(false); if (poser) aller('agenda'); };
  const reference = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : aujourdhui();
  const lundi = lundiDe(reference);
  const premier = `${reference.slice(0, 7)}-01`;
  const bornes = useMemo(() => (vue === 'mois' ? grilleDuMois(premier) : { debut: lundi, fin: plusJours(lundi, 6) }), [vue, premier, lundi]);
  const lecture = useLecture(
    () => Promise.all([Clients.seancesDeLaPeriode(bornes.debut, bornes.fin), Clients.disponibilites(bornes.debut, bornes.fin)])
      .then(([s, d]) => ({ seances: s.seances, jours: d.jours })),
    [vue, bornes.debut, bornes.fin],
  );
  const jours = useMemo(() => new Map((lecture.phase === 'prete' ? lecture.donnees.jours : []).map((j) => [j.date, j])), [lecture]);

  const ouvrirJour = async (d: string) => {
    setRefus(null);
    try { await Clients.rendreDateALaSemaine(d); await lecture.recharger(); } catch (e) { setRefus(messageDe(e)); }
  };

  // Passer de la semaine au mois et retour ramène à la MÊME semaine : la
  // semaine quittée est retenue tant que le mois affiché la contient. Sans elle,
  // « le 1er du mois » puis « son lundi » reculaient d'une semaine à chaque aller-retour.
  const semaineQuittee = useRef<string | null>(null);
  const changerVue = (v: VuePlanning) => {
    if (v === 'mois') {
      semaineQuittee.current = lundi;
      // Le mois de la semaine : celui d'aujourd'hui s'il est dedans, sinon celui de son jeudi.
      const auj = aujourdhui();
      const jour = auj >= lundi && auj <= plusJours(lundi, 6) ? auj : plusJours(lundi, 3);
      return aller(`agenda/mois/${jour.slice(0, 7)}-01`);
    }
    const mois = premier.slice(0, 7);
    const retenue = semaineQuittee.current;
    const auj = aujourdhui();
    const cible = retenue && (retenue.slice(0, 7) === mois || plusJours(retenue, 6).slice(0, 7) === mois) ? retenue
      : auj.slice(0, 7) === mois ? lundiDe(auj)
        // Sinon, la première semaine qui commence dans le mois.
        : lundiDe(premier) < premier ? plusJours(lundiDe(premier), 7) : lundiDe(premier);
    return aller(`agenda/semaine/${cible}`);
  };
  const precedent = () => aller(vue === 'mois' ? `agenda/mois/${moisVoisin(premier, -1)}` : `agenda/semaine/${plusJours(lundi, -7)}`);
  const suivant = () => aller(vue === 'mois' ? `agenda/mois/${moisVoisin(premier, 1)}` : `agenda/semaine/${plusJours(lundi, 7)}`);
  const titre = vue === 'mois'
    ? enLettres(premier, MOIS)
    : `Du ${enLettres(lundi, JOUR_MOIS)} au ${enLettres(plusJours(lundi, 6), JOUR_MOIS)}`;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Bouton intention="borde" onClick={() => setFermer(true)}>Fermer des jours…</Bouton>
        <Bouton onClick={() => setRdv(true)}>Poser un rendez-vous</Bouton>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-6">
        <Onglets<VuePlanning> libelle="Vue de l’agenda" actif={vue} onChange={changerVue}
          onglets={[{ id: 'semaine', libelle: 'Semaine' }, { id: 'mois', libelle: 'Mois' }]} />
        {(
          <div className="flex flex-1 items-center gap-2 md:justify-end">
            <span className="mr-auto min-w-0 font-semibold first-letter:uppercase md:mr-2">{titre}</span>
            <Bouton taille="petit" intention="borde" onClick={precedent} aria-label={vue === 'mois' ? 'Mois précédent' : 'Semaine précédente'}>‹</Bouton>
            <Bouton taille="petit" intention="borde" onClick={() => aller(`agenda/${vue}/${vue === 'mois' ? `${aujourdhui().slice(0, 7)}-01` : lundiDe(aujourdhui())}`)}>Aujourd’hui</Bouton>
            <Bouton taille="petit" intention="borde" onClick={suivant} aria-label={vue === 'mois' ? 'Mois suivant' : 'Semaine suivante'}>›</Bouton>
          </div>
        )}
      </div>

      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}

      {lecture.phase !== 'prete' ? <EtatLecture lecture={lecture} /> : (
        <>
          {vue === 'mois'
            ? <Mois premier={premier} debut={bornes.debut} fin={bornes.fin} seances={lecture.donnees.seances} jours={jours} />
            : <Semaine lundi={lundi} seances={lecture.donnees.seances} jours={jours} onOuvrir={(d) => void ouvrirJour(d)} />}
          {vue === 'semaine' && lecture.donnees.seances.length === 0 && <Secondaire>Aucune séance cette semaine.</Secondaire>}
          <Secondaire>« N libres » compte les créneaux de séance encore libres dans vos horaires.</Secondaire>
        </>
      )}

      {rdv && (
        <PoserRendezVous
          date={vue === 'semaine' && lundi > aujourdhui() ? lundi : aujourdhui()}
          onFermer={fermerRdv}
          onPose={(id) => { setRdv(false); aller(`agenda/${encodeURIComponent(id)}`); }}
        />
      )}
      {fermer && <FermerJours onFermer={() => setFermer(false)} onFait={() => { setFermer(false); void lecture.recharger(); }} />}
    </div>
  );
};

export default PlanningView;
