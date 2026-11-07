import React, { useCallback, useState } from 'react';
import { Subject, StudentProfile, Misconception } from '../types';
import { RealisticHumanBrain, BrainMode } from '../components/Brain3D/RealisticHumanBrain';
import { BrainNavigationRing } from '../components/Brain3D/BrainNavigationRing';
import { NavSection } from '../components/Sidebar';
import { MousePointerClick, Sparkles, Activity, ShieldCheck, Zap, BookOpen, Upload, Layers, CheckCircle2 } from 'lucide-react';

interface DashboardPageProps {
  subjects: Subject[];
  student: StudentProfile;
  misconceptions: Misconception[];
  isNewStudent: boolean;
  onSelectSubject: (subject: Subject) => void;
  onOpenKnowledgeMatrix: () => void;
  onNavigate: (section: NavSection) => void;
  brainMode: BrainMode;
  setBrainMode: (mode: BrainMode) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  subjects,
  student,
  misconceptions,
  isNewStudent,
  onNavigate,
  brainMode,
  setBrainMode,
}) => {
  const [selectedSection, setSelectedSection] = useState<NavSection | null>(null);
  const [activeSubjIdx, setActiveSubjIdx] = useState<number>(0);

  // Toggle between compact brain (initial) and expanded navigation mode
  const handleBrainClick = useCallback(() => {
    if (brainMode === 'compact') {
      setBrainMode('expanded');
    } else if (brainMode === 'expanded') {
      setBrainMode('compact');
    }
  }, [brainMode, setBrainMode]);

  // Selecting a navigation label in expanded mode
  const handleSelectNavigationSection = useCallback((section: NavSection) => {
    setSelectedSection(section);
    setBrainMode('dissolving');
  }, [setBrainMode]);

  // Completion callback for particle dissolve or reconstruction
  const handleTransitionComplete = useCallback(() => {
    if (brainMode === 'dissolving' && selectedSection) {
      onNavigate(selectedSection);
      setSelectedSection(null);
    } else if (brainMode === 'reconstructing') {
      setBrainMode('expanded');
    }
  }, [brainMode, selectedSection, onNavigate, setBrainMode]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050814] flex items-center justify-center select-none">
      {/* 1. Dark Cinematic Background with Cyan & Violet Lighting */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,240,255,0.08)_0%,_rgba(168,85,247,0.05)_40%,_rgba(5,8,20,0.98)_80%)] pointer-events-none" />
      <div className="absolute inset-0 cyber-grid pointer-events-none opacity-20" />

      {/* Futuristic Telemetry Corner HUDs (Discreet, Sci-Fi) */}
      <div className="absolute top-6 left-8 z-20 pointer-events-none flex items-center gap-3 animate-fadeIn">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
        <div className="font-mono text-[11px] tracking-widest text-cyan-300/80">
          <span className="font-bold text-white">LEARNMIND COGNITIVE CORE</span>
          <span className="mx-2 text-cyan-500/50">|</span>
          <span className="text-cyan-400 uppercase">STUDENT: {student.name}</span>
        </div>
      </div>

      <div className="absolute top-6 right-8 z-20 pointer-events-none flex items-center gap-4 animate-fadeIn">
        <div className="px-3 py-1 rounded-full bg-slate-900/60 border border-cyan-500/25 font-mono text-[10px] tracking-widest text-slate-300 flex items-center gap-2">
          <Zap className="w-3 h-3 text-cyan-400" />
          <span>MODE: </span>
          <span className="font-bold text-cyan-300">
            {brainMode === 'compact' && 'STANDBY DORMANT'}
            {brainMode === 'expanded' && 'ORBITAL EXPLORER'}
            {brainMode === 'dissolving' && 'SYNAPTIC BURST'}
            {brainMode === 'reconstructing' && 'PARTICLE CONVERGENCE'}
          </span>
        </div>
      </div>

      {/* Subtle glowing aura directly behind the brain */}
      <div className="absolute w-[580px] h-[580px] rounded-full bg-gradient-to-tr from-cyan-500/15 via-purple-600/10 to-transparent blur-3xl pointer-events-none animate-pulse-glow" />

      {/* 2. Full-Screen Realistic 3D Human Brain (Occupies ~65-80% screen height) */}
      <div className="relative w-full h-full flex items-center justify-center z-10">
        <RealisticHumanBrain
          mode={brainMode}
          onBrainClick={handleBrainClick}
          onTransitionComplete={handleTransitionComplete}
          highlightedSection={selectedSection}
        />
      </div>

      {/* 3. Orbiting Holographic Navigation Ring (Revealed upon clicking brain) */}
      {brainMode !== 'compact' && (
        <BrainNavigationRing
          isVisible={brainMode === 'expanded' || brainMode === 'dissolving'}
          onSelectSection={handleSelectNavigationSection}
          selectedSection={selectedSection}
        />
      )}

      {/* Dynamic Energy Burst Bloom Overlay during Dissolve */}
      {brainMode === 'dissolving' && (
        <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center animate-fadeIn">
          <div className="w-[100vw] h-[100vh] rounded-full bg-[radial-gradient(circle_at_center,_rgba(0,240,255,0.35)_0%,_rgba(168,85,247,0.2)_30%,_rgba(5,8,20,0.85)_70%,_transparent_100%)] blur-2xl animate-pulse" />
        </div>
      )}

      {/* Dynamic Inward Convergence Rings during Reconstruction */}
      {brainMode === 'reconstructing' && (
        <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
          <div className="w-[500px] h-[500px] rounded-full border border-cyan-400/40 animate-ping" />
          <div className="w-[300px] h-[300px] rounded-full border border-purple-500/40 animate-pulse" />
        </div>
      )}

      {/* 4. Bottom Instruction: "CLICK THE BRAIN TO EXPLORE" */}
      {brainMode === 'compact' && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-fadeIn">
          <button
            onClick={handleBrainClick}
            className="group px-8 py-3.5 rounded-full bg-slate-950/85 hover:bg-slate-900/95 border border-cyan-400/60 hover:border-cyan-300 text-cyan-300 font-mono text-xs tracking-widest uppercase backdrop-blur-xl transition-all duration-300 flex items-center gap-3.5 shadow-[0_0_35px_rgba(0,240,255,0.3)] hover:shadow-[0_0_55px_rgba(0,240,255,0.6)] hover:scale-105"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-bold tracking-widest text-white group-hover:text-cyan-200">
              CLICK THE BRAIN TO EXPLORE
            </span>
            <MousePointerClick className="w-4 h-4 text-cyan-400 group-hover:translate-y-[-1px] transition-transform" />
          </button>
        </div>
      )}

      {/* Expanded Mode Bottom Hint */}
      {brainMode === 'expanded' && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-fadeIn">
          <div className="px-6 py-2.5 rounded-full bg-slate-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-[11px] tracking-wider uppercase backdrop-blur-md flex items-center gap-2.5 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-spin-slow" />
            <span>Select any neural domain to transition into that section</span>
          </div>
        </div>
      )}

      {/* 5. Dynamic Holographic Curriculum Tray (Student-Partition Grounded) */}
      {brainMode === 'compact' && (
        <div className="absolute bottom-8 left-8 z-30 pointer-events-auto max-w-sm w-full animate-fadeIn">
          {subjects.length === 0 ? (
            /* Scenario A: Zero Syllabi Uploaded -> Empty State Card */
            <div className="p-4 rounded-2xl glass-panel border border-cyan-500/30 bg-slate-950/85 backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.15)] space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-mono text-[10px] tracking-widest text-cyan-400 font-bold uppercase">
                    Curriculum Status
                  </div>
                  <div className="font-bold text-sm text-white">No subjects uploaded yet</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Upload your institutional course syllabus (Java, Python, Math, Physics, Chemistry, OS, etc.) to calibrate your neural cognitive matrix.
              </p>
              <button
                onClick={() => onNavigate('syllabus')}
                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Your First Syllabus</span>
              </button>
            </div>
          ) : subjects.length === 1 ? (
            /* Scenario B: Exactly One Syllabus Uploaded */
            <div className="p-4 rounded-2xl glass-panel border border-cyan-500/40 bg-slate-950/85 backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.2)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-widest text-cyan-400 font-bold uppercase">
                  Enrolled Subject (1)
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
                  {subjects[0].code}
                </span>
              </div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: subjects[0].color || '#38bdf8' }} />
                <span className="truncate">{subjects[0].name}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>{subjects[0].units.length} Units • {subjects[0].totalTopics} Topics</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {subjects[0].completedTopics || 0}/{subjects[0].totalTopics || 0} Mastered
                </span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all"
                  style={{
                    width: `${subjects[0].totalTopics ? Math.round(((subjects[0].completedTopics || 0) / subjects[0].totalTopics) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => onNavigate('syllabus')}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>View Syllabus</span>
                </button>
                <button
                  onClick={() => onNavigate('assessment')}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Diagnostic</span>
                </button>
              </div>
            </div>
          ) : (
            /* Scenario C: Multiple Syllabi Uploaded (Dynamic Count + Switcher) */
            <div className="p-4 rounded-2xl glass-panel border border-cyan-500/40 bg-slate-950/85 backdrop-blur-xl shadow-[0_0_25px_rgba(0,240,255,0.2)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] tracking-widest text-cyan-400 font-bold uppercase">
                  Total Subjects: {subjects.length}
                </div>
                <button
                  onClick={() => onNavigate('syllabus')}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition-colors cursor-pointer"
                >
                  <span>+ Upload More</span>
                </button>
              </div>

              {/* Dynamic Subject Switcher Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {subjects.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSubjIdx(idx)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      activeSubjIdx === idx
                        ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(0,240,255,0.3)] font-bold'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Active Subject Inspector */}
              {subjects[activeSubjIdx] && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white truncate max-w-[200px]">
                      {subjects[activeSubjIdx].name}
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">
                      {subjects[activeSubjIdx].code}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>
                      {subjects[activeSubjIdx].units.length} Units • {subjects[activeSubjIdx].totalTopics} Topics
                    </span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {subjects[activeSubjIdx].completedTopics || 0}/{subjects[activeSubjIdx].totalTopics || 0} Mastered
                    </span>
                  </div>
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-cyan-400 h-full rounded-full transition-all"
                      style={{
                        width: `${subjects[activeSubjIdx].totalTopics ? Math.round(((subjects[activeSubjIdx].completedTopics || 0) / subjects[activeSubjIdx].totalTopics) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => onNavigate('syllabus')}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>View Syllabus</span>
                    </button>
                    <button
                      onClick={() => onNavigate('assessment')}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Diagnostic</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
