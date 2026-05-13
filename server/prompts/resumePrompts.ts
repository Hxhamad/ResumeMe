import type { JobExtraction, ProfileMatch, ResumeProfile, Suggestion } from "../../shared/types.js";

export interface MiniMaxMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const STRICT_JSON_RULES = `Return strict JSON only. No markdown. No prose outside JSON. No hidden reasoning. No extra schema keys.
Never fabricate candidate facts. Do not invent employers, dates, schools, degrees, certifications, tools, metrics, job titles, projects, or achievements.
If profile evidence is missing, mark it missing and say what evidence the user should add.`;

export function jobExtractionPrompt(jobDescription: string, targetRole: string): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Extract the job description into exactly these keys:
targetTitle:string, seniority:string, mustHaveRequirements:array of {text:string,category:"must",evidence:[],status:"missing"}, preferredRequirements:array of {text:string,category:"preferred",evidence:[],status:"missing"}, hardSkills:string[], softSkills:string[], toolsPlatforms:string[], certifications:string[], responsibilities:string[], industryKeywords:string[], actionVerbs:string[], repeatedTerms:string[].`
    },
    {
      role: "user",
      content: JSON.stringify({ targetRole, jobDescription })
    }
  ];
}

export function profileParsingPrompt(profileText: string, userInfo: unknown): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Parse only facts directly present in the profile text or contact fields.
Return exactly these keys:
userInfo:{fullName:string,email:string,phone:string,location:string,linkedin:string,portfolio:string,targetRole:string}, rawText:string, summary:string, skills:string[], tools:string[], metrics:string[], experience:array of {employer:string,title:string,location:string,startDate:string,endDate:string,bullets:string[],tools:string[],metrics:string[]}, projects:array of {name:string,description:string,tools:string[],bullets:string[],link:string}, education:array of {school:string,degree:string,field:string,location:string,graduationDate:string,details:string[]}, certifications:array of {name:string,issuer:string,date:string}.
Do not create placeholder experience. If no real employer and title are present, return experience:[].`
    },
    {
      role: "user",
      content: JSON.stringify({ userInfo, profileText })
    }
  ];
}

export function profileMatchingPrompt(profile: ResumeProfile, job: JobExtraction): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Compare profile evidence to the job. Distinguish supported, weak, and missing.
Return exactly these keys:
supportedKeywords:array of {keyword:string,status:"supported",evidence:string[],sourceSection:string}, weaklySupportedKeywords:array of {keyword:string,status:"weak",evidence:string[],sourceSection:string}, missingKeywords:array of {keyword:string,status:"missing",evidence:[],sourceSection:string}, transferableSkills:array of {keyword:string,status:"weak",evidence:string[],sourceSection:string}, mustHaveMatches:Requirement[], mustHaveGaps:Requirement[], optionalMatches:Requirement[], optionalGaps:Requirement[], unsupportedClaims:string[], score:number.
Requirement objects must be {text:string,category:"must"|"preferred",evidence:string[],status:"matched"|"weak"|"missing"}.`
    },
    {
      role: "user",
      content: JSON.stringify({ profile, job })
    }
  ];
}

export function suggestionPrompt(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Generate section-specific resume suggestions. Every suggestion must preserve the candidate's facts.
Return exactly an array of objects with these keys:
id:string, section:string, originalText:string, suggestedRewrite:string, reason:string, confidence:number, riskLevel:"low"|"medium"|"high", profileSupported:boolean, status:"pending".
For unsupported missing requirements, profileSupported must be false and the rewrite must ask the user to add real evidence, not claim the requirement.`
    },
    {
      role: "user",
      content: JSON.stringify({ profile, job, match })
    }
  ];
}

export function resumeGenerationPrompt(
  profile: ResumeProfile,
  job: JobExtraction,
  match: ProfileMatch,
  suggestions: Suggestion[]
): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Generate ATS-safe plain text using only profile-supported facts and accepted safe suggestions.
Return exactly these keys:
resumeText:string, feedbackSummary:string[], warnings:string[].
Resume text rules: one column, standard headings, hyphen bullets, no tables, no icons, no decorative separators, no hidden keywords, no keyword stuffing, no fake ATS guarantees.
Do not turn contact info into bullets. Do not create fake "Relevant Experience" or "Candidate Profile". Do not use "Not specified" as a visible work entry. If no real job title/company exists, omit Professional Experience.`
    },
    {
      role: "user",
      content: JSON.stringify({ profile, job, match, suggestions })
    }
  ];
}

export function coverLetterPrompt(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Write a concise cover letter using only profile-supported facts. If work evidence is absent, do not claim experience or expertise.
Return exactly these keys:
coverLetter:string, warnings:string[].`
    },
    {
      role: "user",
      content: JSON.stringify({ profile, job, match })
    }
  ];
}

export function feedbackPrompt(profile: ResumeProfile, job: JobExtraction, match: ProfileMatch): MiniMaxMessage[] {
  return [
    {
      role: "system",
      content: `${STRICT_JSON_RULES}
Explain resume feedback without inventing facts.
Return exactly these keys:
feedbackSummary:string[], warnings:string[].`
    },
    {
      role: "user",
      content: JSON.stringify({ profile, job, match })
    }
  ];
}
