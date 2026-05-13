export function parseJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [
    trimmed,
    withoutFence,
    sliceOuterJson(withoutFence, "{", "}"),
    sliceOuterJson(withoutFence, "[", "]")
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next recovery shape.
    }
  }

  throw new Error("Model output was not valid JSON.");
}

function sliceOuterJson(value: string, open: "{" | "[", close: "}" | "]"): string {
  const start = value.indexOf(open);
  const end = value.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return "";
  return value.slice(start, end + 1);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown): boolean {
  return Boolean(value);
}
