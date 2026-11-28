/**
 * La page « Composants » (`#composants`) : la planche de la charte, calquée
 * sur `docs/refonte/maquettes/Composants.dc.html`. Elle sert à recetter le
 * lot 1 — chaque composant dans ses états, dans les deux thèmes — avant
 * qu'aucun écran ne s'en serve. Elle ne lit aucune donnée.
 */
import React, { useState } from 'react';
import {
  Bouton, Carte, Champ, Etiquette, Fenetre, LigneCarte, Onglets, Pastille, Repliable,
  Secondaire, TemoinEnregistrement, TitreCarte, TitreEcran, ZoneTexte, lireTheme, poserTheme, type Theme,
} from './index';

const Bloc: React.FC<{ titre: string; note?: string; children: React.ReactNode }> = ({ titre, note, children }) => (
  <Carte className="p-5">
    <TitreCarte>{titre}</TitreCarte>
    <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>
    {note && <Secondaire className="mt-4 max-w-[68ch]">{note}</Secondaire>}
  </Carte>
);

export const PageComposants: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(lireTheme);
  const [vue, setVue] = useState<'avant' | 'entretien' | 'apres'>('avant');
  const [fenetre, setFenetre] = useState(false);
  const changerTheme = (t: Theme) => { poserTheme(t); setTheme(t); };

  return (
    <div className="min-h-screen bg-fond font-charte text-courant text-texte tabular-nums">
      <div className="mx-auto max-w-[960px] space-y-6 px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Etiquette>Charte de la console · lot 1</Etiquette>
            <TitreEcran className="mt-1">Composants</TitreEcran>
            <Secondaire className="mt-2">Tout ce qui se répète dans la console. Trois hauteurs, trois intentions, trois couleurs de sens, deux ombres.</Secondaire>
          </div>
          <div role="radiogroup" aria-label="Thème" className="flex gap-1">
            {(['systeme', 'clair', 'sombre'] as Theme[]).map((t) => (
              <Bouton key={t} role="radio" aria-checked={theme === t} intention={theme === t ? 'plein' : 'borde'} onClick={() => changerTheme(t)}>
                {t === 'systeme' ? 'Système' : t === 'clair' ? 'Clair' : 'Sombre'}
              </Bouton>
            ))}
          </div>
        </header>

        <Bloc titre="Boutons · trois intentions" note="Pleine : l’action principale, une par écran. Bordée : secondaire. Soulignée : discrète. Grisé : toujours accompagné de sa raison (« Complet : 12 inscrits sur 12 »).">
          <Bouton>Poser un rendez-vous</Bouton>
          <Bouton intention="borde">Déplacer</Bouton>
          <Bouton intention="souligne">Annuler la séance</Bouton>
          <span className="inline-flex items-center gap-2">
            <Bouton disabled>Inscrire une personne</Bouton>
            <Secondaire>Complet : 12 inscrits sur 12</Secondaire>
          </span>
        </Bloc>

        <Bloc titre="Boutons · trois hauteurs" note="Rayon de 8 px partout, jamais de bouton rond. Le focus se voit : contour de 2 px, décalé de 2 px. Sur l’iPhone, un bouton normal passe à 44 px.">
          <Bouton taille="tactile">44 · iPhone</Bouton>
          <Bouton>40 · Mac</Bouton>
          <Bouton taille="petit" intention="borde">32 · dans une ligne</Bouton>
        </Bloc>

        <Carte className="p-5">
          <TitreCarte>Champs</TitreCarte>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Champ label="Nom" placeholder="Camille Martin" />
            <Champ label="E-mail" defaultValue="camille@" erreur="Il manque la fin de l’adresse." />
            <Champ label="Montant" defaultValue="80 €" aide="Le tarif de la séance, modifiable pour celle-ci." />
            <ZoneTexte label="Notes de l’entretien" placeholder="Ce qui s’est dit…" />
          </div>
          <Secondaire className="mt-4">16 px sur l’iPhone : en dessous, Safari agrandit la page au focus.</Secondaire>
        </Carte>

        <Bloc titre="Pastilles · un signe et un libellé, jamais la couleur seule">
          <Pastille>Prévue</Pastille>
          <Pastille ton="succes">Réalisée</Pastille>
          <Pastille ton="erreur">Annulée</Pastille>
          <Pastille signe="–">Absente</Pastille>
          <Pastille ton="alerte">Restée « prévue »</Pastille>
          <Pastille ton="succes">Payé</Pastille>
          <Pastille ton="alerte">À encaisser</Pastille>
          <Pastille signe="">Offert</Pastille>
          <Pastille ton="alerte">Non relu</Pastille>
          <Pastille ton="succes">Relu</Pastille>
        </Bloc>

        <section aria-label="Carte et lignes">
          <Etiquette as="h2" className="mb-2">À traiter · le geste, l’objet, l’échéance</Etiquette>
          <Carte as="div">
            <LigneCarte href="#composants" onClick={(e) => e.preventDefault()}>
              <span className="flex-1 py-2"><span className="font-semibold">Relire le questionnaire</span> <span className="text-second">Camille Martin</span></span>
              <span className="text-secondaire text-second">séance demain 9 h</span><span aria-hidden="true" className="text-second">›</span>
            </LigneCarte>
            <LigneCarte href="#composants" onClick={(e) => e.preventDefault()}>
              <span className="flex-1 py-2"><span className="font-semibold">Encaisser</span> <span className="text-second">Camille Martin</span></span>
              <span className="text-secondaire text-second">depuis 9 jours</span><span aria-hidden="true" className="text-second">›</span>
            </LigneCarte>
          </Carte>
        </section>

        <Carte className="p-5">
          <TitreCarte>Onglets · jusqu’à quatre vues</TitreCarte>
          <div className="mt-3">
            <Onglets
              libelle="Moments de la séance"
              actif={vue}
              onChange={setVue}
              onglets={[{ id: 'avant', libelle: 'Avant' }, { id: 'entretien', libelle: 'Entretien' }, { id: 'apres', libelle: 'Après', compte: 2 }]}
            />
            <Secondaire className="mt-3">Vue : {vue}. Les flèches, Début et Fin passent d’un onglet à l’autre.</Secondaire>
          </div>
        </Carte>

        <Carte className="p-5">
          <Repliable titre="Durée, mode et montant" resume="1 h 30 · en séance · 80 €">
            <Secondaire>Ce qui sert rarement est replié, et dit en une ligne ce qu’il contient.</Secondaire>
          </Repliable>
        </Carte>

        <Bloc titre="Fenêtre et enregistrement">
          <Bouton intention="borde" onClick={() => setFenetre(true)}>Ouvrir une fenêtre</Bouton>
          <TemoinEnregistrement etat="enregistre" />
          <TemoinEnregistrement etat="en_attente" />
          <TemoinEnregistrement etat="echec" detail="nouvel essai dans 10 s" />
        </Bloc>

        <Fenetre
          ouverte={fenetre}
          titre="Déplacer la séance"
          onFermer={() => setFenetre(false)}
          actions={<><Bouton intention="souligne" onClick={() => setFenetre(false)}>Garder l’horaire</Bouton><Bouton onClick={() => setFenetre(false)}>Déplacer au jeudi 9 h</Bouton></>}
        >
          <Secondaire>Échap ferme la fenêtre ; le focus y reste tant qu’elle est ouverte.</Secondaire>
          <Champ className="mt-4" label="Nouvel horaire" defaultValue="jeudi 3 décembre, 9 h" />
        </Fenetre>
      </div>
    </div>
  );
};

export default PageComposants;
