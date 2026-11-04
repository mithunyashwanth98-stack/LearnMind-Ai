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

// 10. Upload Syllabus PDF File
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
  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/coverage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
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
  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/coverage`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
  const res = await fetch(`${API_BASE}/syllabus/${subjectId}/topic/${topicId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ completed }),
  });
  return handleResponse(res);
}

// 17. Get Adaptive Diagnostic Assessment Questions
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


