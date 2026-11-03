import React from 'react';
import {
  Activity,
  Flame,
  Clock,
  FlaskConical,
  Bell,
  Cpu,
  Search
} from 'lucide-react';
import { StudentProfile } from '../types';
import { NavSection } from './Sidebar';

interface NavbarProps {
  activeSection: NavSection;
  student: StudentProfile;
  onLaunchAssessment: () => void;
  activeMisconceptionsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeSection,
  student,
  onLaunchAssessment,
  activeMisconceptionsCount,
}) => {
  const getSectionTitle = () => {
    switch (activeSection) {
      case 'dashboard':
        return {
          title: 'Cortical Neural Dashboard',
          sub: 'Real-time 3D Cognitive State & Knowledge Mapping',
        };
      case 'knowledge':
        return {
          title: 'Knowledge Matrix & Concepts',
          sub: 'Granular Prerequisite Topology & Topic Competency',
        };
      case 'syllabus':
        return {
          title: 'Syllabus Intelligence Engine',
          sub: 'PyMuPDF Text Extraction & Unit Deconstruction',
        };
      case 'assessment':
        return {
          title: 'Adaptive Diagnostic Arena',
          sub: 'Bayesian Beta Uncertainty Tracking & Misconception Fingerprinting',
        };
      case 'tutor':
        return {
          title: 'Holographic AI Tutor',
          sub: 'Interactive JARVIS-class Voice & Remediative Dialogue',
        };
      case 'learning-path':
        return {
          title: 'Prerequisite-Directed Path',
          sub: 'Topologically Ordered Concept Milestones & Targeted Practice',
        };
      case 'progress':
        return {
          title: 'Mastery & Research Telemetry',
          sub: 'Precision, Recall, F1 & Longitudinal Learning Metrics',
        };
      case 'settings':
        return {
          title: 'System Settings & Models',
          sub: 'Model Parameters, API Keys & Experiment Configurations',
        };
    }
  };

  const { title, sub } = getSectionTitle();

  return (
    <header className="h-20 glass-panel border-b border-cyan-500/20 px-8 flex items-center justify-between z-20 shrink-0">
      {/* Title & Subtitle */}
      <div>
        <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
          <span>{title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono">
            LIVE
          </span>
        </h1>
        <p className="text-xs text-slate-400 font-mono">{sub}</p>
      </div>

      {/* Telemetry Metrics & Quick Actions */}
      <div className="flex items-center gap-4">
        {/* Research Experiment Mode Indicator */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs">
          <FlaskConical className="w-4 h-4 text-purple-400" />
          <span className="font-semibold">Experiment Mode:</span>
          <span className="font-mono text-white">Active (Exp B & D)</span>
        </div>

        {/* Streak Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs">
          <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
          <span className="font-mono font-bold text-white">{student.streakDays}d Streak</span>
        </div>

        {/* Study Hours Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs">
          <Clock className="w-4 h-4 text-sky-400" />
          <span className="font-mono font-bold text-white">{student.totalStudyHours} hrs</span>
        </div>

        {/* Misconception Alert Badge */}
        {activeMisconceptionsCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-mono font-bold">{activeMisconceptionsCount} Misconceptions</span>
          </div>
        )}

        {/* Quick Diagnostic Launch Button */}
        <button
          onClick={onLaunchAssessment}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all duration-200 hover:brightness-110 flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Quick Diagnostic</span>
        </button>
      </div>
    </header>
  );
};

