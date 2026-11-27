/**
 * Les champs d'une fiche, partagés par la nouvelle fiche et les cartes d'une
 * fiche ouverte. La liste est celle que la route accepte (§15.3), et rien
 * d'autre : ni la clé, ni le nom de recherche, ni un identifiant de paiement.
 */
import React from 'react';
import { Champ, Etiquette } from '../ui';
import { CLASSES_SELECT, ORIGINES } from './commun';

/** Ce qu'un formulaire de fiche tient en mémoire : des textes, comme les champs. */
export type SaisieFiche = {
  civilite: string; prenom: string; nom: string; email: string; telephone: string; dateNaissance: string;
  profession: string; adresse: string; codePostal: string; ville: string; pays: string;
  origine: string; motCleGoogleAds: string;
};

export const SAISIE_VIDE: SaisieFiche = {
  civilite: '', prenom: '', nom: '', email: '', telephone: '', dateNaissance: '', profession: '',
  adresse: '', codePostal: '', ville: '', pays: '', origine: '', motCleGoogleAds: '',
};

/** Ce que la route reçoit : un champ vide devient `null`, le prénom reste tel quel. */
export const versRoute = (s: Partial<SaisieFiche>) =>
  Object.fromEntries(Object.entries(s).map(([cle, v]) => [cle, cle === 'prenom' ? (v ?? '').trim() : (v ?? '').trim() || null]));

type Proprietes = {
  saisie: SaisieFiche;
  changer: (champ: keyof SaisieFiche, valeur: string) => void;
  /** Le préfixe des `id`, pour qu'une étiquette désigne son champ même si deux formulaires coexistent. */
  prefixe: string;
};

const ChampTexte: React.FC<Proprietes & { champ: keyof SaisieFiche; label: string; type?: string; autoFocus?: boolean; autoComplete?: string; list?: string }> = ({
  saisie, changer, prefixe, champ, label, type = 'text', autoFocus, autoComplete, list,
}) => (
  <Champ
    id={`${prefixe}-${champ}`}
    label={label}
    type={type}
    value={saisie[champ]}
    autoFocus={autoFocus}
    autoComplete={autoComplete}
    list={list}
    onChange={(e) => changer(champ, (e.target as HTMLInputElement).value)}
  />
);

/** Prénom, nom, e-mail, téléphone : ce qu'on saisit d'abord, pendant l'entretien. */
export const ChampsEssentiels: React.FC<Proprietes & { focus?: boolean }> = (p) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <ChampTexte {...p} champ="prenom" label="Prénom" autoFocus={p.focus} autoComplete="off" />
    <ChampTexte {...p} champ="nom" label="Nom" autoComplete="off" />
    <ChampTexte {...p} champ="email" label="E-mail" type="email" autoComplete="off" />
    <ChampTexte {...p} champ="telephone" label="Téléphone" type="tel" autoComplete="off" />
  </div>
);

export const ChampCivilite: React.FC<Proprietes> = ({ saisie, changer, prefixe }) => (
  <div>
    <Etiquette as="label" htmlFor={`${prefixe}-civilite`} className="mb-1">Civilité</Etiquette>
    <select id={`${prefixe}-civilite`} className={CLASSES_SELECT} value={saisie.civilite} onChange={(e) => changer('civilite', e.target.value)}>
      <option value="">—</option>
      <option value="Mme">Mme</option>
      <option value="M.">M.</option>
    </select>
  </div>
);

/** Civilité, naissance, profession, adresse. */
export const ChampsCoordonnees: React.FC<Proprietes> = (p) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <ChampCivilite {...p} />
    <ChampTexte {...p} champ="dateNaissance" label="Date de naissance" type="date" />
    <ChampTexte {...p} champ="profession" label="Profession" />
    <ChampTexte {...p} champ="adresse" label="Adresse" />
    <ChampTexte {...p} champ="codePostal" label="Code postal" />
    <ChampTexte {...p} champ="ville" label="Ville" />
    <ChampTexte {...p} champ="pays" label="Pays (code, ex. FR)" />
  </div>
);

/** L'origine : une liste de suggestions, et la saisie libre (brief C2, règle 7). */
export const ChampsProvenance: React.FC<Proprietes> = (p) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <ChampTexte {...p} champ="origine" label="Origine" list={`${p.prefixe}-origines`} />
    <datalist id={`${p.prefixe}-origines`}>
      {ORIGINES.map((o) => <option key={o} value={o} />)}
    </datalist>
    <ChampTexte {...p} champ="motCleGoogleAds" label="Mot-clé Google Ads" />
  </div>
);

export const ChoixProfessionnel: React.FC<{
  id: string; valeur: string; onChange: (id: string) => void; professionnels: { id: string; nom: string }[];
}> = ({ id, valeur, onChange, professionnels }) => (
  <div>
    <Etiquette as="label" htmlFor={id} className="mb-1">Venu par un professionnel</Etiquette>
    <select id={id} className={CLASSES_SELECT} value={valeur} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {professionnels.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
    </select>
  </div>
);
