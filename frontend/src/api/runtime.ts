export function getWebRuntime() {
  return {
    baseUrl: new URL(".", window.location.href).href,
    apiVersion: "1" as const,
  };
}
export function resolveApiUrl(path: string) {
  if (!path.startsWith("/api/")) throw new Error("Invalid API resource path.");
  return new URL(path.slice(1), getWebRuntime().baseUrl).href;
}
export function resolveResourceUrl(value: string) {
  const relative =
    value.startsWith("/api/") || value.startsWith("/openge/")
      ? value.slice(1)
      : value;
  return new URL(relative, getWebRuntime().baseUrl).href;
}
