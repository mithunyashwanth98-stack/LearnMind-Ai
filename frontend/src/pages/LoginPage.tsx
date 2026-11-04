import React, { useState, useEffect } from 'react';
import { RealisticHumanBrain } from '../components/Brain3D/RealisticHumanBrain';
import {
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  Brain,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Zap
} from 'lucide-react';
import {
  loginUser,
  registerUser,
  requestPasswordReset,
  UserAccount,
  StudentDataPartition
} from '../services/db';

interface LoginPageProps {
  onLoginSuccess: (user: UserAccount, partition: StudentDataPartition) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('demo@learnmind.ai');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Clear errors on mode change
  useEffect(() => {
    setErrorMessage('');
    setSuccessMessage('');
  }, [authMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (authMode === 'signin') {
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter both your email address and password.');
        }
        const { user, partition } = await loginUser(email, password, rememberMe);
        triggerLoginTransition(user, partition);
      } else {
        if (!name.trim()) {
          throw new Error('Please enter your full name.');
        }
        if (!email.trim() || !password.trim()) {
          throw new Error('Please enter all required fields.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const { user, partition } = await registerUser(name, email, password);
        triggerLoginTransition(user, partition);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
      setIsLoading(false);
    }
  };

  // Smooth cinematic expansion of small left brain into full-screen main brain
  const triggerLoginTransition = (user: UserAccount, partition: StudentDataPartition) => {
    setIsExpanding(true);
    setTimeout(() => {
      onLoginSuccess(user, partition);
    }, 1150);
  };

  const handleDemoFill = () => {
    setAuthMode('signin');
    setEmail('demo@learnmind.ai');
    setPassword('password123');
    setErrorMessage('');
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }
    try {
      const msg = await requestPasswordReset(resetEmail);
      setSuccessMessage(msg);
      setIsForgotPasswordOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send reset link.');
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050814] flex select-none text-slate-100">
      {/* Cinematic Deep Space Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,240,255,0.08)_0%,_rgba(168,85,247,0.05)_40%,_rgba(5,8,20,0.98)_80%)] pointer-events-none" />
      <div className="absolute inset-0 cyber-grid pointer-events-none opacity-20" />

      {/* TRANSITION OVERLAY: Energy flare as brain expands to full screen */}
      {isExpanding && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center animate-fadeIn">
          <div className="w-[120vw] h-[120vw] rounded-full bg-[radial-gradient(circle_at_center,_rgba(0,240,255,0.4)_0%,_rgba(168,85,247,0.25)_30%,_rgba(5,8,20,0.9)_70%)] blur-3xl animate-pulse" />
        </div>
      )}

      {/* ========================================================
          LEFT SIDE: 3D Holographic Animated Human Brain & Branding
          (Smoothly moves to center and expands upon login success)
          ======================================================== */}
      <div
        className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col justify-between p-8 md:p-12 z-20 ${
          isExpanding
            ? 'fixed inset-0 w-screen h-screen items-center justify-center scale-100 p-0'
            : 'w-full lg:w-1/2 h-full border-r border-cyan-500/20'
        }`}
      >
        {/* Brand Header */}
        <div className={`transition-opacity duration-500 ${isExpanding ? 'opacity-0' : 'opacity-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-[0_0_25px_rgba(0,240,255,0.4)]">
              <Sparkles className="w-5 h-5 text-slate-950 font-black animate-spin-slow" />
            </div>
            <div>
              <div className="text-xl font-black text-white tracking-wider flex items-center gap-2">
                <span>LearnMind</span>
                <span className="text-cyan-400 text-glow-cyan text-xs font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/40">
                  AI
                </span>
              </div>
              <div className="text-[10px] font-mono tracking-widest text-cyan-400/80 uppercase">
                Cognitive Neural Architecture
              </div>
            </div>
          </div>
        </div>

        {/* Realistic Animated 3D Human Brain Canvas */}
        <div
          className={`relative transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center ${
            isExpanding
              ? 'w-screen h-screen'
              : 'w-full flex-1 my-4 max-h-[520px]'
          }`}
        >
          {/* Subtle Ambient Aura */}
          <div className="absolute w-[360px] h-[360px] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none animate-pulse-glow" />

          <RealisticHumanBrain
            mode="compact"
            onBrainClick={() => {}}
          />
        </div>

        {/* Left Side Footer Highlights */}
        <div className={`space-y-3 transition-opacity duration-500 ${isExpanding ? 'opacity-0' : 'opacity-100'}`}>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span className="tracking-wide">ISOLATED STUDENT PARTITIONED DATA ENGINE</span>
          </div>
          <p className="text-xs text-slate-400 max-w-md leading-relaxed">
            Neural misconception detection, Bayesian confidence assessment (<span className="text-cyan-300">Beta(α,β)</span>), and prerequisite topological roadmaps.
          </p>
        </div>
      </div>

      {/* ========================================================
          RIGHT SIDE: Premium Cyberpunk Login & Registration Form
          ======================================================== */}
      <div
        className={`w-full lg:w-1/2 h-full flex items-center justify-center p-6 md:p-12 z-20 transition-all duration-700 ${
          isExpanding ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="w-full max-w-md space-y-6 glass-panel rounded-3xl p-8 border border-cyan-500/30 shadow-[0_0_60px_rgba(0,240,255,0.12)] relative">
          {/* Form Tabs: Sign In vs Register */}
          <div className="flex rounded-2xl bg-slate-950/80 p-1 border border-cyan-500/25">
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                authMode === 'signin'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Student Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 ${
                authMode === 'register'
                  ? 'bg-purple-600/25 text-purple-300 border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              New Registration
            </button>
          </div>

          {/* Form Title & Subtitle */}
          <div>
            <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
              {authMode === 'signin' ? 'Welcome Back' : 'Create Student Account'}
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {authMode === 'signin'
                ? 'Sign in to access your private neural knowledge matrix.'
                : 'Register an isolated student account with zero pre-fabricated data.'}
            </p>
          </div>

          {/* Notifications / Alerts */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jordan Hayes"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                Student Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.edu"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authMode === 'register' && (
              <div>
                <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Remember Me & Forgot Password controls */}
            {authMode === 'signin' && (
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-400 focus:ring-0"
                  />
                  <span>Remember Session</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(true)}
                  className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(0,240,255,0.35)] hover:shadow-[0_0_40px_rgba(0,240,255,0.55)] flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Authorizing Cognitive Profile...</span>
                </>
              ) : (
                <>
                  <span>{authMode === 'signin' ? 'Sign In to Neural Core' : 'Register & Initialize Partition'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Fill Helper */}
          <div className="pt-2 border-t border-cyan-500/15 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Evaluator Demo Profile:</span>
            <button
              type="button"
              onClick={handleDemoFill}
              className="px-2.5 py-1 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>Load Demo Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 border border-cyan-400/50 shadow-[0_0_50px_rgba(0,240,255,0.25)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reset Account Password</h3>
                <p className="text-xs text-slate-400">Enter your student email for verification</p>
              </div>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 uppercase mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="demo@learnmind.ai"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotPasswordOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs uppercase hover:bg-cyan-400 transition-colors shadow-lg"
                >
                  Send Verification
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
