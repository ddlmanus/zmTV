import { create } from "zustand";

export type ColorTheme = "pine" | "grape" | "ocean" | "classicDark";
export type Theme = ColorTheme | "auto" | "dark" | "light";

const THEME_STORAGE_KEY = "wavespeed_theme";
const COLOR_THEMES: ColorTheme[] = ["pine", "grape", "ocean", "classicDark"];

function normalizeTheme(theme: string | null | undefined): ColorTheme {
  if (theme === "dark") return "classicDark";
  if (theme && COLOR_THEMES.includes(theme as ColorTheme)) {
    return theme as ColorTheme;
  }
  return "pine";
}

function getStoredTheme(): ColorTheme {
  if (typeof window === "undefined") return "pine";
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

function applyTheme(theme: Theme) {
  const colorTheme = normalizeTheme(theme);
  const root = document.documentElement;
  const isDark = colorTheme === "classicDark";
  root.classList.remove("dark");
  root.dataset.theme = colorTheme;

  // Update Electron title bar overlay colors to match theme
  try {
    (
      window as unknown as {
        electronAPI?: {
          updateTitlebarTheme?: (isDark: boolean) => Promise<void>;
        };
      }
    ).electronAPI?.updateTitlebarTheme?.(isDark);
  } catch {
    /* not in Electron */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "pine",

  setTheme: (theme: Theme) => {
    const colorTheme = normalizeTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, colorTheme);
    applyTheme(colorTheme);
    set({ theme: colorTheme });
  },

  initTheme: () => {
    const theme = getStoredTheme();
    applyTheme(theme);
    set({ theme });

    // Keep legacy auto listeners harmless; visual themes are color palettes now.
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      applyTheme(get().theme);
    };
    mediaQuery.addEventListener("change", handleChange);
  },
}));
