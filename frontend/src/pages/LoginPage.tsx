import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Zap,
  ArrowLeft,
  Clock,
  RotateCw,
  HelpCircle
} from 'lucide-react';
import {
  apiLogin,
  apiRegister,
  apiForgotPassword,
  apiVerifyResetOtp,
  apiResetPassword
} from '../services/api';
import { UserAccount, StudentDataPartition } from '../services/db';

type AuthMode = 'signin' | 'register' | 'forgot_email' | 'forgot_otp' | 'forgot_password';

interface LoginPageProps {
  onLoginSuccess: (user: UserAccount, partition: StudentDataPartition, token: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('demo@learnmind.ai');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Forgot password & OTP state
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [otpCountdown, setOtpCountdown] = useState<number>(300); // 5 minutes in seconds
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Status indicators
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  const countdownIntervalRef = useRef<any>(null);

  // Clear transient error when mode changes
  useEffect(() => {
    setErrorMessage('');
  }, [authMode]);

  // Handle live 5-minute OTP countdown timer
  useEffect(() => {
    if (authMode === 'forgot_otp') {
      setOtpCountdown(300);
      setResendCooldown(60);

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }

      countdownIntervalRef.current = setInterval(() => {
        setOtpCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            return 0;
          }
          return prev - 1;
        });

        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [authMode]);

  // Format seconds as MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // -------------------------------------------------------------
  // PART 1 & 2: SIGN IN & REGISTRATION
  // -------------------------------------------------------------

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter both your email address and password.');
      }

      const res = await apiLogin(email, password, rememberMe);
      triggerLoginTransition(res.user, res.partition, res.token);
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password. Please try again.');
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
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

      // Call backend API
      const res = await apiRegister(name, email, password, confirmPassword);

      // CRITICAL: DO NOT automatically log in. DO NOT create session token.
      setIsLoading(false);
      setPassword('');
      setConfirmPassword('');
      setEmail(res.email); // Keep registered email pre-populated

      // Display required success message
      setSuccessMessage(
        res.message ||
          'Your account has been created successfully. Please sign in using your registered email and password.'
      );

      // Automatically switch to Sign In page
      setAuthMode('signin');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please check your inputs.');
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // PART 3: FORGOT PASSWORD & BREVO EMAIL OTP
  // -------------------------------------------------------------

  // Step 1: Request OTP email
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (!email.trim() || !email.includes('@')) {
        throw new Error('Please enter your registered Gmail address.');
      }

