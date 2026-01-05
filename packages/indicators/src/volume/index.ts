/**
 * Volume Indicators
 *
 * Indicators measuring trading volume activity.
 */

export {
  calculateVolumeSMA,
  volumeSmaRequiredPeriods,
  volumeSmaCalculator,
  isHighVolume,
  isLowVolume,
  isVeryHighVolume,
  getVolumeSignal,
  isVolumeConfirmed,
  isVolumeDivergence,
  VOLUME_SMA_DEFAULTS,
  VOLUME_THRESHOLDS,
} from "./volumeSma";
