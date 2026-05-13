import type { JobExtraction, ResumeProfile, Suggestion, UserInfo } from "../../shared/types";

export type WizardStepId =
  | "start"
  | "basics"
  | "profile"
  | "job"
  | "experience"
  | "skills"
  | "summary"
  | "ats"
  | "final";

export type ResumeSectionKey = "header" | "summary" | "skills" | "experience" | "projects" | "education" | "certifications";

export type ResumeSections = Record<ResumeSectionKey, string>;

export interface SummaryOption {
  id: string;
  text: string;
  whySafe: string;
}

export const EMPTY_USER_INFO: UserInfo = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: "",
  targetRole: ""
};

export function createBlankProfile(userInfo: UserInfo = EMPTY_USER_INFO, rawText = ""): ResumeProfile {
  return {
    userInfo,
    rawText,
    summary: "",
    skills: [],
    tools: [],
    metrics: [],
    experience: [],
    projects: [],
    education: [],
    certifications: []
  };
}

export function emptySections(): ResumeSections {
  return {
    header: "",
    summary: "",
    skills: "",
    experience: "",
    projects: "",
    education: "",
    certifications: ""
  };
}

export function contactCompleteness(userInfo: UserInfo): { completed: number; total: number; percent: number; missing: string[] } {
  const fields: Array<[keyof UserInfo, string]> = [
    ["fullName", "Name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["location", "Location"],
    ["linkedin", "LinkedIn or portfolio"]
  ];
  const completed = fields.filter(([key]) => {
    if (key === "linkedin") return Boolean(userInfo.linkedin || userInfo.portfolio);
    return Boolean(userInfo[key]);
  }).length;
  const missing = fields
    .filter(([key]) => (key === "linkedin" ? !userInfo.linkedin && !userInfo.portfolio : !userInfo[key]))
    .map(([, label]) => label);
  return { completed, total: fields.length, percent: Math.round((completed / fields.length) * 100), missing };
}

export function splitTextList(value: string): string[] {
  return uniqueStrings(
    value
      .split(/\n|,|;/)
      .map((item) => cleanText(item.replace(/^[-*]\s*/, "")))
      .filter(isUsefulText)
  );
}

export function joinTextList(items: string[]): string {
  return uniqueStrings(items).join(", ");
}

export function isCompleteExperience(entry: ResumeProfile["experience"][number]): boolean {
  return Boolean(isUsefulText(entry.title) && isUsefulText(entry.employer));
}

export function sectionsFromResume(resumeText: string, profile?: ResumeProfile): ResumeSections {
  const sections = emptySections();
  const normalized = cleanText(resumeText).trim();
  const headings: Array<[ResumeSectionKey, string]> = [
    ["summary", "Professional Summary"],
    ["skills", "Core Skills"],
    ["experience", "Professional Experience"],
    ["projects", "Projects"],
    ["education", "Education"],
    ["certifications", "Certifications"]
  ];
  const firstHeadingIndex = headings
    .map(([, heading]) => normalized.indexOf(heading))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  sections.header = firstHeadingIndex === undefined ? formatHeader(profile?.userInfo) : normalized.slice(0, firstHeadingIndex).trim();

  for (const [key, heading] of headings) {
    const start = normalized.indexOf(heading);
    if (start === -1) continue;
    const afterHeading = start + heading.length;
    const next = headings
      .map(([, candidate]) => normalized.indexOf(candidate, afterHeading))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    sections[key] = normalized.slice(afterHeading, next ?? normalized.length).trim();
  }
  return sections;
}

export function serializeSections(sections: ResumeSections, userInfo?: UserInfo): string {
  const blocks = [
    sections.header.trim(),
    withHeading("Professional Summary", sections.summary),
    withHeading("Core Skills", sections.skills),
    sections.experience.trim() ? withHeading("Professional Experience", sections.experience) : "",
    sections.projects.trim() ? withHeading("Projects", sections.projects) : "",
    sections.education.trim() ? withHeading("Education", sections.education) : "",
    sections.certifications.trim() ? withHeading("Certifications", sections.certifications) : ""
  ].filter(Boolean);
  return sanitizePreviewText(blocks.join("\n\n"), userInfo);
}

export function formatHeader(userInfo?: UserInfo): string {
  if (!userInfo) return "";
  const contact = [userInfo.email, userInfo.phone, userInfo.location, userInfo.linkedin, userInfo.portfolio].filter(isUsefulText).join(" | ");
  return [userInfo.fullName, contact].filter(isUsefulText).join("\n");
}

export function profileToEvidenceText(profile: ResumeProfile, userInfo: UserInfo): string {
  const lines: string[] = [];
  const mergedUser = { ...profile.userInfo, ...userInfo, targetRole: userInfo.targetRole || profile.userInfo.targetRole || "" };
  lines.push(...[mergedUser.fullName, mergedUser.email, mergedUser.phone, mergedUser.location, mergedUser.linkedin, mergedUser.portfolio].filter(isUsefulText));
  if (isUsefulText(mergedUser.targetRole || "")) lines.push(`Target Role: ${mergedUser.targetRole}`);
  if (isUsefulText(profile.summary)) lines.push(`Summary: ${profile.summary}`);
  if (profile.skills.length) lines.push(`Skills: ${joinTextList(profile.skills)}`);
  if (profile.tools.length) lines.push(`Tools: ${joinTextList(profile.tools)}`);

  const realExperience = profile.experience.filter(isCompleteExperience);
  if (realExperience.length) {
    lines.push("Experience");
    for (const entry of realExperience) {
      const dates = [entry.startDate, entry.endDate].filter(isUsefulText).join(" - ");
      const header = [entry.title, entry.employer, dates, entry.location].filter(isUsefulText).join(" | ");
      lines.push(header);
      lines.push(...entry.bullets.filter(isUsefulText).map((bullet) => `- ${stripBullet(bullet)}`));
    }
  }

  if (profile.projects.length) {
    lines.push("Projects");
    for (const project of profile.projects.filter((item) => isUsefulText(item.name))) {
      lines.push(project.name);
      if (isUsefulText(project.description || "")) lines.push(`- ${project.description}`);
      lines.push(...project.bullets.filter(isUsefulText).map((bullet) => `- ${stripBullet(bullet)}`));
      if (project.tools.length) lines.push(`- Tools: ${joinTextList(project.tools)}`);
    }
  }

  if (profile.education.length) {
    lines.push("Education");
    for (const entry of profile.education.filter((item) => isUsefulText(item.school))) {
      lines.push([entry.degree, entry.field, entry.school, entry.graduationDate, entry.location].filter(isUsefulText).join(", "));
      lines.push(...entry.details.filter(isUsefulText).map((detail) => `- ${stripBullet(detail)}`));
    }
  }

  if (profile.certifications.length) {
    lines.push("Certifications");
    for (const entry of profile.certifications.filter((item) => isUsefulText(item.name) && isSafeCertificationName(item.name))) {
      lines.push([entry.name, entry.issuer, entry.date].filter(isUsefulText).join(", "));
    }
  }

  return sanitizePreviewText(lines.filter(isUsefulText).join("\n"), mergedUser);
}

export function buildSummaryOptions(profile: ResumeProfile, job?: JobExtraction): SummaryOption[] {
  const role = job?.targetTitle || profile.userInfo.targetRole || "";
  const roleText = role ? ` for ${role} roles` : "";
  const skills = profile.skills.slice(0, 6).join(", ");
  const certs = profile.certifications.map((certification) => certification.name).slice(0, 2).join(", ");
  const titles = profile.experience
    .filter(isCompleteExperience)
    .slice(0, 2)
    .map((entry) => `${entry.title} at ${entry.employer}`)
    .join(" and ");
  const options: SummaryOption[] = [];

  if (profile.experience.filter(isCompleteExperience).length) {
    options.push({
      id: "work-history",
      text: cleanText(
        `Professional with profile-supported work history${roleText}${skills ? ` and skills in ${skills}` : ""}. ${certs ? `Credentials include ${certs}.` : ""}`
      ),
      whySafe: `Uses only detected work entries${titles ? ` (${titles})` : ""}, listed skills, and listed credentials.`
    });
    options.push({
      id: "evidence-first",
      text: cleanText(
        `Profile-supported background includes ${titles || "documented roles"}${skills ? `, with practical use of ${skills}` : ""}.`
      ),
      whySafe: "References only confirmed role headers and profile-supported keywords."
    });
  } else {
    options.push({
      id: "skills-only",
      text: cleanText(
        `Candidate with profile-supported skills${roleText}${skills ? ` in ${skills}` : ""}. ${certs ? `Credentials include ${certs}.` : ""}`
      ),
      whySafe: "Does not claim experience, expertise, employers, dates, or achievements."
    });
    options.push({
      id: "evidence-needed",
      text: cleanText(
        `Candidate with profile-supported skills${skills ? ` including ${skills}` : ""}. Add real job, project, education, or achievement evidence before adding work-history claims.`
      ),
      whySafe: "Keeps missing work history as an evidence request instead of a resume claim."
    });
  }

  options.push({
    id: "job-keywords",
    text: cleanText(
      `Profile-supported skills${roleText}${skills ? ` include ${skills}` : ""}${certs ? `, with listed credential ${certs}` : ""}.`
    ),
    whySafe: "Limited to skills and credentials already present in the candidate profile."
  });

  return uniqueBy(options.filter((option) => option.text), (option) => option.text).slice(0, 3);
}

export function applySuggestionToSections(
  current: ResumeSections,
  suggestion: Suggestion
): { sections: ResumeSections; applied: boolean; message: string } {
  if (!suggestion.profileSupported || suggestion.riskLevel === "high") {
    return {
      sections: current,
      applied: false,
      message: "Needs evidence: this suggestion was saved as feedback and did not change resume facts."
    };
  }

  const key = sectionKeyFromSuggestion(suggestion.section);
  if (!key) return { sections: current, applied: false, message: "This suggestion does not map to an editable resume section." };

  const existing = current[key] || "";
  const original = suggestion.originalText.trim();
  const rewrite = suggestion.suggestedRewrite.trim();
  if (!rewrite || /missing profile evidence|add a real/i.test(rewrite)) {
    return { sections: current, applied: false, message: "Needs evidence: this rewrite is an evidence prompt, not resume text." };
  }

  if (original && existing.includes(original)) {
    return { sections: { ...current, [key]: existing.replace(original, rewrite) }, applied: true, message: "Applied to the current section." };
  }
  if (key === "skills") {
    return { sections: { ...current, skills: wrapListAsBullets(rewrite) }, applied: true, message: "Applied to the skills section." };
  }
  return { sections: { ...current, [key]: [existing, rewrite].filter(Boolean).join("\n") }, applied: true, message: "Added to the current section." };
}

export function suggestionsForStep(suggestions: Suggestion[], step: WizardStepId): Suggestion[] {
  const lowerFor = (section: string) => section.toLowerCase();
  if (step === "summary") return suggestions.filter((item) => lowerFor(item.section).includes("summary"));
  if (step === "skills") return suggestions.filter((item) => /skill|missing requirement/i.test(item.section));
  if (step === "experience") return suggestions.filter((item) => /experience|missing requirement/i.test(item.section));
  return suggestions;
}

export function placeholderFor(section: ResumeSectionKey): string {
  if (section === "experience") return "Omitted until a real title, employer, dates, and bullets are present.";
  if (section === "header") return "Name\nemail | phone | location | LinkedIn";
  return "Generated text appears here.";
}

function withHeading(heading: string, content: string): string {
  return content.trim() ? `${heading}\n${content.trim()}` : "";
}

function sectionKeyFromSuggestion(section: string): ResumeSectionKey | null {
  const lower = section.toLowerCase();
  if (lower.includes("summary")) return "summary";
  if (lower.includes("skill")) return "skills";
  if (lower.includes("experience")) return "experience";
  if (lower.includes("project")) return "projects";
  if (lower.includes("education")) return "education";
  if (lower.includes("certification")) return "certifications";
  return null;
}

function sanitizePreviewText(text: string, userInfo?: UserInfo): string {
  const contactNeedles = [userInfo?.email, userInfo?.phone, userInfo?.linkedin, userInfo?.portfolio].filter(isUsefulText).map((item) => item.toLowerCase());
  return cleanText(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/not specified|candidate profile|relevant experience/i.test(line))
    .filter((line) => {
      if (!/^[-*]\s*/.test(line)) return true;
      const lower = line.toLowerCase();
      return !contactNeedles.some((needle) => lower.includes(needle));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function stripBullet(value: string): string {
  return cleanText(value.replace(/^[-*]\s*/, ""));
}

function wrapListAsBullets(value: string): string {
  return splitTextList(value)
    .map((item) => `- ${item}`)
    .join("\n");
}

function isUsefulText(value: string | undefined): value is string {
  return Boolean(value && cleanText(value) && !/^(n\/a|na|none|null|undefined|not specified)$/i.test(cleanText(value)));
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map(cleanText).filter(isUsefulText)));
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSafeCertificationName(value: string): boolean {
  return (
    !/^(summary|professional summary|profile|skills|core skills|technical skills)\s*:/i.test(value) &&
    !/\b(profile-supported skills|candidate with|professional with|credentials include)\b/i.test(value) &&
    /\b(certified|certification|certificate|license|aws certified|aws.*architect|pmp|cissp|scrum)\b/i.test(value)
  );
}
