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

    # Subject Syllabi Table (Persistent per student, replaceable, multi-subject)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subject_syllabi (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        subject_code TEXT,
        original_filename TEXT,
        raw_text TEXT NOT NULL,
        hierarchy_json TEXT,
        extraction_status TEXT DEFAULT 'uploaded',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Topic Knowledge Base Table (Caches the 8 elements per topic)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS topic_knowledge_base (
        id TEXT PRIMARY KEY,
        syllabus_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        topic_name TEXT NOT NULL,
        unit_title TEXT,
        priority_level INTEGER DEFAULT 2,
        status TEXT DEFAULT 'pending',
        knowledge_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (syllabus_id) REFERENCES subject_syllabi (id) ON DELETE CASCADE
    )
    """)

    # Student Topic Coverage Table (Tracks self-reported progress separate from test performance)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_topic_coverage (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        coverage_status TEXT NOT NULL,
        is_current_focus INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, subject_id, topic_id)
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

# -------------------------------------------------------------
# Syllabus & Knowledge Base Operations
# -------------------------------------------------------------

def create_or_update_syllabus(
    user_id: str,
    subject_id: str,
    subject_name: str,
    subject_code: str,
    original_filename: str,
    raw_text: str,
    hierarchy_dict: dict = None,
    extraction_status: str = "uploaded"
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Check if a syllabus already exists for this subject & user
    cursor.execute(
        "SELECT id FROM subject_syllabi WHERE user_id = ? AND subject_id = ?",
        (user_id, subject_id)
    )
    existing = cursor.fetchone()

    hierarchy_json = json.dumps(hierarchy_dict) if hierarchy_dict else None

    if existing:
        syllabus_id = existing["id"]
        cursor.execute(
            """
            UPDATE subject_syllabi
            SET subject_name = ?, subject_code = ?, original_filename = ?,
                raw_text = ?, hierarchy_json = COALESCE(?, hierarchy_json),
                extraction_status = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                subject_name, subject_code, original_filename,
                raw_text, hierarchy_json, extraction_status, now_iso,
                syllabus_id, user_id
            )
        )
    else:
        syllabus_id = f"syl_{uuid.uuid4().hex[:12]}"
        cursor.execute(
            """
            INSERT INTO subject_syllabi (
                id, user_id, subject_id, subject_name, subject_code,
                original_filename, raw_text, hierarchy_json, extraction_status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                syllabus_id, user_id, subject_id, subject_name, subject_code,
                original_filename, raw_text, hierarchy_json, extraction_status,
                now_iso, now_iso
            )
        )

    conn.commit()
    conn.close()
    return get_syllabus_by_id(syllabus_id)

def get_syllabus_by_id(syllabus_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM subject_syllabi WHERE id = ?", (syllabus_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("hierarchy_json"):
        try:
            d["hierarchy"] = json.loads(d["hierarchy_json"])
        except Exception:
            d["hierarchy"] = None
    else:
        d["hierarchy"] = None
    return d

def get_syllabi_for_user(user_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM subject_syllabi WHERE user_id = ? ORDER BY updated_at DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    res = []
    for r in rows:
        d = dict(r)
        if d.get("hierarchy_json"):
            try:
                d["hierarchy"] = json.loads(d["hierarchy_json"])
            except Exception:
                d["hierarchy"] = None
        else:
            d["hierarchy"] = None
        res.append(d)
    return res

def get_syllabus_by_subject(user_id: str, subject_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM subject_syllabi WHERE user_id = ? AND subject_id = ?",
        (user_id, subject_id)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("hierarchy_json"):
        try:
            d["hierarchy"] = json.loads(d["hierarchy_json"])
        except Exception:
            d["hierarchy"] = None
    else:
        d["hierarchy"] = None
    return d

def delete_syllabus(syllabus_id: str, user_id: str) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM subject_syllabi WHERE id = ? AND user_id = ?", (syllabus_id, user_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def update_syllabus_hierarchy(syllabus_id: str, user_id: str, hierarchy_dict: dict, extraction_status: str = "extracted"):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        UPDATE subject_syllabi
        SET hierarchy_json = ?, extraction_status = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (json.dumps(hierarchy_dict), extraction_status, now_iso, syllabus_id, user_id)
    )
    conn.commit()
    conn.close()
    return get_syllabus_by_id(syllabus_id)

def save_topic_knowledge_entry(
    syllabus_id: str,
    subject_id: str,
    topic_id: str,
    topic_name: str,
    unit_title: str,
    priority_level: int = 2,
    status: str = "pending",
    knowledge_dict: dict = None,
    error_message: str = None
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    entry_id = f"tk_{uuid.uuid4().hex[:12]}"

    cursor.execute(
        "SELECT id FROM topic_knowledge_base WHERE syllabus_id = ? AND topic_id = ?",
        (syllabus_id, topic_id)
    )
    existing = cursor.fetchone()

    knowledge_json = json.dumps(knowledge_dict) if knowledge_dict else None

    if existing:
        entry_id = existing["id"]
        cursor.execute(
            """
            UPDATE topic_knowledge_base
            SET topic_name = ?, unit_title = ?, priority_level = ?,
                status = ?, knowledge_json = COALESCE(?, knowledge_json),
                error_message = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                topic_name, unit_title, priority_level, status,
                knowledge_json, error_message, now_iso, entry_id
            )
        )
    else:
        cursor.execute(
            """
            INSERT INTO topic_knowledge_base (
                id, syllabus_id, subject_id, topic_id, topic_name,
                unit_title, priority_level, status, knowledge_json,
                error_message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id, syllabus_id, subject_id, topic_id, topic_name,
                unit_title, priority_level, status, knowledge_json,
                error_message, now_iso, now_iso
            )
        )

    conn.commit()
    conn.close()
    return get_topic_knowledge_entry(syllabus_id, topic_id)

def get_topic_knowledge_entry(syllabus_id: str, topic_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM topic_knowledge_base WHERE syllabus_id = ? AND topic_id = ?",
        (syllabus_id, topic_id)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("knowledge_json"):
        try:
            d["knowledge"] = json.loads(d["knowledge_json"])
        except Exception:
            d["knowledge"] = None
    else:
        d["knowledge"] = None
    return d

def get_all_topic_knowledge_for_syllabus(syllabus_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM topic_knowledge_base WHERE syllabus_id = ? ORDER BY priority_level ASC, created_at ASC",
        (syllabus_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    res = []
    for r in rows:
        d = dict(r)
        if d.get("knowledge_json"):
            try:
                d["knowledge"] = json.loads(d["knowledge_json"])
            except Exception:
                d["knowledge"] = None
        else:
            d["knowledge"] = None
        res.append(d)
    return res

def save_student_topic_coverage_entry(
    user_id: str,
    subject_id: str,
    topic_id: str,
    coverage_status: str,
    is_current_focus: bool = False
):
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    entry_id = f"cov_{uuid.uuid4().hex[:12]}"
    focus_int = 1 if is_current_focus else 0

    cursor.execute(
        """
        INSERT INTO student_topic_coverage (
            id, user_id, subject_id, topic_id, coverage_status, is_current_focus, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, subject_id, topic_id) DO UPDATE SET
            coverage_status = excluded.coverage_status,
            is_current_focus = excluded.is_current_focus,
            updated_at = excluded.updated_at
        """,
        (entry_id, user_id, subject_id, topic_id, coverage_status, focus_int, now_iso)
    )
    conn.commit()
    conn.close()

def get_student_topic_coverage_list(user_id: str, subject_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM student_topic_coverage WHERE user_id = ? AND subject_id = ?",
        (user_id, subject_id)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

