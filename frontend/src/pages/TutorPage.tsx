import React, { useState, useEffect, useRef } from 'react';
import { Subject, Misconception } from '../types';
import { HolographicCore, TutorState } from '../components/HolographicCore';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { apiTutorChat } from '../services/api';
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
  Cpu,
  Layers,
  RotateCcw
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
  studentName?: string;
  onUpdateMisconception?: (misconceptionId: string) => void;
  initialMessages?: ChatMessage[];
  sessionToken?: string;
  onSaveMessages?: (messages: ChatMessage[]) => void;
}

export const TutorPage: React.FC<TutorPageProps> = ({
  subjects,
  misconceptions,
  initialTopic = 'Differentiation & Power Rule',
  studentName = 'Student',
  initialMessages,
  sessionToken,
  onSaveMessages,
}) => {
  const [tutorState, setTutorState] = useState<TutorState>('idle');
  const [voiceIntensity, setVoiceIntensity] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);
  const [modelBadge, setModelBadge] = useState<string>('GEMINI 3 FLASH');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const defaultGreeting: ChatMessage = {
    id: 'm1',
    sender: 'tutor',
    text: `Greetings, **${studentName}**. I am your LearnMind AI Holo-Tutor powered by **Gemini**. I see your active focus is on **${initialTopic}**.\n\nHow can I guide your conceptual understanding today? Feel free to ask about theoretical foundations, step-by-step calculus derivations, or programming patterns!`,
    timestamp: 'Just now',
    suggestedActions: [
      'Explain the Power Rule step-by-step',
      'Why does d/dx(5x) equal 5 and not 0?',
      'Give me a beginner practice problem',
      'Explain with a real-world analogy',
    ],
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return initialMessages;
    }
    return [defaultGreeting];
  });
  const [inputText, setInputText] = useState('');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [speechSynthesisActive, setSpeechSynthesisActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [currentTopic, setCurrentTopic] = useState(initialTopic);

  const activeMisconception =
    misconceptions.find((m) => m.status === 'active') || misconceptions[0];
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioAnimationIdRef = useRef<number | null>(null);
  const typingTimerRef = useRef<any>(null);

  // Check Web Speech API availability on mount
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
    }

    return () => {
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
  }, [messages, isGenerating]);

  // Cleanly stops microphone tracks and audio analysis
  const stopAudioStream = () => {
    if (audioAnimationIdRef.current) {
      cancelAnimationFrame(audioAnimationIdRef.current);
      audioAnimationIdRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setVoiceIntensity(0);
  };

  // Toggle voice recognition via Web Speech API
  const toggleVoiceInput = async () => {
    if (isGenerating) return;

    if (isVoiceActive) {
      stopVoiceInput();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Voice recognition is not supported in this browser. Please use Chrome/Edge.');
      return;
    }

    try {
      setErrorMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1.0, avg / 120);
        setVoiceIntensity(normalized);
        audioAnimationIdRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceActive(true);
        setTutorState('listening');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
        if (event.results[0].isFinal) {
          stopVoiceInput();
          setTimeout(() => {
            handleSendMessage(transcript);
          }, 300);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setErrorMessage(`Voice recognition note: ${event.error}`);
        }
        stopVoiceInput();
      };

      recognition.onend = () => {
        stopVoiceInput();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setErrorMessage(err.message || 'Microphone access failed.');
      stopVoiceInput();
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    stopAudioStream();
    setIsVoiceActive(false);
    if (tutorState === 'listening') {
      setTutorState('idle');
    }
  };

  // Keyboard Typing Detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (tutorState !== 'listening' && tutorState !== 'thinking' && tutorState !== 'responding') {
      setTutorState('typing');

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(() => {
        setTutorState('idle');
      }, 1200);
    }
  };

  // Speech Synthesis
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_`$]/g, '').replace(/d\/dx/g, 'd by dx');
    const utterance = new SpeechSynthesisUtterance(cleanText);

    utterance.rate = 1.0;
    utterance.pitch = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const futuristicVoice =
      voices.find(
        (v) =>
          v.lang.includes('en') &&
          (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David'))
      ) || voices[0];

    if (futuristicVoice) {
      utterance.voice = futuristicVoice;
    }

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
    if (tutorState === 'responding') {
      setTutorState('idle');
    }
  };

  // Question Submission to Gemini AI Tutor
  const handleSendMessage = async (textToSend?: string) => {
    if (isGenerating) return; // Prevent duplicate submissions

    const query = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!query) return;

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

    const updated = [...messages, userMsg];
    setMessages(updated);
    setInputText('');
    setIsGenerating(true);
    setTutorState('thinking'); // Activates holographic core reaction glow & rapid orbital rings
    setErrorMessage('');
    setLastFailedQuery(null);

    const token =
      sessionToken ||
      sessionStorage.getItem('learnmind_session_token') ||
      localStorage.getItem('learnmind_session_token') ||
      '';

    try {
      // Provide conversational history for multi-turn continuity
      const historyPayload = messages.slice(-10).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const activeSub =
        subjects.find(
          (s) =>
            s.name.toLowerCase() === currentTopic.toLowerCase() ||
            s.units?.some((u) =>
              u.topics.some(
                (t) =>
                  t.name.toLowerCase() === currentTopic.toLowerCase() ||
                  t.id === currentTopic
              )
            )
        ) || subjects[0];

      const res = await apiTutorChat(
        token,
        query,
        currentTopic,
        activeSub?.name,
        historyPayload
      );

      if (res.model) {
        setModelBadge(res.model.replace('models/', '').toUpperCase());
      }

      const tutorMsg: ChatMessage = {
        id: `t_${Date.now()}`,
        sender: 'tutor',
        text: res.reply,
        timestamp: 'Just now',
        suggestedActions: res.suggestedActions,
      };

      const finalMessages = [...updated, tutorMsg];
      setMessages(finalMessages);
      setIsGenerating(false);
      setTutorState('idle'); // Core returns smoothly to ambient breathing
      speakText(res.reply);

      if (onSaveMessages) {
        onSaveMessages(finalMessages);
      }
    } catch (err: any) {
      setIsGenerating(false);
      const errDetail = err.message || 'Unable to connect to Gemini AI Tutor. Please try again.';
      setErrorMessage(errDetail);
      setTutorState('error');
      setLastFailedQuery(query);
    }
  };

  const handleClearChat = () => {
    stopSpeaking();
    stopAudioStream();
    setTutorState('idle');
    setErrorMessage('');
    setLastFailedQuery(null);
    const reset = [defaultGreeting];
    setMessages(reset);
    if (onSaveMessages) {
      onSaveMessages(reset);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#050814] flex flex-col md:flex-row relative select-none animate-fadeIn">
      {/* Background Futuristic Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,_rgba(0,240,255,0.08)_0%,_rgba(168,85,247,0.06)_40%,_rgba(5,8,20,0.98)_85%)] pointer-events-none" />
      <div className="absolute inset-0 cyber-grid pointer-events-none opacity-20" />

      {/* ========================================================
          LEFT COLUMN: Permanent JARVIS Holographic Reactor Core
          Stays 100% visible, active, and animated at all times!
          ======================================================== */}
      <div className="w-full md:w-[380px] lg:w-[420px] xl:w-[460px] h-[260px] md:h-full shrink-0 flex flex-col justify-between p-4 md:p-6 lg:p-8 border-b md:border-b-0 md:border-r border-cyan-500/20 bg-slate-950/60 backdrop-blur-md relative z-10 overflow-hidden">
        {/* Top Header Telemetry */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.3)]">
              <Cpu className="w-4 h-4 md:w-5 md:h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs md:text-sm font-black text-white tracking-widest flex items-center gap-2">
                <span>HOLO-JARVIS</span>
                <span className="text-[9px] md:text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/40 text-cyan-400">
                  {modelBadge}
                </span>
              </div>
              <div className="text-[9px] md:text-[10px] font-mono tracking-widest text-cyan-400/80 uppercase">
                COGNITIVE CORE ONLINE
              </div>
            </div>
          </div>

          {/* Voice Output Interrupt Controller */}
          {speechSynthesisActive && (
            <button
              onClick={stopSpeaking}
              className="px-2.5 py-1 md:px-3.5 md:py-1.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-[10px] md:text-xs font-mono flex items-center gap-1.5 md:gap-2 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.35)] cursor-pointer"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Interrupt Voice</span>
            </button>
          )}
        </div>

        {/* Center: Permanently Mounted Holographic Reactor Core */}
        <div className="flex-1 flex flex-col items-center justify-center my-2 relative overflow-hidden">
          {/* Ambient Volumetric Backdrop */}
          <div className="absolute w-[300px] md:w-[440px] h-[300px] md:h-[440px] rounded-full bg-gradient-to-tr from-cyan-500/10 via-purple-600/10 to-transparent blur-3xl pointer-events-none animate-pulse-glow" />

          <HolographicCore
            size={380}
            state={tutorState}
            voiceIntensity={voiceIntensity}
            isAudioPlaying={speechSynthesisActive}
            errorMessage={errorMessage}
            onCoreClick={toggleVoiceInput}
          />
        </div>

        {/* Bottom Status / Active Topic Telemetry Banner */}
        <div className="glass-panel rounded-2xl p-3 md:p-3.5 border border-cyan-500/25 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>TOPIC:</span>
            </div>
            <span className="text-cyan-300 font-bold truncate max-w-[200px]">{currentTopic}</span>
          </div>

          {activeMisconception && (
            <div className="flex items-center gap-2 pt-2 border-t border-cyan-500/15">
              <div className="p-1 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
                <AlertTriangle className="w-3 h-3" />
              </div>
              <div className="text-[10px] font-mono text-slate-300 truncate">
                Focus: <span className="text-amber-300 font-semibold">{activeMisconception.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          RIGHT COLUMN: Spacious AI Tutor Explanation Area
          Spans remaining screen width/height, independent vertical
          scrolling, fixed prompt input bar at the bottom.
          ======================================================== */}
      <div className="flex-1 h-[calc(100vh-260px)] md:h-full min-w-0 flex flex-col bg-slate-950/80 backdrop-blur-2xl relative z-20 overflow-hidden">
        {/* Right Header Bar */}
        <div className="p-3.5 md:p-4 border-b border-cyan-500/20 flex items-center justify-between shrink-0 bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white tracking-wider uppercase">
              Dialogue Console
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[10px] font-mono text-slate-400 hidden sm:inline ml-2">
              • Student: <span className="text-cyan-300">{studentName}</span>
            </span>
          </div>

          <button
            onClick={handleClearChat}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-[11px]"
            title="Clear Conversation History"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>

        {/* Scrollable Conversation Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 animate-fadeIn ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {msg.sender === 'tutor' && (
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0 mt-1 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`w-full max-w-[92%] rounded-2xl p-5 md:p-6 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'max-w-[80%] bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 text-white shadow-[0_0_25px_rgba(0,112,243,0.35)]'
                      : 'glass-panel border border-cyan-500/30 text-slate-200 shadow-xl'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <div className="whitespace-pre-line font-medium text-xs md:text-sm">
                      {msg.text}
                    </div>
                  ) : (
                    <MarkdownRenderer content={msg.text} />
                  )}

                  {/* Follow-up Suggested Action Pills */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div className="mt-4 pt-3.5 border-t border-cyan-500/20 space-y-2">
                      <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        <span>Recommended Next Steps:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.suggestedActions.map((action, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(action)}
                            disabled={isGenerating}
                            className="px-3 py-1.5 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/90 border border-cyan-500/40 text-cyan-200 text-xs font-medium transition-all duration-200 flex items-center gap-1.5 cursor-pointer text-left hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(0,240,255,0.15)]"
                          >
                            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>{action}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] font-mono text-slate-400 text-right mt-2">
                    {msg.timestamp}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-purple-600/30 border border-purple-400/50 flex items-center justify-center text-purple-300 shrink-0 mt-1 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Thinking / Synthesizing Indicator */}
            {isGenerating && (
              <div className="flex items-center gap-3 p-4 rounded-2xl glass-panel border border-cyan-400/50 max-w-md animate-pulse text-cyan-300 text-xs font-mono shadow-[0_0_25px_rgba(0,240,255,0.2)]">
                <Sparkles className="w-5 h-5 animate-spin text-cyan-400 shrink-0" />
                <div>
                  <div className="font-bold text-white">Holo-JARVIS is synthesizing explanation...</div>
                  <div className="text-[10px] text-cyan-400/80">Cognitive neural derivation via Gemini 3 Flash</div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Typing & Voice Command Station (Fixed at bottom) */}
        <div className="p-4 border-t border-cyan-500/20 bg-slate-950/95 shrink-0">
          <div className="max-w-4xl mx-auto space-y-2">
            {/* Error Banner with Retry button */}
            {errorMessage && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-mono shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-fadeIn">
                <div className="flex items-center gap-2 overflow-hidden">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
                  <span className="truncate">{errorMessage}</span>
                </div>
                {lastFailedQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      const retryText = lastFailedQuery;
                      setErrorMessage('');
                      setLastFailedQuery(null);
                      handleSendMessage(retryText);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-900/90 hover:bg-red-800 border border-red-400 text-white text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 ml-2 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}

            <div className="relative">
              <textarea
                rows={2}
                value={inputText}
                disabled={isGenerating}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  isGenerating
                    ? 'Gemini is generating response...'
                    : isVoiceActive
                    ? 'Listening to your question... Speak clearly.'
                    : 'Ask a conceptual question, code explanation, or math step (Press Enter)...'
                }
                className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors resize-none pr-24 disabled:opacity-50"
              />

              {/* Action Buttons inside Textarea */}
              <div className="absolute right-2.5 bottom-3 flex items-center gap-1.5">
                {/* Voice Input Microphone Button */}
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={isGenerating}
                  className={`p-2 rounded-xl border transition-all duration-300 cursor-pointer disabled:opacity-40 ${
                    isVoiceActive
                      ? 'bg-red-500/30 border-red-400 text-red-300 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                      : 'bg-slate-800 border-cyan-500/30 text-slate-400 hover:text-cyan-300 hover:border-cyan-400'
                  }`}
                  title={isVoiceActive ? 'Stop Listening' : 'Activate Voice Input'}
                >
                  {isVoiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() || isGenerating}
                  className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer"
                  title="Submit Question"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Guide Hint */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
              <span>Shift + Enter for new line • Enter to send</span>
              <span>Rich Markdown & KaTeX Math Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
