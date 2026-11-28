/**
 * Le vocabulaire de l'espace Réglages, partagé par le rail, les onglets
 * mobiles et l'écran lui-même — pour qu'une section ajoutée le soit à un
 * seul endroit.
 */
import { Cpu, Crosshair, KeyRound, Download, Gauge, Cloud, CalendarClock, CalendarCheck, SunMoon, DoorOpen, Clock, ListChecks, Database } from 'lucide-react';
import type { AIModel } from '../../types';
import type { ProviderKeyState } from '../../services/apiService';

export type SettingsSection =
    | 'reception' | 'types' | 'horaires' | 'regles' | 'agenda'
    | 'models' | 'presets' | 'mesures' | 'providers' | 'personas'
    | 'etat' | 'quotas' | 'backup'
    | 'apparence';

/**
 * Trois groupes, et un dernier pour la console (refonte, lot 9 —
 * docs/refonte/01, §3, « Réglages ») : la pratique d'abord, puis la rédaction
 * IA, puis les données. Les anciennes adresses (`reservation`) sont reprises
 * par `sectionDAvant`.
 */
export const SETTINGS_SECTIONS: Array<{
    id: SettingsSection;
    label: string;
    groupe: 'Pratique' | 'Rédaction IA' | 'Données et fonctionnement' | 'Console';
    /** Ce que la section donne à voir, sous le titre de l'écran. */
    sousTitre: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'reception', groupe: 'Pratique', label: 'Réception du site',     sousTitre: 'Ouverte ou coupée, ce qui a été reçu, les limites de sécurité', icon: DoorOpen },
    { id: 'types',     groupe: 'Pratique', label: 'Types de rendez-vous',  sousTitre: 'Durée, marge, montant, fenêtre, en ligne ou non', icon: CalendarClock },
    { id: 'horaires',  groupe: 'Pratique', label: 'Horaires habituels',    sousTitre: 'La semaine type, et les dates d’exception à venir', icon: Clock },
    { id: 'regles',    groupe: 'Pratique', label: 'Règles',                sousTitre: 'Rappels, retenue d’une place, liste d’attente', icon: ListChecks },
    { id: 'agenda',    groupe: 'Pratique', label: 'Agenda Google',         sousTitre: 'Ce que la réservation lit et écrit dans votre agenda', icon: CalendarCheck },
    { id: 'models',    groupe: 'Rédaction IA', label: 'Modèles',            sousTitre: 'Le catalogue, rangé par adaptateur',     icon: Cpu },
    { id: 'presets',   groupe: 'Rédaction IA', label: 'Modèle par usage',   sousTitre: 'Quel modèle sert quel travail',          icon: Crosshair },
    { id: 'mesures',   groupe: 'Rédaction IA', label: 'Coûts et durées',    sousTitre: 'Ce que chaque action consomme, et en combien de temps', icon: Gauge },
    { id: 'providers', groupe: 'Rédaction IA', label: 'Clés des fournisseurs', sousTitre: 'Écriture seule — rien ne revient',     icon: KeyRound },
    { id: 'etat',      groupe: 'Données et fonctionnement', label: 'État',   sousTitre: 'La base des clients, reliée ou non', icon: Database },
    { id: 'quotas',    groupe: 'Données et fonctionnement', label: 'Hébergement', sousTitre: 'La consommation du jour, face au plan gratuit', icon: Cloud },
    { id: 'backup',    groupe: 'Données et fonctionnement', label: 'Export éditorial', sousTitre: 'Les contenus, les séries, le corpus : un fichier JSON', icon: Download },
    { id: 'apparence', groupe: 'Console', label: 'Apparence',               sousTitre: 'Le thème : celui de l’appareil, clair ou sombre', icon: SunMoon },
];

/**
 * Les adresses d'avant le lot 9 : `#reglages/reservation` mène aux types de
 * rendez-vous. `personas` reste une section que l'écran sait montrer (l'adresse
 * d'avant), mais elle a quitté la liste : les rôles IA vivent dans Corpus → Carte.
 */
export const sectionDAvant = (valeur: string): SettingsSection | null =>
    valeur === 'reservation' ? 'types' : null;

export const isSettingsSection = (value: string): value is SettingsSection =>
    SETTINGS_SECTIONS.some(s => s.id === value);

export const settingsSectionLabel = (section: SettingsSection) =>
    SETTINGS_SECTIONS.find(s => s.id === section)?.label ?? 'Réglages';

export const settingsSectionSousTitre = (section: SettingsSection) =>
    SETTINGS_SECTIONS.find(s => s.id === section)?.sousTitre ?? '';

/**
 * Les modèles rangés sous leur adaptateur.
 *
 * Un même modèle peut être joignable par deux chemins — Claude via 1min.ai et
 * via OpenRouter — avec un code, un prix et une disponibilité différents. Sans
 * ce regroupement, un menu affiche deux lignes identiques et le choix devient
 * un pari (SPEC §5.3).
 *
 * L'ordre suit celui des adaptateurs connus ; un `provider` orphelin (modèle
 * importé, adaptateur retiré) ferme la marche plutôt que de disparaître.
 */
export const grouperParAdaptateur = (
    models: AIModel[],
    providers: ProviderKeyState[]
): Array<{ id: string; label: string; models: AIModel[] }> => {
    const connus = providers.map(p => p.id);
    const presents = Array.from(new Set(models.map(m => m.provider)));
    const orphelins = presents.filter(id => !connus.includes(id));

    return [...connus, ...orphelins].map(id => ({
        id,
        label: providers.find(p => p.id === id)?.label ?? id,
        models: models.filter(m => m.provider === id),
    }));
};
