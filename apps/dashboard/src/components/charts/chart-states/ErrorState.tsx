import { handleButtonHover, handleButtonReset, styles } from "./styles";
import type { ChartErrorProps } from "./types";

export function ChartError({
  error,
  onRetry,
  message = "Failed to load chart data",
  showDetails = false,
  height = 225,
  className,
}: ChartErrorProps): React.ReactElement {
  return (
    <div role="alert" className={className} style={{ ...styles.container, minHeight: height }}>
      <div style={styles.errorIcon}>⚠️</div>
      <div style={styles.title}>{message}</div>
      {showDetails && error && <div style={styles.details}>{error.message}</div>}
      {onRetry && (
        <button
          type="button"
          style={styles.button}
          onClick={onRetry}
          onMouseOver={handleButtonHover}
          onMouseOut={handleButtonReset}
          onFocus={handleButtonHover}
          onBlur={handleButtonReset}
        >
          Retry
        </button>
      )}
    </div>
  );
}
