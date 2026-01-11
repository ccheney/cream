/**
 * Shared fixtures and test data for IC tests
 */

export interface MockICValue {
  ic: number;
  nObservations: number;
  isValid: boolean;
}

export function createMockICValues(
  count: number,
  options?: { ic?: number; valid?: boolean }
): MockICValue[] {
  const { ic = 0.05, valid = true } = options ?? {};
  return Array(count)
    .fill(null)
    .map(() => ({
      ic,
      nObservations: 50,
      isValid: valid,
    }));
}

export function createPanelData(
  nTime: number,
  nAssets: number,
  options?: { predictive?: boolean }
): { signals: number[][]; returns: number[][] } {
  const { predictive = false } = options ?? {};
  const signals: number[][] = [];
  const returns: number[][] = [];

  for (let t = 0; t < nTime; t++) {
    const sigRow: number[] = [];
    const retRow: number[] = [];
    for (let a = 0; a < nAssets; a++) {
      const signal = predictive ? a : Math.random();
      const ret = predictive ? a * 0.001 : Math.random() * 0.02 - 0.01;
      sigRow.push(signal);
      retRow.push(ret);
    }
    signals.push(sigRow);
    returns.push(retRow);
  }

  return { signals, returns };
}

export const REALISTIC_IC_VALUES: MockICValue[] = [
  { ic: 0.03, nObservations: 50, isValid: true },
  { ic: 0.02, nObservations: 50, isValid: true },
  { ic: 0.04, nObservations: 50, isValid: true },
  { ic: 0.01, nObservations: 50, isValid: true },
  { ic: 0.05, nObservations: 50, isValid: true },
  { ic: -0.01, nObservations: 50, isValid: true },
  { ic: 0.03, nObservations: 50, isValid: true },
  { ic: 0.02, nObservations: 50, isValid: true },
  { ic: 0.04, nObservations: 50, isValid: true },
  { ic: 0.03, nObservations: 50, isValid: true },
];
