import type { UserInfo } from "../../shared/types.js";

export const EMPTY_USER_INFO: UserInfo = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: ""
};

export const KNOWN_TERMS = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Express",
  "Next.js",
  "Vue",
  "Angular",
  "HTML",
  "CSS",
  "Tailwind",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Python",
  "Java",
  "C#",
  "Go",
  "Rust",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "Google Cloud",
  "GCP",
  "Git",
  "GitHub Actions",
  "GitHub",
  "GitLab",
  "CI/CD",
  "Terraform",
  "Linux",
  "REST APIs",
  "REST",
  "GraphQL",
  "API",
  "Microservices",
  "Agile",
  "Scrum",
  "Jira",
  "Figma",
  "Excel",
  "Power BI",
  "Tableau",
  "Salesforce",
  "HubSpot",
  "Customer Service",
  "Data Analysis",
  "Machine Learning",
  "Prompt Engineering",
  "LLM",
  "ATS",
  "Security",
  "OAuth",
  "Testing",
  "Vitest",
  "Jest",
  "Playwright"
];

export const SOFT_SKILLS = [
  "communication",
  "leadership",
  "collaboration",
  "problem solving",
  "stakeholder management",
  "analytical thinking",
  "customer support",
  "mentoring",
  "documentation",
  "presentation",
  "ownership",
  "prioritization"
];

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "that",
  "this",
  "from",
  "you",
  "your",
  "our",
  "are",
  "will",
  "have",
  "has",
  "job",
  "role",
  "work",
  "team",
  "teams",
  "using",
  "within",
  "into",
  "their",
  "they",
  "about",
  "plus",
  "years",
  "year",
  "experience",
  "preferred",
  "required",
  "requirements",
  "responsibilities",
  "candidate",
  "including"
]);

export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
}

export function toLines(text: string): string[] {
  return cleanText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function sentenceSplit(text: string): string[] {
  return cleanText(text)
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?])\s+|;\s+|\s+-\s+/)
    .map((item) => item.replace(/^[-*•]\s*/, "").trim())
    .filter((item) => item.length > 3);
}

