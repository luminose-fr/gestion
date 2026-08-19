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
import {
  SUBSTANCES, DOSE_LEVELS, MUSHROOM_FAMILIES, MUSHROOM_FORMS,
  SAFETY_DATA, COMMON_SAFETY_POINTS,
  getAvailableForms, getMushroomVariant, computeDoses,
  type Substance, type DoseLevel, type MushroomFamily, type MushroomForm,
} from '@luminose/psychedelics';

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

export default function PsychedelicsCalculator() {
  const [activeTab, setActiveTab] = useState<Substance>('Champignons');
  const [weight, setWeight] = useState(70);
  const [mushroomFamily, setMushroomFamily] = useState<MushroomFamily>('Cubensis');
  const [mushroomForm, setMushroomForm] = useState<MushroomForm>('Sec');

  const availableForms = useMemo(() => getAvailableForms(mushroomFamily), [mushroomFamily]);

  useEffect(() => {
    if (!availableForms.includes(mushroomForm)) {
      setMushroomForm(availableForms[0] ?? 'Sec');
    }
  }, [availableForms, mushroomForm]);

  const selectedMushroomVariant = useMemo(
    () => getMushroomVariant(mushroomFamily, mushroomForm),
    [mushroomFamily, mushroomForm]
  );

  const calculation = useMemo(
    () => computeDoses(activeTab, weight, selectedMushroomVariant),
    [activeTab, selectedMushroomVariant, weight]
  );

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
              <p className="mt-1 text-sm text-brand-main/50 dark:text-dark-text/50">
                {activeTab === 'Champignons' && `${selectedMushroomVariant.label}, ${weight} kg`}
                {activeTab === 'LSD' && 'Doses fixes (indépendantes du poids)'}
                {activeTab === 'MDMA' && `Règle 1,5 mg/kg, ${weight} kg`}
              </p>
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
