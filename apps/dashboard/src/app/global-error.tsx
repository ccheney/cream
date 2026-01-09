"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const globalStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
`;

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "24px",
    backgroundColor: "#1c1917", // stone-900 (dark bg for critical)
  },
  card: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    padding: "48px 32px",
    backgroundColor: "#292524", // stone-800
    border: "1px solid #44403c", // stone-700
    borderRadius: "12px",
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
    color: "#fafaf9", // stone-50
    marginBottom: "12px",
  },
  message: {
    fontSize: "16px",
    color: "#a8a29e", // stone-400
    marginBottom: "32px",
    lineHeight: 1.6,
  },
  digest: {
    fontSize: "12px",
    color: "#78716c", // stone-500
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
    color: "#1c1917", // stone-900
    backgroundColor: "#fafaf9", // stone-50
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s, transform 0.1s",
  },
  secondaryButton: {
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#d6d3d1", // stone-300
    backgroundColor: "transparent",
    border: "1px solid #57534e", // stone-600
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
};

// Global error must define its own <html> and <body> tags because it replaces the root layout
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // TODO: Send to error tracking service (e.g., Sentry)
  }, []);

  const handleReset = () => {
    reset();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Application Error | Cream</title>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Required for SSR CSS - constant styles defined at build time */}
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body>
        <div style={styles.container} role="alert" aria-label="Critical error">
          <div style={styles.card}>
            <div style={styles.icon} aria-hidden="true"></div>

            <h1 style={styles.title}>Application Error</h1>

            <p style={styles.message}>
              A critical error occurred while loading the application. This usually requires a page
              refresh to recover.
            </p>

            {error.digest && <p style={styles.digest}>Error ID: {error.digest}</p>}

            <div style={styles.actions}>
              <button
                type="button"
                onClick={handleReset}
                style={styles.primaryButton}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#e7e5e4";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = "#e7e5e4";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "#fafaf9";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = "#fafaf9";
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
                  e.currentTarget.style.backgroundColor = "#44403c";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = "#44403c";
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
      </body>
    </html>
  );
}
