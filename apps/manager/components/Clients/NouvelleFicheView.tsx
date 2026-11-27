/**
 * Nouvelle fiche — l'écran de l'entretien de 20 minutes (SPEC §15.4). Il se
 * remplit sans quitter le clavier : prénom, nom, e-mail, téléphone d'abord, le
 * focus sur le premier champ, la tabulation dans l'ordre de lecture. Dès que le
 * prénom, le nom ou l'e-mail sont saisis, les fiches semblables s'affichent :
 * c'est là que se décide de ne pas créer un doublon.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Bouton, Carte, TitreSection, ecran } from '../ui';
import * as Clients from '../../services/clientsService';
import type { FicheSemblable, Professionnel } from '../../types-clients';
import { aller, Avis, messageDe, useGardeSaisie } from './commun';
import { ChampsCoordonnees, ChampsEssentiels, ChampsProvenance, ChoixProfessionnel, SAISIE_VIDE, versRoute, type SaisieFiche } from './champsFiche';
import { ChoixFiche, type FicheChoisie } from './ChoixFiche';

export const NouvelleFicheView: React.FC = () => {
  const [saisie, setSaisie] = useState<SaisieFiche>(SAISIE_VIDE);
  const [viaProfessionnel, setViaProfessionnel] = useState('');
  const [viaClient, setViaClient] = useState<FicheChoisie | null>(null);
  const [professionnels, setProfessionnels] = useState<Pick<Professionnel, 'id' | 'nom'>[]>([]);
  const [semblables, setSemblables] = useState<FicheSemblable[]>([]);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const demande = useRef(0);

  const modifie = Object.values(saisie).some((v) => v.trim() !== '') || !!viaProfessionnel || !!viaClient;
  useGardeSaisie(modifie && !enCours);

  useEffect(() => {
    Clients.listeProfessionnels().then((r) => setProfessionnels(r.professionnels)).catch(() => setProfessionnels([]));
  }, []);

  // Les fiches semblables, pendant la frappe. Une valeur vide ne se compare à rien (§15.3).
  useEffect(() => {
    const { prenom, nom, email } = saisie;
    if (!prenom.trim() && !nom.trim() && !email.trim()) { setSemblables([]); return; }
    const numero = ++demande.current;
    const minuterie = setTimeout(() => {
      Clients.fichesSemblables({ prenom, nom, email })
        .then((r) => { if (numero === demande.current) setSemblables(r.fiches); })
        .catch(() => { if (numero === demande.current) setSemblables([]); });
    }, 300);
    return () => clearTimeout(minuterie);
  }, [saisie.prenom, saisie.nom, saisie.email]);

  const changer = (champ: keyof SaisieFiche, valeur: string) => setSaisie((s) => ({ ...s, [champ]: valeur }));

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saisie.prenom.trim()) { setRefus('Le prénom est obligatoire.'); return; }
    setEnCours(true);
    setRefus(null);
    try {
      const { id } = await Clients.creerFiche({
        ...(versRoute(saisie) as { prenom: string }),
        viaProfessionnelId: viaProfessionnel || null,
        viaClientId: viaClient?.id ?? null,
      });
      aller(`clients/${encodeURIComponent(id)}`);
    } catch (err) {
      // La saisie reste en place : un refus se corrige, il ne se retape pas.
      setRefus(messageDe(err));
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={enregistrer} className={`${ecran('travail')} space-y-4`}>
      <TitreSection
        titre="Nouvelle fiche"
        action={<Bouton type="button" intention="discrete" onClick={() => aller('clients')}><ArrowLeft /> Fiches</Bouton>}
      />

      <Carte densite="contenu" rythme>
        <ChampsEssentiels saisie={saisie} changer={changer} prefixe="nouvelle" focus />
      </Carte>

      {semblables.length > 0 && (
        <Carte densite="contenu" rythme aria-live="polite">
          <TitreSection as="h3" titre="Fiches semblables" sousTitre="Même clé, même adresse, ou même prénom et nom : la personne est peut-être déjà là." />
          <ul className="divide-y divide-brand-border dark:divide-dark-sec-border">
            {semblables.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-brand-main dark:text-white">
                  {f.prenom} {f.nom}{f.ville && <span className="text-xs text-brand-main dark:text-dark-text"> · {f.ville}</span>}
                </span>
                <Bouton type="button" taille="petit" intention="secondaire" onClick={() => aller(`clients/${encodeURIComponent(f.id)}`)}>
                  Ouvrir cette fiche
                </Bouton>
              </li>
            ))}
          </ul>
        </Carte>
      )}

      <Carte densite="contenu" rythme>
        <ChampsCoordonnees saisie={saisie} changer={changer} prefixe="nouvelle" />
        <ChampsProvenance saisie={saisie} changer={changer} prefixe="nouvelle" />
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoixProfessionnel id="nouvelle-via-pro" valeur={viaProfessionnel} onChange={setViaProfessionnel} professionnels={professionnels} />
          <ChoixFiche id="nouvelle-via-client" label="Venu par une personne" valeur={viaClient} onChange={setViaClient} />
        </div>
      </Carte>

      {refus && <Avis ton="erreur">{refus}</Avis>}

      <div className="flex justify-end gap-3">
        <Bouton type="button" intention="discrete" onClick={() => aller('clients')}>Annuler</Bouton>
        <Bouton type="submit" intention="principale" posee disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</Bouton>
      </div>
    </form>
  );
};

export default NouvelleFicheView;
