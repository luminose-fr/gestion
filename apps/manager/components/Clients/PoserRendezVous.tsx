/**
 * Poser ou déplacer un rendez-vous — UNE fenêtre pour les deux (refonte de la
 * console, lot 4 ; maquettes RendezVous, RendezVousDeplacer, TelRendezVous).
 *
 * Poser : la personne (déjà choisie depuis une fiche, sinon la recherche des
 * fiches), le type, la date, l'heure, et — repliés — la durée, le mode, le
 * montant. Déplacer : la personne et le type sont ceux de la séance ; seuls la
 * date et l'heure changent, et la révision lue part avec la demande.
 *
 * Sous la date, ce qui occupe déjà ce jour-là. Florent passe outre la fenêtre
 * et les horaires, pas l'agenda : un chevauchement est refusé par la route,
 * qui dit avec qui, et la saisie reste pour changer l'heure.
 */
import { duree as dureeEnClair, montant as montantEnClair } from '../../lib/format';
import React, { useEffect, useState } from 'react';
import { Bouton, Champ, Choix, Fenetre, Pastille, Repliable, Secondaire } from '../charte';
import * as Clients from '../../services/clientsService';
import type { ModeSeance, Seance, TypeReservation } from '../../types-clients';
import { aujourdhui, centimesDepuis, heure, isoDepuis, jourDe, messageDe, MODES, nomComplet, STATUTS } from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

/** Ce que « Déplacer » sait de la séance : de quoi la refaire ailleurs, et sa révision. */
export type SeanceADeplacer = Pick<Seance, 'id' | 'debut' | 'revision' | 'dureeMin' | 'type' | 'libelleImporte' | 'personne'>;

export const PoserRendezVous: React.FC<{
  fiche?: FicheChoisie;
  /** La date proposée à l'ouverture, `AAAA-MM-JJ`. */
  date?: string;
  /** L'heure proposée, `HH:MM` (« Poser le suivant » : la même heure). */
  heureInitiale?: string;
  /** Le type proposé (« Poser le suivant » : le même type). */
  typeInitial?: string;
  /** Présent : la fenêtre déplace cette séance au lieu d'en poser une. */
  deplacer?: SeanceADeplacer;
  onFermer: () => void;
  onPose: (seanceId: string) => void;
}> = ({ fiche, date: dateInitiale, heureInitiale, typeInitial, deplacer, onFermer, onPose }) => {
  const [personne, setPersonne] = useState<FicheChoisie | null>(fiche ?? null);
  const [types, setTypes] = useState<TypeReservation[]>([]);
  const [typeId, setTypeId] = useState(typeInitial ?? '');
  const [date, setDate] = useState(deplacer ? jourDe(deplacer.debut) : dateInitiale ?? aujourdhui());
  const [h, setH] = useState(deplacer ? heure(deplacer.debut) : heureInitiale ?? '09:30');
  const [duree, setDuree] = useState('');
  const [mode, setMode] = useState<ModeSeance | ''>('');
  const [montant, setMontant] = useState('');
  const [duJour, setDuJour] = useState<Seance[] | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

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

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setDuJour(null); return; }
    let vivant = true;
    Clients.seancesDeLaPeriode(date, date)
      .then((r) => { if (vivant) setDuJour(r.seances.filter((s) => s.statut === 'prevue' && s.id !== deplacer?.id)); })
      .catch(() => { if (vivant) setDuJour(null); });
    return () => { vivant = false; };
  }, [date, deplacer?.id]);

  const type = types.find((t) => t.id === typeId);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefus(null);
    if (deplacer) {
      setEnCours(true);
      try {
        await Clients.deplacerSeance(deplacer.id, isoDepuis(date, h), deplacer.revision);
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
        clientId: personne.id, typeSeanceId: typeId, debut: isoDepuis(date, h),
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

  const resumeRepli = [
    duree ? dureeEnClair(Number(duree)) : type ? dureeEnClair(type.dureeMin) : null,
    mode ? MODES[mode].toLowerCase() : 'mode du type',
    montant ? `${montant} €` : type ? montantEnClair(type.montantCentimes) : null,
  ].filter(Boolean).join(' · ');

  return (
    <Fenetre
      ouverte
      titre={deplacer ? 'Déplacer le rendez-vous' : 'Poser un rendez-vous'}
      onFermer={() => { if (!enCours) onFermer(); }}
      actions={<>
        <Bouton intention="souligne" onClick={onFermer} disabled={enCours}>Annuler</Bouton>
        <Bouton type="submit" form="fenetre-rdv" disabled={enCours}>
          {enCours ? (deplacer ? 'Déplacement…' : 'Pose…') : deplacer ? 'Déplacer le rendez-vous' : 'Poser le rendez-vous'}
        </Bouton>
      </>}
    >
      <form id="fenetre-rdv" onSubmit={valider} className="flex flex-col gap-4 font-charte text-courant">
        {deplacer ? (
          <p><span className="font-semibold">{nomComplet(deplacer.personne)}</span> · {deplacer.type?.libelle ?? deplacer.libelleImporte ?? 'Type inconnu'}, {dureeEnClair(deplacer.dureeMin)}</p>
        ) : fiche ? (
          <p><span className="text-second">Personne : </span><span className="font-semibold">{nomComplet(fiche)}</span></p>
        ) : (
          <ChoixFiche id="rdv-personne" label="Personne" valeur={personne} onChange={setPersonne} autoFocus />
        )}

        {!deplacer && (
          <Choix id="rdv-type" label="Type" value={typeId} onChange={(e) => setTypeId(e.target.value)} autoFocus={!!fiche}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle} · {dureeEnClair(t.dureeMin)} · {montantEnClair(t.montantCentimes)}</option>)}
          </Choix>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Champ id="rdv-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus={!!deplacer} />
          <Champ id="rdv-heure" label="Heure" type="time" step={300} value={h} onChange={(e) => setH(e.target.value)} required />
        </div>

        <div>
          <p className="mb-1 text-secondaire font-semibold">Déjà prévu ce jour-là</p>
          {duJour === null ? <Secondaire>—</Secondaire>
            : duJour.length === 0 ? <Secondaire>Rien : la journée est libre.</Secondaire> : (
              <ul className="flex flex-col gap-1">
                {duJour.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-secondaire">
                    <span className="font-semibold tabular-nums">{heure(s.debut)}–{heure(s.occupeJusqua)}</span>
                    <span className="min-w-0 flex-1 truncate">{nomComplet(s.personne)} · {s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}</span>
                    <Pastille>{STATUTS[s.statut].libelle}</Pastille>
                  </li>
                ))}
              </ul>
            )}
        </div>

        {!deplacer && (
          <Repliable titre="Durée, mode et montant" resume={resumeRepli}>
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

        <Secondaire>Il s’écrit dans l’agenda Google quand l’agenda est relié ; aucun message ne part.</Secondaire>
        {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      </form>
    </Fenetre>
  );
};

export default PoserRendezVous;
