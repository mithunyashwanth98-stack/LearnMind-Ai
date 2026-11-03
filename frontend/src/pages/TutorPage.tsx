import React, { useState, useEffect, useRef } from 'react';
import { Subject, Misconception } from '../types';
import { HolographicCore, TutorState } from '../components/HolographicCore';
import {
  Mic,
  MicOff,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  User,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  HelpCircle,
  Activity,
  CheckCircle2
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'tutor';
  text: string;
  timestamp: string;
  suggestedActions?: string[];
}

interface TutorPageProps {
  subjects: Subject[];
  misconceptions: Misconception[];
  initialTopic?: string;
}

export const TutorPage: React.FC<TutorPageProps> = ({
  subjects,
  misconceptions,
  initialTopic = 'Differentiation & Power Rule',
}) => {
  const [tutorState, setTutorState] = useState<TutorState>('idle');
  const [voiceIntensity, setVoiceIntensity] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'tutor',
      text: `Greetings, Alex. I am your LearnMind AI Holo-Tutor. I see you recently took an assessment on ${initialTopic} where an exponent reduction misconception was identified. How can I guide your conceptual understanding today?`,
      timestamp: 'Just now',
      suggestedActions: [
        'Explain the Power Rule step-by-step',
        'Why does d/dx(5x) equal 5 and not 0?',
        'Give me a real-world example of derivatives',
        'Generate a practice question for me'
      ],
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [speechSynthesisActive, setSpeechSynthesisActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [currentTopic, setCurrentTopic] = useState(initialTopic);

  const activeMisconception = misconceptions.find((m) => m.status === 'active') || misconceptions[0];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimationIdRef = useRef<number | null>(null);
  const typingTimerRef = useRef<any>(null);

  // Check Web Speech API availability on mount (without requesting mic permission yet)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
    }

    return () => {
      // Clean up speech synthesis & audio streams on unmount
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopAudioStream();
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanly stops microphone tracks and audio analysis to prevent CPU/memory leaks
  const stopAudioStream = () => {
    if (audioAnimationIdRef.current) {
      cancelAnimationFrame(audioAnimationIdRef.current);
      audioAnimationIdRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setVoiceIntensity(0);
  };

  // Keyboard typing detection with smooth state transition and debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    // If currently idle or already typing, activate/extend typing state
    if (tutorState === 'idle' || tutorState === 'typing') {
      if (val.trim().length > 0) {
        setTutorState('typing');

        // Clear previous typing debounce
        if (typingTimerRef.current) {
          clearTimeout(typingTimerRef.current);
        }

        // Return smoothly to idle when typing stops for 1.4 seconds
        typingTimerRef.current = setTimeout(() => {
          setTutorState((curr) => (curr === 'typing' ? 'idle' : curr));
        }, 1400);
      } else {
        setTutorState('idle');
      }
    }
  };

  // Text-To-Speech Output with natural speech synthesis
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const cleanText = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setSpeechSynthesisActive(true);
      setTutorState('responding');
    };

    utterance.onend = () => {
      setSpeechSynthesisActive(false);
      setTutorState('idle');
    };

    utterance.onerror = () => {
      setSpeechSynthesisActive(false);
      setTutorState('idle');
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeechSynthesisActive(false);
    setTutorState('idle');
  };

  // On-Demand Microphone Activation with Real AudioContext Analyser
  const toggleMic = async () => {
    if (!voiceSupported) {
      setTutorState('error');
      setErrorMessage('Speech Recognition is unsupported on this browser. Please use keyboard text.');
      setTimeout(() => setTutorState('idle'), 3000);
      return;
    }

    // Stop speaking if AI is talking
    stopSpeaking();

    // If already active, turn it off
    if (isVoiceActive) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      stopAudioStream();
      setIsVoiceActive(false);
      setTutorState('idle');
      return;
    }

    try {
      // 1. Request microphone permission ONLY upon user click
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 2. Set up Web Audio API Analyser to capture real voice amplitude
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Loop to calculate voice intensity in real-time
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize 0 to 1 with noise threshold gating
        const intensity = avg > 12 ? Math.min(1.0, (avg - 12) / 65) : 0;
        setVoiceIntensity(intensity);

        audioAnimationIdRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 3. Set up SpeechRecognition
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceActive(true);
        setTutorState('listening');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0]?.transcript?.trim();
        // Discard empty or noise-only artifacts
        if (transcript && transcript.length > 1) {
          setInputText(transcript);
          setIsVoiceActive(false);
          stopAudioStream();
          handleSendMessage(transcript);
        } else {
          setIsVoiceActive(false);
          stopAudioStream();
          setTutorState('idle');
        }
      };

      recognition.onerror = (e: any) => {
        setIsVoiceActive(false);
        stopAudioStream();
        if (e.error !== 'no-speech') {
          setTutorState('error');
          setErrorMessage(`Microphone error: ${e.error}`);
          setTimeout(() => setTutorState('idle'), 3000);
        } else {
          setTutorState('idle');
        }
      };

      recognition.onend = () => {
        setIsVoiceActive(false);
        stopAudioStream();
        setTutorState((curr) => (curr === 'listening' ? 'idle' : curr));
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.warn('Microphone access denied or error:', err);
      stopAudioStream();
      setIsVoiceActive(false);
      setTutorState('error');
      setErrorMessage('Microphone access was denied or audio device not found.');
      setTimeout(() => setTutorState('idle'), 3500);
    }
  };

  // Submitting question from typing or speech
  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    // Clear typing timeout and active microphone
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    stopSpeaking();
    stopAudioStream();
    setIsVoiceActive(false);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setTutorState('thinking');

    // Simulate intelligent pedagogical reasoning
    setTimeout(() => {
      let reply = '';
      let suggestions: string[] = [];
      const lower = query.toLowerCase();

      if (lower.includes('power rule') || lower.includes('exponent')) {
        reply =
          "Let's break down the Power Rule step by step:\n\n1. Formula: d/dx(xⁿ) = n · xⁿ⁻¹.\n2. The Two Golden Actions: First, bring the current exponent n to the front as a multiplier. Second, subtract exactly 1 from the exponent.\n\nExample:\nFor x³, bring 3 down: 3 · x^(3-1) = 3x².\nThe common pitfall (which our diagnostic identified) is multiplying by 3 but forgetting to reduce the exponent to 2! Always verify the exponent drops by 1.";
        suggestions = [
          'Give me a practice problem on this',
          'What about d/dx(x¹)?',
          'Explain the Constant Multiple Rule next'
        ];
      } else if (lower.includes('5x') || lower.includes('constant multiple') || lower.includes('zero')) {
        reply =
          "Great question! Why is d/dx(5x) = 5 and not 0?\n\nBecause 5 is a constant MULTIPLE attached to the variable x, not a standalone constant.\n\n• Standalone constant: d/dx(5) = 0 (because the number 5 never changes rate).\n• Constant multiple: d/dx(5 · x) = 5 · d/dx(x) = 5 · 1 = 5.\n\nThink of it visually: y = 5x is a straight line with a steep slope of 5. The derivative measures the slope, so the slope is always 5!";
        suggestions = [
          'Differentiate 7x + 12',
          'How does this combine with the Sum Rule?',
          'Test me with a quiz'
        ];
      } else if (lower.includes('practice') || lower.includes('question') || lower.includes('quiz')) {
        reply =
          "Here is your personalized practice challenge:\n\nDifferentiate f(x) = 3x⁴ - 6x + 9 with respect to x.\n\nTake your time. Identify the power rule for the first term, constant multiple rule for the second term, and the constant rule for the last term.";
        suggestions = [
          'The answer is 12x³ - 6',
          'The answer is 12x⁴ - 6',
          'Walk me through the first step'
        ];
      } else if (lower.includes('12x³ - 6') || lower.includes('12x^3 - 6')) {
        reply =
          'Outstanding work! 🎯 12x³ - 6 is 100% correct.\n\n• d/dx(3x⁴) = 3 · 4x³ = 12x³\n• d/dx(-6x) = -6 · 1 = -6\n• d/dx(9) = 0\n\nYou applied both the power rule reduction and constant rules flawlessly. Your Bayesian mastery score has been incremented!';
        suggestions = [
          'Move on to Product Rule',
          'Explain Chain Rule',
          'Update my Knowledge Matrix'
        ];
      } else {
        reply = `Understood. Analyzing "${query}" in the context of ${currentTopic}.\n\nIn differential calculus, every operation builds strictly upon prerequisite algebraic foundations. Would you like me to explain this concept from first principles with a simple analogy, or demonstrate with a worked mathematical proof?`;
        suggestions = [
          'Explain with a simple analogy',
          'Show a worked mathematical example',
          'How does this relate to my syllabus?'
        ];
      }

      const tutorMsg: ChatMessage = {
        id: `t_${Date.now()}`,
        sender: 'tutor',
        text: reply,
        timestamp: 'Just now',
        suggestedActions: suggestions,
      };

      setMessages((prev) => [...prev, tutorMsg]);
      speakText(reply);
    }, 1300);
  };

  const handleClearChat = () => {
    stopSpeaking();
    stopAudioStream();
    setTutorState('idle');
    setMessages([
      {
        id: 'm_init',
        sender: 'tutor',
        text: `Holographic session cleared. Ready for your next concept query on ${currentTopic}.`,
        timestamp: 'Just now',
        suggestedActions: [
          'Explain Power Rule',
          'Test my understanding',
          'Show prerequisite dependencies'
        ],
      },
    ]);
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto animate-fadeIn">
      {/* Control Room Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
            <span>Holographic AI Tutor Console</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono">
              JARVIS ENGINE • 5-STATE REACTIVE CORE
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Multimodal voice & neural animation responding dynamically to typing, speech, reasoning, and speech synthesis.
          </p>
        </div>

        {/* Audio Speech Controls */}
        <div className="flex items-center gap-3">
          {speechSynthesisActive && (
            <button
              onClick={stopSpeaking}
              className="px-3.5 py-1.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-mono flex items-center gap-1.5 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.3)]"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Interrupt Holo-Voice</span>
            </button>
          )}

          <button
            onClick={handleClearChat}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Clear Session"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Holographic Experience Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Central Holographic Reactor Core Display */}
        <div className="lg:col-span-1 glass-panel rounded-3xl p-6 border border-cyan-500/30 flex flex-col items-center justify-between min-h-[490px] relative overflow-hidden shadow-[0_0_50px_rgba(0,240,255,0.12)]">
          {/* Top Panel Telemetry */}
          <div className="w-full flex items-center justify-between text-xs font-mono text-slate-400 pb-2 border-b border-cyan-500/15">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
              <span>JARVIS CORE INTERFACE</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                tutorState === 'typing'
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : tutorState === 'listening'
                  ? 'bg-purple-500/20 text-purple-300'
                  : tutorState === 'thinking'
                  ? 'bg-amber-500/20 text-amber-300'
                  : tutorState === 'responding'
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}
            >
              STATE: {tutorState.toUpperCase()}
            </span>
          </div>

          {/* JARVIS Animated Holographic Core */}
          <div className="my-auto py-2">
            <HolographicCore
              state={tutorState}
              voiceIntensity={voiceIntensity}
              isAudioPlaying={speechSynthesisActive}
              errorMessage={errorMessage}
              onCoreClick={() => {
                if (speechSynthesisActive) stopSpeaking();
                else toggleMic();
              }}
            />
          </div>

          {/* Active Misconception Telemetry in Side Panel */}
          <div className="w-full p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs space-y-1">
            <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Cognitive Target Context</span>
            </div>
            <div className="font-semibold text-white">{activeMisconception.name}</div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {activeMisconception.evidence}
            </p>
          </div>
        </div>

        {/* Right 2 Columns: Chat Stream & Dialogue Interface */}
        <div className="lg:col-span-2 glass-panel rounded-3xl p-6 border border-cyan-500/20 flex flex-col justify-between min-h-[520px]">
          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 max-h-[380px]">
            {messages.map((msg) => {
              const isTutor = msg.sender === 'tutor';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    isTutor ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {isTutor && (
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center shrink-0 mt-1 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-xl p-4 rounded-2xl text-xs sm:text-sm leading-relaxed space-y-2 ${
                      isTutor
                        ? 'bg-slate-900/80 border border-cyan-500/20 text-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-medium shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>

                    {/* Suggested Follow-up Pills */}
                    {isTutor && msg.suggestedActions && msg.suggestedActions.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                        {msg.suggestedActions.map((action, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(action)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 text-[11px] transition-all flex items-center gap-1 hover:bg-cyan-500/10"
                          >
                            <span>{action}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isTutor && (
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/40 text-purple-300 flex items-center justify-center shrink-0 mt-1">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Message Input Bar */}
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              {/* Voice Microphone Input Button */}
              <button
                onClick={toggleMic}
                className={`p-3.5 rounded-2xl transition-all duration-300 border flex items-center justify-center shrink-0 ${
                  isVoiceActive
                    ? 'bg-purple-600 text-white border-purple-400 animate-pulse shadow-[0_0_25px_rgba(168,85,247,0.6)]'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'
                }`}
                title={
                  voiceSupported
                    ? isVoiceActive
                      ? 'Microphone active • Click to finish'
                      : 'Click to Speak via Microphone'
                    : 'Speech recognition unavailable'
                }
              >
                {isVoiceActive ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5" />}
              </button>

              {/* Text Input Box with Real Typing Detection */}
              <input
                type="text"
                placeholder={
                  isVoiceActive
                    ? 'Listening... speak your concept question clearly'
                    : 'Type a math or concept question (e.g. "Explain power rule", "What is chain rule?")...'
                }
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                className={`flex-1 px-4 py-3.5 rounded-2xl bg-slate-900/80 border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                  tutorState === 'typing'
                    ? 'border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    : 'border-slate-700 focus:border-cyan-400'
                }`}
              />

              {/* Send Button */}
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 disabled:opacity-40 text-slate-950 font-bold transition-all shrink-0 shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                title="Send Question"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isVoiceActive ? 'bg-purple-400 animate-ping' : 'bg-cyan-400'
                  }`}
                />
                <span>
                  {isVoiceActive
                    ? `Audio Signal Intensity: ${Math.round(voiceIntensity * 100)}%`
                    : 'Reactive Keyboard & SpeechSynthesis Web Engine'}
                </span>
              </span>
              <span>Context: {currentTopic}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
