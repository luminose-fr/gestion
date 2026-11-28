/**
 * La fenêtre d'un professionnel : créer et modifier, tous les champs du modèle,
 * courriers compris (SPEC §15.4). La Fenêtre de la charte (refonte, lot 9).
 */
import React, { useState } from 'react';
import { Bouton, Champ, Fenetre, ZoneTexte } from '../charte';
import * as Clients from '../../services/clientsService';
import type { ChampsProfessionnel, Professionnel } from '../../types-clients';
import { messageDe } from './commun';

type Saisie = Record<'nom' | 'categories' | 'specialisation' | 'adresse' | 'codePostal' | 'ville' | 'telephone' | 'email' | 'siteWeb' | 'note' | 'courriers', string> & { connu: boolean };

const depuis = (p?: Professionnel): Saisie => ({
  nom: p?.nom ?? '', categories: (p?.categories ?? []).join(', '), specialisation: p?.specialisation ?? '', adresse: p?.adresse ?? '',
  codePostal: p?.codePostal ?? '', ville: p?.ville ?? '', telephone: p?.telephone ?? '', email: p?.email ?? '', siteWeb: p?.siteWeb ?? '',
  note: p?.note ?? '', courriers: (p?.courriers ?? []).join(', '), connu: p?.connu ?? false,
});

/** Une liste saisie « a, b, c » → `['a', 'b', 'c']`. */
const liste = (t: string) => t.split(',').map((x) => x.trim()).filter(Boolean);

const versRoute = (s: Saisie): ChampsProfessionnel & { nom: string } => {
  const texte = (v: string) => (v.trim() ? v.trim() : null);
  return {
    nom: s.nom.trim(), categories: liste(s.categories), specialisation: texte(s.specialisation), adresse: texte(s.adresse),
    codePostal: texte(s.codePostal), ville: texte(s.ville), telephone: texte(s.telephone), email: texte(s.email),
    siteWeb: texte(s.siteWeb), note: texte(s.note), connu: s.connu, courriers: liste(s.courriers),
  };
};

export const FenetreProfessionnel: React.FC<{ pro?: Professionnel; onFermer: () => void; onEnregistre: () => void }> = ({ pro, onFermer, onEnregistre }) => {
  const [s, setS] = useState<Saisie>(depuis(pro));
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const champ = (cle: Exclude<keyof Saisie, 'connu'>, label: string, extra: Record<string, unknown> = {}) => (
    <Champ id={`pro-${cle}`} label={label} value={s[cle]} {...extra}
      onChange={(e) => setS((x) => ({ ...x, [cle]: e.target.value }))} />
  );
  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.nom.trim()) { setRefus('Le nom est obligatoire.'); return; }
    setEnCours(true);
    setRefus(null);
    try {
      if (pro) await Clients.modifierProfessionnel(pro.id, versRoute(s));
      else await Clients.creerProfessionnel(versRoute(s));
      onEnregistre();
    } catch (err) {
      setRefus(messageDe(err));
      setEnCours(false);
    }
  };
  return (
    <Fenetre ouverte titre={pro ? 'Modifier le professionnel' : 'Nouveau professionnel'} onFermer={() => { if (!enCours) onFermer(); }}
      actions={<>
        <Bouton intention="souligne" onClick={onFermer} disabled={enCours}>Annuler</Bouton>
        <Bouton type="submit" form="fenetre-pro" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
      </>}>
      <form id="fenetre-pro" onSubmit={valider} className="flex flex-col gap-3 font-charte text-courant">
        {champ('nom', 'Nom', { autoFocus: true })}
        {champ('categories', 'Catégories', { aide: 'Séparées par des virgules.' })}
        {champ('specialisation', 'Spécialisation')}
        <div className="grid gap-3 sm:grid-cols-2">
          {champ('adresse', 'Adresse')}
          {champ('codePostal', 'Code postal')}
          {champ('ville', 'Ville')}
          {champ('telephone', 'Téléphone', { type: 'tel' })}
          {champ('email', 'E-mail', { type: 'email' })}
          {champ('siteWeb', 'Site web')}
        </div>
        {champ('courriers', 'Courriers envoyés', { aide: 'Séparés par des virgules : « Mai 2025, Décembre 2024 ».' })}
        <ZoneTexte id="pro-note" label="Note" rows={3} value={s.note} onChange={(e) => setS((x) => ({ ...x, note: e.target.value }))} />
        <label className="flex min-h-11 items-center gap-2 md:min-h-10">
          <input type="checkbox" className="size-4 accent-[var(--marque)]" checked={s.connu} onChange={(e) => setS((x) => ({ ...x, connu: e.target.checked }))} /> Connu
        </label>
        {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      </form>
    </Fenetre>
  );
};

export default FenetreProfessionnel;
