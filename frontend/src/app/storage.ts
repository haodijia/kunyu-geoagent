const LAST_SESSION_ROUTE_KEY = "kunyu.ui.last-session-route";
const SIDEBAR_COLLAPSED_KEY = "kunyu.ui.sidebar-collapsed";
const SIDEBAR_WIDTH_KEY = "kunyu.ui.sidebar-width";
const THEME_MODE_KEY = "kunyu.ui.theme-mode";

export type ThemeMode = "system" | "light" | "dark";

export function readLastSessionRoute(): string | null {
  return localStorage.getItem(LAST_SESSION_ROUTE_KEY);
}

export function writeLastSessionRoute(pathname: string): void {
  localStorage.setItem(LAST_SESSION_ROUTE_KEY, pathname);
}

export function clearLastSessionRoute(): void {
  localStorage.removeItem(LAST_SESSION_ROUTE_KEY);
}

export function readSidebarCollapsed(): boolean {
  const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (value === null || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  console.error("[storage] Ignoring invalid sidebar preference.", { value });
  localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  return false;
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
}

export function readSidebarWidth(): number {
  const value = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(value) && value >= 200 && value <= 400 ? value : 260;
}

export function writeSidebarWidth(width: number): void {
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
}

export function readThemeMode(): ThemeMode {
  const value = localStorage.getItem(THEME_MODE_KEY);
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

export function writeThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_MODE_KEY, mode);
}
