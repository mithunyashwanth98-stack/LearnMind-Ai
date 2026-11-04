import os
import httpx
from dotenv import load_dotenv

# Load environment variables from backend/.env
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"

def send_password_reset_email(to_email: str, recipient_name: str, otp: str) -> dict:
    """
    Sends a professional transactional password reset verification code email via Brevo.
    """
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "").strip()
    sender_name = os.getenv("BREVO_SENDER_NAME", "LearnMind AI").strip()

    if not api_key:
        raise ValueError(
            "BREVO_API_KEY is not configured in backend/.env. "
            "Please provide your Brevo API key in backend/.env to send real OTP verification emails."
        )

    if not sender_email:
        raise ValueError(
            "BREVO_SENDER_EMAIL is not configured in backend/.env. "
            "Please provide your verified Brevo sender email address in backend/.env."
        )

    # Professional Cyberpunk / Clean Futuristic HTML Email Template
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LearnMind AI - Password Reset Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050814; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #050814; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #080e1e; border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; background: linear-gradient(135deg, rgba(0, 240, 255, 0.12) 0%, rgba(168, 85, 247, 0.08) 100%); border-bottom: 1px solid rgba(0, 240, 255, 0.15);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: 1px;">
                      LearnMind <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-family: monospace; color: #00f0ff; background-color: rgba(0, 240, 255, 0.15); border: 1px solid rgba(0, 240, 255, 0.4); border-radius: 6px;">AI</span>
                    </div>
                    <div style="font-size: 10px; font-family: monospace; color: #38bdf8; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">
                      Cognitive Architecture • Security Verification
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #f1f5f9; line-height: 1.6;">
                Hello,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #cbd5e1; line-height: 1.6;">
                We received a request to reset your <strong>LearnMind AI</strong> account password.
              </p>

              <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8; font-family: monospace; text-transform: uppercase; letter-spacing: 1px;">
                Your verification code is:
              </p>

              <!-- Highlighted 6-digit OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="background-color: #050814; border: 2px solid #00f0ff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 0 30px rgba(0, 240, 255, 0.2);">
                    <span style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #00f0ff; font-family: 'Courier New', Courier, monospace; text-shadow: 0 0 12px rgba(0, 240, 255, 0.6);">
                      {otp}
                    </span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; font-size: 14px; color: #f59e0b; font-weight: 500;">
                ⏱ This code expires in <strong>5 minutes</strong>.
              </p>

              <p style="margin: 0 0 28px 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                If you did not request this password reset, you can safely ignore this email. Your current password remains protected and unchanged.
              </p>

              <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                  Regards,<br>
                  <strong style="color: #ffffff;">LearnMind AI Team</strong>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #050814; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <span style="font-size: 11px; font-family: monospace; color: #475569;">
                Automated Security Notification • Do Not Reply Directly
              </span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email,
        },
        "to": [
            {
                "email": to_email,
                "name": recipient_name or "Student",
            }
        ],
        "subject": "LearnMind AI - Password Reset Verification Code",
        "htmlContent": html_content,
    }

    headers = {
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(BREVO_API_URL, json=payload, headers=headers)

            if response.status_code in (200, 201, 202):
                return response.json()
            else:
                error_body = response.text
                try:
                    err_json = response.json()
                    err_msg = err_json.get("message") or err_json.get("code") or error_body
                except Exception:
                    err_msg = error_body

                raise RuntimeError(
                    f"Brevo API rejected email delivery (HTTP {response.status_code}): {err_msg}"
                )
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error connecting to Brevo API: {exc}")
