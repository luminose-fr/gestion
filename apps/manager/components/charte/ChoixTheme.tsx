/**
 * Le thème de la console (04-passation, §3) : il suit l'appareil par défaut,
 * et ce réglage le force — retenu dans ce navigateur, pas dans la base : le
 * Mac et l'iPhone peuvent ne pas vouloir le même.
 */
import React, { useState } from 'react';
import { Carte, Secondaire, TitreCarte, lireTheme, poserTheme, type Theme } from './index';

const CHOIX: { id: Theme; libelle: string }[] = [
  { id: 'systeme', libelle: 'Celui de l’appareil' },
  { id: 'clair', libelle: 'Clair' },
  { id: 'sombre', libelle: 'Sombre' },
];

export const ChoixTheme: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(lireTheme);
  return (
    <Carte className="max-w-[560px] p-5 font-charte">
      <TitreCarte id="titre-theme">Thème</TitreCarte>
      <Secondaire className="mt-1">Retenu dans ce navigateur seulement.</Secondaire>
      <div role="radiogroup" aria-labelledby="titre-theme" className="mt-4 flex flex-col gap-1">
        {CHOIX.map((c) => (
          <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-controle px-2 text-courant text-texte hover:bg-survole md:min-h-10">
            <input type="radio" name="theme" value={c.id} checked={theme === c.id}
              onChange={() => { poserTheme(c.id); setTheme(c.id); }}
              className="size-4 accent-[var(--marque)]" />
            {c.libelle}
          </label>
        ))}
      </div>
    </Carte>
  );
};
