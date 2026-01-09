"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px",
    backgroundColor: "#fafaf9",
  },
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "48px 32px",
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    maxWidth: "480px",
    width: "100%",
    textAlign: "center" as const,
  },
  icon: {
    fontSize: "64px",
    marginBottom: "24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#1c1917",
    marginBottom: "12px",
  },
  message: {
    fontSize: "16px",
    color: "#57534e",
    marginBottom: "32px",
    lineHeight: 1.6,
  },
  digest: {
    fontSize: "12px",
    color: "#a8a29e",
    fontFamily: "monospace",
    marginBottom: "24px",
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  primaryButton: {
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#ffffff",
    backgroundColor: "#292524",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
  },
  secondaryButton: {
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#44403c",
    backgroundColor: "transparent",
    border: "1px solid #d6d3d1",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
};

export default function ErrorPage({ error, reset }: ErrorPageProps): React.JSX.Element {
  useEffect(() => {
    // TODO: Send to error tracking service (e.g., Sentry)
  }, [error]);

  const handleReset = () => {
    reset();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div style={styles.container} role="alert" aria-label="Page error">
      <div style={styles.card}>
        <div style={styles.icon} aria-hidden="true"></div>

        <h1 style={styles.title}>Something went wrong</h1>

        <p style={styles.message}>
          We're sorry, but something unexpected happened. Our team has been notified and is working
          on a fix.
        </p>

        {error.digest && <p style={styles.digest}>Error ID: {error.digest}</p>}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={handleReset}
            style={styles.primaryButton}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#1c1917";
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = "#1c1917";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#292524";
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = "#292524";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            Try again
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            style={styles.secondaryButton}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f4";
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = "#f5f5f4";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            Refresh page
          </button>
        </div>
      </div>
    </div>
  );
}
