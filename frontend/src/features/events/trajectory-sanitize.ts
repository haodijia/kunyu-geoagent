const REDACTED = "[已隐藏]";
const SENSITIVE_TEXT = /(Bearer\s+)[^\s,;]+|(sk-[A-Za-z0-9_-]{12,})/gi;
const SENSITIVE_FIELDS = [
  "authorization",
  "apikey",
  "accesstoken",
  "authtoken",
  "clientsecret",
  "credential",
  "cookie",
  "password",
  "refreshtoken",
  "secret",
  "token",
];

export function sanitizeTrajectoryValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[内容过深]";
  if (typeof value === "string") return value.replace(SENSITIVE_TEXT, REDACTED);
  if (Array.isArray(value))
    return value.map((item) => sanitizeTrajectoryValue(item, depth + 1));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveField(key)
          ? REDACTED
          : sanitizeTrajectoryValue(item, depth + 1),
      ]),
    );
  }
  return value;
}

function isSensitiveField(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en-US");
  return SENSITIVE_FIELDS.some(
    (field) => normalized === field || normalized.endsWith(field),
  );
}