      const res = await apiForgotPassword(email);
      setIsLoading(false);
      setSuccessMessage(
        res.message || 'A verification code has been sent to your registered email address.'
      );
      setOtpCode('');
      setAuthMode('forgot_otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send verification email. Please check your address.');
      setIsLoading(false);
    }
  };

  // Step 2: Resend OTP email
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setErrorMessage('');
    setIsLoading(true);

    try {
      const res = await apiForgotPassword(email);
      setIsLoading(false);
      setSuccessMessage(
        res.message || 'A verification code has been sent to your registered email address.'
      );
      setOtpCountdown(300);
      setResendCooldown(60);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resend code.');
      setIsLoading(false);
    }
  };

  // Step 3: Verify 6-digit OTP code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (!otpCode.trim() || otpCode.trim().length !== 6) {
        throw new Error('Please enter the complete 6-digit verification code.');
      }
      if (otpCountdown <= 0) {
        throw new Error('Verification code has expired. Please click Resend Code.');
      }

      const res = await apiVerifyResetOtp(email, otpCode.trim());
      setIsLoading(false);
      setResetToken(res.reset_token);
      setSuccessMessage('Verification code confirmed. Please set your new password.');
      setNewPassword('');
      setConfirmNewPassword('');
      setAuthMode('forgot_password');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code.');
      setIsLoading(false);
    }
  };

  // Step 4: Set New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      if (!newPassword.trim()) {
        throw new Error('Please enter a new password.');
      }
      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters.');
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error('Passwords do not match.');
      }

      const res = await apiResetPassword(email, resetToken, newPassword, confirmNewPassword);
      setIsLoading(false);

      // CRITICAL: DO NOT automatically log in
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetToken('');

      // Display required success message
      setSuccessMessage(
        res.message ||
          'Your password has been reset successfully. Please sign in using your new password.'
      );

      // Redirect to Sign In page with email pre-filled
      setAuthMode('signin');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password. Please try again.');
      setIsLoading(false);
    }
  };

  // Smooth cinematic expansion of small left brain into full-screen main brain
  const triggerLoginTransition = (
    user: UserAccount,
    partition: StudentDataPartition,
    token: string
  ) => {
    setIsExpanding(true);
    setTimeout(() => {
      onLoginSuccess(user, partition, token);
    }, 1150);
  };

  const handleDemoFill = () => {
    setAuthMode('signin');
    setEmail('demo@learnmind.ai');
    setPassword('password123');
    setErrorMessage('');
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
            isExpanding ? 'w-screen h-screen' : 'w-full flex-1 my-4 max-h-[520px]'
          }`}
        >
          {/* Subtle Ambient Aura */}
          <div className="absolute w-[360px] h-[360px] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none animate-pulse-glow" />

          <RealisticHumanBrain mode="compact" onBrainClick={() => {}} />
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
          RIGHT SIDE: Premium Authentication Console (Multi-Mode)
          ======================================================== */}
      <div
        className={`w-full lg:w-1/2 h-full flex items-center justify-center p-6 md:p-12 z-20 transition-all duration-700 ${
          isExpanding ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="w-full max-w-md space-y-6 glass-panel rounded-3xl p-8 border border-cyan-500/30 shadow-[0_0_60px_rgba(0,240,255,0.12)] relative">
          {/* Status Messages */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-3 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-3 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ====================================================
              MODE 1: SIGN IN
              ==================================================== */}
          {authMode === 'signin' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Form Tabs: Sign In vs Register */}
              <div className="flex rounded-2xl bg-slate-950/80 p-1 border border-cyan-500/25">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.25)]"
                >
                  Student Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setSuccessMessage('');
                  }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                >
                  Create Account
                </button>
              </div>

              <div>
                <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                  <span>Student Sign In</span>
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enter your registered Gmail and password to access your cognitive matrix.
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                    Registered Gmail Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@gmail.com"
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

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
                    onClick={() => {
                      setAuthMode('forgot_email');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(0,240,255,0.35)] hover:shadow-[0_0_40px_rgba(0,240,255,0.55)] flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Neural Core</span>
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
                  className="px-2.5 py-1 rounded bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span>Load Demo Account</span>
                </button>
              </div>
            </div>
          )}

          {/* ====================================================
              MODE 2: REGISTRATION (DOES NOT AUTO LOGIN)
              ==================================================== */}
          {authMode === 'register' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex rounded-2xl bg-slate-950/80 p-1 border border-cyan-500/25">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setSuccessMessage('');
                  }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                >
                  Student Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-purple-600/25 text-purple-300 border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.25)]"
                >
                  Create Account
                </button>
              </div>

              <div>
                <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2">
                  <span>Create Student Account</span>
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Register with your Gmail to create an isolated personal learning profile.
                </p>
              </div>

              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1">
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

                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1">
                    Gmail Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="yourname@gmail.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1">
                    Password (min 6 characters)
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
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1">
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

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(168,85,247,0.35)] hover:shadow-[0_0_40px_rgba(168,85,247,0.55)] flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2 border-t border-cyan-500/15">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="text-xs text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  Already have an account? <span className="text-cyan-400 font-bold underline">Sign In</span>
                </button>
              </div>
            </div>
          )}

          {/* ====================================================
              MODE 3: FORGOT PASSWORD — STEP 1 (REQUEST CODE)
              ==================================================== */}
          {authMode === 'forgot_email' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center gap-3 pb-3 border-b border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Return to Sign In"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-lg font-black text-white">Password Recovery</h3>
                  <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                    Step 1 of 3: Verification Request
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your registered Gmail address below. We will send a secure 6-digit OTP verification code via <strong className="text-cyan-300">Brevo</strong>.
              </p>

              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                    Registered Gmail Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@gmail.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(0,240,255,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Sending Verification Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Remember your password? <span className="text-cyan-400 underline">Return to Sign In</span>
                </button>
              </div>
            </div>
          )}

          {/* ====================================================
              MODE 4: FORGOT PASSWORD — STEP 2 (VERIFY OTP)
              ==================================================== */}
          {authMode === 'forgot_otp' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center gap-3 pb-3 border-b border-cyan-500/20">
                <button
                  type="button"
                  onClick={() => setAuthMode('forgot_email')}
                  className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Change Email"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h3 className="text-lg font-black text-white">Enter Verification Code</h3>
                  <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                    Step 2 of 3: 6-Digit Brevo OTP
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-500/20 text-xs text-slate-300 space-y-1">
                <div>Sent to: <span className="font-mono text-cyan-300 font-bold">{email}</span></div>
                <div className="flex items-center gap-2 text-amber-300 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Code expires in: <strong>{formatTimer(otpCountdown)}</strong></span>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5 text-center">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-center text-2xl font-mono font-bold tracking-[8px] py-3 rounded-xl bg-slate-900/90 border-2 border-cyan-400/60 text-cyan-300 focus:outline-none focus:border-cyan-300 focus:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || otpCode.length !== 6 || otpCountdown <= 0}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(0,240,255,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-cyan-500/15">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isLoading}
                  className="text-cyan-400 hover:text-cyan-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Resend Code {resendCooldown > 0 ? `(${resendCooldown}s)` : ''}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          )}

          {/* ====================================================
              MODE 5: FORGOT PASSWORD — STEP 3 (SET NEW PASSWORD)
              ==================================================== */}
          {authMode === 'forgot_password' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="pb-3 border-b border-cyan-500/20">
                <h3 className="text-lg font-black text-white">Create New Password</h3>
                <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                  Step 3 of 3: Secure Account Update
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Your code was verified successfully. Set your new password below.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                    New Password (min 6 characters)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono tracking-wider text-slate-300 uppercase mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <span>Update Password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel and <span className="text-cyan-400 underline">Return to Sign In</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
