import type {
  JobExtraction,
  ProfileMatch,
  ResumeProfile,
  Suggestion,
  SuggestionDecision,
  UserInfo
} from "../../shared/types.js";
import { applySuggestionDecisions } from "./suggestions.js";
import { cleanText, compactJoin, findKnownTerms, isContactLikeLine, looksLikeMissingValue, parseDelimitedList, uniqueMeaningfulTerms, uniqueStrings } from "./text.js";

export function formatResumeText(
  profile: ResumeProfile,
  job?: JobExtraction,
  suggestions: Suggestion[] = [],
  decisions: SuggestionDecision[] = []
): string {
  const accepted = applySuggestionDecisions(suggestions, decisions).acceptedSafeSuggestions;
  const output: string[] = [];
  const header = formatHeader(profile.userInfo);
  if (header) output.push(header);

  const summary = accepted.find((suggestion) => suggestion.section === "Professional Summary")?.suggestedRewrite || fallbackSummary(profile, job);
  if (summary) output.push(section("Professional Summary", [summary]));

  const skills =
    accepted.find((suggestion) => suggestion.section === "Skills")?.suggestedRewrite ||
    uniqueMeaningfulTerms(profile.skills).join(", ");
  if (skills) output.push(section("Core Skills", wrapCommaLine(skills)));

  const experienceBlock = formatExperience(profile);
  if (experienceBlock) output.push(experienceBlock);

  const projectBlock = formatProjects(profile);
  if (projectBlock) output.push(projectBlock);

  const educationBlock = formatEducation(profile);
  if (educationBlock) output.push(educationBlock);

  const certificationBlock = formatCertifications(profile);
  if (certificationBlock) output.push(certificationBlock);

  return sanitizeResumeText(output.join("\n\n"), profile.userInfo);
}

export function generateCoverLetterFallback(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch): string {
  const name = profile.userInfo.fullName || "Candidate";
  const role = job.targetTitle || profile.userInfo.targetRole || "the role";
  const skills = uniqueMeaningfulTerms([...match.supportedKeywords.map((item) => item.keyword), ...profile.skills]).slice(0, 6).join(", ");
  const certs = profile.certifications.map((certification) => certification.name).slice(0, 2).join(", ");
  const experienceSentence = profile.experience.length
    ? `My submitted profile includes supported work history such as ${profile.experience
        .slice(0, 2)
        .map((entry) => `${entry.title} at ${entry.employer}`)
        .join(" and ")}.`
    : "My submitted profile does not yet include verified work history, so I would add real role, employer, date, and project evidence before claiming experience.";
  const gaps = match.mustHaveGaps.slice(0, 3).map((gap) => gap.text).join("; ");

  return cleanText(`Dear Hiring Team,

I am interested in ${role}. My submitted profile shows support for ${skills || "the listed profile skills"}${certs ? ` and includes ${certs}` : ""}.

${experienceSentence} The job emphasizes ${job.hardSkills.slice(0, 5).join(", ") || "the responsibilities in the posting"}, and I would keep the resume focused on profile-supported evidence for those areas.

${gaps ? "I am careful to keep application materials grounded in verified facts, so any requirements not supported by the submitted profile should be added only with truthful examples." : "The provided profile appears to cover the main listed requirements without adding unsupported claims."}

Sincerely,
${name}`);
}

export function feedbackSummaryFallback(match: ProfileMatch): string[] {
  return [
    `${match.supportedKeywords.length} keywords are strongly supported; ${match.weaklySupportedKeywords.length} are weakly supported by the profile.`,
    `${match.mustHaveGaps.length} must-have requirements need more evidence.`,
    match.unsupportedClaims.length
      ? "Unsupported claims were kept out of the generated resume."
      : "No unsupported claim warnings were detected by the deterministic matcher."
  ];
}

