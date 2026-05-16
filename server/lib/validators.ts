import type {
  AtsRubric,
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  GenerateResponse,
  JobExtraction,
  KeywordMatch,
  ProfileMatch,
  ProjectEntry,
  Requirement,
  ResumeProfile,
  Suggestion,
  UserInfo
} from "../../shared/types.js";
import { asArray, asBoolean, asNumber, asString, isRecord } from "./json.js";
import {
  clampScore,
  cleanText,
  EMPTY_USER_INFO,
  includesTerm,
  looksLikeMissingValue,
  normalizeTerm,
  uniqueMeaningfulTerms,
  uniqueStrings
} from "./text.js";

export function validateUserInfo(value: unknown, fallback: UserInfo = EMPTY_USER_INFO): UserInfo {
  const record = isRecord(value) ? value : {};
  return {
    fullName: cleanText(asString(record.fullName) || fallback.fullName),
    email: cleanText(asString(record.email) || fallback.email),
    phone: cleanText(asString(record.phone) || fallback.phone),
    location: cleanText(asString(record.location) || fallback.location),
    linkedin: cleanText(asString(record.linkedin) || fallback.linkedin),
    portfolio: cleanText(asString(record.portfolio) || fallback.portfolio),
    targetRole: cleanText(asString(record.targetRole) || fallback.targetRole || "")
  };
}

export function validateResumeProfile(value: unknown, fallback: ResumeProfile): ResumeProfile {
  const record = isRecord(value) ? value : {};
  const rawText = cleanText(asString(record.rawText) || fallback.rawText);
  const fallbackSkills = new Set(fallback.skills.map(normalizeTerm));
  const fallbackTools = new Set(fallback.tools.map(normalizeTerm));
  const fallbackMetrics = new Set(fallback.metrics.map(normalizeTerm));
  return {
    userInfo: validateUserInfo(record.userInfo, fallback.userInfo),
    rawText,
    summary: cleanText(asString(record.summary) || fallback.summary),
    skills: uniqueMeaningfulTerms([...asStringArray(record.skills), ...fallback.skills], 80).filter(
      (item) => isSkillCandidate(item) && (fallbackSkills.has(normalizeTerm(item)) || hasEvidence(rawText, item))
    ),
    tools: uniqueMeaningfulTerms([...asStringArray(record.tools), ...fallback.tools], 80).filter(
      (item) => fallbackTools.has(normalizeTerm(item)) || hasEvidence(rawText, item)
    ),
    metrics: uniqueStrings([...asStringArray(record.metrics), ...fallback.metrics], 40).filter(
      (item) => fallbackMetrics.has(normalizeTerm(item)) || hasEvidence(rawText, item)
    ),
    experience: [...asArray(record.experience).map(validateExperienceEntry), ...fallback.experience]
      .filter((entry) => isRealExperience(entry) && hasEntryEvidence(rawText, entry.title, entry.employer, fallback.experience)),
    projects: [...asArray(record.projects).map(validateProjectEntry), ...fallback.projects]
      .filter((entry) => !looksLikeMissingValue(entry.name) && hasNamedEvidence(rawText, entry.name, fallback.projects.map((project) => project.name))),
    education: [...asArray(record.education).map(validateEducationEntry), ...fallback.education]
      .filter((entry) => !looksLikeMissingValue(entry.school) && hasNamedEvidence(rawText, entry.school, fallback.education.map((education) => education.school))),
    certifications: [...asArray(record.certifications).map(validateCertificationEntry), ...fallback.certifications]
      .filter((entry) => !looksLikeMissingValue(entry.name) && hasNamedEvidence(rawText, entry.name, fallback.certifications.map((cert) => cert.name)))
  };
}

export function validateJobExtraction(value: unknown, fallback: JobExtraction): JobExtraction {
  const record = isRecord(value) ? value : {};
  const job: JobExtraction = {
    targetTitle: cleanText(asString(record.targetTitle) || fallback.targetTitle),
    seniority: cleanText(asString(record.seniority) || fallback.seniority),
    mustHaveRequirements: asArray(record.mustHaveRequirements).map((item) => validateRequirement(item, "must")),
    preferredRequirements: asArray(record.preferredRequirements).map((item) => validateRequirement(item, "preferred")),
    hardSkills: uniqueMeaningfulTerms([...asStringArray(record.hardSkills), ...fallback.hardSkills], 80),
    softSkills: uniqueStrings([...asStringArray(record.softSkills), ...fallback.softSkills], 40),
    toolsPlatforms: uniqueMeaningfulTerms([...asStringArray(record.toolsPlatforms), ...fallback.toolsPlatforms], 60),
    certifications: uniqueStrings([...asStringArray(record.certifications), ...fallback.certifications], 40),
    responsibilities: uniqueStrings([...asStringArray(record.responsibilities), ...fallback.responsibilities], 30),
    industryKeywords: uniqueStrings([...asStringArray(record.industryKeywords), ...fallback.industryKeywords], 40),
    actionVerbs: uniqueStrings([...asStringArray(record.actionVerbs), ...fallback.actionVerbs], 30),
    repeatedTerms: uniqueStrings([...asStringArray(record.repeatedTerms), ...fallback.repeatedTerms], 30)
  };
  if (!job.mustHaveRequirements.length) job.mustHaveRequirements = fallback.mustHaveRequirements;
  return job;
}

