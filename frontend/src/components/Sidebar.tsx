import React from 'react';
import {
  LayoutDashboard,
  Brain,
  BrainCircuit,
  FileSpreadsheet,
  Activity,
  Bot,
  GitBranch,
  LineChart,
  Settings as SettingsIcon,
  Sparkles,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { StudentProfile } from '../types';

export type NavSection =
  | 'dashboard'
  | 'knowledge'
  | 'syllabus'
  | 'assessment'
  | 'tutor'
  | 'learning-path'
  | 'progress'
  | 'settings';

interface SidebarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  student: StudentProfile;
  isNewStudent: boolean;
  onToggleNewStudent: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onNavigate,
  student,
  isNewStudent,
  onToggleNewStudent,
}) => {
  const navItems: { id: NavSection; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'dashboard',
      label: '3D Neural Brain',
      icon: <Brain className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />,
      badge: 'Hub',
    },
    { id: 'knowledge', label: 'My Knowledge', icon: <BrainCircuit className="w-5 h-5" /> },
    { id: 'syllabus', label: 'Syllabus', icon: <FileSpreadsheet className="w-5 h-5" /> },
    {
      id: 'assessment',
      label: 'Diagnostic Assessment',
      icon: <Activity className="w-5 h-5" />,
      badge: isNewStudent ? 'Required' : 'Adaptive',
    },
    {
      id: 'tutor',
      label: 'AI Tutor',
      icon: <Bot className="w-5 h-5" />,
      badge: 'HoloJARVIS',
    },
    { id: 'learning-path', label: 'Learning Path', icon: <GitBranch className="w-5 h-5" /> },
    { id: 'progress', label: 'Progress', icon: <LineChart className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="w-5 h-5" /> },
  ];

  return (
    <aside className="w-64 h-screen glass-panel border-r border-cyan-500/20 flex flex-col justify-between py-6 px-4 select-none shrink-0 z-30">
      <div className="space-y-6">
        {/* Brand Logo & Core Status */}
        <div className="px-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.4)]">
            <Sparkles className="w-6 h-6 text-slate-950 font-black animate-spin-slow" />
          </div>
          <div>
            <div className="text-lg font-black text-white tracking-wider flex items-center gap-1.5">
              <span>LearnMind</span>
              <span className="text-cyan-400 text-glow-cyan text-xs font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/40">
                AI
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono tracking-widest flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>COGNITIVE ENGINE v2.4</span>
            </div>
          </div>
        </div>

        {/* Demo Mode Toggle: New Student vs Populated Student */}
        <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-cyan-500/20 text-xs">
          <div className="flex items-center justify-between text-slate-300 mb-1.5">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-400">
              Student State
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isNewStudent ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}
            >
              {isNewStudent ? 'Onboarding' : 'Assessed'}
            </span>
          </div>
          <button
            onClick={onToggleNewStudent}
            className="w-full py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-[11px] text-slate-200 transition-colors flex items-center justify-center gap-1.5 border border-slate-700"
          >
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>Switch to {isNewStudent ? 'Active Profile' : 'New Onboarding'}</span>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-semibold tracking-wide transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/10 text-cyan-300 border border-cyan-400/50 shadow-[0_0_20px_rgba(0,240,255,0.15)]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`transition-colors ${
                      isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                      isActive
                        ? 'bg-cyan-400 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-400 group-hover:text-cyan-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Student Profile Card Footer */}
      <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-cyan-500/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
            {student.name.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <div className="text-xs font-bold text-white truncate">{student.name}</div>
            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400 inline" />
              <span>Learner Account</span>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>STREAK</span>
          <span className="text-cyan-400 font-bold">🔥 {student.streakDays} Days</span>
        </div>
      </div>
    </aside>
  );
};

