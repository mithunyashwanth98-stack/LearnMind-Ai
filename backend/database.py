import sqlite3
import os
import json
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt

DB_PATH = os.path.join(os.path.dirname(__file__), "learnmind.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)

    # Password Reset OTPs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS password_reset_otps (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        reset_token TEXT,
        expires_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Student Partition Data Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_partitions (
        user_id TEXT PRIMARY KEY,
        partition_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Sessions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    conn.commit()

    # Seed demo student if not present
    cursor.execute("SELECT id FROM users WHERE email = 'demo@learnmind.ai'")
    demo_row = cursor.fetchone()
    if not demo_row:
        demo_id = "usr_demo_4491"
        pw_hash = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode("utf-8")
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (demo_id, "Alex Rivera", "demo@learnmind.ai", pw_hash, now_iso, now_iso)
        )

        # Seed initial demo partition with assessment records
        demo_partition = {
            "profile": {
                "id": demo_id,
                "name": "Alex Rivera",
                "email": "demo@learnmind.ai",
                "streakDays": 7,
                "totalStudyHours": 24.5,
                "completedConceptsCount": 18,
                "overallMastery": 72,
                "isNewStudent": False,
                "activeMisconceptionsCount": 2
            },
            "subjects": [
                {
                    "id": "sub_math",
                    "name": "Mathematics",
                    "code": "MATH-201",
                    "status": "developing",
                    "masteryScore": 68,
                    "confidence": "high",
                    "color": "#00f0ff",
                    "brainRegion": "Frontal Cortex (Reasoning & Logic)",
                    "nodeCoordinates": [0.8, 0.4, 0.5],
                    "totalTopics": 12,
                    "completedTopics": 8,
                    "detectedMisconceptionsCount": 2,
                    "recommendedNextConcept": "Power Rule Exponent Reduction",
                    "units": []
                }
            ],
            "misconceptions": [
                {
                    "id": "MIS_DIFF_POWER_01",
                    "name": "Power Rule Exponent Error",
                    "topic": "Differentiation",
                    "evidence": "In question 'Differentiate x³ + 5x', student answered 3x³ + 5 (multiplied exponent as coefficient but did not reduce power by 1).",
                    "repeatedErrors": 3,
                    "confidence": 88,
                    "correctiveExplanation": "When differentiating xⁿ, remember the dual operation: multiply base by power n, AND subtract 1: d/dx(xⁿ) = n·xⁿ⁻¹.",
                    "status": "active"
                }
            ],
            "learningPath": [],
            "tutorMessages": []
        }

        cursor.execute(
            "INSERT INTO student_partitions (user_id, partition_json, updated_at) VALUES (?, ?, ?)",
            (demo_id, json.dumps(demo_partition), now_iso)
        )
        conn.commit()

    conn.close()

def get_user_by_email(email: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email.strip().lower(),))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_id(user_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def create_user(name: str, email: str, password_hash: str):
    conn = get_connection()
    cursor = conn.cursor()
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, name.strip(), email.strip().lower(), password_hash, now_iso, now_iso)
    )

    # Initialize clean, unassessed student profile partition
    clean_partition = {
        "profile": {
            "id": user_id,
            "name": name.strip(),
            "email": email.strip().lower(),
            "streakDays": 0,
            "totalStudyHours": 0,
            "completedConceptsCount": 0,
            "overallMastery": 0,
            "isNewStudent": True,
            "activeMisconceptionsCount": 0
        },
        "subjects": [
            {
                "id": "sub_math",
                "name": "Mathematics",
                "code": "MATH-201",
                "status": "not_assessed",
                "masteryScore": 0,
                "confidence": "none",
                "color": "#00f0ff",
                "brainRegion": "Frontal Cortex (Reasoning & Logic)",
                "nodeCoordinates": [0.8, 0.4, 0.5],
                "totalTopics": 12,
                "completedTopics": 0,
                "detectedMisconceptionsCount": 0,
                "recommendedNextConcept": "Foundational Limits & Functions",
                "units": []
            }
        ],
        "misconceptions": [],
        "learningPath": [],
        "tutorMessages": []
    }

    cursor.execute(
        "INSERT INTO student_partitions (user_id, partition_json, updated_at) VALUES (?, ?, ?)",
        (user_id, json.dumps(clean_partition), now_iso)
    )

    conn.commit()
    conn.close()
    return {"id": user_id, "name": name.strip(), "email": email.strip().lower()}

def update_user_password(user_id: str, new_password_hash: str):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        (new_password_hash, now_iso, user_id)
    )
    # Invalidate all active sessions on password change
    cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

def create_password_reset_otp(user_id: str, otp_hash: str, expires_at: str):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Invalidate any prior unused OTPs for this user
    cursor.execute(
        "UPDATE password_reset_otps SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
        (now_iso, user_id)
    )

    otp_id = f"otp_{uuid.uuid4().hex[:12]}"
    cursor.execute(
        "INSERT INTO password_reset_otps (id, user_id, otp_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        (otp_id, user_id, otp_hash, expires_at, now_iso)
    )
    conn.commit()
    conn.close()
    return otp_id

def get_latest_otp_for_user(user_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM password_reset_otps WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
        (user_id,)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def increment_otp_attempts(otp_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ?", (otp_id,))
    conn.commit()
    conn.close()

def set_otp_reset_token(otp_id: str, reset_token: str):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "UPDATE password_reset_otps SET reset_token = ?, used_at = ? WHERE id = ?",
        (reset_token, now_iso, otp_id)
    )
    conn.commit()
    conn.close()

def get_otp_by_reset_token(user_id: str, reset_token: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM password_reset_otps WHERE user_id = ? AND reset_token = ? AND reset_token IS NOT NULL",
        (user_id, reset_token)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def invalidate_reset_token(otp_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE password_reset_otps SET reset_token = NULL WHERE id = ?", (otp_id,))
    conn.commit()
    conn.close()

def create_session(user_id: str, days_valid: int = 7):
    conn = get_connection()
    cursor = conn.cursor()
    token = f"lms_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=days_valid)).isoformat()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (token, user_id, expires_at, now.isoformat())
    )
    conn.commit()
    conn.close()
    return token

def get_session(token: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sessions WHERE token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    sess = dict(row)
    now_iso = datetime.now(timezone.utc).isoformat()
    if sess["expires_at"] < now_iso:
        delete_session(token)
        return None
    return sess

def delete_session(token: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def get_student_partition(user_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT partition_json FROM student_partitions WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row and row["partition_json"]:
        return json.loads(row["partition_json"])
    return None

def save_student_partition(user_id: str, data: dict):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        INSERT INTO student_partitions (user_id, partition_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET partition_json = excluded.partition_json, updated_at = excluded.updated_at
        """,
        (user_id, json.dumps(data), now_iso)
    )
    conn.commit()
    conn.close()
