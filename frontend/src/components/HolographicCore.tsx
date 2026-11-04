import React, { useEffect, useRef } from 'react';

export type TutorState = 'idle' | 'typing' | 'listening' | 'thinking' | 'responding' | 'error';

interface HolographicCoreProps {
  state: TutorState;
  voiceIntensity?: number; // 0.0 to 1.0 (from Web Audio API Analyser)
  isAudioPlaying?: boolean;
  errorMessage?: string;
  onCoreClick?: () => void;
  size?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  orbitAngle: number;
  orbitDistance: number;
  orbitSpeed: number;
  alpha: number;
  pulsePhase: number;
}

export const HolographicCore: React.FC<HolographicCoreProps> = ({
  state,
  voiceIntensity = 0,
  isAudioPlaying = false,
  errorMessage,
  onCoreClick,
  size = 460,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Smooth interpolation values across animation frames
  const animRef = useRef({
    currentScale: 1.0,
    targetScale: 1.0,
    currentBrightness: 1.0,
    targetBrightness: 1.0,
    currentRingSpeed: 0.005,
    targetRingSpeed: 0.005,
    currentParticleSpeed: 1.0,
    targetParticleSpeed: 1.0,
    smoothVoiceIntensity: 0,
    rotationAngle1: 0,
    rotationAngle2: 0,
    rotationAngle3: 0,
    time: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    const width = size;
    const height = size;

    // High-DPI screen sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Initialize 55 neural network particles
    const particleCount = 55;
    const particles: Particle[] = Array.from({ length: particleCount }, (_, i) => {
      const dist = 35 + Math.random() * 115;
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: 1.0 + Math.random() * 2.2,
        orbitAngle: angle,
        orbitDistance: dist,
        orbitSpeed: (0.004 + Math.random() * 0.008) * (i % 2 === 0 ? 1 : -1),
        alpha: 0.35 + Math.random() * 0.55,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });

    const render = () => {
      const anim = animRef.current;
      anim.time += 0.016;

      // Smoothly interpolate voice intensity
      anim.smoothVoiceIntensity += (voiceIntensity - anim.smoothVoiceIntensity) * 0.2;

      // Configure targets according to state
      switch (state) {
        case 'typing':
          anim.targetScale = 1.22;
          anim.targetBrightness = 1.45;
          anim.targetRingSpeed = 0.018;
          anim.targetParticleSpeed = 2.2;
          break;
        case 'listening':
          // Scale dynamically modulates with user's voice intensity
          anim.targetScale = 1.15 + anim.smoothVoiceIntensity * 0.5;
          anim.targetBrightness = 1.3 + anim.smoothVoiceIntensity * 0.6;
          anim.targetRingSpeed = 0.012 + anim.smoothVoiceIntensity * 0.02;
          anim.targetParticleSpeed = 1.6 + anim.smoothVoiceIntensity * 1.5;
          break;
        case 'thinking':
          anim.targetScale = 1.32;
          anim.targetBrightness = 1.7;
          anim.targetRingSpeed = 0.038;
          anim.targetParticleSpeed = 3.6;
          break;
        case 'responding':
          // Harmonious pulsing
          const speechPulse = isAudioPlaying ? Math.sin(anim.time * 8) * 0.12 : 0;
          anim.targetScale = 1.18 + speechPulse;
          anim.targetBrightness = 1.4 + (speechPulse > 0 ? 0.2 : 0);
          anim.targetRingSpeed = 0.014;
          anim.targetParticleSpeed = 1.5;
          break;
        case 'error':
          anim.targetScale = 0.95 + Math.sin(anim.time * 20) * 0.04;
          anim.targetBrightness = 1.1;
          anim.targetRingSpeed = 0.003;
          anim.targetParticleSpeed = 0.5;
          break;
        case 'idle':
        default:
          // Subtle natural breathing pulse: never completely static!
          const idleBreathing = Math.sin(anim.time * 1.6) * 0.05;
          anim.targetScale = 1.0 + idleBreathing;
          anim.targetBrightness = 1.0;
          anim.targetRingSpeed = 0.006;
          anim.targetParticleSpeed = 1.0;
          break;
      }

      // Smooth lerp state transitions
      anim.currentScale += (anim.targetScale - anim.currentScale) * 0.08;
      anim.currentBrightness += (anim.targetBrightness - anim.currentBrightness) * 0.08;
      anim.currentRingSpeed += (anim.targetRingSpeed - anim.currentRingSpeed) * 0.08;
      anim.currentParticleSpeed += (anim.targetParticleSpeed - anim.currentParticleSpeed) * 0.08;

      anim.rotationAngle1 += anim.currentRingSpeed;
      anim.rotationAngle2 -= anim.currentRingSpeed * 1.35;
      anim.rotationAngle3 += anim.currentRingSpeed * 0.7;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Base color palette determined by state
      let mainColor = '0, 240, 255'; // Electric Cyan
      let secondaryColor = '245, 158, 11'; // Amber / Gold (JARVIS Age of Ultron)
      let accentColor = '56, 189, 248'; // Sky Blue

      if (state === 'typing') {
        mainColor = '0, 240, 255';
        secondaryColor = '168, 85, 247'; // Electric Violet
      } else if (state === 'listening') {
        mainColor = '168, 85, 247'; // Violet
        secondaryColor = '0, 240, 255';
        accentColor = '236, 72, 153'; // Neon Pink
      } else if (state === 'thinking') {
        mainColor = '0, 240, 255';
        secondaryColor = '245, 158, 11'; // High-energy gold & cyan
        accentColor = '255, 255, 255';
      } else if (state === 'responding') {
        mainColor = '56, 189, 248'; // Sky Blue
        secondaryColor = '0, 240, 255';
        accentColor = '16, 185, 129'; // Emerald
      } else if (state === 'error') {
        mainColor = '239, 68, 68'; // Crimson
        secondaryColor = '249, 115, 22';
        accentColor = '220, 38, 38';
      }

      ctx.save();
      ctx.translate(cx, cy);

      // -------------------------------------------------------------
      // 1. LAYER: AMBIENT RADIAL HALO & VOLUMETRIC ENERGY
      // -------------------------------------------------------------
      const haloRadius = 145 * anim.currentScale;
      const haloGrad = ctx.createRadialGradient(0, 0, 15, 0, 0, haloRadius);
      haloGrad.addColorStop(0, `rgba(${mainColor}, ${0.28 * anim.currentBrightness})`);
      haloGrad.addColorStop(0.4, `rgba(${secondaryColor}, ${0.12 * anim.currentBrightness})`);
      haloGrad.addColorStop(0.8, `rgba(${mainColor}, 0.03)`);
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // -------------------------------------------------------------
      // 2. LAYER: CONCENTRIC HOLOGRAPHIC JARVIS RINGS
      // -------------------------------------------------------------
      ctx.lineWidth = 1.2;

      // Outer Ring 1: Angular Graduation Ticks
      ctx.save();
      ctx.rotate(anim.rotationAngle1);
      const outerR = 142 * Math.min(anim.currentScale, 1.3);
      ctx.strokeStyle = `rgba(${mainColor}, ${0.25 * anim.currentBrightness})`;
      ctx.beginPath();
      ctx.arc(0, 0, outerR, 0, Math.PI * 2);
      ctx.stroke();

      // Tick marks on Outer Ring
      const numTicks = 36;
      for (let i = 0; i < numTicks; i++) {
        const a = (i / numTicks) * Math.PI * 2;
        const tickLen = i % 3 === 0 ? 6 : 3;
        const x1 = Math.cos(a) * (outerR - tickLen);
        const y1 = Math.sin(a) * (outerR - tickLen);
        const x2 = Math.cos(a) * outerR;
        const y2 = Math.sin(a) * outerR;

        ctx.strokeStyle =
          i % 6 === 0
            ? `rgba(${secondaryColor}, ${0.6 * anim.currentBrightness})`
            : `rgba(${mainColor}, 0.2)`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // Middle Ring 2: Segmented Cyber Arcs (Counter-Rotating)
      ctx.save();
      ctx.rotate(anim.rotationAngle2);
      const midR = 118 * anim.currentScale;
      ctx.strokeStyle = `rgba(${secondaryColor}, ${0.45 * anim.currentBrightness})`;
      ctx.lineWidth = 2.0;

      // 4 segmented arc quadrants
      for (let q = 0; q < 4; q++) {
        const startA = q * (Math.PI / 2) + 0.18;
        const endA = startA + (Math.PI / 2) - 0.36;
        ctx.beginPath();
        ctx.arc(0, 0, midR, startA, endA);
        ctx.stroke();
      }
      ctx.restore();

      // Inner Ring 3: Audio Frequency Waveform Equalizer
      ctx.save();
      ctx.rotate(anim.rotationAngle3);
      const innerR = 86 * anim.currentScale;
      const numBars = 48;
      ctx.lineWidth = 1.5;

      for (let b = 0; b < numBars; b++) {
        const a = (b / numBars) * Math.PI * 2;
        let waveHeight = Math.sin(anim.time * 4 + b * 0.4) * 4;

        if (state === 'listening') {
          waveHeight += anim.smoothVoiceIntensity * 18 * Math.abs(Math.sin(b * 0.8 + anim.time * 12));
        } else if (state === 'thinking') {
          waveHeight += Math.sin(anim.time * 14 + b * 1.2) * 8;
        } else if (state === 'typing') {
          waveHeight += Math.sin(anim.time * 8 + b * 0.6) * 5;
        } else if (state === 'responding') {
          waveHeight += (isAudioPlaying ? 9 : 4) * Math.abs(Math.sin(anim.time * 6 + b * 0.5));
        }

        const barX1 = Math.cos(a) * innerR;
        const barY1 = Math.sin(a) * innerR;
        const barX2 = Math.cos(a) * (innerR + waveHeight);
        const barY2 = Math.sin(a) * (innerR + waveHeight);

        ctx.strokeStyle =
          b % 4 === 0
            ? `rgba(${accentColor}, ${0.75 * anim.currentBrightness})`
            : `rgba(${mainColor}, ${0.35 * anim.currentBrightness})`;
        ctx.beginPath();
        ctx.moveTo(barX1, barY1);
        ctx.lineTo(barX2, barY2);
        ctx.stroke();
      }
      ctx.restore();

      // -------------------------------------------------------------
      // 3. LAYER: NEURAL NETWORK PARTICLES & SYNAPTIC FILAMENTS
      // -------------------------------------------------------------
      const connectionDist = state === 'typing' ? 82 : state === 'thinking' ? 95 : 68;

      // Update particle positions
      particles.forEach((p, idx) => {
        // Orbit speed modified by particle speed multiplier
        p.orbitAngle += p.orbitSpeed * anim.currentParticleSpeed;

        if (state === 'thinking') {
          // Spiraling vortex movement towards center
          p.orbitDistance += (45 - p.orbitDistance) * 0.015;
          if (p.orbitDistance < 42) p.orbitDistance = 110 + Math.random() * 20;
        } else if (state === 'listening') {
          // Radial pulse according to voice intensity
          const targetDist = (50 + (idx % 80)) * (1 + anim.smoothVoiceIntensity * 0.35);
          p.orbitDistance += (targetDist - p.orbitDistance) * 0.1;
        } else {
          // Return to home distance
          const originalDist = 38 + (idx * 2) % 95;
          p.orbitDistance += (originalDist - p.orbitDistance) * 0.05;
        }

        p.x = Math.cos(p.orbitAngle) * p.orbitDistance;
        p.y = Math.sin(p.orbitAngle) * p.orbitDistance;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (state === 'thinking' ? 1.3 : 1.0), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${mainColor}, ${p.alpha * anim.currentBrightness})`;
        ctx.fill();
      });

      // Draw neural connections between nearby particles
      ctx.lineWidth = 0.8;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDist) {
            const alpha = (1 - dist / connectionDist) * 0.45 * anim.currentBrightness;
            ctx.strokeStyle =
              i % 3 === 0
                ? `rgba(${secondaryColor}, ${alpha * 0.85})`
                : `rgba(${mainColor}, ${alpha})`;

            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();

            // Synaptic flash on typing or thinking
            if ((state === 'typing' || state === 'thinking') && Math.random() < 0.015) {
              const midX = (particles[i].x + particles[j].x) / 2;
              const midY = (particles[i].y + particles[j].y) / 2;
              ctx.beginPath();
              ctx.arc(midX, midY, 2.0, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
              ctx.fill();
            }
          }
        }
      }

      // -------------------------------------------------------------
      // 4. LAYER: CENTRAL GLOWING JARVIS HOLOGRAPHIC CORE
      // -------------------------------------------------------------
      const coreR = 42 * anim.currentScale;

      // Coronal energy flare pulses
      ctx.save();
      const flareGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, coreR * 1.5);
      flareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      flareGrad.addColorStop(0.35, `rgba(${mainColor}, ${0.85 * anim.currentBrightness})`);
      flareGrad.addColorStop(0.75, `rgba(${secondaryColor}, ${0.45 * anim.currentBrightness})`);
      flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = flareGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Solid inner core with cybernetic iris reticle
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(5, 8, 20, 0.85)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${mainColor}, ${0.8 * anim.currentBrightness})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Rotating inner hexagonal reticle
      ctx.save();
      ctx.rotate(anim.rotationAngle2 * 1.5);
      ctx.beginPath();
      const sides = 6;
      const hexR = coreR * 0.48;
      for (let s = 0; s < sides; s++) {
        const hAngle = (s / sides) * Math.PI * 2;
        const hx = Math.cos(hAngle) * hexR;
        const hy = Math.sin(hAngle) * hexR;
        if (s === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${secondaryColor}, ${0.9 * anim.currentBrightness})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      // Central Quantum Pupil / Energy Node
      ctx.beginPath();
      const pupilR = 6 + (state === 'listening' ? anim.smoothVoiceIntensity * 8 : Math.sin(anim.time * 3) * 1.5);
      ctx.arc(0, 0, pupilR, 0, Math.PI * 2);
      ctx.fillStyle =
        state === 'error'
          ? 'rgba(239, 68, 68, 1)'
          : state === 'listening'
          ? 'rgba(168, 85, 247, 1)'
          : state === 'thinking'
          ? 'rgba(255, 255, 255, 1)'
          : 'rgba(0, 240, 255, 1)';
      ctx.fill();

      // Outer Shockwave Rings on State Triggers
      if (state === 'thinking' || state === 'listening') {
        const waveScale = (anim.time * 2.5) % 1;
        const waveR = coreR + waveScale * 75;
        ctx.beginPath();
        ctx.arc(0, 0, waveR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${mainColor}, ${(1 - waveScale) * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, voiceIntensity, isAudioPlaying]);

  // State metadata configuration
  const getBadgeConfig = () => {
    switch (state) {
      case 'typing':
        return {
          label: 'KEYBOARD INPUT DETECTED',
          textColor: 'text-cyan-300',
          borderColor: 'border-cyan-400/50',
          badgeBg: 'bg-cyan-950/80',
          dotBg: 'bg-cyan-400 animate-pulse',
          subtext: 'Core expanding & synapses accelerating',
        };
      case 'listening':
        return {
          label: 'LISTENING VIA MICROPHONE...',
          textColor: 'text-purple-300',
          borderColor: 'border-purple-400/60',
          badgeBg: 'bg-purple-950/80',
          dotBg: 'bg-purple-400 animate-ping',
          subtext: voiceIntensity > 0.08 ? 'Audio speech detected' : 'Awaiting vocal command',
        };
      case 'thinking':
        return {
          label: 'SYNTHESIZING COGNITIVE RESPONSE...',
          textColor: 'text-amber-300',
          borderColor: 'border-amber-400/60',
          badgeBg: 'bg-amber-950/80',
          dotBg: 'bg-amber-400 animate-spin',
          subtext: 'Neural vortex processing concept graph',
        };
      case 'responding':
        return {
          label: 'STREAMING REMEDIATION & VOICE...',
          textColor: 'text-sky-300',
          borderColor: 'border-sky-400/60',
          badgeBg: 'bg-sky-950/80',
          dotBg: 'bg-sky-400 animate-pulse',
          subtext: isAudioPlaying ? 'SpeechSynthesis vocal stream active' : 'Interactive text guidance',
        };
      case 'error':
        return {
          label: 'COGNITIVE DISCONNECT / ERROR',
          textColor: 'text-red-400',
          borderColor: 'border-red-500/60',
          badgeBg: 'bg-red-950/80',
          dotBg: 'bg-red-500 animate-ping',
          subtext: errorMessage || 'Microphone or reasoning stream fault',
        };
      case 'idle':
      default:
        return {
          label: 'JARVIS-CLASS TUTOR ONLINE • READY',
          textColor: 'text-cyan-400',
          borderColor: 'border-cyan-500/30',
          badgeBg: 'bg-slate-950/80',
          dotBg: 'bg-emerald-400 animate-ping',
          subtext: 'Continuous holographic quantum breathing',
        };
    }
  };

  const badge = getBadgeConfig();

  return (
    <div
      onClick={onCoreClick}
      className="relative flex flex-col items-center justify-center select-none cursor-pointer group"
      title="Interactive Holographic Core • Click to toggle microphone or speech"
    >
      {/* Dynamic Size Canvas Display Container */}
      <div
        className="relative flex items-center justify-center max-w-[85vw] max-h-[85vw]"
        style={{ width: size, height: size }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="w-full h-full pointer-events-none drop-shadow-[0_0_35px_rgba(0,240,255,0.35)]"
        />

        {/* Center overlay icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-slate-950/80 border border-cyan-400/40 text-[10px] text-cyan-300 font-mono tracking-wider backdrop-blur-md">
            CLICK CORE
          </div>
        </div>
      </div>

      {/* Holographic Status Pill */}
      <div
        className={`mt-3 flex flex-col items-center px-4 py-2 rounded-2xl ${badge.badgeBg} border ${badge.borderColor} backdrop-blur-md shadow-lg transition-all duration-300`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${badge.dotBg}`} />
          <span className={`text-[11px] font-mono tracking-widest font-bold ${badge.textColor}`}>
            {badge.label}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono mt-0.5">{badge.subtext}</span>
      </div>
    </div>
  );
};
