/**
 * Select Component Styles
 */

import type React from "react";

export const baseStyles: React.CSSProperties = {
  position: "relative",
  display: "block",
  width: "100%",
};

export const triggerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  lineHeight: "1.5",
  color: "#1c1917", // stone-900
  backgroundColor: "#ffffff",
  border: "1px solid #d6d3d1", // stone-300
  borderRadius: "6px",
  outline: "none",
  cursor: "pointer",
  transition: "border-color 0.2s, box-shadow 0.2s",
  boxSizing: "border-box" as const,
  textAlign: "left" as const,
};

export const triggerOpenStyles: React.CSSProperties = {
  borderColor: "#78716c", // stone-500
  boxShadow: "0 0 0 3px rgba(120, 113, 108, 0.15)",
};

export const errorStyles: React.CSSProperties = {
  borderColor: "#dc2626", // red-600
};

export const disabledStyles: React.CSSProperties = {
  backgroundColor: "#f5f5f4", // stone-100
  color: "#a8a29e", // stone-400
  cursor: "not-allowed",
};

export const dropdownStyles: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "4px",
  backgroundColor: "#ffffff",
  border: "1px solid #d6d3d1",
  borderRadius: "6px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  zIndex: 50,
  maxHeight: "240px",
  overflow: "auto",
};

export const searchInputStyles: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "14px",
  border: "none",
  borderBottom: "1px solid #e7e5e4",
  outline: "none",
  boxSizing: "border-box" as const,
};

export const optionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  fontSize: "14px",
  color: "#1c1917",
  cursor: "pointer",
  transition: "background-color 0.1s",
};

export const optionHoverStyles: React.CSSProperties = {
  backgroundColor: "#f5f5f4", // stone-100
};

export const optionSelectedStyles: React.CSSProperties = {
  backgroundColor: "#e7e5e4", // stone-200
  fontWeight: 500,
};

export const optionDisabledStyles: React.CSSProperties = {
  color: "#a8a29e",
  cursor: "not-allowed",
};

export const groupLabelStyles: React.CSSProperties = {
  padding: "8px 12px 4px",
  fontSize: "12px",
  fontWeight: 600,
  color: "#78716c", // stone-500
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

export const loadingStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  color: "#78716c",
};

export const placeholderStyles: React.CSSProperties = {
  color: "#a8a29e", // stone-400
};

export const checkboxStyles: React.CSSProperties = {
  width: "16px",
  height: "16px",
  marginRight: "8px",
  border: "1px solid #d6d3d1",
  borderRadius: "3px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
