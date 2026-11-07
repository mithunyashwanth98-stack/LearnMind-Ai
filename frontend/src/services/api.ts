import { StudentDataPartition, UserAccount } from './db';

const API_BASE = '/api';

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: UserAccount;
  partition?: StudentDataPartition;
  message?: string;
  email?: string;
  expires_in_seconds?: number;
  reset_token?: string;
}

// Helper to handle API responses and exceptions
async function handleResponse(response: Response): Promise<any> {
  let data: any = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const errorMsg = data.detail || data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }
  return data;
}

// 1. Register student (DOES NOT auto-login)
export async function apiRegister(
  name: string,
  email: string,
  password: string,
  confirmPassword?: string
): Promise<{ success: boolean; message: string; email: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      confirm_password: confirmPassword,
    }),
  });
  return handleResponse(res);
}

// 2. Sign in student
export async function apiLogin(
  email: string,
  password: string,
  rememberMe: boolean = false
): Promise<{
  success: boolean;
  token: string;
  user: UserAccount;
  partition: StudentDataPartition;
}> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      remember_me: rememberMe,
    }),
  });
  return handleResponse(res);
}

// 3. Request Password Reset OTP (triggers Brevo email)
export async function apiForgotPassword(email: string): Promise<{
  success: boolean;
  message: string;
  email: string;
  expires_in_seconds: number;
}> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse(res);
}

// 4. Verify 6-digit OTP
export async function apiVerifyResetOtp(
  email: string,
  otp: string
): Promise<{
  success: boolean;
  message: string;
  reset_token: string;
}> {
  const res = await fetch(`${API_BASE}/auth/verify-reset-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  return handleResponse(res);
}

// 5. Update Password using reset_token
export async function apiResetPassword(
  email: string,
  resetToken: string,
  newPassword: string,
  confirmPassword?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      reset_token: resetToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });
  return handleResponse(res);
}

// 6. Logout
export async function apiLogout(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {}
}

// 7. Verify session / Me
export async function apiGetMe(token: string): Promise<{
  user: UserAccount;
  partition: StudentDataPartition;
}> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

// 8. Update partition on backend
export async function apiUpdatePartition(token: string, partition: StudentDataPartition): Promise<void> {
  try {
    await fetch(`${API_BASE}/student/partition`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ partition }),
    });
  } catch {}
}

export interface TutorChatResponse {
  reply: string;
  suggestedActions: string[];
  model: string;
}

// 9. Send question to Gemini AI Tutor
export async function apiTutorChat(
  token: string,
  message: string,
  topic?: string,
  subject?: string,
  history?: Array<{ sender: 'user' | 'tutor'; text: string }>
): Promise<TutorChatResponse> {
  const res = await fetch(`${API_BASE}/tutor/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      topic,
      subject,
      history,
    }),
  });
  return handleResponse(res);
}

// 10. Extract Syllabus Preview (Stage 1 of 2 - DOES NOT AUTO-SAVE)
export async function apiExtractSyllabusPreview(
  token: string,
  file: File,
  subjectName?: string,
  subjectCode?: string,
  forceReprocess: boolean = false
): Promise<{
  success: boolean;
  cached: boolean;
  file_hash: string;
  subject_name: string;
  subject_code: string;
  original_filename: string;
  hierarchy: any;
  confidence_score: number;
  needs_review: boolean;
  validation?: any;
  message: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (subjectName) formData.append('subject_name', subjectName);
  if (subjectCode) formData.append('subject_code', subjectCode);
  if (forceReprocess) formData.append('force_reprocess', 'true');

  const headers: Record<string, string> = {};
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`${API_BASE}/syllabus/extract-preview`, {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleResponse(res);
}

// 10b. Confirm & Persist Syllabus (Stage 2 of 2 - After Student Review)
export async function apiConfirmSyllabus(
  token: string,
  payload: {
    file_hash?: string;
    subject_name: string;
    subject_code?: string;
    original_filename?: string;
    raw_text?: string;
    hierarchy: any;
  }
): Promise<{
  success: boolean;
  message: string;
  syllabus: any;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const res = await fetch(`${API_BASE}/syllabus/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

// 10c. Upload Syllabus PDF File (Legacy wrapper)
export async function apiUploadSyllabusFile(
  token: string,
  file: File,
  subjectName?: string,
  subjectCode?: string
): Promise<{
  success: boolean;
  message: string;
  syllabus: any;
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (subjectName) formData.append('subject_name', subjectName);
  if (subjectCode) formData.append('subject_code', subjectCode);

  const res = await fetch(`${API_BASE}/syllabus/upload-file`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  return handleResponse(res);
}

// 11. Upload Raw Syllabus Text
export async function apiUploadSyllabusText(
  token: string,
  rawText: string,
  subjectName: string,
  subjectCode?: string
): Promise<{
  success: boolean;
  message: string;
  syllabus: any;
}> {
  const res = await fetch(`${API_BASE}/syllabus/upload-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      raw_text: rawText,
      subject_name: subjectName,
      subject_code: subjectCode || '',
    }),
  });
  return handleResponse(res);
}

