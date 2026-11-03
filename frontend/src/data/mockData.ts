import { Subject, StudentProfile, LearningPathStep, Misconception } from '../types';

export const initialStudent: StudentProfile = {
  id: 'std_alex_99',
  name: 'Alex Rivera',
  email: 'alex.rivera@learnmind.ai',
  streakDays: 7,
  totalStudyHours: 24.5,
  completedConceptsCount: 18,
  overallMastery: 72,
  isNewStudent: false,
  activeMisconceptionsCount: 2,
};

export const sampleMisconceptions: Misconception[] = [
  {
    id: 'MIS_DIFF_POWER_01',
    name: 'Power Rule Exponent Error',
    topic: 'Differentiation',
    evidence: 'In question "Differentiate x³ + 5x", student answered 3x³ + 5 (multiplied exponent as coefficient but did not reduce power by 1).',
    repeatedErrors: 3,
    confidence: 88,
    correctiveExplanation: 'When differentiating xⁿ, remember the dual operation: multiply the base by the current power n, AND subtract 1 from the power: d/dx(xⁿ) = n·xⁿ⁻¹.',
    followUpQuestions: [
      'What is d/dx(x⁴)?',
      'Differentiate 2x⁵ - 3x.',
      'How does the power rule apply to x¹?'
    ],
    status: 'active',
    detectedAt: '2026-11-02'
  },
  {
    id: 'MIS_DIFF_CONST_02',
    name: 'Constant Multiple Confusion',
    topic: 'Differentiation',
    evidence: 'Treated 5x as a standalone constant and differentiated it to 0 instead of 5.',
    repeatedErrors: 2,
    confidence: 76,
    correctiveExplanation: 'The constant multiple rule states that d/dx[c·f(x)] = c·f\'(x). Since d/dx(x) = 1, d/dx(5x) = 5·1 = 5, not 0.',
    followUpQuestions: [
      'What is the derivative of 7x with respect to x?',
      'Differentiate f(x) = 12x + 9.'
    ],
    status: 'active',
    detectedAt: '2026-11-03'
  }
];

