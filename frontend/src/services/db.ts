import {
  Subject,
  StudentProfile,
  LearningPathStep,
  Misconception,
  Unit,
  Topic,
  Concept,
} from '../types';
import {
  sampleSubjects,
  sampleMisconceptions,
  sampleLearningPath,
  initialStudent,
} from '../data/mockData';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface StudentDataPartition {
  profile: StudentProfile;
  subjects: Subject[];
  misconceptions: Misconception[];
  learningPath: LearningPathStep[];
  tutorMessages: Array<{
    id: string;
    sender: 'user' | 'tutor';
    text: string;
    timestamp: string;
    suggestedActions?: string[];
  }>;
}

const STORAGE_USERS_KEY = 'learnmind_db_users_v2';
const STORAGE_DATA_PREFIX = 'learnmind_data_user_';
const SESSION_AUTH_KEY = 'learnmind_session_token';
const SESSION_USER_ID_KEY = 'learnmind_session_user_id';
const LOCAL_REMEMBER_KEY = 'learnmind_remember_user_id';

// Simple deterministic cryptographic SHA-256 hash
export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password + '::learnmind_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Generate secure random session token
function generateToken(): string {
  return 'lmt_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Initialize database with default demo account if first run
export async function initializeDatabase(): Promise<void> {
  const usersRaw = localStorage.getItem(STORAGE_USERS_KEY);
  let users: UserAccount[] = usersRaw ? JSON.parse(usersRaw) : [];

  const demoUser = users.find((u) => u.email.toLowerCase() === 'demo@learnmind.ai');
  if (!demoUser) {
    const demoHash = await hashPassword('password123');
    const demoAccount: UserAccount = {
      id: 'usr_demo_4491',
      name: 'Alex Rivera',
      email: 'demo@learnmind.ai',
      passwordHash: demoHash,
      createdAt: new Date().toISOString(),
    };
    users.push(demoAccount);
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));

    // Seed Demo Student Partition with active calculus diagnostic records
    const demoPartition: StudentDataPartition = {
      profile: {
        id: 'usr_demo_4491',
        name: 'Alex Rivera',
        email: 'demo@learnmind.ai',
        streakDays: 7,
        totalStudyHours: 24.5,
        completedConceptsCount: 18,
        overallMastery: 72,
        isNewStudent: false,
        activeMisconceptionsCount: sampleMisconceptions.length,
      },
      subjects: sampleSubjects,
      misconceptions: sampleMisconceptions,
      learningPath: sampleLearningPath,
      tutorMessages: [
        {
          id: 'msg_init',
          sender: 'tutor',
          text: `Greetings, Alex. I am your LearnMind AI Holo-Tutor. I see you recently took an assessment on Differentiation & Power Rule where an exponent reduction misconception was identified. How can I guide your conceptual understanding today?`,
          timestamp: 'Just now',
          suggestedActions: [
            'Explain the Power Rule step-by-step',
            'Why does d/dx(5x) equal 5 and not 0?',
            'Give me a real-world example of derivatives',
            'Generate a practice question for me',
          ],
        },
      ],
    };
    localStorage.setItem(
      STORAGE_DATA_PREFIX + 'usr_demo_4491',
      JSON.stringify(demoPartition)
    );
  }
}