export function sanitizeResumeText(text: string, userInfo: UserInfo): string {
  const lines = cleanText(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/not specified|candidate profile|relevant experience/i.test(line))
    .filter((line) => !/^[-*•]\s*/.test(line) || !isContactLikeLine(line, userInfo));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function guardResumeText(profile: ResumeProfile, generatedText: string, fallbackText: string): { resumeText: string; warnings: string[] } {
  const text = sanitizeResumeText(generatedText, profile.userInfo);
  const warnings: string[] = [];
  const profileNumbers = new Set((profile.rawText.match(/\d+%|\$\d+(?:,\d{3})*|\b\d+\s*(?:k|m|million|hours|days|weeks|months|users|customers|tickets|projects|deployments|reports|applications|employees|teams)\b/gi) ?? []).map((item) => item.toLowerCase()));
  const resumeNumbers = text.match(/\d+%|\$\d+(?:,\d{3})*|\b\d+\s*(?:k|m|million|hours|days|weeks|months|users|customers|tickets|projects|deployments|reports|applications|employees|teams)\b/gi) ?? [];

  if (!text) warnings.push("AI resume text was empty.");
  if (!profile.experience.length && /\bprofessional experience\b|\brelevant experience\b|\bwork experience\b/i.test(text)) {
    warnings.push("AI resume text introduced an experience section without real work entries.");
  }
  if (!profile.experience.length && /\b(experience|expertise|expert)\b/i.test(text)) {
    warnings.push("AI resume text used unsupported experience or expertise language.");
  }
  if (/candidate profile|relevant experience|not specified/i.test(text)) {
    warnings.push("AI resume text included blocked placeholder wording.");
  }
  if (resumeNumbers.some((metric) => !profileNumbers.has(metric.toLowerCase()))) {
    warnings.push("AI resume text introduced a metric not present in the profile.");
  }

  return warnings.length
    ? { resumeText: sanitizeResumeText(fallbackText, profile.userInfo), warnings }
    : { resumeText: text, warnings };
}

function formatHeader(userInfo: UserInfo): string {
  const name = cleanText(userInfo.fullName || "Candidate");
  const contact = compactJoin([userInfo.email, userInfo.phone, userInfo.location, userInfo.linkedin, userInfo.portfolio]);
  return contact ? `${name}\n${contact}` : name;
}

function fallbackSummary(profile: ResumeProfile, job?: JobExtraction): string {
  const role = job?.targetTitle || profile.userInfo.targetRole || "";
  const skills = uniqueMeaningfulTerms(profile.skills).slice(0, 8).join(", ");
  const certs = profile.certifications.map((certification) => certification.name).slice(0, 2).join(", ");
  if (profile.summary && (profile.experience.length || !/\b(experience|expertise|expert|years?)\b/i.test(profile.summary))) return profile.summary;
  if (profile.experience.length) {
    return cleanText(
      `Professional with profile-supported work history${role ? ` for ${role} roles` : ""}${skills ? ` and skills in ${skills}` : ""}. ${certs ? `Credentials include ${certs}.` : ""}`
    );
  }
  return cleanText(
    `Candidate with profile-supported skills${role ? ` for ${role} roles` : ""}${skills ? ` in ${skills}` : ""}. ${certs ? `Credentials include ${certs}.` : ""}`
  );
}

function section(title: string, lines: string[]): string {
  const content = lines.map(cleanText).filter(Boolean);
  if (!content.length) return "";
  return `${title}\n${content.join("\n")}`;
}

function wrapCommaLine(value: string): string[] {
  return uniqueMeaningfulTerms(value.split(/,|;|\n/)).map((item) => `- ${item}`);
}

function formatExperience(profile: ResumeProfile): string {
  const blocks = profile.experience
    .filter((entry) => !looksLikeMissingValue(entry.title) && !looksLikeMissingValue(entry.employer))
    .map((entry) => {
      const date = compactJoin([entry.startDate || "", entry.endDate || ""], " - ");
      const header = compactJoin([entry.title, entry.employer, date, entry.location || ""]);
      const bullets = entry.bullets
        .map((bullet) => cleanText(bullet.replace(/^[-*•]\s*/, "")))
        .filter((bullet) => bullet && !isContactLikeLine(bullet, profile.userInfo))
        .map((bullet) => `- ${bullet}`);
      return [header, ...bullets].filter(Boolean).join("\n");
    })
    .filter(Boolean);
  return blocks.length ? section("Professional Experience", blocks) : "";
}

function formatProjects(profile: ResumeProfile): string {
  const blocks = profile.projects
    .filter((project) => !looksLikeMissingValue(project.name))
    .map((project) => {
      const lines = [project.name];
      const toolBullets = project.bullets.filter((bullet) => /^tools?\s*:/i.test(cleanText(bullet.replace(/^[-*â€¢]\s*/, ""))));
      const inlineTools = toolBullets.flatMap((bullet) => parseDelimitedList(cleanText(bullet).replace(/^[-*â€¢]\s*tools?\s*:\s*/i, "")));
      const tools = uniqueMeaningfulTerms([...project.tools, ...inlineTools, ...findKnownTerms(inlineTools.join(", "))]);
      const bullets = uniqueStrings([project.description || "", ...project.bullets]).filter(
        (bullet) => !/^tools?\s*:/i.test(cleanText(bullet.replace(/^[-*â€¢]\s*/, "")))
      );
      lines.push(...bullets.map((bullet) => `- ${bullet}`));
      if (tools.length) lines.push(`- Tools: ${tools.join(", ")}`);
      return lines.join("\n");
    });
  return blocks.length ? section("Projects", blocks) : "";
}

function formatEducation(profile: ResumeProfile): string {
  const lines = profile.education
    .filter((entry) => !looksLikeMissingValue(entry.school))
    .map((entry) => compactJoin([entry.degree || "", entry.field || "", entry.school, entry.graduationDate || "", entry.location || ""]));
  return lines.length ? section("Education", lines.map((line) => `- ${line}`)) : "";
}

function formatCertifications(profile: ResumeProfile): string {
  const lines = profile.certifications
    .filter(
      (entry) =>
        !looksLikeMissingValue(entry.name) &&
        !/^(summary|professional summary|profile|skills)\s*:/i.test(entry.name) &&
        !/\b(profile-supported skills|candidate with|professional with|credentials include)\b/i.test(entry.name) &&
        /\b(certified|certification|certificate|license|aws certified|aws.*architect|pmp|cissp|scrum)\b/i.test(entry.name)
    )
    .map((entry) => compactJoin([entry.name, entry.issuer || "", entry.date || ""]));
  return lines.length ? section("Certifications", lines.map((line) => `- ${line}`)) : "";
}
