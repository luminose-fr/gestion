/**
 * Poser ou déplacer un rendez-vous — UNE fenêtre pour les deux (refonte de la
 * console, lot 4 ; retours du 28/11/2026, §5 — maquettes RendezVous,
 * RendezVousDeplacer, TelRendezVous).
 *
 * Le même choix de créneau que la page de réservation du site, pour que
 * Florent retrouve le geste qu'il connaît : à gauche le mois, les jours qui
 * ont des heures libres sur un rond teinté ; à droite le jour choisi et ses
 * heures, une par ligne ; choisir une heure fait apparaître « Poser à cette
 * heure » (ou « Déplacer ici »). Les heures viennent du calcul du site
 * (`GET /api/seances/creneaux`), sans sa fenêtre de réservation en ligne.
 *
 * « Autre heure… » pose hors des créneaux : Florent passe outre les horaires,
 * pas l'agenda — un chevauchement est refusé par la route, qui dit avec qui.
 * Sur l'iPhone, comme sur le site : le calendrier, puis le jour choisi avec
 * « ‹ Autre jour ».
 */
import { duree as dureeEnClair, heureCreneau, montant as montantEnClair } from '../../lib/format';
import React, { useEffect, useMemo, useState } from 'react';
import { Bouton, Champ, Choix, Etiquette, FOCUS, Fenetre, Pastille, Repliable, Secondaire } from '../charte';
import * as Clients from '../../services/clientsService';
import type { ModeSeance, Seance, TypeReservation } from '../../types-clients';
import { aujourdhui, centimesDepuis, heure, isoDepuis, jourDe, jourEnLettres, messageDe, MODES, nomComplet, STATUTS } from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Ce que « Déplacer » sait de la séance : de quoi la refaire ailleurs, et sa révision. */
export type SeanceADeplacer = Pick<Seance, 'id' | 'debut' | 'revision' | 'dureeMin' | 'type' | 'libelleImporte' | 'personne'>;

const JOURS_SEMAINE = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `AAAA-MM` → le premier et le dernier jour, et les cases du mois, lundi en tête (null : avant le 1er). */
const moisDe = (mois: string) => {
  const [a, m] = mois.split('-').map(Number);
  const premier = new Date(Date.UTC(a, m - 1, 1));
  const nb = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const decalage = (premier.getUTCDay() + 6) % 7;
  const jour = (d: number) => `${mois}-${String(d).padStart(2, '0')}`;
  return {
    du: jour(1), au: jour(nb), libelle: MOIS.format(premier),
    cases: [...Array<null>(decalage).fill(null), ...Array.from({ length: nb }, (_, i) => jour(i + 1))],
  };
};
const moisVoisin = (mois: string, pas: number) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + pas, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const enLettres = (date: string) => jourEnLettres(`${date}T12:00:00+01:00`);

