import os
import re
import time
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Depends, status, UploadFile, File, Form
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
    save_student_partition,
    sync_student_partition_subjects,
    find_duplicate_syllabus,
    create_or_update_syllabus,
    get_syllabus_by_id,
    get_syllabus_by_file_hash,
    get_syllabi_for_user,
    get_syllabus_by_subject,
    delete_syllabus,
    update_syllabus_hierarchy,
    save_topic_knowledge_entry,
    get_topic_knowledge_entry,
    get_all_topic_knowledge_for_syllabus,
    save_student_topic_coverage_entry,
    get_student_topic_coverage_list,
    get_adaptive_session,
    get_active_adaptive_session_for_user,
    get_adaptive_responses_for_session
)
from email_service import send_password_reset_email
from tutor_service import generate_tutor_response
from adaptive_controller import AdaptiveAssessmentController
from syllabus_service import (
    extract_text_from_pdf,
    extract_syllabus_hierarchy,
    synthesize_topic_knowledge,
    generate_coverage_diagnostic_questions
)
from google.genai.errors import APIError

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

class SyllabusTextUploadRequest(BaseModel):
    subject_name: str
    subject_code: Optional[str] = ""
    raw_text: str
    original_filename: Optional[str] = "Pasted_Syllabus.txt"

class HierarchyUpdateRequest(BaseModel):
    hierarchy: dict

class TopicCoverageItem(BaseModel):
    topic_id: str
    coverage_status: str  # 'completed', 'currently_studying', 'partially_covered', 'not_started'
    is_current_focus: Optional[bool] = False

class SaveCoverageRequest(BaseModel):
    coverage: List[TopicCoverageItem]

class ToggleTopicCompleteRequest(BaseModel):
    completed: bool

class ConfirmSyllabusRequest(BaseModel):
    file_hash: Optional[str] = None
    subject_name: str
    subject_code: Optional[str] = "MOD-101"
    original_filename: Optional[str] = "Syllabus.pdf"
    raw_text: Optional[str] = ""
    hierarchy: dict

class TutorChatRequest(BaseModel):
    message: str
    topic: Optional[str] = None
    subject: Optional[str] = None
    history: Optional[List[Dict[str, Any]]] = None

class StartAdaptiveSessionRequest(BaseModel):
    subject_id: str
    topic_id: Optional[str] = None

class SubmitAdaptiveAnswerRequest(BaseModel):
    session_id: str
    selected_option_id: str
    active_question: dict

# In-memory rate limiting map: user_id -> last_timestamp
user_last_tutor_request: Dict[str, float] = {}

