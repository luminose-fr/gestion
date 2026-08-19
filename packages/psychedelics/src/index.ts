/**
 * packages/psychedelics — repères de dosage.
 *
 * ZÉRO DÉPENDANCE (SPEC §1.1). Extrait du composant React qui mêlait la table
 * des facteurs, le calcul et l'affichage. Ce qui relève de la présentation
 * (thèmes Tailwind, icônes) est resté dans le composant ; ce qui relève du
 * domaine est ici, et devient testable.
 *
 * Les valeurs sont des REPÈRES indicatifs, pas des prescriptions : la
 * puissance réelle d'un produit varie fortement (voir COMMON_SAFETY_POINTS).
 */

export const SUBSTANCES = ['Champignons', 'LSD', 'MDMA'] as const;
export type Substance = (typeof SUBSTANCES)[number];

export const DOSE_LEVELS = ['Micro-dose', 'Faible', 'Normal', 'Fort', 'Héroïque'] as const;
export type DoseLevel = (typeof DOSE_LEVELS)[number];

export const MUSHROOM_TYPES = [
  'Psilocybe Cubensis (Secs)',
  'Psilocybe Cubensis (Frais)',
  'Truffes Magiques (Secs)',
  'Truffes Magiques (Fraîches)',
  'Copelandia Cyanescens (Frais)',
  'Copelandia Cyanescens (Secs)',
] as const;
export type MushroomType = (typeof MUSHROOM_TYPES)[number];

export const MUSHROOM_FAMILIES = ['Cubensis', 'Truffes', 'Copelandia'] as const;
export type MushroomFamily = (typeof MUSHROOM_FAMILIES)[number];

export const MUSHROOM_FORMS = ['Frais', 'Sec'] as const;
export type MushroomForm = (typeof MUSHROOM_FORMS)[number];

export type CalculationResult = {
  level: DoseLevel;
  amount: number;
  unit: string;
  description: string;
};

export type MushroomVariant = {
  label: string;
  type: MushroomType;
};

// Truffes (sclérotes) : ~65-70% d'eau → ratio frais/sec ≈ 3
export const TRUFFLE_FRESH_TO_DRY_RATIO = 3;

export const TRUFFLE_FRESH_FACTORS: Record<DoseLevel, number> = {
  'Micro-dose': 0.01,    // 70 kg → 0.7 g
  Faible: 0.09,          // 70 kg → 6.3 g
  Normal: 0.18,          // 70 kg → 12.6 g
  Fort: 0.30,            // 70 kg → 21 g
  'Héroïque': 0.50,      // 70 kg → 35 g
};

export const TRUFFLE_DRY_FACTORS: Record<DoseLevel, number> = {
  'Micro-dose': TRUFFLE_FRESH_FACTORS['Micro-dose'] / TRUFFLE_FRESH_TO_DRY_RATIO,
  Faible: TRUFFLE_FRESH_FACTORS.Faible / TRUFFLE_FRESH_TO_DRY_RATIO,
  Normal: TRUFFLE_FRESH_FACTORS.Normal / TRUFFLE_FRESH_TO_DRY_RATIO,
  Fort: TRUFFLE_FRESH_FACTORS.Fort / TRUFFLE_FRESH_TO_DRY_RATIO,
  'Héroïque': TRUFFLE_FRESH_FACTORS['Héroïque'] / TRUFFLE_FRESH_TO_DRY_RATIO,
};

export const MUSHROOM_FACTORS: Record<MushroomType, Record<DoseLevel, number>> = {
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
  // Copelandia : 2-3x plus puissant que cubensis
  'Copelandia Cyanescens (Frais)': {
    'Micro-dose': 0.01,    // 70 kg → 0.7 g
    Faible: 0.08,          // 70 kg → 5.6 g
    Normal: 0.15,          // 70 kg → 10.5 g
    Fort: 0.25,            // 70 kg → 17.5 g
    'Héroïque': 0.35,      // 70 kg → 24.5 g
  },
  'Copelandia Cyanescens (Secs)': {
    'Micro-dose': 0.001,   // 70 kg → 0.07 g
    Faible: 0.008,         // 70 kg → 0.56 g
    Normal: 0.015,         // 70 kg → 1.05 g
    Fort: 0.025,           // 70 kg → 1.75 g
    'Héroïque': 0.035,     // 70 kg → 2.45 g
  },
};

export const MUSHROOM_VARIANTS: Record<MushroomFamily, Partial<Record<MushroomForm, MushroomVariant>>> = {
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

export const LSD_TIERS: Record<DoseLevel, { min: number; description: string }> = {
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

export const MDMA_FACTOR = 1.5;
export const MDMA_MAX_SAFE = 120;

export const SAFETY_DATA: Record<Substance, { effects: string[]; advice: string; duration: string }> = {
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

export const COMMON_SAFETY_POINTS = [
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

// ── API du moteur ────────────────────────────────────────────────────────

/** Formes disponibles pour une famille (toutes n'existent pas partout). */
export const getAvailableForms = (family: MushroomFamily): MushroomForm[] =>
  MUSHROOM_FORMS.filter((form) => Boolean(MUSHROOM_VARIANTS[family][form]));

/**
 * Variante retenue pour un couple famille/forme. Retombe sur la première forme
 * disponible de la famille, puis sur le cubensis sec : l'appelant n'a jamais à
 * gérer un couple impossible.
 */
export const getMushroomVariant = (family: MushroomFamily, form: MushroomForm): MushroomVariant =>
  MUSHROOM_VARIANTS[family][form] ??
  MUSHROOM_VARIANTS[family][getAvailableForms(family)[0] ?? 'Sec'] ?? {
    label: 'Psilocybe Cubensis sec',
    type: 'Psilocybe Cubensis (Secs)' as MushroomType,
  };

export interface DoseComputation {
  results: CalculationResult[];
  /** Formulation lisible de la dose de référence, pour les textes de sécurité. */
  doseContext: string;
}

export const MUSHROOM_DESCRIPTIONS: Record<DoseLevel, string> = {
  'Micro-dose': 'Sub-perceptuel. Usage distinct, généralement recherché pour sa discrétion.',
  Faible: 'Léger. Couleurs plus vives, rires, ouverture émotionnelle.',
  Normal: 'Standard. Visuels, introspection, immersion marquée.',
  Fort: 'Très intense. Distorsions importantes et perte de repères possible.',
  'Héroïque': "Extrême. Risque psychologique élevé, approche prudente indispensable.",
};

/** Calcul des repères pour une substance, un poids et une variante de champignon. */
export const computeDoses = (
  substance: Substance,
  weightKg: number,
  variant: MushroomVariant
): DoseComputation => {
  if (substance === 'Champignons') {
    const results = DOSE_LEVELS.map((level) => ({
      level,
      amount: roundToTwo(weightKg * MUSHROOM_FACTORS[variant.type][level]),
      unit: 'g',
      description: MUSHROOM_DESCRIPTIONS[level],
    }));
    return { results, doseContext: `${results[2].amount} g de ${variant.label}` };
  }

  if (substance === 'LSD') {
    const results = DOSE_LEVELS.map((level) => ({
      level,
      amount: LSD_TIERS[level].min,
      unit: 'µg',
      description: LSD_TIERS[level].description,
    }));
    return { results, doseContext: '100 µg de LSD' };
  }

  // MDMA : proportionnel au poids, mais plafonné — le plafond prime sur le calcul.
  let recommended = Math.round(weightKg * MDMA_FACTOR);
  const isCapped = recommended > MDMA_MAX_SAFE;
  if (isCapped) recommended = MDMA_MAX_SAFE;

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
};