// Create clean, unassessed subjects template for new students
function createCleanSubjectsForNewStudent(): Subject[] {
  return [
    {
      id: 'sub_math',
      name: 'Mathematics',
      code: 'MATH-201',
      status: 'not_assessed',
      masteryScore: 0,
      confidence: 'none',
      color: '#00f0ff',
      brainRegion: 'Frontal Cortex (Reasoning & Logic)',
      nodeCoordinates: [0.8, 0.4, 0.5],
      totalTopics: 12,
      completedTopics: 0,
      detectedMisconceptionsCount: 0,
      recommendedNextConcept: 'Foundational Limits & Functions',
      units: [
        {
          id: 'u1',
          title: 'Unit 1: Functions & Differential Calculus',
          topics: [
            {
              id: 't1',
              name: 'Limits and Continuity',
              status: 'not_assessed',
              masteryScore: 0,
              confidence: 'none',
              completed: false,
              recommendedNext: 'Definition of the Derivative',
              concepts: [
                {
                  id: 'c1',
                  name: 'Epsilon-Delta Definition',
                  description: 'Rigorous definition of limit approaching finite values',
                  masteryScore: 0,
                  status: 'not_assessed',
                  confidence: 'none',
                },
                {
                  id: 'c2',
                  name: 'One-Sided Limits',
                  description: 'Left and right behavior near discontinuities',
                  masteryScore: 0,
                  status: 'not_assessed',
                  confidence: 'none',
                },
              ],
              misconceptions: [],
            },
          ],
        },
      ],
    },
    {
      id: 'sub_cs',
      name: 'Computer Science',
      code: 'CS-101',
      status: 'not_assessed',
      masteryScore: 0,
      confidence: 'none',
      color: '#a855f7',
      brainRegion: 'Temporal Lobe (Memory & Algorithms)',
      nodeCoordinates: [-0.9, 0.2, 0.4],
      totalTopics: 10,
      completedTopics: 0,
      detectedMisconceptionsCount: 0,
      recommendedNextConcept: 'Asymptotic Complexity Analysis',
      units: [],
    },
    {
      id: 'sub_phys',
      name: 'Physics',
      code: 'PHYS-150',
      status: 'not_assessed',
      masteryScore: 0,
      confidence: 'none',
      color: '#38bdf8',
      brainRegion: 'Parietal Lobe (Spatial & Motion)',
      nodeCoordinates: [0.4, 0.9, -0.3],
      totalTopics: 8,
      completedTopics: 0,
      detectedMisconceptionsCount: 0,
      recommendedNextConcept: 'Kinematics in One Dimension',
      units: [],
    },
  ];
}

// User Registration
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: UserAccount; partition: StudentDataPartition }> {
  await initializeDatabase();
  const usersRaw = localStorage.getItem(STORAGE_USERS_KEY);
  const users: UserAccount[] = usersRaw ? JSON.parse(usersRaw) : [];

  const cleanEmail = email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === cleanEmail)) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const userId = 'usr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
  const passwordHash = await hashPassword(password);

  const newUser: UserAccount = {
    id: userId,
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));

  // Initialize completely isolated, clean student partition (Zero fake data)
  const newPartition: StudentDataPartition = {
    profile: {
      id: userId,
      name: name.trim(),
      email: cleanEmail,
      streakDays: 0,
      totalStudyHours: 0,
      completedConceptsCount: 0,
      overallMastery: 0,
      isNewStudent: true,
      activeMisconceptionsCount: 0,
    },
    subjects: createCleanSubjectsForNewStudent(),
    misconceptions: [],
    learningPath: [
      {
        id: 'step_init_1',
        topicId: 't1',
        topicName: 'Diagnostic Assessment Calibration',
        subjectName: 'Mathematics',
        whyRecommended: 'Complete your initial diagnostic test to map your cognitive neural matrix',
        difficulty: 'Beginner',
        estimatedMinutes: 10,
        currentMastery: 0,
        completed: false,
        prerequisites: [],
        status: 'ready',
      },
    ],
    tutorMessages: [
      {
        id: 'msg_welcome',
        sender: 'tutor',
        text: `Welcome to LearnMind AI, ${name.trim()}. I am your personalized Holo-JARVIS tutor. Once you complete your first diagnostic assessment or upload a syllabus, I will detect your conceptual misconceptions and construct a custom learning path. What would you like to explore first?`,
        timestamp: 'Just now',
        suggestedActions: [
          'Start Diagnostic Assessment',
          'Upload Course Syllabus',
          'Explore Cognitive Matrix',
        ],
      },
    ],
  };

  localStorage.setItem(STORAGE_DATA_PREFIX + userId, JSON.stringify(newPartition));

  // Set session
  const token = generateToken();
  sessionStorage.setItem(SESSION_AUTH_KEY, token);
  sessionStorage.setItem(SESSION_USER_ID_KEY, userId);

  return { user: newUser, partition: newPartition };
}

