import type { ThemeId } from "./theme";

/**
 * Clerk derives shades from these colors and redefines generic CSS variables (e.g. --accent)
 * inside its components, so it gets literal values that mirror the tokens in globals.css.
 */
const PALETTES: Record<ThemeId, Record<string, string>> = {
  light: {
    colorPrimary: "#12283a",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "#ffffff",
    colorForeground: "#12283a",
    colorMuted: "#eceeeb",
    colorMutedForeground: "#5a6976",
    colorInput: "#f3f4f2",
    colorInputForeground: "#12283a",
    colorBorder: "#e5e8e4",
    colorRing: "#12283a",
    colorNeutral: "#12283a",
    colorDanger: "#d93b3b",
    colorSuccess: "#1e8e3e",
    colorWarning: "#d98a00",
  },
  dark: {
    colorPrimary: "#b9ef1c",
    colorPrimaryForeground: "#12283a",
    colorBackground: "#141414",
    colorForeground: "#f5f5f5",
    colorMuted: "#161616",
    colorMutedForeground: "#8a8a8a",
    colorInput: "#0b0b0b",
    colorInputForeground: "#f5f5f5",
    colorBorder: "#262626",
    colorRing: "#b9ef1c",
    colorNeutral: "#f5f5f5",
    colorDanger: "#f06a6a",
    colorSuccess: "#4fcb72",
    colorWarning: "#ffb340",
  },
};

export function clerkAppearance(theme: ThemeId) {
  return {
    variables: {
      ...PALETTES[theme],
      borderRadius: "16px",
      fontFamily: "var(--font-onest), ui-sans-serif, system-ui, sans-serif",
    },
    elements: {
      cardBox: "rounded-[26px]! shadow-[var(--shadow)]!",
    },
  };
}