# Dependency: Authenticated User (Strict authentication; demo fallback only if explicitly enabled via ALLOW_ANONYMOUS_DEMO=true)
def get_current_user(authorization: Optional[str] = Header(None)):
    allow_anonymous_demo = os.getenv("ALLOW_ANONYMOUS_DEMO", "false").lower() == "true"

    if not authorization or not authorization.startswith("Bearer "):
        if allow_anonymous_demo:
            demo_user = get_user_by_id("usr_demo_4491")
            if demo_user:
                return demo_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in."
        )

    parts = authorization.split(" ")
    if len(parts) < 2 or not parts[1].strip():
        if allow_anonymous_demo:
            demo_user = get_user_by_id("usr_demo_4491")
            if demo_user:
                return demo_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in."
        )

    token = parts[1].strip()
    sess = get_session(token)
    if not sess:
        if allow_anonymous_demo:
            demo_user = get_user_by_id("usr_demo_4491")
            if demo_user:
                return demo_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please sign in again."
        )

    user = get_user_by_id(sess["user_id"])
    if not user:
        if allow_anonymous_demo:
            demo_user = get_user_by_id("usr_demo_4491")
            if demo_user:
                return demo_user
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
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)
    return {
        "status": "online",
        "service": "LearnMind AI Backend API",
        "database": "SQLite (learnmind.db)",
        "brevo_configured": bool(
            (os.getenv("BREVO_SMTP_KEY") or os.getenv("BREVO_API_KEY")) and 
            (os.getenv("BREVO_SMTP_LOGIN") or os.getenv("BREVO_SENDER_EMAIL"))
        ),
        "gemini_configured": bool(
            os.getenv("GEMINI_API_KEY") and os.getenv("GEMINI_API_KEY") != "your_gemini_api_key_here"
        ),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
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

# PART 4: GEMINI AI TUTOR INTERACTION
@app.post("/api/tutor/chat")
def tutor_chat_endpoint(req: TutorChatRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    query = req.message.strip()

    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question cannot be empty."
        )
    if len(query) > 2500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question exceeds maximum length of 2500 characters."
        )

    # Rate limiting: 1.0s cooldown per student to prevent rapid double-clicks
    now = time.time()
    last_req_time = user_last_tutor_request.get(user_id, 0)
    if now - last_req_time < 1.0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Tutor is currently synthesizing knowledge. Please wait a brief moment before sending another query."
        )
    user_last_tutor_request[user_id] = now

    # Retrieve authentic student partition from database (user-isolated)
    partition = get_student_partition(user_id) or {}

    try:
        result = generate_tutor_response(
            user_message=query,
            student_name=current_user.get("name", "Student"),
            subject=req.subject,
            topic=req.topic,
            partition=partition,
            history=req.history
        )
        return result
    except APIError as api_err:
        if api_err.code in (401, 403):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Gemini API authentication rejected. Please verify GEMINI_API_KEY in backend/.env."
            )
        elif api_err.code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Gemini API quota or rate limit exceeded. Please wait a moment and try again."
            )
        elif api_err.code in (503, 504):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Gemini AI model is temporarily experiencing high demand. Please try again shortly."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gemini API error ({api_err.code}): {api_err.message}"
            )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(val_err)
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Tutor generation error: {str(exc)}"
        )

# -------------------------------------------------------------
# PART 5: SYLLABUS INGESTION & DECONSTRUCTION ENGINE
# -------------------------------------------------------------

