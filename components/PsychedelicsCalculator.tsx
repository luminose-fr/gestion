import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  Droplets,
  FlaskConical,
  Leaf,
  Pill,
  type LucideIcon,
} from 'lucide-react';

const SUBSTANCES = ['Champignons', 'LSD', 'MDMA'] as const;
type Substance = (typeof SUBSTANCES)[number];

const DOSE_LEVELS = ['Micro-dose', 'Faible', 'Normal', 'Fort', 'Héroïque'] as const;
type DoseLevel = (typeof DOSE_LEVELS)[number];

const MUSHROOM_TYPES = [
  'Psilocybe Cubensis (Secs)',
  'Psilocybe Cubensis (Frais)',
  'Truffes Magiques (Secs)',
  'Truffes Magiques (Fraîches)',
  'Copelandia Cyanescens (Frais)',
  'Copelandia Cyanescens (Secs)',
] as const;
type MushroomType = (typeof MUSHROOM_TYPES)[number];

const MUSHROOM_FAMILIES = ['Cubensis', 'Truffes', 'Copelandia'] as const;
type MushroomFamily = (typeof MUSHROOM_FAMILIES)[number];

const MUSHROOM_FORMS = ['Frais', 'Sec'] as const;
type MushroomForm = (typeof MUSHROOM_FORMS)[number];

type CalculationResult = {
  level: DoseLevel;
  amount: number;
  unit: string;
  description: string;
};

type MushroomVariant = {
  label: string;
  type: MushroomType;
};

const TRUFFLE_FRESH_TO_DRY_DOSE_RATIO = 10.9 / 7.1;

const TRUFFLE_FRESH_FACTORS: Record<DoseLevel, number> = {
  'Micro-dose': 0.07,
  Faible: 0.13,
  Normal: 0.2,
  Fort: 0.35,
  'Héroïque': 0.6,
};

const TRUFFLE_DRY_FACTORS: Record<DoseLevel, number> = {
  'Micro-dose': TRUFFLE_FRESH_FACTORS['Micro-dose'] / TRUFFLE_FRESH_TO_DRY_DOSE_RATIO,
  Faible: TRUFFLE_FRESH_FACTORS.Faible / TRUFFLE_FRESH_TO_DRY_DOSE_RATIO,
  Normal: TRUFFLE_FRESH_FACTORS.Normal / TRUFFLE_FRESH_TO_DRY_DOSE_RATIO,
  Fort: TRUFFLE_FRESH_FACTORS.Fort / TRUFFLE_FRESH_TO_DRY_DOSE_RATIO,
  'Héroïque': TRUFFLE_FRESH_FACTORS['Héroïque'] / TRUFFLE_FRESH_TO_DRY_DOSE_RATIO,
};

const MUSHROOM_FACTORS: Record<MushroomType, Record<DoseLevel, number>> = {
  'Psilocybe Cubensis (Secs)': {
    'Micro-dose': 0.003,
    Faible: 0.015,
    Normal: 0.03,
    Fort: 0.05,
    'Héroïque': 0.07,
  },
  'Psilocybe Cubensis (Frais)': {
    'Micro-dose': 0.03,
    Faible: 0.15,
    Normal: 0.3,
    Fort: 0.5,
    'Héroïque': 0.7,
  },
  'Truffes Magiques (Fraîches)': TRUFFLE_FRESH_FACTORS,
  'Truffes Magiques (Secs)': TRUFFLE_DRY_FACTORS,
  'Copelandia Cyanescens (Frais)': {
    'Micro-dose': 0.01,
    Faible: 0.05,
    Normal: 0.1,
    Fort: 0.18,
    'Héroïque': 0.25,
  },
  'Copelandia Cyanescens (Secs)': {
    'Micro-dose': 0.001,
    Faible: 0.005,
    Normal: 0.01,
    Fort: 0.018,
    'Héroïque': 0.025,
  },
};

