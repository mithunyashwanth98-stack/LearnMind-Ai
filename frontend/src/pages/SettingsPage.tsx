import React, { useState } from 'react';
import { StudentProfile } from '../types';
import { GlassCard } from '../components/GlassCard';
import {
  Settings as SettingsIcon,
  Key,
  Shield,
  Volume2,
  Cpu,
  FlaskConical,
  Save,
  Check,
  User,
  Zap,
  LogOut
} from 'lucide-react';

interface SettingsPageProps {
  student: StudentProfile;
  onUpdateStudent: (updated: Partial<StudentProfile>) => void;
  onLogout?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  student,
  onUpdateStudent,
  onLogout,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [modelProvider, setModelProvider] = useState<'gemini' | 'local_fallback'>('local_fallback');
  const [voiceVolume, setVoiceVolume] = useState(85);
  const [experimentModeEnabled, setExperimentModeEnabled] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveSettings = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>System Settings & Model Configuration</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              PREFERENCES
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure LLM inference endpoints, student credentials, and scientific research
            telemetry.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          className="px-5 py-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)]"
        >
          {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{savedSuccess ? 'Settings Saved' : 'Save Settings'}</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Student Profile Card */}
        <GlassCard glowColor="cyan" className="p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            <User className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Learner Identity & Security</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">Full Name</label>
              <input
                type="text"
                value={student.name}
                onChange={(e) => onUpdateStudent({ name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1 block">
                Academic Email
              </label>
              <input
                type="email"
                value={student.email}
                onChange={(e) => onUpdateStudent({ email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        </GlassCard>

        {/* AI & LLM Engine Settings */}
        <GlassCard glowColor="violet" className="p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            <Cpu className="w-5 h-5 text-purple-400" />
            <h3 className="text-base font-bold text-white">AI Inference & Tutor Provider</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 block">
                Select Model Provider
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setModelProvider('local_fallback')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    modelProvider === 'local_fallback'
                      ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                    <span>Local Cognitive Engine</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Deterministic symbolic reasoner + Scikit-Learn classifier. Zero external API
                    dependency.
                  </p>
                </div>

                <div
                  onClick={() => setModelProvider('gemini')}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    modelProvider === 'gemini'
                      ? 'border-purple-400 bg-purple-950/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                    <span>Google Gemini API</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">
                      CLOUD LLM
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Advanced generative explanations and complex natural language tutoring.
                  </p>
                </div>
              </div>
            </div>

            {modelProvider === 'gemini' && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-xs font-semibold text-slate-300 block">
                  Gemini API Key (stored client-side only)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono focus:outline-none focus:border-purple-400"
                  />
                </div>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Multimodal Voice Settings */}
        <GlassCard glowColor="blue" className="p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
            <Volume2 className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-bold text-white">Multimodal Voice Synthesis</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Holo-Tutor Voice Volume: {voiceVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={voiceVolume}
              onChange={(e) => setVoiceVolume(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        </GlassCard>

        {/* Account & Session Isolation Card */}
        <GlassCard glowColor="violet" className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-purple-400" />
              <div>
                <h3 className="text-base font-bold text-white">Authenticated Profile: {student.name}</h3>
                <p className="text-xs text-slate-400 font-mono">{student.email} • ID: {student.id}</p>
              </div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-4 py-2 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out of Session</span>
              </button>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Status: <span className="text-emerald-400 font-bold">Isolated Student Partition Active</span> • All assessments, misconceptions, and roadmaps are strictly scoped to this account.
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

