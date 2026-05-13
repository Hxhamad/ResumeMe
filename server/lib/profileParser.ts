import type {
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeProfile,
  UserInfo
} from "../../shared/types.js";
import {
  cleanText,
  EMPTY_USER_INFO,
  extractEmail,
  extractLabeledValue,
  extractMetrics,
  extractPhone,
  extractSection,
  extractUrls,
  findKnownTerms,
  isContactLikeLine,
  looksLikeMissingValue,
  parseDelimitedList,
  toLines,
  uniqueStrings
} from "./text.js";

export function parseProfileFallback(profileText: string, overrides?: Partial<UserInfo>): ResumeProfile {
  const rawText = cleanText(profileText);
  const lines = toLines(rawText);
  const userInfo = inferUserInfo(rawText, overrides);
  const skills = inferSkills(rawText);
  const certifications = inferCertifications(rawText);
  const experience = inferExperience(rawText, userInfo);
  const projects = inferProjects(rawText);
  const education = inferEducation(rawText);
  const summary = inferSummary(rawText);
  const allBulletLines = [
    ...experience.flatMap((entry) => entry.bullets),
    ...projects.flatMap((entry) => entry.bullets),
    summary
  ];

  return {
    userInfo,
    rawText,
    summary,
    skills,
    tools: findKnownTerms([rawText, skills.join(", ")].join("\n")),
    metrics: extractMetrics(allBulletLines),
    experience,
    projects,
    education,
    certifications
  };
}

export function inferUserInfo(profileText: string, overrides?: Partial<UserInfo>): UserInfo {
  const text = cleanText(profileText);
  const lines = toLines(text);
  const urls = extractUrls(text);
  const linkedin = urls.find((url) => /linkedin\.com/i.test(url)) ?? "";
  const portfolio = urls.find((url) => !/linkedin\.com/i.test(url)) ?? "";
  const location =
    overrides?.location ||
    extractLabeledValue(text, ["location", "address", "city"]) ||
    lines.find((line) => /,\s*[A-Za-z ]+$/.test(line) && !extractEmail(line) && !extractPhone(line)) ||
    "";
  const firstNameLine =
    lines.find((line) => {
      if (line.includes(":") || extractEmail(line) || extractPhone(line) || /^skills\b/i.test(line)) return false;
      const words = line.split(/\s+/);
      return words.length >= 2 && words.length <= 5 && !/\d/.test(line);
    }) ?? "";

  return {
    ...EMPTY_USER_INFO,
    fullName: cleanText(overrides?.fullName || extractLabeledValue(text, ["name"]) || firstNameLine),
    email: cleanText(overrides?.email || extractEmail(text)),
    phone: cleanText(overrides?.phone || extractPhone(text)),
    location: cleanText(location),
    linkedin: cleanText(overrides?.linkedin || linkedin),
    portfolio: cleanText(overrides?.portfolio || portfolio),
    targetRole: cleanText(overrides?.targetRole)
  };
}

function inferSummary(text: string): string {
  const summaryLines = extractSection(text, ["summary", "professional summary", "profile"]);
  if (!summaryLines.length) return "";
  return cleanText(summaryLines.join(" "));
}

function inferSkills(text: string): string[] {
  const labeled = extractLabeledValue(text, ["skills", "technical skills", "core skills"]);
  const section = extractSection(text, ["skills", "technical skills", "core skills"]);
  const fromLabels = parseDelimitedList([labeled, ...section].join("\n"));
  return uniqueStrings([...fromLabels, ...findKnownTerms(text)], 60);
}

function inferCertifications(text: string): CertificationEntry[] {
  const section = extractSection(text, ["certifications", "certification", "licenses"]);
  const labeled = extractLabeledValue(text, ["certification", "certifications", "license", "licenses"]);
  const candidates = parseDelimitedList([labeled, ...section].join("\n")).filter(isCertificationCandidate);
  const inferred = toLines(text)
    .filter((line) => /\b(certified|certification|certificate|aws certified|pmp|cissp|scrum)\b/i.test(line))
    .filter((line) => !/^(summary|professional summary|profile)\s*:/i.test(line))
    .map((line) => line.replace(/^(certifications?|licenses?)\s*:\s*/i, ""));
  return uniqueStrings([...candidates, ...inferred].filter(isCertificationCandidate), 20).map((name) => ({ name }));
}

function isCertificationCandidate(item: string): boolean {
  return (
    !looksLikeMissingValue(item) &&
    !/^(summary|professional summary|profile|skills|core skills|technical skills)\s*:/i.test(item) &&
    !/\b(profile-supported skills|candidate with|professional with|credentials include)\b/i.test(item) &&
    /\b(certified|certification|certificate|license|aws certified|aws.*architect|pmp|cissp|scrum)\b/i.test(item)
  );
}

function inferEducation(text: string): EducationEntry[] {
  const section = extractSection(text, ["education"]);
  const candidates = section.filter((line) => /\b(university|college|school|bachelor|master|degree|diploma|bootcamp)\b/i.test(line));
  return uniqueStrings(candidates, 10).map((line) => ({
    school: line,
    details: []
  }));
}

