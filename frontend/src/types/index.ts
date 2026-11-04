export type MasteryLevel = 'strong' | 'good' | 'developing' | 'needs_improvement' | 'not_assessed';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface Concept {
  id: string;
  name: string;
  description: string;
  masteryScore: number; // 0 to 1
  status: MasteryLevel;
  confidence: ConfidenceLevel;
  isPrerequisiteFor?: string[];
}

export interface Misconception {
  id: string;
  name: string;
  topic: string;
  evidence: string;
  repeatedErrors: number;
  confidence: number; // 0 to 100%
  correctiveExplanation: string;
  followUpQuestions?: string[];
  status: 'active' | 'resolving' | 'resolved';
  detectedAt?: string;
}

export interface Topic {
  id: string;
  name: string;
  status: MasteryLevel;
  masteryScore: number; // 0 to 100
  confidence: ConfidenceLevel;
  concepts: Concept[];
  misconceptions: Misconception[];
  completed: boolean;
  pageNumber?: number;
  coverageStatus?: 'completed' | 'currently_studying' | 'partially_covered' | 'not_started';
  recommendedNext?: string;
}

export interface Unit {
  id: string;
  title: string;
  pageNumber?: number;
  topics: Topic[];
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  status: MasteryLevel;
  masteryScore: number;
  confidence: ConfidenceLevel;
  color: string;
  brainRegion: string; // e.g. "Frontal Lobe", "Temporal Lobe", "Parietal Lobe", "Occipital Lobe"
  nodeCoordinates: [number, number, number]; // 3D coordinates for brain connection
  totalTopics: number;
  completedTopics: number;
  units: Unit[];
  detectedMisconceptionsCount: number;
  recommendedNextConcept: string;
}

export interface DiagnosticOption {
  id: string;
  text: string;
  isCorrect: boolean;
  misconceptionId?: string;
  misconceptionName?: string;
  explanation?: string;
}

export interface DiagnosticQuestion {
  id: string;
  subjectId: string;
  topicId: string;
  conceptId: string;
  questionText: string;
  latex?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  options: DiagnosticOption[];
  prerequisites?: string[];
}

export interface LearningPathStep {
  id: string;
  topicId: string;
  topicName: string;
  subjectName: string;
  whyRecommended: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedMinutes: number;
  currentMastery: number;
  completed: boolean;
  prerequisites: string[];
  status: 'ready' | 'locked' | 'completed';
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  streakDays: number;
  totalStudyHours: number;
  completedConceptsCount: number;
  overallMastery: number;
  isNewStudent: boolean;
  activeMisconceptionsCount: number;
}