export const sampleSubjects: Subject[] = [
  {
    id: 'sub_math',
    name: 'Mathematics',
    code: 'MATH-201',
    status: 'developing',
    masteryScore: 68,
    confidence: 'high',
    color: '#00f0ff', // Cyan
    brainRegion: 'Frontal Cortex (Reasoning & Logic)',
    nodeCoordinates: [0.8, 0.4, 0.5],
    totalTopics: 12,
    completedTopics: 7,
    detectedMisconceptionsCount: 2,
    recommendedNextConcept: 'Power Rule and Constant Multiple Rule in Differentiation',
    units: [
      {
        id: 'u1_math',
        title: 'Unit 1: Foundations & Functions',
        topics: [
          {
            id: 'top_algebra',
            name: 'Algebra',
            status: 'strong',
            masteryScore: 92,
            confidence: 'high',
            completed: true,
            misconceptions: [],
            concepts: [
              { id: 'c_alg_1', name: 'Polynomial Expansion', description: 'Manipulating and expanding algebraic polynomials', masteryScore: 0.94, status: 'strong', confidence: 'high' },
              { id: 'c_alg_2', name: 'Factorization', description: 'Quadratic & cubic factoring', masteryScore: 0.90, status: 'strong', confidence: 'high' }
            ]
          },
          {
            id: 'top_functions',
            name: 'Functions',
            status: 'good',
            masteryScore: 84,
            confidence: 'high',
            completed: true,
            misconceptions: [],
            concepts: [
              { id: 'c_fun_1', name: 'Domain & Range', description: 'Real function inputs and outputs', masteryScore: 0.88, status: 'good', confidence: 'high' },
              { id: 'c_fun_2', name: 'Composite Functions', description: 'f(g(x)) chaining', masteryScore: 0.80, status: 'good', confidence: 'medium' }
            ]
          },
          {
            id: 'top_limits',
            name: 'Limits',
            status: 'developing',
            masteryScore: 71,
            confidence: 'medium',
            completed: true,
            misconceptions: [],
            concepts: [
              { id: 'c_lim_1', name: 'One-Sided Limits', description: 'Behavior as x approaches from left or right', masteryScore: 0.75, status: 'developing', confidence: 'medium' },
              { id: 'c_lim_2', name: 'L\'Hôpital\'s Rule', description: 'Evaluating 0/0 indeterminate forms', masteryScore: 0.67, status: 'developing', confidence: 'medium' }
            ]
          }
        ]
      },
      {
        id: 'u2_math',
        title: 'Unit 2: Differential Calculus',
        topics: [
          {
            id: 'top_diff',
            name: 'Differentiation',
            status: 'needs_improvement',
            masteryScore: 48,
            confidence: 'high',
            completed: false,
            recommendedNext: 'Power Rule Refinement',
            misconceptions: sampleMisconceptions,
            concepts: [
              { id: 'c_dif_1', name: 'Definition of Derivative', description: 'Instantaneous rate of change as limit of difference quotient', masteryScore: 0.60, status: 'developing', confidence: 'medium' },
              { id: 'c_dif_2', name: 'Power Rule', description: 'd/dx(x^n) = n*x^(n-1)', masteryScore: 0.42, status: 'needs_improvement', confidence: 'high' },
              { id: 'c_dif_3', name: 'Product & Quotient Rules', description: 'd/dx(u*v) and d/dx(u/v)', masteryScore: 0.45, status: 'needs_improvement', confidence: 'medium' },
              { id: 'c_dif_4', name: 'Chain Rule', description: 'd/dx(f(g(x))) = f\'(g(x))*g\'(x)', masteryScore: 0.38, status: 'needs_improvement', confidence: 'medium' }
            ]
          },
          {
            id: 'top_integ',
            name: 'Integration',
            status: 'not_assessed',
            masteryScore: 0,
            confidence: 'none',
            completed: false,
            misconceptions: [],
            concepts: [
              { id: 'c_int_1', name: 'Indefinite Integrals', description: 'Anti-derivatives and constants of integration', masteryScore: 0, status: 'not_assessed', confidence: 'none' },
              { id: 'c_int_2', name: 'Definite Integrals & Fundamental Theorem', description: 'Area under curves', masteryScore: 0, status: 'not_assessed', confidence: 'none' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'sub_python',
    name: 'Python Programming',
    code: 'CS-101',
    status: 'good',
    masteryScore: 82,
    confidence: 'high',
    color: '#38bdf8', // Neon Sky Blue
    brainRegion: 'Temporal Lobe (Language & Sequences)',
    nodeCoordinates: [-0.8, -0.2, 0.4],
    totalTopics: 10,
    completedTopics: 8,
    detectedMisconceptionsCount: 0,
    recommendedNextConcept: 'Object-Oriented Inheritance & Polymorphism',
    units: [
      {
        id: 'u1_py',
        title: 'Core Syntax & Structures',
        topics: [
          {
            id: 'top_py_syntax',
            name: 'Variables & Control Flow',
            status: 'strong',
            masteryScore: 94,
            confidence: 'high',
            completed: true,
            misconceptions: [],
            concepts: [
              { id: 'c_py_1', name: 'Conditionals & Loops', description: 'if/elif/else and while/for loops', masteryScore: 0.96, status: 'strong', confidence: 'high' }
            ]
          },
          {
            id: 'top_py_fn',
            name: 'Functions & Lambdas',
            status: 'strong',
            masteryScore: 90,
            confidence: 'high',
            completed: true,
            misconceptions: [],
            concepts: [
              { id: 'c_py_2', name: 'First-class Functions', description: 'Scope, closures, *args, **kwargs', masteryScore: 0.90, status: 'strong', confidence: 'high' }
            ]
          },
          {
            id: 'top_py_oop',
            name: 'Object-Oriented Programming',
            status: 'developing',
            masteryScore: 68,
            confidence: 'medium',
            completed: false,
            misconceptions: [],
            concepts: [
              { id: 'c_py_3', name: 'Classes & Dunder Methods', description: '__init__, __repr__, inheritance', masteryScore: 0.68, status: 'developing', confidence: 'medium' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'sub_java',
    name: 'Java Architecture',
    code: 'CS-202',
    status: 'needs_improvement',
    masteryScore: 44,
    confidence: 'high',
    color: '#f97316', // Orange
    brainRegion: 'Parietal Lobe (Spatial & Structural Processing)',
    nodeCoordinates: [0.3, 0.7, -0.6],
    totalTopics: 8,
    completedTopics: 3,
    detectedMisconceptionsCount: 1,
    recommendedNextConcept: 'Interface Segregation and Abstract Classes',
    units: [
      {
        id: 'u1_java',
        title: 'Core OOP & Memory',
        topics: [
          {
            id: 'top_jvm',
            name: 'JVM & Memory Management',
            status: 'needs_improvement',
            masteryScore: 42,
            confidence: 'high',
            completed: false,
            misconceptions: [
              {
                id: 'MIS_JAVA_MEM_01',
                name: 'Pass-by-Value vs Reference Confusion',
                topic: 'JVM Memory',
                evidence: 'Believed Java passes objects by reference rather than passing object reference copies by value.',
                repeatedErrors: 2,
                confidence: 84,
                correctiveExplanation: 'In Java, everything is strictly pass-by-value. For objects, the value passed to a method is the pointer/reference address itself, not the memory pointer.',
                status: 'active'
              }
            ],
            concepts: [
              { id: 'c_jvm_1', name: 'Stack vs Heap', description: 'Primitive allocation vs Object referencing', masteryScore: 0.40, status: 'needs_improvement', confidence: 'high' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'sub_physics',
    name: 'Physics (Mechanics)',
    code: 'PHYS-101',
    status: 'not_assessed',
    masteryScore: 0,
    confidence: 'none',
    color: '#94a3b8', // Slate Grey
    brainRegion: 'Occipital Lobe (Visual & Trajectory Processing)',
    nodeCoordinates: [-0.4, -0.6, -0.5],
    totalTopics: 10,
    completedTopics: 0,
    detectedMisconceptionsCount: 0,
    recommendedNextConcept: 'Start Diagnostic Assessment to Map Knowledge Profile',
    units: [
      {
        id: 'u1_phys',
        title: 'Classical Kinematics',
        topics: [
          {
            id: 'top_phys_kin',
            name: '1D & 2D Kinematics',
            status: 'not_assessed',
            masteryScore: 0,
            confidence: 'none',
            completed: false,
            misconceptions: [],
            concepts: [
              { id: 'c_phys_1', name: 'Velocity vs Acceleration Vectors', description: 'Derivatives of position', masteryScore: 0, status: 'not_assessed', confidence: 'none' }
            ]
          }
        ]
      }
    ]
  }
];

export const sampleLearningPath: LearningPathStep[] = [
  {
    id: 'lp_1',
    topicId: 'top_diff',
    topicName: 'Power Rule Mechanics & Constant Rule',
    subjectName: 'Mathematics',
    whyRecommended: 'Identified recurring exponent reduction error (MIS_DIFF_POWER_01) in diagnostic questions.',
    difficulty: 'Beginner',
    estimatedMinutes: 15,
    currentMastery: 42,
    completed: false,
    prerequisites: ['Algebra - Polynomial Expansion', 'Limits - Definition of Derivative'],
    status: 'ready'
  },
  {
    id: 'lp_2',
    topicId: 'top_diff',
    topicName: 'Constant Multiple & Sum Rules',
    subjectName: 'Mathematics',
    whyRecommended: 'Targeted remediation for MIS_DIFF_CONST_02 (d/dx[5x] = 5, not 0).',
    difficulty: 'Beginner',
    estimatedMinutes: 12,
    currentMastery: 48,
    completed: false,
    prerequisites: ['Power Rule Mechanics'],
    status: 'ready'
  },
  {
    id: 'lp_3',
    topicId: 'top_diff',
    topicName: 'Product & Quotient Rules',
    subjectName: 'Mathematics',
    whyRecommended: 'Direct prerequisite required before tackling Chain Rule.',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    currentMastery: 45,
    completed: false,
    prerequisites: ['Power Rule Mechanics & Constant Rule'],
    status: 'ready'
  },
  {
    id: 'lp_4',
    topicId: 'top_diff',
    topicName: 'The Chain Rule with Composite Functions',
    subjectName: 'Mathematics',
    whyRecommended: 'Foundational step required to bridge into Integration techniques.',
    difficulty: 'Advanced',
    estimatedMinutes: 25,
    currentMastery: 38,
    completed: false,
    prerequisites: ['Functions - Composite Functions', 'Product & Quotient Rules'],
    status: 'locked'
  },
  {
    id: 'lp_5',
    topicId: 'top_integ',
    topicName: 'Introduction to Anti-Derivatives',
    subjectName: 'Mathematics',
    whyRecommended: 'Unlock next syllabus unit upon reaching ≥70% mastery in Differentiation.',
    difficulty: 'Intermediate',
    estimatedMinutes: 30,
    currentMastery: 0,
    completed: false,
    prerequisites: ['The Chain Rule with Composite Functions'],
    status: 'locked'
  }
];