export const PoserRendezVous: React.FC<{
  fiche?: FicheChoisie;
  /** Le jour proposé à l'ouverture, `AAAA-MM-JJ` (« Poser le suivant » : sept jours plus tard). */
  date?: string;
  /** L'heure présélectionnée, `HH:MM` (« Poser le suivant » : la même heure). */
  heureInitiale?: string;
  /** Le type proposé (« Poser le suivant » : le même type). */
  typeInitial?: string;
  /** Présent : la fenêtre déplace cette séance au lieu d'en poser une. */
  deplacer?: SeanceADeplacer;
  onFermer: () => void;
  onPose: (seanceId: string) => void;
}> = ({ fiche, date: dateInitiale, heureInitiale, typeInitial, deplacer, onFermer, onPose }) => {
  const depart = deplacer ? jourDe(deplacer.debut) : dateInitiale ?? aujourdhui();
  const [personne, setPersonne] = useState<FicheChoisie | null>(fiche ?? null);
  const [types, setTypes] = useState<TypeReservation[]>([]);
  const [typeId, setTypeId] = useState(deplacer ? deplacer.type?.id ?? '' : typeInitial ?? '');
  const [mois, setMois] = useState(depart.slice(0, 7));
  const [jour, setJour] = useState<string>(depart);
  const [heureChoisie, setHeureChoisie] = useState<string | null>(null);
  const [creneaux, setCreneaux] = useState<string[] | null>(null);
  const [autre, setAutre] = useState(!deplacer?.type && !!deplacer);
  const [autreDate, setAutreDate] = useState(depart);
  const [autreHeure, setAutreHeure] = useState(deplacer ? heure(deplacer.debut) : heureInitiale ?? '09:30');
  const [vueTel, setVueTel] = useState<'calendrier' | 'jour'>('calendrier');
  const [duree, setDuree] = useState('');
  const [mode, setMode] = useState<ModeSeance | ''>('');
  const [montant, setMontant] = useState('');
  const [duJour, setDuJour] = useState<Seance[] | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [premiereLecture, setPremiereLecture] = useState(true);

  useEffect(() => {
    if (deplacer) return;
    Clients.lireReservation()
      .then((r) => {
        const actifs = r.types.filter((t) => t.actif);
        setTypes(actifs);
        setTypeId((v) => v || actifs.find((t) => t.cle === 'seance')?.id || actifs[0]?.id || '');
      })
      .catch((e) => setRefus(messageDe(e)));
  }, [deplacer]);

  // Les heures libres du mois affiché, pour le type choisi.
  const { du, au, cases, libelle } = moisDe(mois);
  useEffect(() => {
    if (!typeId) { setCreneaux([]); return; }
    let vivant = true;
    setCreneaux(null);
    Clients.creneauxLibres(typeId, du, au, deplacer?.id)
      .then((r) => { if (vivant) setCreneaux(r.creneaux); })
      .catch((e) => { if (vivant) { setCreneaux([]); setRefus(messageDe(e)); } });
    return () => { vivant = false; };
  }, [typeId, du, au, deplacer?.id]);

  const parJour = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of creneaux ?? []) { const j = jourDe(c); m.set(j, [...(m.get(j) ?? []), c]); }
    return m;
  }, [creneaux]);

  // À la première lecture : le jour proposé s'il a des heures, sinon le premier qui en a ; l'heure d'avant présélectionnée.
  useEffect(() => {
    if (!creneaux || !premiereLecture) return;
    setPremiereLecture(false);
    const jourLibre = parJour.has(depart) ? depart : [...parJour.keys()].sort().find((j) => j >= depart);
    if (jourLibre) {
      setJour(jourLibre);
      if (heureInitiale && !deplacer) {
        const meme = parJour.get(jourLibre)?.find((c) => heure(c) === heureInitiale);
        if (meme) setHeureChoisie(meme);
      }
    }
  }, [creneaux]);

  // Ce qui occupe déjà le jour choisi.
  const jourVu = autre ? autreDate : jour;
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jourVu)) { setDuJour(null); return; }
    let vivant = true;
    Clients.seancesDeLaPeriode(jourVu, jourVu)
      .then((r) => { if (vivant) setDuJour(r.seances.filter((s) => s.statut === 'prevue' && s.id !== deplacer?.id)); })
      .catch(() => { if (vivant) setDuJour(null); });
    return () => { vivant = false; };
  }, [jourVu, deplacer?.id]);

  const type = types.find((t) => t.id === typeId);
  const heuresDuJour = parJour.get(jour) ?? [];

  const poser = async (debut: string) => {
    setRefus(null);
    if (deplacer) {
      setEnCours(true);
      try {
        await Clients.deplacerSeance(deplacer.id, debut, deplacer.revision);
        onPose(deplacer.id);
      } catch (err) { setRefus(messageDe(err)); setEnCours(false); }
      return;
    }
    if (!personne) { setRefus('Choisir la personne.'); return; }
    if (!typeId) { setRefus('Choisir le type de séance.'); return; }
    const centimes = montant.trim() ? centimesDepuis(montant) : undefined;
    if (centimes === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
    setEnCours(true);
    try {
      const { id } = await Clients.poserRendezVous({
        clientId: personne.id, typeSeanceId: typeId, debut,
        ...(duree.trim() ? { dureeMin: Number(duree) } : {}),
        ...(mode ? { mode } : {}),
        ...(centimes !== undefined ? { montantCentimes: centimes } : {}),
      });
      onPose(id);
    } catch (err) {
      // « Ce créneau chevauche le rendez-vous de … » : la saisie reste, l'heure se change.
      setRefus(messageDe(err));
      setEnCours(false);
    }
  };

  const action = deplacer ? 'Déplacer ici' : 'Poser à cette heure';
  const resumeRepli = [
    duree ? dureeEnClair(Number(duree)) : type ? dureeEnClair(type.dureeMin) : null,
    mode ? MODES[mode].toLowerCase() : 'mode du type',
    montant ? `${montant} €` : type ? montantEnClair(type.montantCentimes) : null,
  ].filter(Boolean).join(' · ');

  return (
    <Fenetre ouverte large
      titre={deplacer ? 'Déplacer le rendez-vous' : 'Poser un rendez-vous'}
      onFermer={() => { if (!enCours) onFermer(); }}
      actions={<Bouton intention="souligne" onClick={onFermer} disabled={enCours}>Annuler</Bouton>}
    >
      <div className="flex flex-col gap-5 font-charte text-courant">
        {deplacer ? (
          <div>
            <p><span className="font-semibold">{nomComplet(deplacer.personne)}</span> · {deplacer.type?.libelle ?? deplacer.libelleImporte ?? 'Type inconnu'}, {dureeEnClair(deplacer.dureeMin)}</p>
            <Secondaire>Actuellement : <span className="first-letter:uppercase">{jourEnLettres(deplacer.debut)}</span>, {heureCreneau(deplacer.debut)}.</Secondaire>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              {fiche
                ? <><span className="mb-1 block text-secondaire font-medium text-second">Personne</span><p className="flex h-10 items-center font-semibold">{nomComplet(fiche)}</p></>
                : <ChoixFiche id="rdv-personne" label="Personne" valeur={personne} onChange={setPersonne} autoFocus />}
            </div>
            <Choix id="rdv-type" label="Type" className="min-w-64 flex-1" value={typeId} onChange={(e) => { setTypeId(e.target.value); setHeureChoisie(null); }} autoFocus={!!fiche}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle} · {dureeEnClair(t.dureeMin)} · {montantEnClair(t.montantCentimes)}</option>)}
            </Choix>
          </div>
        )}

        <div className="flex flex-col gap-4 border-t border-bord pt-5 md:flex-row md:items-start">
          {/* Le mois : les jours qui ont des heures libres, sur un rond teinté. */}
          <section aria-label="Calendrier" className={cx('flex-none rounded-carte bg-bas p-4 md:w-[372px]', vueTel === 'jour' && 'hidden md:block')}>
            <div className="flex items-center gap-2 px-1 pb-3">
              <span className="flex-1 font-semibold first-letter:uppercase">{libelle}</span>
              <Bouton taille="petit" intention="borde" aria-label="Mois précédent" className="!w-9 !px-0" onClick={() => setMois(moisVoisin(mois, -1))}>‹</Bouton>
              <Bouton taille="petit" intention="borde" aria-label="Mois suivant" className="!w-9 !px-0" onClick={() => setMois(moisVoisin(mois, 1))}>›</Bouton>
            </div>
            <div role="grid" aria-busy={creneaux === null} className="grid grid-cols-7 gap-y-1 text-center">
              {JOURS_SEMAINE.map((j) => <span key={j} className="pb-1.5 text-secondaire text-second">{j}</span>)}
              {cases.map((d, i) => {
                if (!d) return <span key={`v${i}`} />;
                const libres = parJour.get(d)?.length ?? 0;
                const choisi = d === jour && !autre;
                const n = Number(d.slice(8));
                return (
                  <button key={d} type="button" disabled={!libres} aria-pressed={choisi}
                    aria-label={`${enLettres(d)}${libres ? `, ${libres} heure${libres > 1 ? 's' : ''} libre${libres > 1 ? 's' : ''}` : ', aucune heure libre'}`}
                    onClick={() => { setJour(d); setHeureChoisie(null); setAutre(false); setRefus(null); setVueTel('jour'); }}
                    className={cx('size-[42px] justify-self-center rounded-full tabular-nums', FOCUS,
                      choisi ? 'bg-marque font-semibold text-sur-marque'
                        : libres ? 'bg-doux font-semibold text-marque hover:bg-doux-survol' : 'cursor-default text-second')}>
                    {n}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Le jour choisi et ses heures libres, une par ligne. */}
          <section aria-label="Heures libres" className={cx('min-w-0 flex-1 flex-col gap-2', vueTel === 'calendrier' ? 'hidden md:flex' : 'flex')}>
            <Bouton taille="petit" intention="souligne" className="self-start !px-0 md:hidden" onClick={() => setVueTel('calendrier')}>‹ Autre jour</Bouton>
            {!autre && <>
              <div className="flex items-baseline gap-2">
                <h3 className="flex-1 font-semibold first-letter:uppercase">{enLettres(jour)}</h3>
                <Secondaire>{creneaux === null ? 'Lecture…' : `${heuresDuJour.length} heure${heuresDuJour.length > 1 ? 's' : ''} libre${heuresDuJour.length > 1 ? 's' : ''}`}</Secondaire>
              </div>
              {creneaux !== null && heuresDuJour.length === 0 && <Secondaire>Aucune heure libre ce jour-là.</Secondaire>}
              {heuresDuJour.map((c) => {
                const choisie = c === heureChoisie;
                return (
                  <div key={c} className="flex gap-2">
                    <Bouton intention="borde" aria-pressed={choisie} className="flex-1" onClick={() => { setHeureChoisie(choisie ? null : c); setRefus(null); }}>{heureCreneau(c)}</Bouton>
                    {choisie && <Bouton className="flex-1" disabled={enCours} onClick={() => void poser(c)}>{enCours ? (deplacer ? 'Déplacement…' : 'Pose…') : action}</Bouton>}
                  </div>
                );
              })}
            </>}

            {autre ? (
              <div className="flex flex-col gap-3">
                <p className="font-semibold">Autre heure</p>
                <div className="grid grid-cols-2 gap-3">
                  <Champ id="rdv-date" label="Date" type="date" value={autreDate} onChange={(e) => setAutreDate(e.target.value)} required />
                  <Champ id="rdv-heure" label="Heure" type="time" step={300} value={autreHeure} onChange={(e) => setAutreHeure(e.target.value)} required />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Bouton disabled={enCours || !autreDate || !autreHeure} onClick={() => void poser(isoDepuis(autreDate, autreHeure))}>
                    {enCours ? (deplacer ? 'Déplacement…' : 'Pose…') : deplacer ? 'Déplacer à cette heure' : 'Poser à cette heure'}
                  </Bouton>
                  {(!deplacer || deplacer.type) && <Bouton intention="souligne" onClick={() => { setAutre(false); setRefus(null); }}>Revenir aux heures libres</Bouton>}
                </div>
              </div>
            ) : (
              <Bouton taille="petit" intention="souligne" className="mt-0.5 self-start !px-0" onClick={() => { setAutre(true); setAutreDate(jour); setRefus(null); }}>Autre heure…</Bouton>
            )}

            {refus && <p role="alert" className="rounded-carte border border-sens-erreur bg-sens-erreur-fond px-3 py-2.5 font-medium text-sens-erreur">× {refus}</p>}

            <div className="mt-1.5 flex flex-col gap-1 border-t border-bord pt-2.5">
              <Etiquette as="h3">Déjà prévu ce jour</Etiquette>
              {duJour === null ? <Secondaire>—</Secondaire>
                : duJour.length === 0 ? <Secondaire>Rien : la journée est libre.</Secondaire> : (
                  <ul className="flex flex-col gap-1">
                    {duJour.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-secondaire">
                        <span className="font-semibold tabular-nums text-texte">{heureCreneau(s.debut)} – {heureCreneau(s.occupeJusqua)}</span>
                        <span className="min-w-0 flex-1 truncate text-second">{nomComplet(s.personne)} · {s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}</span>
                        <Pastille>{STATUTS[s.statut].libelle}</Pastille>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>
        </div>

        {!deplacer && (
          <Repliable titre="Durée, lieu et montant" resume={resumeRepli} className="border-t border-bord pt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Champ id="rdv-duree" label="Durée (min)" type="number" min={5} value={duree} placeholder={type ? String(type.dureeMin) : ''} onChange={(e) => setDuree(e.target.value)} />
              <Choix id="rdv-mode" label="Mode" value={mode} onChange={(e) => setMode(e.target.value as ModeSeance | '')}>
                <option value="">Selon le type</option>
                {(Object.keys(MODES) as ModeSeance[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
              </Choix>
              <Champ id="rdv-montant" label="Montant (€)" inputMode="decimal" value={montant} placeholder={type ? String(type.montantCentimes / 100) : ''} onChange={(e) => setMontant(e.target.value)} />
            </div>
          </Repliable>
        )}

        <Secondaire>Il s’écrit dans l’agenda Google quand l’agenda est relié.</Secondaire>
      </div>
    </Fenetre>
  );
};

export default PoserRendezVous;