export function validateProfileMatch(value: unknown, fallback: ProfileMatch): ProfileMatch {
  const record = isRecord(value) ? value : {};
  return {
    supportedKeywords: asArray(record.supportedKeywords).map((item) => validateKeywordMatch(item, "supported")),
    weaklySupportedKeywords: asArray(record.weaklySupportedKeywords).map((item) => validateKeywordMatch(item, "weak")),
    missingKeywords: asArray(record.missingKeywords).map((item) => validateKeywordMatch(item, "missing")),
    transferableSkills: asArray(record.transferableSkills).map((item) => validateKeywordMatch(item, "weak")),
    mustHaveMatches: asArray(record.mustHaveMatches).map((item) => validateRequirement(item, "must")).filter((item) => item.status !== "missing"),
    mustHaveGaps: asArray(record.mustHaveGaps).map((item) => validateRequirement(item, "must")).filter((item) => item.status === "missing"),
    optionalMatches: asArray(record.optionalMatches).map((item) => validateRequirement(item, "preferred")).filter((item) => item.status !== "missing"),
    optionalGaps: asArray(record.optionalGaps).map((item) => validateRequirement(item, "preferred")).filter((item) => item.status === "missing"),
    unsupportedClaims: uniqueStrings([...asStringArray(record.unsupportedClaims), ...fallback.unsupportedClaims], 50),
    score: clampScore(asNumber(record.score, fallback.score))
  };
}

export function validateSuggestions(value: unknown, fallback: Suggestion[]): Suggestion[] {
  const source = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.suggestions) ? value.suggestions : fallback;
  const suggestions = source.map((item, index) => validateSuggestion(item, fallback[index]));
  return suggestions.filter((suggestion) => suggestion.id && suggestion.section && suggestion.suggestedRewrite).slice(0, 20);
}

export function validateAtsRubric(value: unknown, fallback: AtsRubric): AtsRubric {
  const record = isRecord(value) ? value : {};
  return {
    parserSafety: clampScore(asNumber(record.parserSafety, fallback.parserSafety)),
    keywordCoverage: clampScore(asNumber(record.keywordCoverage, fallback.keywordCoverage)),
    mustHaveCoverage: clampScore(asNumber(record.mustHaveCoverage, fallback.mustHaveCoverage)),
    evidenceMetricsStrength: clampScore(asNumber(record.evidenceMetricsStrength, fallback.evidenceMetricsStrength)),
    experienceRelevance: clampScore(asNumber(record.experienceRelevance, fallback.experienceRelevance)),
    contactCompleteness: clampScore(asNumber(record.contactCompleteness, fallback.contactCompleteness)),
    dateCompleteness: clampScore(asNumber(record.dateCompleteness, fallback.dateCompleteness)),
    unsupportedClaimRisk: clampScore(asNumber(record.unsupportedClaimRisk, fallback.unsupportedClaimRisk)),
    overallScore: clampScore(asNumber(record.overallScore, fallback.overallScore)),
    feedback: uniqueStrings([...asStringArray(record.feedback), ...fallback.feedback], 20)
  };
}

export function validateGeneratePayload(
  value: unknown,
  fallback: { resumeText: string; coverLetter: string; feedbackSummary: string[]; warnings: string[] }
): { resumeText: string; coverLetter: string; feedbackSummary: string[]; warnings: string[] } {
  const record = isRecord(value) ? value : {};
  return {
    resumeText: cleanText(asString(record.resumeText) || fallback.resumeText),
    coverLetter: cleanText(asString(record.coverLetter) || fallback.coverLetter),
    feedbackSummary: uniqueStrings([...asStringArray(record.feedbackSummary), ...fallback.feedbackSummary], 20),
    warnings: uniqueStrings([...asStringArray(record.warnings), ...fallback.warnings], 20)
  };
}

export function validateFullGenerateResponse(value: GenerateResponse): GenerateResponse {
  return value;
}

function validateExperienceEntry(value: unknown): ExperienceEntry {
  const record = isRecord(value) ? value : {};
  return {
    employer: cleanText(asString(record.employer)),
    title: cleanText(asString(record.title)),
    location: cleanText(asString(record.location)),
    startDate: cleanText(asString(record.startDate)),
    endDate: cleanText(asString(record.endDate)),
    bullets: uniqueStrings(asStringArray(record.bullets), 12),
    tools: uniqueStrings(asStringArray(record.tools), 24),
    metrics: uniqueStrings(asStringArray(record.metrics), 12)
  };
}

