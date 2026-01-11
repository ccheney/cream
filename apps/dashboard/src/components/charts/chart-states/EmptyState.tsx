import { handleButtonHover, handleButtonReset, styles } from "./styles";
import type { ChartEmptyProps } from "./types";

export function ChartEmpty({
  icon = "📊",
  title = "No data available",
  description,
  action,
  height = 225,
  className,
}: ChartEmptyProps): React.ReactElement {
  return (
    <output className={className} style={{ ...styles.container, minHeight: height }}>
      <div style={styles.icon}>{icon}</div>
      <div style={styles.title}>{title}</div>
      {description && <div style={styles.description}>{description}</div>}
      {action && (
        <button
          type="button"
          style={styles.button}
          onClick={action.onClick}
          onMouseOver={handleButtonHover}
          onMouseOut={handleButtonReset}
          onFocus={handleButtonHover}
          onBlur={handleButtonReset}
        >
          {action.label}
        </button>
      )}
    </output>
  );
}

export function NoPositionsEmpty(
  props: Omit<ChartEmptyProps, "icon" | "title">
): React.ReactElement {
  return (
    <ChartEmpty
      icon="📈"
      title="No positions yet"
      description="Positions will appear here once the system executes its first trade."
      {...props}
    />
  );
}

export function NoDecisionsEmpty(
  props: Omit<ChartEmptyProps, "icon" | "title">
): React.ReactElement {
  return (
    <ChartEmpty
      icon="🎯"
      title="No decisions yet"
      description="Decisions will appear here as the trading cycle runs."
      {...props}
    />
  );
}

export function NoTradesEmpty(props: Omit<ChartEmptyProps, "icon" | "title">): React.ReactElement {
  return (
    <ChartEmpty
      icon="💹"
      title="No trades in this period"
      description="Try expanding the date range or adjusting filters."
      {...props}
    />
  );
}

export function NoCorrelationEmpty(
  props: Omit<ChartEmptyProps, "icon" | "title">
): React.ReactElement {
  return (
    <ChartEmpty
      icon="🔗"
      title="No correlation data"
      description="Add more positions to see correlation analysis."
      {...props}
    />
  );
}