// 12. List Enrolled Syllabi
export async function apiGetSyllabi(token: string): Promise<{
  success: boolean;
  syllabi: any[];
}> {
  const res = await fetch(`${API_BASE}/syllabus`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

// 13. Update Syllabus Hierarchy
export async function apiUpdateSyllabusHierarchy(
  token: string,
  syllabusId: string,
  hierarchy: any
): Promise<{
  success: boolean;
  message: string;
  syllabus: any;
}> {
  const res = await fetch(`${API_BASE}/syllabus/${syllabusId}/hierarchy`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ hierarchy }),
  });
  return handleResponse(res);
}

// 14. Save Student Topic Coverage
export interface TopicCoverageItemPayload {
  topic_id: string;
  coverage_status: 'completed' | 'currently_studying' | 'partially_covered' | 'not_started';
  is_current_focus?: boolean;
}

export async function apiSaveTopicCoverage(
  token: string,
  subjectId: string,
  coverage: TopicCoverageItemPayload[]
): Promise<{
  success: boolean;
  message: string;
  coverage: any[];
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;

  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/coverage`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ coverage }),
  });
  return handleResponse(res);
}

// 15. Get Student Topic Coverage
export async function apiGetTopicCoverage(
  token: string,
  subjectId: string
): Promise<{
  success: boolean;
  coverage: any[];
}> {
  const headers: Record<string, string> = {};
  if (token && token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;

  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/coverage`, {
    method: 'GET',
    headers,
  });
  return handleResponse(res);
}

// 16. Toggle Topic Complete Status
export async function apiToggleTopicComplete(
  token: string,
  subjectId: string,
  topicId: string,
  completed: boolean
): Promise<{
  success: boolean;
  message: string;
  topic_id: string;
  completed: boolean;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token && token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`;

  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/topic/${topicId}/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ completed }),
  });
  return handleResponse(res);
}

// 17. Get Adaptive Diagnostic Assessment Questions (Legacy batch fallback)
export async function apiGetDiagnosticQuestions(
  token: string,
  subjectId: string
): Promise<{
  success: boolean;
  data: {
    isBaseline: boolean;
    statusMessage: string;
    evaluatedTopics: string[];
    questions: any[];
  };
}> {
  const res = await fetch(`${API_BASE}/assessment/${subjectId}/questions`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

// 18. Start Adaptive Assessment Session
export async function apiStartAdaptiveSession(
  token: string,
  subjectId: string,
  topicId?: string
): Promise<{
  success: boolean;
  session: {
    session_id: string;
    subject_id: string;
    subject_name: string;
    current_topic: { id: string; name: string; unitTitle: string };
    stage: string;
    difficulty: string;
    total_questions_answered: number;
    min_questions: number;
    max_questions: number;
    current_question: any;
  };
}> {
  const res = await fetch(`${API_BASE}/adaptive-assessment/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      subject_id: subjectId,
      topic_id: topicId || null,
    }),
  });
  return handleResponse(res);
}

// 19. Submit Adaptive Answer and Receive Next Pedagogical Step
export async function apiSubmitAdaptiveAnswer(
  token: string,
  payload: {
    session_id: string;
    selected_option_id: string;
    active_question: any;
  }
): Promise<{
  success: boolean;
  data: {
    session_id: string;
    evaluated_answer: {
      is_correct: boolean;
      selected_option_id: string;
      correct_option_id: string;
      explanation: string;
      diagnosed_misconception?: string;
    };
    bayesian_telemetry: {
      alpha: number;
      beta: number;
      posterior_mean: number;
      variance: number;
      certainty: number;
    };
    pedagogical_decision: {
      action: string;
      reasoning: string;
      next_difficulty: string;
      next_stage: string;
    };
    total_questions_answered: number;
    is_concluded: boolean;
    next_question?: any;
    final_report?: any;
  };
}> {
  const res = await fetch(`${API_BASE}/adaptive-assessment/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

// 20. Check for Active In-Progress Adaptive Session (Resume)
export async function apiGetActiveAdaptiveSession(
  token: string,
  subjectId: string
): Promise<{
  success: boolean;
  has_active: boolean;
  session?: any;
  responses?: any[];
}> {
  const res = await fetch(`${API_BASE}/adaptive-assessment/active/${subjectId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

// 21. Get Full Adaptive Session by ID
export async function apiGetAdaptiveSession(
  token: string,
  sessionId: string
): Promise<{
  success: boolean;
  session: any;
  responses: any[];
}> {
  const res = await fetch(`${API_BASE}/adaptive-assessment/session/${sessionId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}