function inferProjects(text: string): ProjectEntry[] {
  const section = extractSection(text, ["projects"]);
  if (!section.length) return [];
  const projects: ProjectEntry[] = [];
  let current: ProjectEntry | undefined;
  for (const rawLine of section) {
    const line = cleanText(rawLine.replace(/^[-*•]\s*/, ""));
    if (!line || looksLikeMissingValue(line)) continue;
    const startsBullet = /^[-*•]/.test(rawLine);
    if (!startsBullet && line.length < 80) {
      if (current && (current.description || current.bullets.length)) projects.push(current);
      current = { name: line, tools: findKnownTerms(line), bullets: [] };
      continue;
    }
    if (!current) current = { name: "Project", tools: [], bullets: [] };
    current.bullets.push(line);
    current.tools = uniqueStrings([...current.tools, ...findKnownTerms(line)]);
  }
  if (current && (current.description || current.bullets.length || current.name !== "Project")) projects.push(current);
  return projects.filter((project) => project.name !== "Project" || project.bullets.length > 0);
}

function inferExperience(text: string, userInfo: UserInfo): ExperienceEntry[] {
  const section = extractSection(text, ["experience", "professional experience", "work experience", "employment"]);
  const candidates = section.length ? section : toLines(text);
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | undefined;

  for (const rawLine of candidates) {
    const startsBullet = /^[-*•]/.test(rawLine);
    const line = cleanText(rawLine.replace(/^[-*•]\s*/, ""));
    if (/^(summary|profile|skills|technical skills|core skills|projects?|education|certifications?|licenses?)\b(?:\s*:.*)?$/i.test(line)) {
      if (current && isRealExperience(current)) entries.push(current);
      current = undefined;
      continue;
    }
    if (!line || looksLikeMissingValue(line) || isContactLikeLine(line, userInfo)) continue;

    if (!startsBullet && hasExperienceShape(line)) {
      if (current && isRealExperience(current)) entries.push(current);
      current = parseExperienceHeader(line);
      continue;
    }

    if (current && line.length > 6) {
      current.bullets.push(line);
      current.tools = uniqueStrings([...current.tools, ...findKnownTerms(line)]);
      current.metrics = uniqueStrings([...current.metrics, ...extractMetrics([line])]);
    }
  }

  if (current && isRealExperience(current)) entries.push(current);
  return entries.filter(isRealExperience);
}

function hasExperienceShape(line: string): boolean {
  const text = cleanText(line);
  if (text.length < 8 || /^skills|certification|education|projects?:?/i.test(text)) return false;
  const hasDate = /\b(19|20)\d{2}\b|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text);
  const hasDivider = /\s(at|@|\||-)\s/i.test(text);
  const hasRoleWord = /\b(engineer|developer|manager|analyst|designer|specialist|consultant|lead|director|coordinator|administrator|representative)\b/i.test(
    text
  );
  return hasDate && (hasDivider || hasRoleWord);
}

function parseExperienceHeader(line: string): ExperienceEntry {
  const dateMatch = line.match(
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(19|20)\d{2}\s*(?:-|to|–|—)\s*(present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(19|20)?\d{0,2}\b/i
  );
  const dateText = dateMatch?.[0] ?? "";
  const withoutDates = cleanText(line.replace(dateText, "").replace(/[|,-]+$/, ""));
  let title = "";
  let employer = "";
  let location = "";

  if (/\s+at\s+/i.test(withoutDates)) {
    const [left, right] = withoutDates.split(/\s+at\s+/i);
    title = stripHeaderPart(left);
    employer = stripHeaderPart(right);
  } else {
    const parts = withoutDates.split(/\s+\|\s+|\s+-\s+|\s+@\s+/).map(stripHeaderPart).filter(Boolean);
    if (parts.length >= 2) {
      const roleIndex = parts.findIndex((part) =>
        /\b(engineer|developer|manager|analyst|designer|specialist|consultant|lead|director|coordinator|administrator|representative)\b/i.test(
          part
        )
      );
      if (roleIndex >= 0) {
        title = parts[roleIndex];
        employer = parts.find((_, index) => index !== roleIndex) ?? "";
        location = parts.find((part, index) => index !== roleIndex && index !== parts.indexOf(employer) && /,/.test(part)) ?? "";
      } else {
        title = parts[0];
        employer = parts[1];
      }
    } else {
      title = withoutDates;
    }
  }

  return {
    employer: cleanText(employer),
    title: cleanText(title),
    location: cleanText(location),
    startDate: dateText ? dateText.split(/-|to|–|—/i)[0]?.trim() : "",
    endDate: dateText ? dateText.split(/-|to|–|—/i).slice(1).join("-").trim() : "",
    bullets: [],
    tools: findKnownTerms(line),
    metrics: extractMetrics([line])
  };
}

function isRealExperience(entry: ExperienceEntry): boolean {
  return Boolean(
    !looksLikeMissingValue(entry.title) &&
      !looksLikeMissingValue(entry.employer) &&
      !/not specified|candidate profile|relevant experience/i.test(`${entry.title} ${entry.employer}`)
  );
}

function stripHeaderPart(value: string): string {
  return cleanText(value.replace(/^[|,\-\s]+|[|,\-\s]+$/g, ""));
}
