/**
 * Professionnels (SPEC §15.4 ; refonte, lot 9 — maquettes Professionnels,
 * Professionnel). Une liste : nom, catégories, ville, téléphone, connu,
 * nombre de personnes reçues. Un filtre de texte, appliqué sur place (la liste
 * est déjà là : aucune requête par frappe). Une fenêtre pour créer et
 * modifier, tous les champs du modèle, courriers compris.
 *
 * C'est aussi un fichier de prospection (inventaire, §4.7) : les courriers
 * envoyés s'y tiennent.
 */
import { Bandeau } from '../charte/bandeau';
import React, { useMemo, useState } from 'react';
import { Bouton, Carte, Champ, Etiquette, Fenetre, Pastille } from '../charte';
import * as Clients from '../../services/clientsService';
import type { Professionnel } from '../../types-clients';
import { FenetreProfessionnel } from './FenetreProfessionnel';
import { EtatLecture, messageDe, useLecture } from './commun';

const sansAccents = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const ProfessionnelsView: React.FC = () => {
  const lecture = useLecture(() => Clients.listeProfessionnels(), []);
  const [filtre, setFiltre] = useState('');
  const [fenetre, setFenetre] = useState<{ pro?: Professionnel } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Professionnel | null>(null);
  const [refus, setRefus] = useState<string | null>(null);

  const visibles = useMemo(() => {
    if (lecture.phase !== 'prete') return [];
    const f = sansAccents(filtre.trim());
    return lecture.donnees.professionnels.filter((p) => !f || sansAccents([p.nom, p.ville, p.specialisation, ...p.categories].filter(Boolean).join(' ')).includes(f));
  }, [lecture, filtre]);

  if (lecture.phase !== 'prete') return <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-8"><EtatLecture lecture={lecture} /></div>;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-5 font-charte text-courant text-texte md:px-8 md:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Champ className="flex-1" label="Filtrer les professionnels" masquerLabel type="search" value={filtre}
          onChange={(e) => setFiltre(e.target.value)} placeholder="Filtrer : nom, ville, catégorie" />
        <Bandeau actions={<Bouton onClick={() => setFenetre({})}>Nouveau professionnel</Bouton>} />
      </div>
      {refus && <p role="alert" className="text-secondaire font-semibold text-sens-erreur">× {refus}</p>}
      {visibles.length === 0 ? <Carte className="px-4 py-4"><p>{filtre ? 'Aucun professionnel ne répond à ce filtre.' : 'Aucun professionnel pour l’instant.'}</p></Carte> : (
        <Carte as="div" className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left">
                {['Nom', 'Catégories', 'Ville', 'Téléphone', 'Connu', 'Reçus', ''].map((t) => <th key={t} className="px-4 py-2"><Etiquette as="span">{t}</Etiquette></th>)}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className="cursor-pointer border-t border-bord hover:bg-survole" onClick={() => setFenetre({ pro: p })}>
                  <td className="px-4 py-2.5">
                    <button type="button" className="text-left font-semibold underline-offset-[3px] hover:underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marque rounded-controle"
                      onClick={(e) => { e.stopPropagation(); setFenetre({ pro: p }); }}>{p.nom}</button>
                    {p.specialisation && <span className="block text-secondaire text-second">{p.specialisation}</span>}
                  </td>
                  <td className="px-4 py-2.5"><span className="flex flex-wrap gap-1">{p.categories.map((c) => <Pastille key={c} signe="">{c}</Pastille>)}</span></td>
                  <td className="px-4 py-2.5 text-second">{p.ville ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-second">{p.telephone ?? '—'}</td>
                  <td className="px-4 py-2.5">{p.connu ? <Pastille ton="succes">Connu</Pastille> : <span className="text-second">—</span>}</td>
                  <td className="px-4 py-2.5 tabular-nums">{p.personnesRecues}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Bouton taille="petit" intention="souligne" aria-label={`Retirer ${p.nom}`} onClick={(e) => { e.stopPropagation(); setASupprimer(p); }}>Retirer</Bouton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Carte>
      )}
      {fenetre && (
        <FenetreProfessionnel pro={fenetre.pro} onFermer={() => setFenetre(null)} onEnregistre={() => { setFenetre(null); void lecture.recharger(); }} />
      )}
      <Fenetre ouverte={!!aSupprimer} titre="Retirer ce professionnel ?" onFermer={() => setASupprimer(null)}
        actions={<>
          <Bouton intention="souligne" onClick={() => setASupprimer(null)}>Garder</Bouton>
          <Bouton onClick={() => { const p = aSupprimer; setASupprimer(null); if (p) void Clients.supprimerProfessionnel(p.id).then(() => lecture.recharger()).catch((e) => setRefus(messageDe(e))); }}>Retirer</Bouton>
        </>}>
        <p>Il disparaît de la liste. Les fiches qui le désignaient gardent leur lien jusqu’à ce que vous le changiez.</p>
      </Fenetre>
    </div>
  );
};

export default ProfessionnelsView;
