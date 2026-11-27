/**
 * Professionnels (SPEC §15.4) — un espace au premier niveau depuis le
 * 27/11/2026. Un tableau : nom, catégories, ville, téléphone, connu, nombre de
 * personnes reçues. Un filtre de texte, appliqué sur place (la liste est déjà
 * là : aucune requête par frappe). Une fenêtre pour créer et modifier, tous les
 * champs du modèle, courriers compris.
 *
 * C'est aussi un fichier de prospection (inventaire, §4.7) : les courriers
 * envoyés s'y tiennent.
 */
import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Bouton, Carte, Champ, CLASSES_SURTITRE, ecran } from '../ui';
import { ConfirmModal } from '../CommonModals';
import * as Clients from '../../services/clientsService';
import type { Professionnel } from '../../types-clients';
import { FenetreProfessionnel } from './FenetreProfessionnel';
import { Avis, EtatLecture, messageDe, Pastille, useLecture, Vide } from './commun';

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

  if (lecture.phase !== 'prete') return <div className={ecran('liste')}><EtatLecture lecture={lecture} /></div>;

  return (
    <div className={`${ecran('liste')} space-y-4`}>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-brand-main dark:text-dark-text pointer-events-none" />
          <Champ taille="grand" type="search" value={filtre} onChange={(e) => setFiltre((e.target as HTMLInputElement).value)}
            placeholder="Filtrer : nom, ville, catégorie" aria-label="Filtrer les professionnels" className="pl-9" />
        </div>
        <Bouton taille="grand" intention="principale" posee onClick={() => setFenetre({})}><Plus /> Nouveau professionnel</Bouton>
      </div>
      {refus && <Avis ton="erreur">{refus}</Avis>}
      {visibles.length === 0 ? <Vide>{filtre ? 'Aucun professionnel ne répond à ce filtre.' : 'Aucun professionnel pour l’instant.'}</Vide> : (
        <Carte densite="tableau">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-border dark:border-dark-sec-border text-left">
                  {['Nom', 'Catégories', 'Ville', 'Téléphone', 'Connu', 'Reçus', ''].map((t) => <th key={t} className={`px-4 py-2 ${CLASSES_SURTITRE}`}>{t}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border dark:divide-dark-sec-border">
                {visibles.map((p) => (
                  <tr key={p.id} className="hover:bg-survol dark:hover:bg-dark-sec-bg cursor-pointer" onClick={() => setFenetre({ pro: p })}>
                    <td className="px-4 py-2 font-semibold text-brand-main dark:text-white">{p.nom}{p.specialisation && <span className="block text-xs font-normal text-brand-main dark:text-dark-text">{p.specialisation}</span>}</td>
                    <td className="px-4 py-2"><span className="flex flex-wrap gap-1">{p.categories.map((c) => <Pastille key={c} libelle={c} ton="neutre" />)}</span></td>
                    <td className="px-4 py-2 text-brand-main dark:text-dark-text">{p.ville ?? '—'}</td>
                    <td className="px-4 py-2 text-brand-main dark:text-dark-text whitespace-nowrap">{p.telephone ?? '—'}</td>
                    <td className="px-4 py-2">{p.connu ? <Pastille libelle="Connu" ton="succes" /> : <span className="text-brand-main dark:text-dark-text">—</span>}</td>
                    <td className="px-4 py-2 tabular-nums text-brand-main dark:text-white">{p.personnesRecues}</td>
                    <td className="px-4 py-2 text-right">
                      <Bouton taille="petit" intention="discrete" ton="erreur" aria-label={`Retirer ${p.nom}`} onClick={(e) => { e.stopPropagation(); setASupprimer(p); }}><Trash2 /></Bouton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}
      {fenetre && (
        <FenetreProfessionnel pro={fenetre.pro} onFermer={() => setFenetre(null)} onEnregistre={() => { setFenetre(null); void lecture.recharger(); }} />
      )}
      <ConfirmModal
        isOpen={!!aSupprimer}
        onClose={() => setASupprimer(null)}
        onConfirm={() => aSupprimer && void Clients.supprimerProfessionnel(aSupprimer.id).then(() => lecture.recharger()).catch((e) => setRefus(messageDe(e)))}
        title="Retirer ce professionnel ?"
        message="Il disparaît de la liste. Les fiches qui le désignaient gardent leur lien jusqu’à ce que vous le changiez."
        confirmLabel="Retirer"
        isDestructive
      />
    </div>
  );
};

export default ProfessionnelsView;
