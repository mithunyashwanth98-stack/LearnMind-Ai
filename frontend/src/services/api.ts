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