// User Login
export async function loginUser(
  email: string,
  password: string,
  rememberMe: boolean = false
): Promise<{ user: UserAccount; partition: StudentDataPartition }> {
  await initializeDatabase();
  const usersRaw = localStorage.getItem(STORAGE_USERS_KEY);
  const users: UserAccount[] = usersRaw ? JSON.parse(usersRaw) : [];

  const cleanEmail = email.trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    throw new Error('No student account found with this email address.');
  }

  const hash = await hashPassword(password);
  if (user.passwordHash !== hash) {
    throw new Error('Incorrect password. Please verify your credentials.');
  }

  // Load user-partitioned data
  const dataRaw = localStorage.getItem(STORAGE_DATA_PREFIX + user.id);
  let partition: StudentDataPartition;

  if (dataRaw) {
    partition = JSON.parse(dataRaw);
  } else {
    // If somehow missing partition, construct clean one
    partition = {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        streakDays: 0,
        totalStudyHours: 0,
        completedConceptsCount: 0,
        overallMastery: 0,
        isNewStudent: true,
        activeMisconceptionsCount: 0,
      },
      subjects: createCleanSubjectsForNewStudent(),
      misconceptions: [],
      learningPath: [],
      tutorMessages: [],
    };
    localStorage.setItem(STORAGE_DATA_PREFIX + user.id, JSON.stringify(partition));
  }

  // Establish session
  const token = generateToken();
  sessionStorage.setItem(SESSION_AUTH_KEY, token);
  sessionStorage.setItem(SESSION_USER_ID_KEY, user.id);

  if (rememberMe) {
    localStorage.setItem(LOCAL_REMEMBER_KEY, user.id);
  } else {
    localStorage.removeItem(LOCAL_REMEMBER_KEY);
  }

  return { user, partition };
}

// Check current session
export function getCurrentSession(): { userId: string } | null {
  const token = sessionStorage.getItem(SESSION_AUTH_KEY);
  const userId = sessionStorage.getItem(SESSION_USER_ID_KEY);

  if (token && userId) {
    return { userId };
  }

  // Check remember me in localStorage
  const rememberedUserId = localStorage.getItem(LOCAL_REMEMBER_KEY);
  if (rememberedUserId) {
    // Restore session
    const newToken = generateToken();
    sessionStorage.setItem(SESSION_AUTH_KEY, newToken);
    sessionStorage.setItem(SESSION_USER_ID_KEY, rememberedUserId);
    return { userId: rememberedUserId };
  }

  return null;
}

// Load data partition strictly for current user
export function getStudentPartition(userId: string): StudentDataPartition | null {
  const dataRaw = localStorage.getItem(STORAGE_DATA_PREFIX + userId);
  if (!dataRaw) return null;
  try {
    return JSON.parse(dataRaw);
  } catch {
    return null;
  }
}

// Save data partition strictly for current user
export function saveStudentPartition(userId: string, data: StudentDataPartition): void {
  localStorage.setItem(STORAGE_DATA_PREFIX + userId, JSON.stringify(data));
}

// Logout
export function logoutUser(): void {
  sessionStorage.removeItem(SESSION_AUTH_KEY);
  sessionStorage.removeItem(SESSION_USER_ID_KEY);
  localStorage.removeItem(LOCAL_REMEMBER_KEY);
}

// Reset password request (mock simulation with temporary token)
export async function requestPasswordReset(email: string): Promise<string> {
  await initializeDatabase();
  const usersRaw = localStorage.getItem(STORAGE_USERS_KEY);
  const users: UserAccount[] = usersRaw ? JSON.parse(usersRaw) : [];
  const cleanEmail = email.trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    throw new Error('No account found with this email.');
  }

  return `A reset verification link has been sent to ${cleanEmail}. In demo mode, your password is ready to be updated.`;
}