function validateEducationEntry(value: unknown): EducationEntry {
  const record = isRecord(value) ? value : {};
  return {
    school: cleanText(asString(record.school)),
    degree: cleanText(asString(record.degree)),
    field: cleanText(asString(record.field)),
    location: cleanText(asString(record.location)),
    graduationDate: cleanText(asString(record.graduationDate)),
    details: uniqueStrings(asStringArray(record.details), 10)
  };
}

function validateCertificationEntry(value: unknown): CertificationEntry {
  const record = isRecord(value) ? value : {};
  if (typeof value === "string") return { name: cleanText(value) };
  return {
    name: cleanText(asString(record.name)),
    issuer: cleanText(asString(record.issuer)),
    date: cleanText(asString(record.date))
  };
}

function validateProjectEntry(value: unknown): ProjectEntry {
  const record = isRecord(value) ? value : {};
  return {
    name: cleanText(asString(record.name)),
    description: cleanText(asString(record.description)),
    tools: uniqueMeaningfulTerms(asStringArray(record.tools), 24),
    bullets: uniqueStrings(asStringArray(record.bullets), 12),
    link: cleanText(asString(record.link))
  };
}

function validateRequirement(value: unknown, fallbackCategory: Requirement["category"]): Requirement {
  const record = isRecord(value) ? value : {};
  const status = asString(record.status);
  const category = asString(record.category) === "preferred" ? "preferred" : fallbackCategory;
  return {
    text: cleanText(asString(record.text) || (typeof value === "string" ? value : "")),
    category,
    evidence: uniqueStrings(asStringArray(record.evidence), 8),
    status: status === "matched" || status === "weak" || status === "missing" ? status : "missing"
  };
}

function validateKeywordMatch(value: unknown, fallbackStatus: KeywordMatch["status"]): KeywordMatch {
  const record = isRecord(value) ? value : {};
  const status = asString(record.status);
  return {
    keyword: cleanText(asString(record.keyword) || (typeof value === "string" ? value : "")),
    status: status === "supported" || status === "weak" || status === "missing" ? status : fallbackStatus,
    evidence: uniqueStrings(asStringArray(record.evidence), 8),
    sourceSection: cleanText(asString(record.sourceSection))
  };
}

function validateSuggestion(value: unknown, fallback?: Suggestion): Suggestion {
  const record = isRecord(value) ? value : {};
  const riskLevel = asString(record.riskLevel);
  const status = asString(record.status);
  return {
    id: cleanText(asString(record.id) || fallback?.id || ""),
    section: cleanText(asString(record.section) || fallback?.section || ""),
    originalText: cleanText(asString(record.originalText) || fallback?.originalText || ""),
    suggestedRewrite: cleanText(asString(record.suggestedRewrite) || fallback?.suggestedRewrite || ""),
    reason: cleanText(asString(record.reason) || fallback?.reason || ""),
    confidence: clampScore(asNumber(record.confidence, fallback?.confidence ?? 50)),
    riskLevel: riskLevel === "low" || riskLevel === "medium" || riskLevel === "high" ? riskLevel : fallback?.riskLevel ?? "medium",
    profileSupported: typeof record.profileSupported === "boolean" ? asBoolean(record.profileSupported) : fallback?.profileSupported ?? false,
    status: status === "accepted" || status === "rejected" || status === "pending" ? status : fallback?.status ?? "pending"
  };
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map(asString).filter(Boolean);
}

function isRealExperience(entry: ExperienceEntry): boolean {
  return Boolean(!looksLikeMissingValue(entry.employer) && !looksLikeMissingValue(entry.title));
}

function hasEvidence(rawText: string, item: string): boolean {
  return includesTerm(rawText, item) || normalizeTerm(item).split(/\s+/).every((part) => part.length < 3 || includesTerm(rawText, part));
}

function hasNamedEvidence(rawText: string, item: string, fallbackItems: string[]): boolean {
  const normalized = normalizeTerm(item);
  return fallbackItems.map(normalizeTerm).includes(normalized) || hasEvidence(rawText, item);
}

function hasEntryEvidence(rawText: string, title: string, employer: string, fallbackEntries: ExperienceEntry[]): boolean {
  const normalizedTitle = normalizeTerm(title);
  const normalizedEmployer = normalizeTerm(employer);
  const fallbackHasEntry = fallbackEntries.some(
    (entry) => normalizeTerm(entry.title) === normalizedTitle && normalizeTerm(entry.employer) === normalizedEmployer
  );
  return fallbackHasEntry || (hasEvidence(rawText, title) && hasEvidence(rawText, employer));
}

function isSkillCandidate(item: string): boolean {
  return !/^(tools?|tooling|platforms?)\s*:/i.test(cleanText(item));
}
