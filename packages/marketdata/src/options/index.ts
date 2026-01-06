/**
 * Options Module
 *
 * Provides options pricing, Greeks calculation, and portfolio exposure analysis.
 */

export {
  calculateGreeks,
  calculateMoneyness,
  calculateOptionsExposure,
  createEmptyExposure,
  daysToYears,
  formatExposure,
  getMoneyStatus,
  normalCDF,
  normalPDF,
  type OptionGreeks,
  type OptionPosition,
  type OptionsExposure,
  type OptionType,
  type SymbolExposure,
} from "./greeks";
