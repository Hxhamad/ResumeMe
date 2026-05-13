export interface UserInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  targetRole?: string;
}

export interface ResumeSection {
  id: string;
  title: string;
  content: string;
}

export interface ExperienceEntry {
  employer: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
  tools: string[];
  metrics: string[];
}

export interface EducationEntry {
  school: string;
  degree?: string;
  field?: string;
  location?: string;
  graduationDate?: string;
  details: string[];
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  date?: string;
}

export interface ProjectEntry {
  name: string;
  description?: string;
  tools: string[];
  bullets: string[];
  link?: string;
}

export interface ResumeProfile {
  userInfo: UserInfo;
  rawText: string;
  summary: string;
  skills: string[];
  tools: string[];
  metrics: string[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
}

export interface Requirement {
  text: string;
  category: "must" | "preferred";
  evidence: string[];
  status: "matched" | "weak" | "missing";
}

export interface JobExtraction {
  targetTitle: string;
  seniority: string;
  mustHaveRequirements: Requirement[];
  preferredRequirements: Requirement[];
  hardSkills: string[];
  softSkills: string[];
  toolsPlatforms: string[];
  certifications: string[];
  responsibilities: string[];
  industryKeywords: string[];
  actionVerbs: string[];
  repeatedTerms: string[];
}

export interface KeywordMatch {
  keyword: string;
  status: "supported" | "weak" | "missing";
  evidence: string[];
  sourceSection: string;
}

export interface ProfileMatch {
  supportedKeywords: KeywordMatch[];
  weaklySupportedKeywords: KeywordMatch[];
  missingKeywords: KeywordMatch[];
  transferableSkills: KeywordMatch[];
  mustHaveMatches: Requirement[];
  mustHaveGaps: Requirement[];
  optionalMatches: Requirement[];
  optionalGaps: Requirement[];
  unsupportedClaims: string[];
  score: number;
}

export interface Suggestion {
  id: string;
  section: string;
  originalText: string;
  suggestedRewrite: string;
  reason: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  profileSupported: boolean;
  status?: "pending" | "accepted" | "rejected";
}

export interface SuggestionDecision {
  suggestionId: string;
  decision: "accepted" | "rejected";
}

export interface AtsRubric {
  parserSafety: number;
  keywordCoverage: number;
  mustHaveCoverage: number;
  evidenceMetricsStrength: number;
  experienceRelevance: number;
  contactCompleteness: number;
  dateCompleteness: number;
  unsupportedClaimRisk: number;
  overallScore: number;
  feedback: string[];
}

export interface GenerateResponse {
  profile: ResumeProfile;
  job: JobExtraction;
  match: ProfileMatch;
  suggestions: Suggestion[];
  ats: AtsRubric;
  resumeText: string;
  coverLetter: string;
  feedbackSummary: string[];
  warnings: string[];
}

export interface FullGenerateInput {
  profileText: string;
  jobDescription: string;
  userInfo: UserInfo;
  targetRole: string;
}