@app.post("/api/syllabus/extract-preview")
async def extract_syllabus_preview(
    file: UploadFile = File(...),
    subject_name: Optional[str] = Form(None),
    subject_code: Optional[str] = Form(""),
    force_reprocess: Optional[bool] = Form(False),
    current_user: dict = Depends(get_current_user)
):
    """
    Step 1 of Syllabus Understanding:
    Parses PDF bytes, checks SHA-256 cache, runs multi-tier extraction (PyMuPDF / Gemini Vision / Pydantic schema / Validation),
    and returns the structured syllabus PREVIEW for the student to review & edit before confirming.
    Does NOT automatically save without student confirmation.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Currently, only PDF syllabus documents are supported."
        )

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if not content or len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF file is empty (0 bytes)."
        )

    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 25MB limit. Please upload a smaller PDF."
        )

    file_hash = hashlib.sha256(content).hexdigest()

    input_sub_name = subject_name.strip() if (subject_name and subject_name.strip() and subject_name.lower() not in ("undefined", "null")) else ""
    input_sub_code = subject_code.strip() if (subject_code and subject_code.strip() and subject_code.lower() not in ("undefined", "null")) else ""

    # Check for existing duplicate syllabus before extraction if not forced
    if not force_reprocess:
        duplicate = find_duplicate_syllabus(
            user_id=current_user["id"],
            file_hash=file_hash,
            subject_name=input_sub_name,
            subject_code=input_sub_code
        )
        if duplicate and duplicate.get("hierarchy"):
            return {
                "success": True,
                "cached": True,
                "is_duplicate": True,
                "duplicate_type": duplicate.get("duplicate_reason", "identical_file"),
                "existing_syllabus_id": duplicate["id"],
                "existing_subject_name": duplicate["subject_name"],
                "existing_subject_code": duplicate.get("subject_code") or "MOD-101",
                "file_hash": file_hash,
                "subject_name": duplicate.get("subject_name"),
                "subject_code": duplicate.get("subject_code"),
                "original_filename": duplicate.get("original_filename") or file.filename,
                "hierarchy": duplicate.get("hierarchy"),
                "confidence_score": duplicate.get("confidence_score", 1.0),
                "needs_review": False,
                "validation": duplicate.get("hierarchy", {}).get("validation", {"confidenceScore": 1.0, "needsReview": False}),
                "message": f"Syllabus for '{duplicate['subject_name']}' is already enrolled in your account."
            }

    try:
        hierarchy = extract_syllabus_hierarchy(
            pdf_bytes=content,
            subject_name=input_sub_name,
            subject_code=input_sub_code,
            filename=file.filename
        )

        final_subject_name = input_sub_name or hierarchy.get("subjectName") or "Academic Curriculum"
        final_subject_code = input_sub_code or hierarchy.get("subjectCode") or "MOD-101"
        validation = hierarchy.get("validation", {})
        confidence_score = validation.get("confidenceScore", 0.9)
        needs_review = validation.get("needsReview", True)

        # Check if the extracted subject name matches an existing confirmed syllabus
        is_dup = False
        dup_type = None
        existing_syl_id = None
        existing_syl_name = None

        if not force_reprocess:
            dup_match = find_duplicate_syllabus(
                user_id=current_user["id"],
                subject_name=final_subject_name,
                subject_code=final_subject_code
            )
            if dup_match:
                is_dup = True
                dup_type = dup_match.get("duplicate_reason", "matching_name")
                existing_syl_id = dup_match["id"]
                existing_syl_name = dup_match["subject_name"]

        return {
            "success": True,
            "cached": False,
            "is_duplicate": is_dup,
            "duplicate_type": dup_type,
            "existing_syllabus_id": existing_syl_id,
            "existing_subject_name": existing_syl_name,
            "file_hash": file_hash,
            "subject_name": final_subject_name,
            "subject_code": final_subject_code,
            "original_filename": file.filename,
            "hierarchy": hierarchy,
            "confidence_score": confidence_score,
            "needs_review": needs_review,
            "validation": validation,
            "message": f"Syllabus for '{existing_syl_name}' is already enrolled in your account." if is_dup else "Curriculum extracted. Always review and edit units/topics before confirming."
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Syllabus extraction error: {str(exc)}"
        )

@app.post("/api/syllabus/confirm")
def confirm_syllabus_endpoint(
    req: ConfirmSyllabusRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Step 2 of Syllabus Understanding:
    Invoked AFTER the student reviews, inspects, and approves the extracted syllabus.
    Persists to SQLite and synchronizes with the student's personal partition.
    """
    sub_name = req.subject_name.strip()
    if not sub_name:
        raise HTTPException(status_code=400, detail="Subject name is required.")

    sub_code = req.subject_code.strip() if req.subject_code else "MOD-101"
    subject_id = "sub_" + re.sub(r'[^a-zA-Z0-9]', '_', sub_name.lower())

    units = req.hierarchy.get("units", [])
    if not units:
        raise HTTPException(status_code=400, detail="Cannot confirm syllabus without any units or topics.")

    # Save to SQLite database as confirmed (automatically calls sync_student_partition_subjects)
    syllabus = create_or_update_syllabus(
        user_id=current_user["id"],
        subject_id=subject_id,
        subject_name=sub_name,
        subject_code=sub_code,
        original_filename=req.original_filename or "Syllabus.pdf",
        raw_text=req.raw_text or "",
        hierarchy_dict=req.hierarchy,
        extraction_status="confirmed",
        file_hash=req.file_hash,
        confidence_score=req.hierarchy.get("validation", {}).get("confidenceScore", 1.0)
    )

    partition_data = sync_student_partition_subjects(current_user["id"])

    return {
        "success": True,
        "message": "Syllabus confirmed successfully. Ready for individual topic coverage audit.",
        "syllabus": syllabus,
        "partition": partition_data
    }

@app.post("/api/syllabus/upload-file")
async def upload_syllabus_file(
    file: UploadFile = File(...),
    subject_name: Optional[str] = Form(None),
    subject_code: Optional[str] = Form(""),
    current_user: dict = Depends(get_current_user)
):
    """Backwards-compatible extraction wrapper."""
    return await extract_syllabus_preview(
        file=file,
        subject_name=subject_name,
        subject_code=subject_code,
        force_reprocess=False,
        current_user=current_user
    )

