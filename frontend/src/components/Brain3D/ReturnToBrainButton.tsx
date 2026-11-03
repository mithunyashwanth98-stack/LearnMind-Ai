import React, { useEffect } from 'react';
import { Brain, ArrowLeft, Sparkles } from 'lucide-react';

interface ReturnToBrainButtonProps {
  onReturn: () => void;
  currentSectionTitle?: string;
}

export const ReturnToBrainButton: React.FC<ReturnToBrainButtonProps> = ({
  onReturn,
  currentSectionTitle,
}) => {
  // Listen for 'Escape' key as a fast shortcut to return to 3D Brain
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onReturn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReturn]);

  return (
    <div className="fixed bottom-6 right-8 z-40 animate-fadeIn">
      <button
        onClick={onReturn}
        className="group relative px-5 py-3 rounded-2xl bg-slate-950/85 hover:bg-slate-900 border border-cyan-400/50 hover:border-cyan-300 text-white font-bold text-xs tracking-wider uppercase transition-all duration-300 shadow-[0_0_30px_rgba(0,240,255,0.25)] hover:shadow-[0_0_45px_rgba(0,240,255,0.5)] flex items-center gap-3 backdrop-blur-xl"
        title="Return to 3D Neural Brain Hub (Press Escape)"
      >
        {/* Glowing Brain Icon with Ping Indicator */}
        <div className="relative p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 group-hover:scale-110 transition-transform">
          <Brain className="w-5 h-5 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
        </div>

        {/* Action Label */}
        <div className="text-left">
          <div className="text-[10px] font-mono tracking-widest text-cyan-400 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            <span>NEURAL CORE HUB</span>
          </div>
          <div className="text-xs font-black text-white group-hover:text-glow-cyan tracking-wide">
            RETURN TO 3D BRAIN
          </div>
        </div>

        {/* Keyboard Shortcut Keycap */}
        <div className="ml-1 px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-[10px] font-mono text-slate-400 group-hover:text-cyan-300">
          ESC
        </div>
      </button>
    </div>
  );
};