export function normalizeTerm(value: string): string {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

export function canonicalTerm(value: string): string {
  const text = cleanText(value);
  const normalized = normalizeTerm(text);
  if (!normalized) return "";
  if (/^node\s*js$/.test(normalized)) return "Node.js";
  if (/^next\s*js$/.test(normalized)) return "Next.js";
  if (/^github actions?$/.test(normalized)) return "GitHub Actions";
  if (/^rest apis?$/.test(normalized)) return "REST APIs";
  if (/^ci cd$/.test(normalized)) return "CI/CD";
  if (/^gcp$/.test(normalized)) return "GCP";
  if (/^aws$/.test(normalized)) return "AWS";
  if (/^api$/.test(normalized)) return "API";
  return text;
}

export function uniqueStrings(values: unknown[], limit = 80): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = cleanText(value);
    const key = normalizeTerm(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

export function uniqueMeaningfulTerms(values: unknown[], limit = 80): string[] {
  const canonical = uniqueStrings(values.map((value) => canonicalTerm(String(value ?? ""))), 120);
  const keys = new Set(canonical.map(normalizeTerm));
  const output = canonical.filter((term) => !isCoveredByCompositeTerm(term, keys));
  return output.slice(0, limit);
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function includesTerm(haystack: string, term: string): boolean {
  const source = normalizeTerm(haystack);
  const needle = normalizeTerm(term);
  if (!needle) return false;
  if (needle.includes(" ")) return source.includes(needle);
  const tokens = source.split(/\s+/);
  return tokens.some((token) => token === needle || token === `${needle}s`);
}

export function findKnownTerms(text: string, terms = KNOWN_TERMS): string[] {
  return uniqueMeaningfulTerms(
    terms.filter((term) => includesTerm(text, term) || includesTerm(text, term.replace(".", "")))
  );
}

export function extractEmail(text: string): string {
  return cleanText(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

export function extractPhone(text: string): string {
  return cleanText(text).match(/(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?){2,5}\d{2,4}/)?.[0] ?? "";
}

export function extractUrls(text: string): string[] {
  return uniqueStrings(cleanText(text).match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi) ?? []);
}

export function extractLabeledValue(text: string, labels: string[]): string {
  const labelPattern = [...labels]
    .sort((a, b) => b.length - a.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const match = cleanText(text).match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*(.+)`, "i"));
  return match?.[1]?.split("\n")[0]?.trim() ?? "";
}

export function parseDelimitedList(value: string): string[] {
  return uniqueStrings(
    cleanText(value)
      .replace(/^[-*•]\s*/, "")
      .split(/,|;|\||\n|\/{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function extractSection(text: string, headings: string[]): string[] {
  const lines = toLines(text);
  const headingSet = new Set([
    "summary",
    "professional summary",
    "profile",
    "skills",
    "technical skills",
    "core skills",
    "tools",
    "tooling",
    "platforms",
    "tools platforms",
    "experience",
    "professional experience",
    "work experience",
    "employment",
    "projects",
    "education",
    "certifications",
    "certification",
    "licenses"
  ]);
  const normalizedHeadings = headings.map(normalizeTerm);
  let collecting = false;
  const output: string[] = [];
  for (const line of lines) {
    const normalized = normalizeTerm(line.replace(/:.*$/, ""));
    const isTarget = normalizedHeadings.includes(normalized);
    const isAnyHeading = headingSet.has(normalized);
    if (isTarget) {
      collecting = true;
      const inline = line.split(":").slice(1).join(":").trim();
      if (inline) output.push(inline);
      continue;
    }
    if (collecting && isAnyHeading) break;
    if (collecting) output.push(line);
  }
  return output;
}

export function extractRepeatedTerms(text: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  const words = normalizeTerm(text)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

export function containsMetric(text: string): boolean {
  return /(\d+%|\$\d+|\d+\s*(?:k|m|million|hours|days|weeks|months|users|customers|tickets|projects|deployments|reports|applications|employees|teams)\b)/i.test(
    text
  );
}

export function extractMetrics(lines: string[]): string[] {
  return uniqueStrings(lines.filter(containsMetric));
}

export function looksLikeMissingValue(text: string): boolean {
  const normalized = normalizeTerm(text);
  return !normalized || normalized === "not specified" || normalized === "n a" || normalized === "none";
}

export function isContactLikeLine(line: string, userInfo: UserInfo): boolean {
  const text = cleanText(line);
  if (!text) return false;
  const lower = text.toLowerCase();
  const contactValues = [userInfo.email, userInfo.phone, userInfo.linkedin, userInfo.portfolio]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return Boolean(extractEmail(text) || contactValues.some((value) => lower.includes(value)));
}

export function makeSuggestionId(section: string, index: number, text: string): string {
  const seed = normalizeTerm(`${section}-${index}-${text}`).replace(/\s+/g, "-").slice(0, 36);
  return `${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}-${seed || "item"}`;
}

export function compactJoin(values: string[], separator = " | "): string {
  return values.map(cleanText).filter(Boolean).join(separator);
}

function isCoveredByCompositeTerm(term: string, keys: Set<string>): boolean {
  const key = normalizeTerm(term);
  const coveredBy: Record<string, string[]> = {
    github: ["github actions"],
    rest: ["rest apis"],
    api: ["rest apis"]
  };
  if ((coveredBy[key] ?? []).some((composite) => keys.has(composite))) return true;
  if (!key.includes(" ") && key.length > 2) {
    return [...keys].some(
      (candidate) =>
        candidate !== key &&
        candidate.split(/\s+/).includes(key) &&
        /^(basic|beginner|intermediate|advanced|strong|expert)\s+/.test(candidate)
    );
  }
  return false;
}
