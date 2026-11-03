import React, { useState } from 'react';
import { Sidebar, NavSection } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { SyllabusPage } from './pages/SyllabusPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { TutorPage } from './pages/TutorPage';
import { LearningPathPage } from './pages/LearningPathPage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsPage } from './pages/SettingsPage';
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

export function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [brainMode, setBrainMode] = useState<BrainMode>('compact');
  const [subjects, setSubjects] = useState<Subject[]>(sampleSubjects);
  const [student, setStudent] = useState<StudentProfile>(initialStudent);
  const [misconceptions, setMisconceptions] = useState<Misconception[]>(sampleMisconceptions);
  const [learningPath, setLearningPath] = useState<LearningPathStep[]>(sampleLearningPath);
  const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(sampleSubjects[0]);
  const [tutorInitialTopic, setTutorInitialTopic] = useState('Differentiation & Power Rule');

  // Toggle demo mode between Active Assessed Student and Brand New Student
  const handleToggleNewStudent = () => {
    setStudent((prev) => {
      const nextIsNew = !prev.isNewStudent;
      return {
        ...prev,
        isNewStudent: nextIsNew,
        overallMastery: nextIsNew ? 0 : 72,
        activeMisconceptionsCount: nextIsNew ? 0 : 2,
        streakDays: nextIsNew ? 0 : 7,
        totalStudyHours: nextIsNew ? 0 : 24.5,
      };
    });
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
    setSubjects((prev) => [...prev, newSubject]);
  };

  const handleUpdateSubject = (updated: Subject) => {
    setSubjects((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleCompleteAssessment = (results: {
    strongConcepts: string[];
    weakConcepts: string[];
    misconceptions: Misconception[];
    confidence: number;
  }) => {
    if (results.misconceptions.length > 0) {
      setMisconceptions(results.misconceptions);
    }
    setStudent((prev) => ({
      ...prev,
      isNewStudent: false,
      overallMastery: Math.min(100, prev.overallMastery + 6),
      activeMisconceptionsCount: results.misconceptions.length,
    }));
  };

  const handleStartLearningStep = (step: LearningPathStep) => {
    setTutorInitialTopic(step.topicName);
    setActiveSection('tutor');
  };

  const handleCompleteLearningStep = (stepId: string) => {
    setLearningPath((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, completed: true } : s))
    );
    setStudent((prev) => ({
      ...prev,
      completedConceptsCount: prev.completedConceptsCount + 1,
      overallMastery: Math.min(100, prev.overallMastery + 4),
    }));
  };

  // Return to 3D Brain Hub with Particle Reconstruction Sequence
  const handleReturnToBrain = () => {
    setBrainMode('reconstructing');
    setActiveSection('dashboard');
  };

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
        /* 2. INNER APPLICATION SECTIONS (With Sidebar, Top Telemetry, and Floating Return-to-Brain) */
        <div className="flex h-screen w-screen overflow-hidden relative animate-fadeIn">
          {/* Futuristic Cyberpunk Background Glows */}
          <div className="fixed inset-0 cyber-radial-glow pointer-events-none z-0" />
          <div className="fixed inset-0 cyber-grid pointer-events-none z-0 opacity-25" />

          {/* Section Sidebar Navigation */}
          <Sidebar
            activeSection={activeSection}
            onNavigate={(sec) => {
              if (sec === 'dashboard') {
                handleReturnToBrain();
              } else {
                setActiveSection(sec);
              }
            }}
            student={student}
            isNewStudent={student.isNewStudent}
            onToggleNewStudent={handleToggleNewStudent}
          />

          {/* Main Section Content Area */}
          <div className="flex-1 flex flex-col min-w-0 z-10 overflow-hidden relative">
            <Navbar
              activeSection={activeSection}
              student={student}
              onLaunchAssessment={() => handleLaunchAssessment()}
              activeMisconceptionsCount={student.activeMisconceptionsCount}
            />

            <main className="flex-1 overflow-y-auto">
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
                  onUpdateStudent={(updated) => setStudent((prev) => ({ ...prev, ...updated }))}
                />
              )}
            </main>
          </div>

          {/* Floating Animated "Return to Neural Brain" button on all section pages */}
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
