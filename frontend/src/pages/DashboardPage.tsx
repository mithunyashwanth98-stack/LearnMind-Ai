import React, { useCallback, useState } from 'react';
import { Subject, StudentProfile, Misconception } from '../types';
import { RealisticHumanBrain, BrainMode } from '../components/Brain3D/RealisticHumanBrain';
import { BrainNavigationRing } from '../components/Brain3D/BrainNavigationRing';
import { NavSection } from '../components/Sidebar';
import { MousePointerClick, Sparkles, Activity, ShieldCheck, Zap } from 'lucide-react';

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
          <span className="text-cyan-400">NEURAL INTERFACE ONLINE</span>
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
    </div>
  );
};
