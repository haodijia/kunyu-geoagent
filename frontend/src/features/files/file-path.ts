export function workspaceFilePath(path: string): string {
  const source = path.startsWith("/") ? path : `/workspace/${path}`;
  const parts: string[] = [];
  for (const part of source.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function localFileLink(href: string, base = "/workspace/"): { path: string; line?: number } | null {
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(href)) return null;
  let source = href;
  if (source.startsWith("file://")) {
    const url = new URL(source);
    if (url.host !== "" && url.host !== "localhost") return null;
    source = url.pathname + url.hash;
  }
  const hash = /#L([1-9]\d*)(?:[-:].*)?$/.exec(source);
  const colon = hash === null ? /:([1-9]\d*)(?::\d+)?$/.exec(source) : null;
  const location = hash ?? colon;
  if (location !== null) source = source.slice(0, location.index);
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return null;
  source = decodeURIComponent(source.replace(/%(?![0-9a-f]{2})/gi, "%25"));
  const path = workspaceFilePath(source.startsWith("/") ? source : base + source);
  if (location === null) return { path };
  const line = Number(location[1]);
  if (!Number.isSafeInteger(line)) throw new Error("Invalid file link line number.");
  return { path, line };
}

export function isLocalFileHref(href: string): boolean {
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(href)) return false;
  return href.startsWith("file://") || /:[1-9]\d*(?::\d+)?$/.test(href) || !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

export function fileName(path: string): string {
  return path.split("/").at(-1)!;
}

export function formatFileBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