@app.post("/api/syllabus/upload-text")
def upload_syllabus_text(
    req: SyllabusTextUploadRequest,
    current_user: dict = Depends(get_current_user)
):
    text = req.raw_text.strip()
    if len(text) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Syllabus text is too short. Please provide a complete curriculum outline."
        )

    subject_name = req.subject_name.strip()
    subject_id = "sub_" + re.sub(r'[^a-zA-Z0-9]', '_', subject_name.lower())

    try:
        hierarchy = extract_syllabus_hierarchy(text, subject_name, req.subject_code.strip() if req.subject_code else "")
        syllabus = create_or_update_syllabus(
            user_id=current_user["id"],
            subject_id=subject_id,
            subject_name=subject_name,
            subject_code=req.subject_code.strip() if req.subject_code else "",
            original_filename=req.original_filename or "Pasted_Syllabus.txt",
            raw_text=text,
            hierarchy_dict=hierarchy,
            extraction_status="extracted"
        )
        return {
            "success": True,
            "message": "Syllabus extracted successfully.",
            "syllabus": syllabus
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Syllabus extraction error: {str(exc)}"
        )

@app.get("/api/syllabus")
def list_student_syllabi(current_user: dict = Depends(get_current_user)):
    """Returns all enrolled subject syllabi for the authenticated student."""
    syllabi = get_syllabi_for_user(current_user["id"])
    return {
        "success": True,
        "syllabi": syllabi
    }

@app.get("/api/syllabus/{syllabus_id}")
def get_single_syllabus(syllabus_id: str, current_user: dict = Depends(get_current_user)):
    syllabus = get_syllabus_by_id(syllabus_id)
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus record not found.")
    if syllabus["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied to another student's syllabus.")
    return {
        "success": True,
        "syllabus": syllabus
    }