const MUSHROOM_VARIANTS: Record<MushroomFamily, Partial<Record<MushroomForm, MushroomVariant>>> = {
  Cubensis: {
    Frais: {
      label: 'Psilocybe Cubensis frais',
      type: 'Psilocybe Cubensis (Frais)',
    },
    Sec: {
      label: 'Psilocybe Cubensis sec',
      type: 'Psilocybe Cubensis (Secs)',
    },
  },
  Truffes: {
    Frais: {
      label: 'Truffes magiques fraîches',
      type: 'Truffes Magiques (Fraîches)',
    },
    Sec: {
      label: 'Truffes magiques sèches',
      type: 'Truffes Magiques (Secs)',
    },
  },
  Copelandia: {
    Frais: {
      label: 'Copelandia Cyanescens frais',
      type: 'Copelandia Cyanescens (Frais)',
    },
    Sec: {
      label: 'Copelandia Cyanescens sec',
      type: 'Copelandia Cyanescens (Secs)',
    },
  },
};

const LSD_TIERS: Record<DoseLevel, { min: number; description: string }> = {
  'Micro-dose': {
    min: 10,
    description: "Sub-perceptuel. Augmentation légère de l'énergie et de la créativité.",
  },
  Faible: {
    min: 25,
    description: 'Effets légers, légère euphorie, visuels discrets.',
  },
  Normal: {
    min: 80,
    description: 'Trip complet, visuels géométriques et perception altérée du temps.',
  },
  Fort: {
    min: 150,
    description: "Expérience intense, confusion possible, dissolution de l'ego.",
  },
  'Héroïque': {
    min: 300,
    description: 'Dose extrême, réservée aux profils très expérimentés.',
  },
};

const MDMA_FACTOR = 1.5;
const MDMA_MAX_SAFE = 120;

const SAFETY_DATA: Record<Substance, { effects: string[]; advice: string; duration: string }> = {
  Champignons: {
    effects: ['Introspection', 'Visuels', 'Connexion émotionnelle', 'Distorsion du temps'],
    advice:
      "Le set & setting reste central. Privilégiez un cadre calme, une personne de confiance et commencez bas si la puissance du produit est inconnue.",
    duration: '4 à 6 heures',
  },
  LSD: {
    effects: ['Énergie', 'Visuels complexes', 'Pensées associatives', 'Synesthésie'],
    advice:
      "La durée est longue. Gardez la journée et la nuit libres, testez toujours vos produits et évitez les redrops impulsifs.",
    duration: '8 à 12 heures',
  },
  MDMA: {
    effects: ['Empathie', 'Énergie', 'Euphorie', 'Sensations tactiles accrues'],
    advice:
      "Hydratez-vous sans excès, faites des pauses si vous dansez, évitez les mélanges et respectez un délai de plusieurs semaines entre deux prises.",
    duration: '3 à 6 heures',
  },
};

const SUBSTANCE_THEME: Record<
  Substance,
  {
    accent: string;
    soft: string;
    strong: string;
  }
> = {
  Champignons: {
    accent: 'border-amber-200 dark:border-amber-400/20',
    soft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
    strong: 'text-amber-700 dark:text-amber-200',
  },
  LSD: {
    accent: 'border-sky-200 dark:border-sky-400/20',
    soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200',
    strong: 'text-sky-700 dark:text-sky-200',
  },
  MDMA: {
    accent: 'border-rose-200 dark:border-rose-400/20',
    soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
    strong: 'text-rose-700 dark:text-rose-200',
  },
};

const SUBSTANCE_META: Record<Substance, { icon: LucideIcon }> = {
  Champignons: { icon: Leaf },
  LSD: { icon: Droplets },
  MDMA: { icon: Pill },
};

const COMMON_SAFETY_POINTS = [
  {
    title: 'Résultats indicatifs',
    description: 'Les quantités affichées restent des repères. La puissance réelle du produit peut varier fortement.',
  },
  {
    title: 'Commencer bas',
    description: 'Il est plus prudent de démarrer plus bas que prévu que de chercher à corriger une dose trop forte.',
  },
  {
    title: 'Éviter les mélanges',
    description: 'Le cumul avec alcool, stimulants ou autres psychotropes augmente nettement les risques.',
  },
  {
    title: 'Set & setting',
    description: 'Le lieu, l’état émotionnel et la présence d’une personne de confiance changent beaucoup l’expérience.',
  },
] as const;

