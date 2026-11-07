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
        file_hash TEXT,
        raw_text TEXT NOT NULL,
        hierarchy_json TEXT,
        extraction_status TEXT DEFAULT 'uploaded',
        confidence_score REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Run auto-migrations for existing databases
    cursor.execute("PRAGMA table_info(subject_syllabi)")
    existing_cols = [col[1] for col in cursor.fetchall()]
    if "file_hash" not in existing_cols:
        cursor.execute("ALTER TABLE subject_syllabi ADD COLUMN file_hash TEXT")
    if "confidence_score" not in existing_cols:
        cursor.execute("ALTER TABLE subject_syllabi ADD COLUMN confidence_score REAL DEFAULT 1.0")

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

    # Adaptive Assessment Sessions Table (Dynamic multi-stage testing with persistence)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS adaptive_assessment_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        topic_ids_json TEXT NOT NULL,
        current_topic_id TEXT,
        current_stage TEXT DEFAULT 'easy',
        current_difficulty TEXT DEFAULT 'easy',
        streak_correct INTEGER DEFAULT 0,
        consecutive_incorrect INTEGER DEFAULT 0,
        total_questions_answered INTEGER DEFAULT 0,
        posterior_alpha REAL DEFAULT 1.0,
        posterior_beta REAL DEFAULT 1.0,
        status TEXT DEFAULT 'in_progress',
        evidence_summary_json TEXT,
        final_report_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Adaptive Question Responses Table (Granular student telemetry & cognitive evidence)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS adaptive_question_responses (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        topic_id TEXT NOT NULL,
        concept_tested TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        question_text TEXT NOT NULL,
        options_json TEXT NOT NULL,
        selected_option_id TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        correct_option_id TEXT NOT NULL,
        explanation TEXT NOT NULL,
        diagnosed_misconception TEXT,
        pedagogical_reasoning TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES adaptive_assessment_sessions (id) ON DELETE CASCADE
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

    # Initialize clean, unassessed student profile partition (zero hardcoded default subjects)
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
        "subjects": [],
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

def sync_student_partition_subjects(user_id: str) -> dict:
    """
    Authoritative single-source-of-truth synchronization.
    Builds student partition subjects exclusively from confirmed subject_syllabi.
    Prunes hardcoded legacy/default subjects (e.g. sub_math) and orphans without genuine confirmed syllabi.
    """
    conn = get_connection()
    cursor = conn.cursor()

    if user_id == "usr_demo_4491":
        cursor.execute("SELECT partition_json FROM student_partitions WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row and row["partition_json"]:
            return json.loads(row["partition_json"])
        return {}

    # Fetch all confirmed syllabi for this authenticated student
    cursor.execute(
        "SELECT * FROM subject_syllabi WHERE user_id = ? AND extraction_status = 'confirmed' ORDER BY created_at ASC",
        (user_id,)
    )
    syllabi_rows = cursor.fetchall()

    cursor.execute("SELECT partition_json FROM student_partitions WHERE user_id = ?", (user_id,))
    part_row = cursor.fetchone()
    partition = json.loads(part_row["partition_json"]) if (part_row and part_row["partition_json"]) else {
        "profile": {
            "id": user_id,
            "streakDays": 0,
            "totalStudyHours": 0,
            "completedConceptsCount": 0,
            "overallMastery": 0,
            "isNewStudent": True,
            "activeMisconceptionsCount": 0
        },
        "subjects": [],
        "misconceptions": [],
        "learningPath": [],
        "tutorMessages": []
    }

    # If student has zero confirmed syllabi, partition subjects MUST be empty
    if not syllabi_rows:
        partition["subjects"] = []
        if partition.get("profile"):
            partition["profile"]["completedConceptsCount"] = 0
            partition["profile"]["overallMastery"] = 0
        now_iso = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO student_partitions (user_id, partition_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET partition_json = excluded.partition_json, updated_at = excluded.updated_at
            """,
            (user_id, json.dumps(partition), now_iso)
        )
        conn.commit()
        conn.close()
        return partition

    # Fetch individual topic coverage entries
    cursor.execute(
        "SELECT subject_id, topic_id, coverage_status, is_current_focus FROM student_topic_coverage WHERE user_id = ?",
        (user_id,)
    )
    cov_rows = cursor.fetchall()
    coverage_dict = {(cr["subject_id"], cr["topic_id"]): cr["coverage_status"] for cr in cov_rows}

    existing_sub_map = {s.get("id"): s for s in partition.get("subjects", [])}
    synced_subjects = []
    total_completed_all = 0
    total_topics_all = 0

    for s_row in syllabi_rows:
        s_dict = dict(s_row)
        sub_id = s_dict["subject_id"]
        sub_name = s_dict["subject_name"]
        sub_code = s_dict.get("subject_code") or "MOD-101"

        hierarchy = {}
        if s_dict.get("hierarchy_json"):
            try:
                hierarchy = json.loads(s_dict["hierarchy_json"])
            except Exception:
                hierarchy = {}

        raw_units = hierarchy.get("units", [])
        fe_units = []
        completed_in_subj = 0
        total_in_subj = 0

        for u_idx, u in enumerate(raw_units):
            fe_topics = []
            for t_idx, t in enumerate(u.get("topics", [])):
                t_id = t.get("id") or f"top_{u_idx + 1}_{t_idx + 1}"
                t_name = t.get("name")

                cov_status = coverage_dict.get((sub_id, t_id), "not_started")
                is_completed = (cov_status == "completed")
                if is_completed:
                    completed_in_subj += 1
                total_in_subj += 1

                concepts = []
                for c_idx, st in enumerate(t.get("subtopics", [])):
                    concepts.append({
                        "id": f"c_{t_id}_{c_idx + 1}",
                        "name": st,
                        "description": f"Subtopic of {t_name}",
                        "masteryScore": 100 if is_completed else 0,
                        "status": "strong" if is_completed else "not_assessed",
                        "confidence": "high" if is_completed else "none"
                    })
                if not concepts:
                    concepts.append({
                        "id": f"c_{t_id}_1",
                        "name": t_name,
                        "description": "Core concept",
                        "masteryScore": 100 if is_completed else 0,
                        "status": "strong" if is_completed else "not_assessed",
                        "confidence": "high" if is_completed else "none"
                    })

                fe_topics.append({
                    "id": t_id,
                    "name": t_name,
                    "page_number": t.get("page_number", u.get("page_number", 1)),
                    "status": "strong" if is_completed else "not_assessed",
                    "masteryScore": 100 if is_completed else 0,
                    "confidence": "high" if is_completed else "none",
                    "completed": is_completed,
                    "coverageStatus": cov_status,
                    "misconceptions": [],
                    "concepts": concepts
                })

            fe_units.append({
                "id": u.get("id") or f"u_{u_idx + 1}",
                "title": u.get("title", f"Unit {u_idx + 1}"),
                "page_number": u.get("page_number", 1),
                "topics": fe_topics
            })

        existing_s = existing_sub_map.get(sub_id, {})
        color = existing_s.get("color") or ("#38bdf8" if any(k in sub_name.lower() for k in ["java", "oop", "code", "python", "software", "cs"]) else "#a855f7")
        brain_region = existing_s.get("brainRegion") or ("Temporal Lobe (Programming & Systems)" if any(k in sub_name.lower() for k in ["code", "prog", "java", "python", "os"]) else "Frontal Cortex (Reasoning & Theory)")
        node_coords = existing_s.get("nodeCoordinates") or [0.6, 0.2, 0.4]

        mastery_pct = round((completed_in_subj / total_in_subj) * 100) if total_in_subj > 0 else 0
        total_completed_all += completed_in_subj
        total_topics_all += total_in_subj

        synced_subject = {
            "id": sub_id,
            "name": sub_name,
            "code": sub_code,
            "status": "strong" if mastery_pct >= 80 else ("developing" if mastery_pct > 0 else "not_assessed"),
            "masteryScore": mastery_pct,
            "confidence": "high" if mastery_pct >= 60 else "none",
            "color": color,
            "brainRegion": brain_region,
            "nodeCoordinates": node_coords,
            "totalTopics": total_in_subj,
            "completedTopics": completed_in_subj,
            "detectedMisconceptionsCount": 0,
            "recommendedNextConcept": f"Focus on {fe_units[0]['topics'][0]['name'] if fe_units and fe_units[0]['topics'] else sub_name}",
            "units": fe_units
        }
        synced_subjects.append(synced_subject)

    partition["subjects"] = synced_subjects
    if partition.get("profile"):
        partition["profile"]["completedConceptsCount"] = total_completed_all
        if total_topics_all > 0:
            partition["profile"]["overallMastery"] = round((total_completed_all / total_topics_all) * 100)
        if len(synced_subjects) > 0 and partition["profile"].get("isNewStudent") and total_completed_all > 0:
            partition["profile"]["isNewStudent"] = False

    now_iso = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        INSERT INTO student_partitions (user_id, partition_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET partition_json = excluded.partition_json, updated_at = excluded.updated_at
        """,
        (user_id, json.dumps(partition), now_iso)
    )
    conn.commit()
    conn.close()
    return partition

def get_student_partition(user_id: str):
    if user_id != "usr_demo_4491":
        return sync_student_partition_subjects(user_id)
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

def find_duplicate_syllabus(user_id: str, file_hash: str = None, subject_name: str = None, subject_code: str = None):
    """
    Identifies if a matching syllabus already exists for this authenticated student:
    1. By SHA-256 file_hash of uploaded PDF
    2. By normalized subject_name
    3. By normalized subject_code (if non-generic)
    """
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Match by SHA-256 file_hash among confirmed syllabi
    if file_hash:
        cursor.execute(
            "SELECT * FROM subject_syllabi WHERE user_id = ? AND file_hash = ? AND extraction_status = 'confirmed' LIMIT 1",
            (user_id, file_hash)
        )
        row = cursor.fetchone()
        if row:
            conn.close()
            d = dict(row)
            d["duplicate_reason"] = "identical_file"
            if d.get("hierarchy_json"):
                try:
                    d["hierarchy"] = json.loads(d["hierarchy_json"])
                except Exception:
                    d["hierarchy"] = None
            return d

    # 2. Match by normalized subject name
    if subject_name and subject_name.strip():
        norm_name = subject_name.strip().lower()
        cursor.execute(
            "SELECT * FROM subject_syllabi WHERE user_id = ? AND extraction_status = 'confirmed' AND LOWER(TRIM(subject_name)) = ? LIMIT 1",
            (user_id, norm_name)
        )
        row = cursor.fetchone()
        if row:
            conn.close()
            d = dict(row)
            d["duplicate_reason"] = "matching_name"
            if d.get("hierarchy_json"):
                try:
                    d["hierarchy"] = json.loads(d["hierarchy_json"])
                except Exception:
                    d["hierarchy"] = None
            return d

    # 3. Match by normalized subject code (if non-empty and non-generic)
    if subject_code and subject_code.strip() and subject_code.strip().upper() not in ("MOD-101", ""):
        norm_code = subject_code.strip().lower()
        cursor.execute(
            "SELECT * FROM subject_syllabi WHERE user_id = ? AND extraction_status = 'confirmed' AND LOWER(TRIM(subject_code)) = ? LIMIT 1",
            (user_id, norm_code)
        )
        row = cursor.fetchone()
        if row:
            conn.close()
            d = dict(row)
            d["duplicate_reason"] = "matching_code"
            if d.get("hierarchy_json"):
                try:
                    d["hierarchy"] = json.loads(d["hierarchy_json"])
                except Exception:
                    d["hierarchy"] = None
            return d

    conn.close()
    return None

def create_or_update_syllabus(
    user_id: str,
    subject_id: str,
    subject_name: str,
    subject_code: str,
    original_filename: str,
    raw_text: str,
    hierarchy_dict: dict = None,
    extraction_status: str = "uploaded",
    file_hash: str = None,
    confidence_score: float = 1.0
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Check if a syllabus already exists for this subject & user
    # 1. By subject_id
    cursor.execute(
        "SELECT id FROM subject_syllabi WHERE user_id = ? AND subject_id = ?",
        (user_id, subject_id)
    )
    existing = cursor.fetchone()

    # 2. If not found, check by file_hash
    if not existing and file_hash:
        cursor.execute(
            "SELECT id FROM subject_syllabi WHERE user_id = ? AND file_hash = ?",
            (user_id, file_hash)
        )
        existing = cursor.fetchone()

    # 3. If not found, check by normalized subject_name
    if not existing and subject_name:
        cursor.execute(
            "SELECT id FROM subject_syllabi WHERE user_id = ? AND LOWER(TRIM(subject_name)) = LOWER(TRIM(?))",
            (user_id, subject_name.strip())
        )
        existing = cursor.fetchone()

    hierarchy_json = json.dumps(hierarchy_dict) if hierarchy_dict else None

    if existing:
        syllabus_id = existing["id"]
        cursor.execute(
            """
            UPDATE subject_syllabi
            SET subject_id = ?, subject_name = ?, subject_code = ?, original_filename = ?,
                raw_text = ?, hierarchy_json = COALESCE(?, hierarchy_json),
                extraction_status = ?, file_hash = COALESCE(?, file_hash),
                confidence_score = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                subject_id, subject_name, subject_code, original_filename,
                raw_text, hierarchy_json, extraction_status, file_hash,
                confidence_score, now_iso, syllabus_id, user_id
            )
        )
    else:
        syllabus_id = f"syl_{uuid.uuid4().hex[:12]}"
        cursor.execute(
            """
            INSERT INTO subject_syllabi (
                id, user_id, subject_id, subject_name, subject_code,
                original_filename, raw_text, hierarchy_json, extraction_status,
                file_hash, confidence_score, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                syllabus_id, user_id, subject_id, subject_name, subject_code,
                original_filename, raw_text, hierarchy_json, extraction_status,
                file_hash, confidence_score, now_iso, now_iso
            )
        )

    conn.commit()
    conn.close()

    # Auto-synchronize student partition if this syllabus is confirmed
    if extraction_status == "confirmed" and user_id != "usr_demo_4491":
        sync_student_partition_subjects(user_id)

    return get_syllabus_by_id(syllabus_id)

def get_syllabus_by_file_hash(user_id: str, file_hash: str):
    """Retrieves cached syllabus record for an identical file payload without calling Gemini again."""
    if not file_hash:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM subject_syllabi WHERE user_id = ? AND file_hash = ?",
        (user_id, file_hash)
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
    cursor.execute("SELECT subject_id FROM subject_syllabi WHERE id = ? AND user_id = ?", (syllabus_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    sub_id = row["subject_id"]
    cursor.execute("DELETE FROM subject_syllabi WHERE id = ? AND user_id = ?", (syllabus_id, user_id))
    cursor.execute("DELETE FROM student_topic_coverage WHERE user_id = ? AND subject_id = ?", (user_id, sub_id))
    cursor.execute("DELETE FROM topic_knowledge_base WHERE syllabus_id = ?", (syllabus_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if user_id != "usr_demo_4491":
        sync_student_partition_subjects(user_id)
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

    if user_id != "usr_demo_4491":
        sync_student_partition_subjects(user_id)

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

# -------------------------------------------------------------
# ADAPTIVE ASSESSMENT SESSION PERSISTENCE & TELEMETRY
# -------------------------------------------------------------

def create_adaptive_session(
    session_id: str,
    user_id: str,
    subject_id: str,
    topic_ids: List[str],
    current_topic_id: str
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    topic_ids_json = json.dumps(topic_ids)

    cursor.execute(
        """
        INSERT INTO adaptive_assessment_sessions (
            id, user_id, subject_id, topic_ids_json, current_topic_id,
            current_stage, current_difficulty, streak_correct, consecutive_incorrect,
            total_questions_answered, posterior_alpha, posterior_beta, status,
            evidence_summary_json, final_report_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'easy', 'easy', 0, 0, 0, 1.0, 1.0, 'in_progress', '{}', '{}', ?, ?)
        """,
        (session_id, user_id, subject_id, topic_ids_json, current_topic_id, now_iso, now_iso)
    )
    conn.commit()
    conn.close()
    return get_adaptive_session(session_id)

def get_adaptive_session(session_id: str) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM adaptive_assessment_sessions WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try:
        d["topic_ids"] = json.loads(d.get("topic_ids_json") or "[]")
    except Exception:
        d["topic_ids"] = []
    try:
        d["evidence_summary"] = json.loads(d.get("evidence_summary_json") or "{}")
    except Exception:
        d["evidence_summary"] = {}
    try:
        d["final_report"] = json.loads(d.get("final_report_json") or "{}")
    except Exception:
        d["final_report"] = {}
    return d

def get_active_adaptive_session_for_user(user_id: str, subject_id: str) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM adaptive_assessment_sessions 
        WHERE user_id = ? AND subject_id = ? AND status = 'in_progress'
        ORDER BY updated_at DESC LIMIT 1
        """,
        (user_id, subject_id)
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return get_adaptive_session(row["id"])

def update_adaptive_session(
    session_id: str,
    current_topic_id: Optional[str] = None,
    current_stage: Optional[str] = None,
    current_difficulty: Optional[str] = None,
    streak_correct: Optional[int] = None,
    consecutive_incorrect: Optional[int] = None,
    total_questions_answered: Optional[int] = None,
    posterior_alpha: Optional[float] = None,
    posterior_beta: Optional[float] = None,
    status: Optional[str] = None,
    evidence_summary: Optional[dict] = None,
    final_report: Optional[dict] = None
) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()

    updates = ["updated_at = ?"]
    params = [now_iso]

    if current_topic_id is not None:
        updates.append("current_topic_id = ?")
        params.append(current_topic_id)
    if current_stage is not None:
        updates.append("current_stage = ?")
        params.append(current_stage)
    if current_difficulty is not None:
        updates.append("current_difficulty = ?")
        params.append(current_difficulty)
    if streak_correct is not None:
        updates.append("streak_correct = ?")
        params.append(streak_correct)
    if consecutive_incorrect is not None:
        updates.append("consecutive_incorrect = ?")
        params.append(consecutive_incorrect)
    if total_questions_answered is not None:
        updates.append("total_questions_answered = ?")
        params.append(total_questions_answered)
    if posterior_alpha is not None:
        updates.append("posterior_alpha = ?")
        params.append(posterior_alpha)
    if posterior_beta is not None:
        updates.append("posterior_beta = ?")
        params.append(posterior_beta)
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if evidence_summary is not None:
        updates.append("evidence_summary_json = ?")
        params.append(json.dumps(evidence_summary))
    if final_report is not None:
        updates.append("final_report_json = ?")
        params.append(json.dumps(final_report))

    params.append(session_id)
    query = f"UPDATE adaptive_assessment_sessions SET {', '.join(updates)} WHERE id = ?"
    cursor.execute(query, tuple(params))
    conn.commit()
    conn.close()
    return get_adaptive_session(session_id)

def save_adaptive_question_response(
    session_id: str,
    user_id: str,
    topic_id: str,
    concept_tested: str,
    difficulty: str,
    question_text: str,
    options: List[dict],
    selected_option_id: str,
    is_correct: bool,
    correct_option_id: str,
    explanation: str,
    diagnosed_misconception: Optional[str] = None,
    pedagogical_reasoning: Optional[str] = None
) -> dict:
    conn = get_connection()
    cursor = conn.cursor()
    resp_id = f"resp_{uuid.uuid4().hex[:14]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    options_json = json.dumps(options)
    is_correct_int = 1 if is_correct else 0

    cursor.execute(
        """
        INSERT INTO adaptive_question_responses (
            id, session_id, user_id, topic_id, concept_tested, difficulty,
            question_text, options_json, selected_option_id, is_correct,
            correct_option_id, explanation, diagnosed_misconception,
            pedagogical_reasoning, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            resp_id, session_id, user_id, topic_id, concept_tested, difficulty,
            question_text, options_json, selected_option_id, is_correct_int,
            correct_option_id, explanation, diagnosed_misconception or "",
            pedagogical_reasoning or "", now_iso
        )
    )
    conn.commit()
    conn.close()
    return {
        "id": resp_id,
        "session_id": session_id,
        "is_correct": is_correct,
        "diagnosed_misconception": diagnosed_misconception,
        "pedagogical_reasoning": pedagogical_reasoning
    }

def get_adaptive_responses_for_session(session_id: str) -> List[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM adaptive_question_responses 
        WHERE session_id = ? ORDER BY created_at ASC
        """,
        (session_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    res = []
    for r in rows:
        d = dict(r)
        d["is_correct"] = bool(d["is_correct"])
        try:
            d["options"] = json.loads(d.get("options_json") or "[]")
        except Exception:
            d["options"] = []
        res.append(d)
    return res

