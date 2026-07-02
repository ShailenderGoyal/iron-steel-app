export const UNIT_FACTORS = {
  mm: 1,
  cm: 10,
  inches: 25.4,
  feet: 304.8,
  meters: 1000,
};

export const UNIT_LABELS = {
  mm: 'mm',
  cm: 'cm',
  inches: 'in',
  feet: 'ft',
  meters: 'm',
};

export function toMm(value, unit = 'mm') {
  return parseFloat(value) * (UNIT_FACTORS[unit] || 1);
}

export function fromMm(value_mm, unit = 'mm') {
  return value_mm / (UNIT_FACTORS[unit] || 1);
}

export function displayMm(value_mm, unit = 'mm', decimals = 2) {
  if (value_mm == null) return '—';
  return `${fromMm(value_mm, unit).toFixed(decimals)} ${UNIT_LABELS[unit]}`;
}

export function displayWeight(kg) {
  if (kg == null) return '—';
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} T`;
  return `${kg.toFixed(2)} kg`;
}

export const HARDNESS_LABELS = {
  soft: 'Soft',
  semi_soft: 'Semi-Soft',
  medium: 'Medium',
  medium_hard: 'Medium Hard',
  hard: 'Hard',
};

export const HARDNESS_COLORS = {
  soft: 'bg-green-100 text-green-800',
  semi_soft: 'bg-teal-100 text-teal-800',
  medium: 'bg-blue-100 text-blue-800',
  medium_hard: 'bg-orange-100 text-orange-800',
  hard: 'bg-red-100 text-red-800',
};

export const RUST_LEVELS = ['prime', 'little_rust', 'rusty'];

export const RUST_LABELS = {
  prime: 'Prime',
  little_rust: 'Little Rust',
  rusty: 'Rusty',
};

export const RUST_COLORS = {
  prime: 'bg-green-100 text-green-800',
  little_rust: 'bg-amber-100 text-amber-800',
  rusty: 'bg-orange-200 text-orange-900',
};

export const ORDER_STATUS_LABELS = {
  pending: 'Pending / लंबित',
  in_production: 'In Production / उत्पादन में',
  ready: 'Ready / तैयार',
  dispatched: 'Dispatched / भेजा गया',
  partially_dispatched: 'Partly Dispatched / आंशिक',
};

export const JOB_STATUS_LABELS = {
  planned: 'Planned / नियोजित',
  in_progress: 'In Progress / चालू',
  completed: 'Completed / पूर्ण',
  cancelled: 'Cancelled / रद्द',
};

export const PRIORITY_LABELS = {
  high: 'High / उच्च',
  normal: 'Normal / सामान्य',
};

// Directional tolerances: both = ± (over or under ok), plus = + (over only), minus = − (under only)
export const TOL_DIRECTIONS = ['both', 'plus', 'minus'];
export const TOL_DIR_LABELS = { both: '± both', plus: '+ over only', minus: '− under only' };
export const TOL_DIR_SIGN = { both: '±', plus: '+', minus: '−' };

// SRD global fallback used when a party has no default set for a dimension.
export const DEFAULT_TOLERANCES = {
  width: { value_mm: 0.2, direction: 'both' },
  length: { value_mm: 0.5, direction: 'both' },
  gauge: { value_mm: 0.1, direction: 'minus' },
};

export const SHEET_PRESETS = [
  { label: '3×8 (914×2438 mm)', value: '3x8', length: 2438, width: 914 },
  { label: '2×4 (610×1219 mm)', value: '2x4', length: 1219, width: 610 },
  { label: '8×4 (2438×1219 mm)', value: '8x4', length: 1219, width: 2438 },
  { label: '1250×2500 mm', value: '1250x2500', length: 2500, width: 1250 },
  { label: '900×2500 mm', value: '900x2500', length: 2500, width: 900 },
  { label: '600×1200 mm', value: '600x1200', length: 1200, width: 600 },
  { label: '1200×1200 mm', value: '1200x1200', length: 1200, width: 1200 },
  { label: 'Custom', value: 'custom', length: null, width: null },
];