const roundToTwo = (value: number) => Math.round(value * 100) / 100;

export default function PsychedelicsCalculator() {
  const [activeTab, setActiveTab] = useState<Substance>('Champignons');
  const [weight, setWeight] = useState(70);
  const [mushroomFamily, setMushroomFamily] = useState<MushroomFamily>('Cubensis');
  const [mushroomForm, setMushroomForm] = useState<MushroomForm>('Sec');

  const availableForms = useMemo(
    () => MUSHROOM_FORMS.filter((form) => Boolean(MUSHROOM_VARIANTS[mushroomFamily][form])),
    [mushroomFamily]
  );

  useEffect(() => {
    if (!MUSHROOM_VARIANTS[mushroomFamily][mushroomForm]) {
      setMushroomForm(availableForms[0] ?? 'Sec');
    }
  }, [availableForms, mushroomFamily, mushroomForm]);

  const selectedMushroomVariant = useMemo(() => {
    return (
      MUSHROOM_VARIANTS[mushroomFamily][mushroomForm] ??
      MUSHROOM_VARIANTS[mushroomFamily][availableForms[0] ?? 'Sec'] ?? {
        label: 'Psilocybe Cubensis sec',
        type: 'Psilocybe Cubensis (Secs)' as MushroomType,
      }
    );
  }, [availableForms, mushroomFamily, mushroomForm]);

  const calculation = useMemo(() => {
    if (activeTab === 'Champignons') {
      const results = DOSE_LEVELS.map((level) => ({
        level,
        amount: roundToTwo(weight * MUSHROOM_FACTORS[selectedMushroomVariant.type][level]),
        unit: 'g',
        description:
          level === 'Micro-dose'
            ? 'Sub-perceptuel. Usage distinct, généralement recherché pour sa discrétion.'
            : level === 'Faible'
              ? 'Léger. Couleurs plus vives, rires, ouverture émotionnelle.'
              : level === 'Normal'
                ? 'Standard. Visuels, introspection, immersion marquée.'
                : level === 'Fort'
                  ? 'Très intense. Distorsions importantes et perte de repères possible.'
                  : "Extrême. Risque psychologique élevé, approche prudente indispensable.",
      }));

      return {
        results,
        doseContext: `${results[2].amount} g de ${selectedMushroomVariant.label}`,
      };
    }

    if (activeTab === 'LSD') {
      const results = DOSE_LEVELS.map((level) => ({
        level,
        amount: LSD_TIERS[level].min,
        unit: 'µg',
        description: LSD_TIERS[level].description,
      }));

      return {
        results,
        doseContext: '100 µg de LSD',
      };
    }

    let recommended = Math.round(weight * MDMA_FACTOR);
    const isCapped = recommended > MDMA_MAX_SAFE;
    if (isCapped) {
      recommended = MDMA_MAX_SAFE;
    }

    return {
      results: [
        {
          level: 'Faible' as DoseLevel,
          amount: Math.round(recommended * 0.7),
          unit: 'mg',
          description: "Effets plus doux, descente souvent moins difficile.",
        },
        {
          level: 'Normal' as DoseLevel,
          amount: recommended,
          unit: 'mg',
          description: isCapped
            ? `Plafonné à ${MDMA_MAX_SAFE} mg pour rester dans un cadre de réduction des risques.`
            : 'Repère standard basé sur 1,5 mg/kg.',
        },
        {
          level: 'Fort' as DoseLevel,
          amount: Math.round(recommended * 1.3),
          unit: 'mg',
          description: 'Charge corporelle et risque de neurotoxicité nettement accrus.',
        },
      ],
      doseContext: `${recommended} mg de MDMA`,
    };
  }, [activeTab, selectedMushroomVariant, weight]);

  const safety = SAFETY_DATA[activeTab];
  const theme = SUBSTANCE_THEME[activeTab];
  const usesWeight = activeTab !== 'LSD';
  const microDoseResult = calculation.results.find((result) => result.level === 'Micro-dose');
  const standardResults = calculation.results.filter((result) => result.level !== 'Micro-dose');
  const safetyTargetLabel =
    activeTab === 'LSD' ? 'le LSD' : activeTab === 'MDMA' ? 'la MDMA' : 'les champignons';

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="rounded-3xl border border-brand-border bg-white p-4 shadow-sm sm:p-6 dark:border-dark-sec-border dark:bg-dark-surface">
          <div>
            <p className="text-sm font-semibold text-brand-main dark:text-white">Type de produit</p>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {SUBSTANCES.map((substance) => {
                const isActive = activeTab === substance;
                const tabTheme = SUBSTANCE_THEME[substance];
                const Icon = SUBSTANCE_META[substance].icon;

                return (
                  <button
                    key={substance}
                    onClick={() => setActiveTab(substance)}
                    className={`min-h-[72px] rounded-2xl border px-3 py-3 text-sm font-semibold transition-all sm:min-h-0 sm:rounded-full sm:px-4 sm:py-2 ${
                      isActive
                        ? `${tabTheme.soft} ${tabTheme.accent}`
                        : 'border-brand-border text-brand-main/70 hover:bg-brand-light hover:text-brand-main dark:border-dark-sec-border dark:text-dark-text/70 dark:hover:bg-dark-sec-bg dark:hover:text-white'
                    }`}
                  >
                    <span className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                      <Icon className="w-4 h-4" />
                      {substance}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {usesWeight && (
              <div className="rounded-2xl border border-brand-border p-4 sm:p-5 dark:border-dark-sec-border">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold text-brand-main dark:text-white">Poids corporel</p>
                  <div className="rounded-full bg-brand-light px-3 py-1 text-sm font-bold text-brand-main dark:bg-dark-sec-bg dark:text-dark-text">
                    {weight} kg
                  </div>
                </div>
                <input
                  type="range"
                  min="40"
                  max="120"
                  value={weight}
                  onChange={(event) => setWeight(parseInt(event.target.value, 10))}
                  className="mt-4 w-full accent-brand-main"
                />
              </div>
            )}

            {activeTab === 'Champignons' && (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold text-brand-main dark:text-white">Type de champignon</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {MUSHROOM_FAMILIES.map((family) => {
                      const isSelected = mushroomFamily === family;
                      return (
                        <button
                          key={family}
                          onClick={() => setMushroomFamily(family)}
                          className={`rounded-2xl border p-3 text-center text-sm font-semibold transition-all sm:p-4 ${
                            isSelected
                              ? 'border-brand-main bg-brand-light dark:border-dark-text dark:bg-dark-sec-bg'
                              : 'border-brand-border hover:bg-brand-light/60 dark:border-dark-sec-border dark:hover:bg-dark-bg/60'
                          }`}
                        >
                          <div className="text-brand-main dark:text-white">{family}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-brand-main dark:text-white">État du produit</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {MUSHROOM_FORMS.map((form) => {
                      const isSelected = mushroomForm === form;

                      return (
                        <button
                          key={form}
                          onClick={() => setMushroomForm(form)}
                          className={`rounded-2xl border p-3 text-center text-sm font-semibold transition-all sm:p-4 ${
                            isSelected
                              ? 'border-brand-main bg-brand-light dark:border-dark-text dark:bg-dark-sec-bg'
                              : 'border-brand-border hover:bg-brand-light/60 dark:border-dark-sec-border dark:hover:bg-dark-bg/60'
                          }`}
                        >
                          <div>{form}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'LSD' && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200">
                Le LSD varie surtout selon la dose réelle du buvard ou de la goutte. Le poids n&apos;est donc pas le
                facteur principal ici.
              </div>
            )}

            {activeTab === 'MDMA' && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
                Le repère affiché utilise la règle de réduction des risques à <strong>1,5 mg/kg</strong>, avec un
                plafond conservateur à <strong>120 mg</strong>.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-brand-border bg-white p-4 shadow-sm sm:p-6 dark:border-dark-sec-border dark:bg-dark-surface">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-lg font-bold text-brand-main dark:text-white">Paliers estimatifs</h4>
            </div>
            <div className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${theme.soft}`}>{activeTab}</div>
          </div>

          <div className="mt-5 space-y-4">
            {microDoseResult && (
              <article className="rounded-2xl border border-dashed border-brand-main/35 bg-brand-light/70 p-4 dark:border-dark-text/35 dark:bg-dark-sec-bg/70">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-main dark:bg-dark-surface dark:text-dark-text">
                        Micro-dose
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-brand-main/70 dark:text-dark-text/70">
                      {microDoseResult.description}
                    </p>
                  </div>
                  <div className="text-3xl font-bold text-brand-main dark:text-white">
                    {microDoseResult.amount}
                    <span className="ml-2 text-base font-medium text-brand-main/55 dark:text-dark-text/60">
                      {microDoseResult.unit}
                    </span>
                  </div>
                </div>
              </article>
            )}

            <div className="space-y-3">
              {standardResults.map((result) => {
                const isRecommended = result.level === 'Normal';
                return (
                  <article
                    key={result.level}
                    className="rounded-2xl border border-brand-border p-4 transition-colors dark:border-dark-sec-border"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-brand-main dark:text-white">{result.level}</span>
                          {isRecommended && (
                            <span className="rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-semibold text-brand-main dark:bg-dark-sec-bg dark:text-dark-text">
                              Repère
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-brand-main/70 dark:text-dark-text/70">
                          {result.description}
                        </p>
                      </div>

                      <div className="text-3xl font-bold text-brand-main dark:text-white">
                        {result.amount}
                        <span className="ml-2 text-base font-medium text-brand-main/55 dark:text-dark-text/60">
                          {result.unit}
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-brand-border bg-white p-4 shadow-sm sm:p-6 dark:border-dark-sec-border dark:bg-dark-surface">
        <div className="flex flex-col gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-light px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-main dark:bg-dark-sec-bg dark:text-dark-text">
              <FlaskConical className="w-4 h-4" />
              Réduction des risques
            </div>
            <h3 className="mt-3 text-xl font-bold text-brand-main sm:text-2xl dark:text-white">
              Conseils et réduction des risques
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-brand-main/70 dark:text-dark-text/70">
              Les résultats restent indicatifs et doivent toujours être croisés avec la puissance réelle du produit,
              le contexte de consommation et la sensibilité de la personne.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="rounded-2xl border border-brand-border p-4 sm:p-5 dark:border-dark-sec-border">
              <h4 className="text-lg font-bold text-brand-main dark:text-white">
                Conseils communs à tous les produits
              </h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {COMMON_SAFETY_POINTS.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-brand-border bg-brand-light p-4 dark:border-dark-sec-border dark:bg-dark-sec-bg"
                  >
                    <div className="text-sm font-semibold text-brand-main dark:text-white">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-brand-main/70 dark:text-dark-text/70">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/15 dark:bg-red-500/10 dark:text-red-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    En cas de malaise, de confusion sévère ou de signes physiques inquiétants, contactez immédiatement
                    les secours. Ce module ne remplace jamais une prise en charge médicale.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-border bg-brand-light p-4 sm:p-5 dark:border-dark-sec-border dark:bg-dark-sec-bg">
              <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${theme.soft}`}>{activeTab}</div>
              <h4 className="mt-3 text-lg font-bold text-brand-main dark:text-white">
                Conseils pour {safetyTargetLabel}
              </h4>
              <p className="mt-2 text-sm leading-6 text-brand-main/70 dark:text-dark-text/70">{safety.advice}</p>

              <div className="mt-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-main/50 dark:text-dark-text/50">
                  Effets souvent rapportés
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {safety.effects.map((effect) => (
                    <span
                      key={effect}
                      className="rounded-full border border-brand-border bg-white px-3 py-1 text-xs font-medium text-brand-main dark:border-dark-sec-border dark:bg-dark-surface dark:text-dark-text"
                    >
                      {effect}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-brand-border bg-white p-4 text-sm text-brand-main dark:border-dark-sec-border dark:bg-dark-surface dark:text-white">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4" />
                  Durée indicative : <strong>{safety.duration}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
