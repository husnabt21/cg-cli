import { CaseRecord } from './store';

export const PRIMARY_VARIANT = 'one_hop';

export const CATEGORY_LABELS: Record<string, string> = {
  bug_diagnosis: 'Bug Diagnosis',
  code_navigation: 'Code Navigation',
  function_understanding: 'Function Understanding',
  class_understanding: 'Class/Object Understanding',
  dependency_tracing: 'Dependency Tracing',
  error_path: 'Error Path',
  data_flow: 'Data Flow',
  impact_analysis: 'Impact Analysis',
  test_relationship: 'Test Relationship',
  configuration: 'Configuration',
  api_route: 'API/Route',
  database_access: 'Database/Data Access',
  security_validation: 'Security/Validation',
  performance: 'Performance Investigation',
  feature_change: 'Feature/Change',
};

export function labelFor(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export interface Aggregate {
  total: number;
  evaluated: number;
  dataErrors: number;
  noMatch: number;
  reduction: number | null;
  recall: number | null;
  selectedNodes: number | null;
  baselineUnits: number | null;
  selectedUnits: number | null;
  baselineChars: number | null;
  selectedChars: number | null;
  expected: number;
  hits: number;
  missedNotRetrieved: number;
  missedBudget: number;
}

/** Data-error cases are excluded from every average. Reduction uses only cases that retrieved something. */
export function aggregate(records: CaseRecord[]): Aggregate {
  const ok = records.filter((r) => r.status === 'ok');
  const evaluated = records.filter((r) => r.status !== 'data_error');
  const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

  return {
    total: records.length,
    evaluated: evaluated.length,
    dataErrors: records.filter((r) => r.status === 'data_error').length,
    noMatch: records.filter((r) => r.status === 'no_match').length,
    reduction: mean(ok.filter((r) => r.reductionPct !== null).map((r) => r.reductionPct as number)),
    recall: mean(evaluated.filter((r) => r.recallPct !== null).map((r) => r.recallPct as number)),
    selectedNodes: mean(ok.map((r) => r.selectedNodes)),
    baselineUnits: mean(ok.map((r) => r.baselineUnits)),
    selectedUnits: mean(ok.map((r) => r.selectedUnits)),
    baselineChars: mean(ok.map((r) => r.baselineChars)),
    selectedChars: mean(ok.map((r) => r.selectedChars)),
    expected: sum(evaluated.map((r) => r.expectedCount)),
    hits: sum(evaluated.map((r) => r.hitCount)),
    missedNotRetrieved: sum(evaluated.map((r) => r.missedNotRetrieved.length)),
    missedBudget: sum(evaluated.map((r) => r.missedBudget.length)),
  };
}

export function byCategory(
  records: CaseRecord[]
): Array<{ category: string; label: string; agg: Aggregate }> {
  const present = Array.from(new Set(records.map((r) => r.category)));
  const ordered = [
    ...Object.keys(CATEGORY_LABELS).filter((c) => present.includes(c)),
    ...present.filter((c) => !(c in CATEGORY_LABELS)),
  ];
  return ordered.map((category) => ({
    category,
    label: labelFor(category),
    agg: aggregate(records.filter((r) => r.category === category)),
  }));
}

export function fmtPct(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(1)}%`;
}

export function fmtNum(value: number | null, digits = 1): string {
  return value === null ? 'n/a' : value.toFixed(digits);
}