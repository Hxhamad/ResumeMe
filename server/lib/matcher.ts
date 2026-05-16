import type { JobExtraction, KeywordMatch, ProfileMatch, Requirement, ResumeProfile } from "../../shared/types.js";
import { clampScore, cleanText, includesTerm, normalizeTerm, uniqueMeaningfulTerms, uniqueStrings } from "./text.js";

export function matchProfileFallback(profile: ResumeProfile, job: JobExtraction): ProfileMatch {
  const profileEvidence = profileEvidenceText(profile);
  const keywords = uniqueMeaningfulTerms([
    ...job.hardSkills,
    ...job.toolsPlatforms,
    ...job.certifications,
    ...job.industryKeywords,
    ...job.repeatedTerms
  ]);
  const keywordMatches = keywords.map((keyword) => classifyKeyword(keyword, profileEvidence, profile));
  const supportedKeywords = keywordMatches.filter((match) => match.status === "supported");
  const weaklySupportedKeywords = keywordMatches.filter((match) => match.status === "weak");
  const missingKeywords = keywordMatches.filter((match) => match.status === "missing");
  const mustHave = job.mustHaveRequirements.map((requirement) => classifyRequirement(requirement, profileEvidence, profile));
  const optional = job.preferredRequirements.map((requirement) => classifyRequirement(requirement, profileEvidence, profile));
  const mustHaveMatches = mustHave.filter((requirement) => requirement.status !== "missing");
  const mustHaveGaps = mustHave.filter((requirement) => requirement.status === "missing");
  const optionalMatches = optional.filter((requirement) => requirement.status !== "missing");
  const optionalGaps = optional.filter((requirement) => requirement.status === "missing");
  const transferableSkills = profile.skills
    .filter((skill) => !supportedKeywords.some((match) => normalizeTerm(match.keyword) === normalizeTerm(skill)))
    .slice(0, 8)
    .map((skill) => ({
      keyword: skill,
      status: "weak" as const,
      evidence: [`Profile lists ${skill}`],
      sourceSection: "Skills"
    }));
  const unsupportedClaims = uniqueStrings([
    ...mustHaveGaps.map((requirement) => `No profile evidence for required item: ${requirement.text}`),
    ...missingKeywords.slice(0, 8).map((match) => `No profile evidence for keyword: ${match.keyword}`)
  ]);
  const score = clampScore(
    (supportedKeywords.length * 1 + weaklySupportedKeywords.length * 0.45) / Math.max(1, keywords.length) * 55 +
      (mustHaveMatches.length / Math.max(1, mustHave.length)) * 45
  );

  return {
    supportedKeywords,
    weaklySupportedKeywords,
    missingKeywords,
    transferableSkills,
    mustHaveMatches,
    mustHaveGaps,
    optionalMatches,
    optionalGaps,
    unsupportedClaims,
    score
  };
}

function classifyKeyword(keyword: string, evidenceText: string, profile: ResumeProfile): KeywordMatch {
  const exact = includesTerm(evidenceText, keyword);
  if (exact) {
    return {
      keyword,
      status: "supported",
      evidence: findEvidence(keyword, profile),
      sourceSection: sourceForKeyword(keyword, profile)
    };
  }

  const parts = normalizeTerm(keyword).split(/\s+/).filter((part) => part.length > 2);
  const overlap = parts.filter((part) => includesTerm(evidenceText, part)).length;
  if (parts.length > 1 && overlap > 0) {
    return {
      keyword,
      status: "weak",
      evidence: [`Partial wording overlap with profile: ${parts.filter((part) => includesTerm(evidenceText, part)).join(", ")}`],
      sourceSection: "Profile"
    };
  }

  return {
    keyword,
    status: "missing",
    evidence: [],
    sourceSection: ""
  };
}

function classifyRequirement(requirement: Requirement, evidenceText: string, profile: ResumeProfile): Requirement {
  const skills = [...profile.skills, ...profile.tools, ...profile.certifications.map((certification) => certification.name)];
  const directEvidence = skills.filter((skill) => includesTerm(requirement.text, skill));
  const status = directEvidence.some((skill) => includesTerm(evidenceText, skill))
    ? "matched"
    : directEvidence.length > 0
      ? "weak"
      : includesTerm(evidenceText, requirement.text)
        ? "matched"
        : "missing";

  return {
    ...requirement,
    evidence: status === "missing" ? [] : uniqueStrings(directEvidence.map((skill) => `Profile lists ${skill}`)),
    status
  };
}

function profileEvidenceText(profile: ResumeProfile): string {
  return cleanText(
    [
      profile.rawText,
      profile.summary,
      profile.skills.join(" "),
      profile.tools.join(" "),
      profile.metrics.join(" "),
      profile.certifications.map((certification) => certification.name).join(" "),
      profile.experience.flatMap((entry) => [entry.title, entry.employer, entry.bullets.join(" "), entry.tools.join(" ")]).join(" "),
      profile.projects.flatMap((project) => [project.name, project.description, project.bullets.join(" "), project.tools.join(" ")]).join(" ")
    ].join("\n")
  );
}

function findEvidence(keyword: string, profile: ResumeProfile): string[] {
  const evidence: string[] = [];
  if (profile.skills.some((skill) => includesTerm(skill, keyword) || includesTerm(keyword, skill))) evidence.push(`Skills include ${keyword}`);
  if (profile.tools.some((tool) => includesTerm(tool, keyword) || includesTerm(keyword, tool))) evidence.push(`Tools include ${keyword}`);
  for (const entry of profile.experience) {
    const bullet = entry.bullets.find((item) => includesTerm(item, keyword));
    if (bullet) evidence.push(`${entry.title} at ${entry.employer}: ${bullet}`);
  }
  for (const project of profile.projects) {
    if (includesTerm(`${project.name} ${project.bullets.join(" ")}`, keyword)) evidence.push(`Project evidence: ${project.name}`);
  }
  for (const certification of profile.certifications) {
    if (includesTerm(certification.name, keyword) || includesTerm(keyword, certification.name)) evidence.push(`Certification: ${certification.name}`);
  }
  return uniqueStrings(evidence, 4);
}

function sourceForKeyword(keyword: string, profile: ResumeProfile): string {
  if (profile.skills.some((skill) => includesTerm(skill, keyword) || includesTerm(keyword, skill))) return "Skills";
  if (profile.tools.some((tool) => includesTerm(tool, keyword) || includesTerm(keyword, tool))) return "Tools";
  if (profile.certifications.some((certification) => includesTerm(certification.name, keyword) || includesTerm(keyword, certification.name))) {
    return "Certifications";
  }
  if (profile.experience.some((entry) => includesTerm(entry.bullets.join(" "), keyword))) return "Professional Experience";
  if (profile.projects.some((project) => includesTerm(project.bullets.join(" "), keyword))) return "Projects";
  return "Profile";
}
