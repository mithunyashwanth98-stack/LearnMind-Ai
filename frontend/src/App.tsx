import React, { useState, useEffect } from 'react';
import { NavSection } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SyllabusPage } from './pages/SyllabusPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { TutorPage } from './pages/TutorPage';
import { LearningPathPage } from './pages/LearningPathPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { BrainKnowledgeModal } from './components/Brain3D/BrainKnowledgeModal';
import { ReturnToBrainButton } from './components/Brain3D/ReturnToBrainButton';
import { BrainMode } from './components/Brain3D/RealisticHumanBrain';
import {
  initialStudent,
  sampleSubjects,
  sampleMisconceptions,
  sampleLearningPath,
} from './data/mockData';
import { Subject, StudentProfile, LearningPathStep, Misconception } from './types';
import {
  getCurrentSession,
  getStudentPartition,
  saveStudentPartition,
  logoutUser,
  UserAccount,
  StudentDataPartition,
  initializeDatabase,
} from './services/db';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return getCurrentSession() !== null;
  });
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [brainMode, setBrainMode] = useState<BrainMode>('compact');
  const [subjects, setSubjects] = useState<Subject[]>(sampleSubjects);
  const [student, setStudent] = useState<StudentProfile>(initialStudent);
  const [misconceptions, setMisconceptions] = useState<Misconception[]>(sampleMisconceptions);
  const [learningPath, setLearningPath] = useState<LearningPathStep[]>(sampleLearningPath);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(sampleSubjects[0]);
  const [tutorInitialTopic, setTutorInitialTopic] = useState('Differentiation & Power Rule');

  // Verify and hydrate current user session on mount
  useEffect(() => {
    initializeDatabase().then(() => {
      const session = getCurrentSession();
      if (session) {
        const partition = getStudentPartition(session.userId);
        if (partition) {
          setStudent(partition.profile);
          setSubjects(partition.subjects);
          setMisconceptions(partition.misconceptions);
          setLearningPath(partition.learningPath);
          setIsAuthenticated(true);
        }
      }
    });
  }, []);

  // Save student partition whenever relevant state changes
  const persistPartition = (
    updatedProfile?: StudentProfile,
    updatedSubjects?: Subject[],
    updatedMisconceptions?: Misconception[],
    updatedPath?: LearningPathStep[]
  ) => {
    const prof = updatedProfile || student;
    const subs = updatedSubjects || subjects;
    const miscs = updatedMisconceptions || misconceptions;
    const path = updatedPath || learningPath;

    saveStudentPartition(prof.id, {
      profile: prof,
      subjects: subs,
      misconceptions: miscs,
      learningPath: path,
      tutorMessages: [],
    });
  };

  const handleLoginSuccess = (user: UserAccount, partition: StudentDataPartition) => {
    setStudent(partition.profile);
    setSubjects(partition.subjects);
    setMisconceptions(partition.misconceptions);
    setLearningPath(partition.learningPath);
    setIsAuthenticated(true);
    setActiveSection('dashboard');
    setBrainMode('compact');
  };

  const handleLogout = () => {
    logoutUser();
    setIsAuthenticated(false);
    setActiveSection('dashboard');
    setBrainMode('compact');
  };

  const handleSelectSubjectFromBrain = (subj: Subject) => {
    setSelectedSubject(subj);
    setIsKnowledgeModalOpen(true);
  };

  const handleLaunchAssessment = (subjectId?: string) => {
    setActiveSection('assessment');
    setIsKnowledgeModalOpen(false);
  };

  const handleLaunchTutor = (topicName: string) => {
    setTutorInitialTopic(topicName);
    setActiveSection('tutor');
    setIsKnowledgeModalOpen(false);
  };

  const handleAddSubject = (newSubject: Subject) => {
    const updated = [...subjects, newSubject];
    setSubjects(updated);
    persistPartition(student, updated);
  };

  const handleUpdateSubject = (updatedSubj: Subject) => {
    const updated = subjects.map((s) => (s.id === updatedSubj.id ? updatedSubj : s));
    setSubjects(updated);
    persistPartition(student, updated);
  };

  const handleCompleteAssessment = (results: {
    strongConcepts: string[];
    weakConcepts: string[];
    misconceptions: Misconception[];
    confidence: number;
  }) => {
    let nextMisconceptions = misconceptions;
    if (results.misconceptions.length > 0) {
      nextMisconceptions = results.misconceptions;
      setMisconceptions(nextMisconceptions);
    }
    const nextStudent: StudentProfile = {
      ...student,
      isNewStudent: false,
      overallMastery: Math.min(100, student.overallMastery + 6),
      activeMisconceptionsCount: results.misconceptions.length,
    };
    setStudent(nextStudent);
    persistPartition(nextStudent, subjects, nextMisconceptions, learningPath);
  };

  const handleStartLearningStep = (step: LearningPathStep) => {
    setTutorInitialTopic(step.topicName);
    setActiveSection('tutor');
  };

  const handleCompleteLearningStep = (stepId: string) => {
    const nextPath = learningPath.map((s) => (s.id === stepId ? { ...s, completed: true } : s));
    setLearningPath(nextPath);
    const nextStudent: StudentProfile = {
      ...student,
      completedConceptsCount: student.completedConceptsCount + 1,
      overallMastery: Math.min(100, student.overallMastery + 4),
    };
    setStudent(nextStudent);
    persistPartition(nextStudent, subjects, misconceptions, nextPath);
  };

  // Return to 3D Brain Hub with Particle Reconstruction Sequence
  const handleReturnToBrain = () => {
    setBrainMode('reconstructing');
    setActiveSection('dashboard');
  };

  // ========================================================
  // RENDER FLOW:
  // 1. Unauthenticated -> Show Dual-Pane LoginPage
  // 2. Authenticated + 'dashboard' -> Full-Screen 3D Brain
  // 3. Authenticated + other section -> Full-Screen Pure Section
  // ========================================================

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  const isInitialBrainScreen = activeSection === 'dashboard';

  return (
    <div className="w-screen h-screen bg-[#050814] text-slate-100 overflow-hidden font-sans select-none relative">
      {/* 1. INITIAL FULL-SCREEN DIGITAL BRAIN HUB (No sidebar, no top navbar, no cards) */}
      {isInitialBrainScreen ? (
        <DashboardPage
          subjects={subjects}
          student={student}
          misconceptions={misconceptions}
          isNewStudent={student.isNewStudent}
          onSelectSubject={handleSelectSubjectFromBrain}
          onOpenKnowledgeMatrix={() => setIsKnowledgeModalOpen(true)}
          onNavigate={(sec) => {
            setActiveSection(sec);
          }}
          brainMode={brainMode}
          setBrainMode={setBrainMode}
        />
      ) : (
        /* 2. INNER APPLICATION SECTIONS (100% Full-Screen Pure Section — NO sidebar, NO top navbar) */
        <div className="w-screen h-screen overflow-hidden relative animate-fadeIn">
          {/* Cyberpunk Radial Backdrop Glow */}
          <div className="fixed inset-0 cyber-radial-glow pointer-events-none z-0" />
          <div className="fixed inset-0 cyber-grid pointer-events-none z-0 opacity-20" />

          {/* Full Screen Section Content */}
          <main className="w-full h-full overflow-y-auto z-10 relative">
            {activeSection === 'knowledge' && (
              <KnowledgePage
                subjects={subjects}
                isNewStudent={student.isNewStudent}
                onLaunchAssessment={handleLaunchAssessment}
                onLaunchTutor={handleLaunchTutor}
              />
            )}

            {activeSection === 'syllabus' && (
              <SyllabusPage
                subjects={subjects}
                onAddSubject={handleAddSubject}
                onUpdateSubject={handleUpdateSubject}
              />
            )}

            {activeSection === 'assessment' && (
              <AssessmentPage
                subjects={subjects}
                onCompleteAssessment={handleCompleteAssessment}
                onNavigateToTutor={() => setActiveSection('tutor')}
              />
            )}

            {activeSection === 'tutor' && (
              <TutorPage
                subjects={subjects}
                misconceptions={misconceptions}
                initialTopic={tutorInitialTopic}
                studentName={student.name}
              />
            )}

            {activeSection === 'learning-path' && (
              <LearningPathPage
                steps={learningPath}
                onStartStep={handleStartLearningStep}
                onCompleteStep={handleCompleteLearningStep}
              />
            )}

            {activeSection === 'progress' && (
              <ProgressPage
                subjects={subjects}
                student={student}
                misconceptions={misconceptions}
              />
            )}

            {activeSection === 'settings' && (
              <SettingsPage
                student={student}
                onUpdateStudent={(updated) => {
                  const next = { ...student, ...updated };
                  setStudent(next);
                  persistPartition(next);
                }}
                onLogout={handleLogout}
              />
            )}
          </main>

          {/* Floating Animated "RETURN TO BRAIN" control fixed at bottom-right of every section */}
          <ReturnToBrainButton onReturn={handleReturnToBrain} />
        </div>
      )}

      {/* 3D Brain Interactive Subject Knowledge Modal */}
      <BrainKnowledgeModal
        isOpen={isKnowledgeModalOpen}
        onClose={() => setIsKnowledgeModalOpen(false)}
        subjects={subjects}
        selectedSubject={selectedSubject}
        onSelectSubject={setSelectedSubject}
        onStartAssessment={handleLaunchAssessment}
        onStartRemediation={() => {
          setIsKnowledgeModalOpen(false);
          setActiveSection('tutor');
        }}
        isNewStudent={student.isNewStudent}
      />
    </div>
  );
}

export default App;
