export const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    backgroundColor: "#fafaf9", // stone-50
    borderRadius: "8px",
    padding: "24px",
    boxSizing: "border-box" as const,
  },
  skeleton: {
    backgroundColor: "#e7e5e4", // stone-200
    borderRadius: "4px",
    overflow: "hidden",
    position: "relative" as const,
  },
  shimmer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
    animation: "shimmer 1.5s infinite",
  },
  icon: {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5,
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#44403c", // stone-700
    marginBottom: "8px",
    textAlign: "center" as const,
  },
  description: {
    fontSize: "14px",
    color: "#78716c", // stone-500
    textAlign: "center" as const,
    maxWidth: "300px",
    marginBottom: "16px",
  },
  errorIcon: {
    fontSize: "48px",
    marginBottom: "16px",
    color: "#dc2626", // red-600
  },
  errorMessage: {
    fontSize: "14px",
    color: "#dc2626", // red-600
    marginBottom: "16px",
    textAlign: "center" as const,
  },
  button: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#292524", // stone-800
    color: "#fafaf9", // stone-50
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  details: {
    marginTop: "8px",
    padding: "8px",
    backgroundColor: "#fef2f2", // red-50
    borderRadius: "4px",
    fontSize: "12px",
    color: "#991b1b", // red-800
    fontFamily: "monospace",
    maxWidth: "100%",
    overflow: "auto",
  },
};

export const shimmerKeyframes = `
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
`;

export function handleButtonHover(
  e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>
): void {
  e.currentTarget.style.backgroundColor = "#1c1917";
}

export function handleButtonReset(
  e: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>
): void {
  e.currentTarget.style.backgroundColor = "#292524";
}
