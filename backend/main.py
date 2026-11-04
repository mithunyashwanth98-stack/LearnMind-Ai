import os
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import bcrypt
from dotenv import load_dotenv

from database import (
    init_db,
    get_user_by_email,
    get_user_by_id,
    create_user,
    update_user_password,
    create_password_reset_otp,
    get_latest_otp_for_user,
    increment_otp_attempts,
    set_otp_reset_token,
    get_otp_by_reset_token,
    invalidate_reset_token,
    create_session,
    get_session,
    delete_session,
    get_student_partition,
    save_student_partition
)
from email_service import send_password_reset_email

# Load environment configuration
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

# Initialize SQLite database and tables
init_db()

app = FastAPI(
    title="LearnMind AI Backend",
    description="Cognitive learning platform authentication and user-partitioned intelligence API",
    version="2.5.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------
# Request & Response Pydantic Models
# -------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    confirm_password: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: Optional[bool] = False

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    reset_token: str
    new_password: str
    confirm_password: Optional[str] = None

class PartitionUpdateRequest(BaseModel):
    partition: dict

# Dependency: Authenticated User
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required"
        )
    token = authorization.split(" ")[1]
    sess = get_session(token)
    if not sess:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please sign in again."
        )
    user = get_user_by_id(sess["user_id"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Student account not found."
        )
    return user

# -------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "LearnMind AI Backend API",
        "database": "SQLite (learnmind.db)",
        "brevo_configured": bool(os.getenv("BREVO_API_KEY") and os.getenv("BREVO_SENDER_EMAIL"))
    }

# PART 1: REGISTRATION FLOW
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_student(req: RegisterRequest):
    name = req.name.strip()
    email = req.email.strip().lower()
    password = req.password

    # Input validations
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required.")
    if not email or "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please provide a valid email address.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if req.confirm_password and password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    # Check whether Gmail/email is already registered
    existing_user = get_user_by_email(email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists. Please sign in instead."
        )

    # Securely hash password with bcrypt
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Create account and clean student partition (zero fake data)
    created = create_user(name, email, password_hash)

    # REQUIRED: DO NOT automatically log in the student.
    # DO NOT create an authenticated session or authentication token.
    return {
        "success": True,
        "message": "Your account has been created successfully. Please sign in using your registered email and password.",
        "email": created["email"]
    }

# PART 2: SIGN-IN FLOW
@app.post("/api/auth/login")
def login_student(req: LoginRequest):
    email = req.email.strip().lower()
    password = req.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = get_user_by_email(email)
    if not user:
        # Do not reveal whether email exists
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please try again."
        )

    # Verify password with bcrypt
    try:
        is_valid = bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8"))
    except Exception:
        is_valid = False

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please try again."
        )

    # Valid credentials: create authenticated session
    days_valid = 30 if req.remember_me else 1
    session_token = create_session(user["id"], days_valid=days_valid)
    partition = get_student_partition(user["id"])

    return {
        "success": True,
        "token": session_token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        },
        "partition": partition
    }

# PART 3 — STEP 1 & 2 & 3: FORGOT PASSWORD REQUEST & BREVO SEND
@app.post("/api/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No student account found with this email address. Please verify your email or register."
        )

    # Rate limiting: check whether an OTP was created within the last 60 seconds
    latest_otp = get_latest_otp_for_user(user["id"])
    if latest_otp and latest_otp.get("created_at"):
        try:
            created_at = datetime.fromisoformat(latest_otp["created_at"])
            now = datetime.now(timezone.utc)
            if (now - created_at).total_seconds() < 60:
                remaining = int(60 - (now - created_at).total_seconds())
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"A verification code was recently generated. Please wait {remaining} seconds before requesting a new code."
                )
        except HTTPException:
            raise
        except Exception:
            pass

    # Generate cryptographically secure random 6-digit OTP
    otp_int = secrets.randbelow(900000) + 100000  # 100000 to 999999
    otp_code = str(otp_int)

    # Store only the SHA-256 hash of the OTP
    otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()

    # Set 5-minute expiration time
    now_utc = datetime.now(timezone.utc)
    expires_at = (now_utc + timedelta(minutes=5)).isoformat()

    # Save to database (invalidates any older unused OTP for this user)
    create_password_reset_otp(user["id"], otp_hash, expires_at)

    # Send OTP via Brevo transactional email
    try:
        send_password_reset_email(
            to_email=user["email"],
            recipient_name=user["name"],
            otp=otp_code
        )
    except Exception as exc:
        # If Brevo fails, return exact error so student/developer knows what configuration is missing
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email delivery failed: {str(exc)}"
        )

    return {
        "success": True,
        "message": "A verification code has been sent to your registered email address.",
        "email": user["email"],
        "expires_in_seconds": 300
    }

