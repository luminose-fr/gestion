/**
 * La fenêtre d'un professionnel : créer et modifier, tous les champs du modèle,
 * courriers compris (SPEC §15.4). Une fenêtre, pas une zone de travail : sa
 * largeur est celle d'une modale (DESIGN.md, exceptions).
 */
import React, { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Bouton, Champ, CLASSES_TITRE } from '../ui';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { useModalFocus } from '../hooks/useModalFocus';
import * as Clients from '../../services/clientsService';
import type { ChampsProfessionnel, Professionnel } from '../../types-clients';
import { Avis, messageDe } from './commun';

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
  const modal = useModalFocus(true);
  const titreId = useId();
  useEscapeClose(true, onFermer, enCours);
  const champ = (cle: Exclude<keyof Saisie, 'connu'>, label: string, extra: Record<string, unknown> = {}) => (
    <Champ id={`pro-${cle}`} label={label} value={s[cle]} {...extra}
      onChange={(e) => setS((x) => ({ ...x, [cle]: (e.target as HTMLInputElement).value }))} />
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
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in" onClick={enCours ? undefined : onFermer}>
      <div ref={modal} role="dialog" aria-modal="true" aria-labelledby={titreId} tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="ui-dialog bg-white dark:bg-dark-surface w-full max-w-lg max-h-full overflow-y-auto rounded-xl shadow-lg border border-brand-border dark:border-dark-sec-border p-6">
        <form onSubmit={valider} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <h3 id={titreId} className={CLASSES_TITRE}>{pro ? 'Modifier le professionnel' : 'Nouveau professionnel'}</h3>
            <button type="button" aria-label="Fermer" onClick={onFermer} className="text-brand-main dark:text-dark-text"><X className="size-5" /></button>
          </div>
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
          <Champ multiligne id="pro-note" label="Note" rows={3} value={s.note} onChange={(e) => setS((x) => ({ ...x, note: (e.target as HTMLTextAreaElement).value }))} />
          <label className="flex items-center gap-2 text-sm text-brand-main dark:text-white">
            <input type="checkbox" checked={s.connu} onChange={(e) => setS((x) => ({ ...x, connu: e.target.checked }))} /> Connu
          </label>
          {refus && <Avis ton="erreur">{refus}</Avis>}
          <div className="flex justify-end gap-3">
            <Bouton type="button" intention="discrete" onClick={onFermer} disabled={enCours}>Annuler</Bouton>
            <Bouton type="submit" intention="principale" posee disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FenetreProfessionnel;
