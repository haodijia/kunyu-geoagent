const LAST_SESSION_ROUTE_KEY = "kunyu.ui.last-session-route";
const SIDEBAR_COLLAPSED_KEY = "kunyu.ui.sidebar-collapsed";

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