# PART 3 — STEP 4: VERIFY OTP
@app.post("/api/auth/verify-reset-otp")
def verify_reset_otp(req: VerifyOtpRequest):
    email = req.email.strip().lower()
    otp = req.otp.strip()

    if not email or not otp:
        raise HTTPException(status_code=400, detail="Email and 6-digit verification code are required.")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification request.")

    otp_record = get_latest_otp_for_user(user["id"])
    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification code found. Please request a new code."
        )

    # Check attempt limits (max 5 attempts)
    if otp_record["attempts"] >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed verification attempts. Please request a new code."
        )

    # Increment attempt count
    increment_otp_attempts(otp_record["id"])

    # Check expiration time (5 minutes)
    now_iso = datetime.now(timezone.utc).isoformat()
    if now_iso > otp_record["expires_at"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code has expired. Please request a new code."
        )

    # Securely compare submitted OTP with stored SHA-256 hash
    submitted_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    if submitted_hash != otp_record["otp_hash"]:
        remaining_attempts = 5 - (otp_record["attempts"] + 1)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining_attempts} attempts remaining."
        )

    # Correct OTP: generate single-use reset authorization token (expires in 10 minutes)
    reset_token = f"rst_{secrets.token_hex(24)}"
    set_otp_reset_token(otp_record["id"], reset_token)

    return {
        "success": True,
        "message": "Verification code confirmed successfully. Please enter your new password.",
        "reset_token": reset_token
    }

# PART 3 — STEP 5: SET NEW PASSWORD
@app.post("/api/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    email = req.email.strip().lower()
    reset_token = req.reset_token.strip()
    new_password = req.new_password

    if not email or not reset_token or not new_password:
        raise HTTPException(status_code=400, detail="All fields are required.")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    if req.confirm_password and new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid password reset request.")

    # Verify reset token
    otp_record = get_otp_by_reset_token(user["id"], reset_token)
    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset authorization has expired or is invalid. Please request a new code."
        )

    # Check if reset authorization is within 10 minutes
    if otp_record.get("used_at"):
        try:
            used_time = datetime.fromisoformat(otp_record["used_at"])
            now = datetime.now(timezone.utc)
            if (now - used_time).total_seconds() > 600:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Password reset authorization has expired. Please request a new verification code."
                )
        except HTTPException:
            raise
        except Exception:
            pass

    # Hash new password with bcrypt
    new_password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Update student password and invalidate all active sessions
    update_user_password(user["id"], new_password_hash)

    # Invalidate reset token so it cannot be reused
    invalidate_reset_token(otp_record["id"])

    # REQUIRED: Do not automatically log the student in
    return {
        "success": True,
        "message": "Your password has been reset successfully. Please sign in using your new password."
    }

# Session verification
@app.get("/api/auth/me")
def get_current_session_info(current_user: dict = Depends(get_current_user)):
    partition = get_student_partition(current_user["id"])
    return {
        "user": {
            "id": current_user["id"],
            "name": current_user["name"],
            "email": current_user["email"]
        },
        "partition": partition
    }

# Logout
@app.post("/api/auth/logout")
def logout_student(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        delete_session(token)
    return {"success": True, "message": "Logged out successfully."}

# Partition sync
@app.put("/api/student/partition")
def update_partition(req: PartitionUpdateRequest, current_user: dict = Depends(get_current_user)):
    save_student_partition(current_user["id"], req.partition)
    return {"success": True, "message": "Partition saved successfully."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