@app.put("/api/syllabus/{syllabus_id}/hierarchy")
def update_syllabus_hierarchy_endpoint(
    syllabus_id: str,
    req: HierarchyUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Allows the student to review, add, edit, or remove extracted topics before knowledge synthesis."""
    syllabus = get_syllabus_by_id(syllabus_id)
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus record not found.")
    if syllabus["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    updated = update_syllabus_hierarchy(
        syllabus_id=syllabus_id,
        user_id=current_user["id"],
        hierarchy_dict=req.hierarchy,
        extraction_status="verified"
    )
    return {
        "success": True,
        "message": "Curriculum hierarchy updated and verified.",
        "syllabus": updated
    }

@app.delete("/api/syllabus/{syllabus_id}")
def delete_syllabus_endpoint(syllabus_id: str, current_user: dict = Depends(get_current_user)):
    syllabus = get_syllabus_by_id(syllabus_id)
    if not syllabus:
        raise HTTPException(status_code=404, detail="Syllabus not found.")
    if syllabus["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    success = delete_syllabus(syllabus_id, current_user["id"])
    return {
        "success": success,
        "message": "Syllabus removed successfully."
    }

# -------------------------------------------------------------
# PART 6: STUDENT SYLLABUS COVERAGE & ADAPTIVE DIAGNOSTICS
# -------------------------------------------------------------

@app.post("/api/syllabus/{subject_id}/coverage")
def save_student_coverage_endpoint(
    subject_id: str,
    req: SaveCoverageRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Saves the student's self-reported coverage status (completed, currently_studying, partially_covered, not_started)
    for each topic in the subject's curriculum.
    """
    for item in req.coverage:
        save_student_topic_coverage_entry(
            user_id=current_user["id"],
            subject_id=subject_id,
            topic_id=item.topic_id,
            coverage_status=item.coverage_status,
            is_current_focus=bool(item.is_current_focus)
        )

    # Sync into student partition
    try:
        partition_data = get_student_partition(current_user["id"])
        if partition_data:
            subjects_list = partition_data.get("subjects", [])
            for subj in subjects_list:
                if subj.get("id") == subject_id:
                    completed_count = 0
                    for u in subj.get("units", []):
                        for t in u.get("topics", []):
                            match = next((c for c in req.coverage if c.topic_id == t.get("id")), None)
                            if match:
                                t["completed"] = (match.coverage_status == "completed")
                                if match.coverage_status == "completed":
                                    t["status"] = "strong" if t.get("masteryScore", 0) > 80 else "developing"
                                    completed_count += 1
                                elif match.coverage_status == "not_started":
                                    t["status"] = "not_assessed"
                            elif t.get("completed"):
                                completed_count += 1
                    subj["completedTopics"] = completed_count
                    total = subj.get("totalTopics", 1) or 1
                    subj["masteryScore"] = round((completed_count / total) * 100) if completed_count > 0 else 0
            save_student_partition(current_user["id"], partition_data)
    except Exception as e:
        print("Coverage partition sync notice:", e)

    return {
        "success": True,
        "message": "Curriculum coverage updated.",
        "coverage": get_student_topic_coverage_list(current_user["id"], subject_id)
    }

@app.get("/api/syllabus/{subject_id}/coverage")
def get_student_coverage_endpoint(
    subject_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Returns student topic coverage records for a subject."""
    records = get_student_topic_coverage_list(current_user["id"], subject_id)
    return {
        "success": True,
        "subject_id": subject_id,
        "coverage": records
    }

@app.post("/api/syllabus/{subject_id}/topic/{topic_id}/complete")
def toggle_topic_complete_endpoint(
    subject_id: str,
    topic_id: str,
    req: ToggleTopicCompleteRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Enables the student to mark a topic as completed when they finish it.
    Immediately updates the AI agent's memory so it knows the student completed it.
    """
    status_str = "completed" if req.completed else "not_started"
    save_student_topic_coverage_entry(
        user_id=current_user["id"],
        subject_id=subject_id,
        topic_id=topic_id,
        coverage_status=status_str,
        is_current_focus=False
    )

    try:
        partition_data = get_student_partition(current_user["id"])
        if partition_data:
            subjects_list = partition_data.get("subjects", [])
            for subj in subjects_list:
                if subj.get("id") == subject_id:
                    completed_count = 0
                    for u in subj.get("units", []):
                        for t in u.get("topics", []):
                            if t.get("id") == topic_id:
                                t["completed"] = req.completed
                                t["status"] = "developing" if req.completed else "not_assessed"
                            if t.get("completed"):
                                completed_count += 1
                    subj["completedTopics"] = completed_count
                    total = subj.get("totalTopics", 1) or 1
                    subj["masteryScore"] = round((completed_count / total) * 100) if completed_count > 0 else 0
            save_student_partition(current_user["id"], partition_data)
    except Exception as e:
        print("Topic complete partition sync notice:", e)

    return {
        "success": True,
        "message": f"Topic marked as {'completed' if req.completed else 'not started'}.",
        "topic_id": topic_id,
        "completed": req.completed
    }

@app.get("/api/assessment/{subject_id}/questions")
def get_adaptive_diagnostic_questions(
    subject_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Adaptive Diagnostic Engine:
    - If student has covered topics: generates questions specifically from those topics.
    - If student has not started any topic: generates foundational baseline aptitude questions.
      CRITICAL: Never scores unstudied topics as zero failure!
    """
    syllabus = get_syllabus_by_subject(current_user["id"], subject_id)
    coverage = get_student_topic_coverage_list(current_user["id"], subject_id)

    hierarchy = None
    subject_name = "Subject"
    subject_code = "CS-101"
    if syllabus and syllabus.get("hierarchy"):
        hierarchy = syllabus["hierarchy"]
        subject_name = syllabus.get("subject_name", "Subject")
        subject_code = syllabus.get("subject_code", "MOD-101")
    else:
        partition_data = get_student_partition(current_user["id"])
        if partition_data:
            subj = next((s for s in partition_data.get("subjects", []) if s.get("id") == subject_id), None)
            if subj:
                subject_name = subj.get("name", "Subject")
                subject_code = subj.get("code", "MOD-101")
                hierarchy = {
                    "subjectName": subject_name,
                    "subjectCode": subject_code,
                    "units": subj.get("units", [])
                }

    res = generate_coverage_diagnostic_questions(
        subject_name=subject_name,
        subject_code=subject_code,
        hierarchy=hierarchy or {},
        coverage_list=coverage
    )
    return {
        "success": True,
        "data": res
    }

# -------------------------------------------------------------
# PART 7: TRULY ADAPTIVE AI LEARNING & ASSESSMENT ENGINE
# -------------------------------------------------------------

@app.post("/api/adaptive-assessment/start")
def start_adaptive_assessment_endpoint(
    req: StartAdaptiveSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Initializes a dynamic adaptive assessment session:
    - Analyzes student syllabus coverage.
    - Synthesizes initial Stage 1 (Easy) question using Gemini 3.8 Flash.
    - Persists session in SQLite database.
    """
    subject_id = req.subject_id
    syllabus = get_syllabus_by_subject(current_user["id"], subject_id)
    coverage = get_student_topic_coverage_list(current_user["id"], subject_id)

    hierarchy = None
    subject_name = "Academic Curriculum"
    if syllabus and syllabus.get("hierarchy"):
        hierarchy = syllabus["hierarchy"]
        subject_name = syllabus.get("subject_name", "Academic Curriculum")
    else:
        part = get_student_partition(current_user["id"])
        if part:
            subj = next((s for s in part.get("subjects", []) if s.get("id") == subject_id), None)
            if subj:
                subject_name = subj.get("name", "Academic Curriculum")
                hierarchy = {"subjectName": subject_name, "units": subj.get("units", [])}

    if not hierarchy:
        raise HTTPException(
            status_code=404,
            detail="No confirmed syllabus found for this subject. Please enroll and confirm a syllabus first."
        )

    try:
        session_data = AdaptiveAssessmentController.start_session(
            user_id=current_user["id"],
            subject_id=subject_id,
            subject_name=subject_name,
            hierarchy=hierarchy,
            topic_coverage=coverage,
            target_topic_id=req.topic_id
        )
        return {
            "success": True,
            "session": session_data
        }
    except Exception as e:
        logger.error(f"Error starting adaptive session: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize adaptive assessment: {str(e)}")

@app.post("/api/adaptive-assessment/submit")
def submit_adaptive_answer_endpoint(
    req: SubmitAdaptiveAnswerRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Evaluates student answer in real time, investigates misconceptions,
    updates Bayesian mastery, and dynamically generates the next question or final report.
    """
    session = get_adaptive_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Adaptive assessment session not found.")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied to another student's session.")

    syllabus = get_syllabus_by_subject(current_user["id"], session["subject_id"])
    subject_name = syllabus.get("subject_name", "Academic Curriculum") if syllabus else "Academic Curriculum"
    hierarchy = syllabus.get("hierarchy", {}) if syllabus else {}

    try:
        decision_data = AdaptiveAssessmentController.submit_answer_and_step(
            user_id=current_user["id"],
            session_id=req.session_id,
            subject_name=subject_name,
            hierarchy=hierarchy,
            selected_option_id=req.selected_option_id,
            active_question=req.active_question
        )
        return {
            "success": True,
            "data": decision_data
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Adaptive step error: {e}")
        raise HTTPException(status_code=500, detail=f"Adaptive decision engine error: {str(e)}")

@app.get("/api/adaptive-assessment/session/{session_id}")
def get_adaptive_session_endpoint(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Returns adaptive session state and response trajectory."""
    session = get_adaptive_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")

    responses = get_adaptive_responses_for_session(session_id)
    return {
        "success": True,
        "session": session,
        "responses": responses
    }

@app.get("/api/adaptive-assessment/active/{subject_id}")
def get_active_session_endpoint(
    subject_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Checks if an in-progress adaptive assessment session exists to allow seamless resume."""
    active_session = get_active_adaptive_session_for_user(current_user["id"], subject_id)
    if not active_session:
        return {"success": True, "has_active": False, "session": None}

    responses = get_adaptive_responses_for_session(active_session["id"])
    return {
        "success": True,
        "has_active": True,
        "session": active_session,
        "responses": responses
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

