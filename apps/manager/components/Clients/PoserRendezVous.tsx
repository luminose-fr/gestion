/**
 * Poser un rendez-vous — une fenêtre (SPEC §15.4). La personne (déjà choisie
 * depuis une fiche ; sinon la recherche des fiches), le type, la date, l'heure,
 * et — repliés — la durée, le mode, le montant. Sous la date, les séances déjà
 * prévues ce jour-là.
 *
 * Florent passe outre la fenêtre et les horaires, pas l'agenda : un
 * chevauchement est refusé par la route, et son message s'affiche tel quel. La
 * fenêtre rappelle que rien n'est écrit dans l'agenda Google et qu'aucun message
 * ne part.
 */
import React, { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { Bouton, Champ, Etiquette, CLASSES_TITRE } from '../ui';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { useModalFocus } from '../hooks/useModalFocus';
import * as Clients from '../../services/clientsService';
import type { ModeSeance, Seance, TypeReservation } from '../../types-clients';
import { aujourdhui, Avis, centimesDepuis, CLASSES_SELECT, heure, isoDepuis, messageDe, MODES, nomComplet, PastilleStatut } from './commun';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

export const PoserRendezVous: React.FC<{
  fiche?: FicheChoisie;
  /** La date proposée à l'ouverture, `AAAA-MM-JJ` : celle du jour affiché dans le planning. */
  date?: string;
  onFermer: () => void;
  onPose: (seanceId: string) => void;
}> = ({ fiche, date: dateInitiale, onFermer, onPose }) => {
  const [personne, setPersonne] = useState<FicheChoisie | null>(fiche ?? null);
  const [types, setTypes] = useState<TypeReservation[]>([]);
  const [typeId, setTypeId] = useState('');
  const [date, setDate] = useState(dateInitiale ?? aujourdhui());
  const [h, setH] = useState('09:30');
  const [duree, setDuree] = useState('');
  const [mode, setMode] = useState<ModeSeance | ''>('');
  const [montant, setMontant] = useState('');
  const [duJour, setDuJour] = useState<Seance[] | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const modal = useModalFocus(true);
  const titreId = useId();
  useEscapeClose(true, onFermer, enCours);

  useEffect(() => {
    Clients.lireReservation()
      .then((r) => {
        const actifs = r.types.filter((t) => t.actif);
        setTypes(actifs);
        setTypeId((v) => v || actifs.find((t) => t.cle === 'seance')?.id || actifs[0]?.id || '');
      })
      .catch((e) => setRefus(messageDe(e)));
  }, []);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setDuJour(null); return; }
    let vivant = true;
    Clients.seancesDeLaPeriode(date, date)
      .then((r) => { if (vivant) setDuJour(r.seances.filter((s) => s.statut === 'prevue')); })
      .catch(() => { if (vivant) setDuJour(null); });
    return () => { vivant = false; };
  }, [date]);

  const type = types.find((t) => t.id === typeId);

  const poser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personne) { setRefus('Choisir la personne.'); return; }
    if (!typeId) { setRefus('Choisir le type de séance.'); return; }
    const centimes = montant.trim() ? centimesDepuis(montant) : undefined;
    if (centimes === null) { setRefus('Le montant ne se lit pas : un nombre, en euros.'); return; }
    setEnCours(true);
    setRefus(null);
    try {
      const { id } = await Clients.poserRendezVous({
        clientId: personne.id, typeSeanceId: typeId, debut: isoDepuis(date, h),
        ...(duree.trim() ? { dureeMin: Number(duree) } : {}),
        ...(mode ? { mode } : {}),
        ...(centimes !== undefined ? { montantCentimes: centimes } : {}),
      });
      onPose(id);
    } catch (err) {
      // « Ce créneau chevauche un autre rendez-vous. » : la saisie reste, l'heure se change.
      setRefus(messageDe(err));
      setEnCours(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" onClick={enCours ? undefined : onFermer}>
      <div
        ref={modal}
        role="dialog" aria-modal="true" aria-labelledby={titreId} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="ui-dialog bg-white dark:bg-dark-surface w-full max-w-lg max-h-full overflow-y-auto rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-6"
      >
      <form onSubmit={poser} className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 id={titreId} className={CLASSES_TITRE}>Poser un rendez-vous</h3>
          <button type="button" aria-label="Fermer" onClick={onFermer} className="text-brand-main dark:text-dark-text"><X className="size-5" /></button>
        </div>

        {fiche ? (
          <p className="text-sm text-brand-main dark:text-white"><Etiquette as="span">Personne</Etiquette> {nomComplet(fiche)}</p>
        ) : (
          <ChoixFiche id="rdv-personne" label="Personne" valeur={personne} onChange={setPersonne} autoFocus />
        )}

        <div>
          <Etiquette as="label" htmlFor="rdv-type" className="mb-1">Type</Etiquette>
          <select id="rdv-type" className={CLASSES_SELECT} value={typeId} onChange={(e) => setTypeId(e.target.value)} autoFocus={!!fiche}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.libelle} — {t.dureeMin} min</option>)}
          </select>
        </div>

        <div className="grid gap-3 grid-cols-2">
          <Champ id="rdv-date" label="Date" type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} required />
          <Champ id="rdv-heure" label="Heure" type="time" step={300} value={h} onChange={(e) => setH((e.target as HTMLInputElement).value)} required />
        </div>

        <div>
          <Etiquette className="mb-1">Déjà prévu ce jour-là</Etiquette>
          {duJour === null ? <p className="text-xs text-brand-main dark:text-dark-text">—</p>
            : duJour.length === 0 ? <p className="text-xs text-brand-main dark:text-dark-text">Rien.</p> : (
              <ul className="space-y-1">
                {duJour.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs text-brand-main dark:text-dark-text">
                    <span className="font-semibold tabular-nums">{heure(s.debut)}–{heure(s.occupeJusqua)}</span>
                    <span className="truncate">{nomComplet(s.personne)} · {s.type?.libelle ?? s.libelleImporte ?? 'Type inconnu'}</span>
                    <PastilleStatut statut={s.statut} />
                  </li>
                ))}
              </ul>
            )}
        </div>

        <details className="rounded-lg border border-brand-border dark:border-dark-sec-border px-3 py-2">
          <summary className="text-sm font-semibold text-brand-main dark:text-white cursor-pointer">Durée, mode, montant</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Champ id="rdv-duree" label="Durée (min)" type="number" min={5} value={duree} placeholder={type ? String(type.dureeMin) : ''} onChange={(e) => setDuree((e.target as HTMLInputElement).value)} />
            <div>
              <Etiquette as="label" htmlFor="rdv-mode" className="mb-1">Mode</Etiquette>
              <select id="rdv-mode" className={CLASSES_SELECT} value={mode} onChange={(e) => setMode(e.target.value as ModeSeance | '')}>
                <option value="">Selon le type</option>
                {(Object.keys(MODES) as ModeSeance[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
              </select>
            </div>
            <Champ id="rdv-montant" label="Montant (€)" inputMode="decimal" value={montant} placeholder={type ? String(type.montantCentimes / 100) : ''} onChange={(e) => setMontant((e.target as HTMLInputElement).value)} />
          </div>
        </details>

        <p className="text-xs text-brand-main dark:text-dark-text">
          Ce rendez-vous n’est pas écrit dans l’agenda Google, et aucun message ne part.
        </p>

        {refus && <Avis ton="erreur">{refus}</Avis>}

        <div className="flex justify-end gap-3">
          <Bouton type="button" intention="discrete" onClick={onFermer} disabled={enCours}>Annuler</Bouton>
          <Bouton type="submit" intention="principale" posee disabled={enCours}>{enCours ? 'Pose…' : 'Poser le rendez-vous'}</Bouton>
        </div>
      </form>
      </div>
    </div>
  );
};

export default PoserRendezVous;
