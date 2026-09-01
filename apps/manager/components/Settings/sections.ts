/**
 * Le vocabulaire de l'espace Réglages, partagé par le rail, les onglets
 * mobiles et l'écran lui-même — pour qu'une section ajoutée le soit à un
 * seul endroit.
 */
import { SlidersHorizontal, Cpu, Crosshair, KeyRound, User, Download, Gauge, Cloud } from 'lucide-react';
import type { AIModel } from '../../types';
import type { ProviderKeyState } from '../../services/apiService';

export type SettingsSection =
    | 'display' | 'models' | 'presets' | 'mesures' | 'quotas' | 'providers' | 'personas' | 'backup';

export const SETTINGS_SECTIONS: Array<{
    id: SettingsSection;
    label: string;
    /** Ce que la section donne à voir, sous le titre de l'écran. */
    sousTitre: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { id: 'display',   label: 'Affichage',              sousTitre: 'Ce que montrent les listes de contenus', icon: SlidersHorizontal },
    { id: 'models',    label: 'Modèles IA',             sousTitre: 'Le catalogue, rangé par adaptateur',     icon: Cpu },
    { id: 'presets',   label: 'Modèle par action',      sousTitre: 'Quel modèle sert quelle tâche',          icon: Crosshair },
    { id: 'mesures',   label: 'Mesures',                sousTitre: 'Ce que chaque action consomme, et en combien de temps', icon: Gauge },
    { id: 'quotas',    label: 'Quotas Cloudflare',      sousTitre: 'La consommation du jour, face au plan gratuit', icon: Cloud },
    { id: 'providers', label: 'Clés des fournisseurs',  sousTitre: 'Écriture seule — rien ne revient',       icon: KeyRound },
    { id: 'personas',  label: 'Personas',               sousTitre: 'Les prompts système, en lecture',        icon: User },
    { id: 'backup',    label: 'Sauvegarde',             sousTitre: 'Export JSON complet',                    icon: Download },
];

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
