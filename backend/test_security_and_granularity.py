import os
import sys
import json
from fastapi.testclient import TestClient

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import (
    init_db,
    create_user,
    get_user_by_email,
    create_session,
    get_connection
)

init_db()
client = TestClient(app)

def test_01_strict_authentication_rejection():
    """Verify that endpoints reject requests without token or with invalid token with 401 Unauthorized."""
    # Ensure ALLOW_ANONYMOUS_DEMO is not enabled
    os.environ["ALLOW_ANONYMOUS_DEMO"] = "false"

    # 1. No Authorization header
    resp_no_auth = client.get("/api/syllabus")
    assert resp_no_auth.status_code == 401, f"Expected 401, got {resp_no_auth.status_code}"
    assert "token required" in resp_no_auth.json().get("detail", "").lower()

    # 2. Malformed Authorization header
    resp_bad_auth = client.get("/api/syllabus", headers={"Authorization": "InvalidHeaderFormat"})
    assert resp_bad_auth.status_code == 401

    # 3. Invalid / expired session token
    resp_invalid_token = client.get("/api/syllabus", headers={"Authorization": "Bearer non_existent_token_12345"})
    assert resp_invalid_token.status_code == 401
    assert "session expired or invalid" in resp_invalid_token.json().get("detail", "").lower()

    # 4. Coverage endpoint without auth
    resp_cov = client.get("/api/syllabus/sub_java_oop/coverage")
    assert resp_cov.status_code == 401

    # 5. Extract preview without auth
    pdf_content = b"%PDF-1.4 mock content"
    files = {"file": ("test.pdf", pdf_content, "application/pdf")}
    resp_ext = client.post("/api/syllabus/extract-preview", files=files)
    assert resp_ext.status_code == 401

def test_02_demo_login_via_credentials():
    """Verify that logging in as demo student gives a real token and works securely."""
    resp = client.post("/api/auth/login", json={
        "email": "demo@learnmind.ai",
        "password": "password123",
        "remember_me": True
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    token = data["token"]
    assert token.startswith("lms_")

    # Access /api/auth/me with valid demo token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["email"] == "demo@learnmind.ai"

def test_03_cross_student_data_isolation():
    """Verify strict multi-tenant isolation: Student A cannot access Student B's data."""
    # Create Student A
    email_a = "student_a_sec@learnmind.ai"
    u_a = get_user_by_email(email_a)
    if not u_a:
        u_a = create_user("Student A", email_a, "hashed_pw_a")
    token_a = create_session(u_a["id"])

    # Create Student B
    email_b = "student_b_sec@learnmind.ai"
    u_b = get_user_by_email(email_b)
    if not u_b:
        u_b = create_user("Student B", email_b, "hashed_pw_b")
    token_b = create_session(u_b["id"])

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Student A confirms a syllabus
    confirm_payload = {
        "subject_name": "Object-Oriented Programming (Java)",
        "subject_code": "25CS303",
        "original_filename": "Java_Syllabus.pdf",
        "hierarchy": {
            "units": [
                {
                    "id": "unit_1",
                    "title": "Unit 1: Classes and Object-Oriented Concepts",
                    "topics": [
                        {"id": "top_1_1", "name": "Java buzzwords", "subtopics": []},
                        {"id": "top_1_2", "name": "Data types, variables and arrays", "subtopics": []},
                        {"id": "top_1_3", "name": "Operators", "subtopics": []}
                    ]
                }
            ],
            "validation": {"confidenceScore": 0.95, "needsReview": False}
        }
    }

    conf_resp = client.post("/api/syllabus/confirm", json=confirm_payload, headers=headers_a)
    assert conf_resp.status_code == 200
    syllabus_a_id = conf_resp.json()["syllabus"]["id"]

    # Student A can view their syllabus
    view_resp = client.get(f"/api/syllabus/{syllabus_a_id}", headers=headers_a)
    assert view_resp.status_code == 200

    # Student B CANNOT view Student A's syllabus (403 Forbidden)
    view_b_resp = client.get(f"/api/syllabus/{syllabus_a_id}", headers=headers_b)
    assert view_b_resp.status_code == 403, f"Expected 403, got {view_b_resp.status_code}"

    # Student B's syllabus list does not contain Student A's syllabus
    list_b_resp = client.get("/api/syllabus", headers=headers_b)
    assert list_b_resp.status_code == 200
    b_syllabi_ids = [s["id"] for s in list_b_resp.json()["syllabi"]]
    assert syllabus_a_id not in b_syllabi_ids

    # Student A saves topic coverage
    cov_payload = {
        "coverage": [
            {"topic_id": "top_1_1", "coverage_status": "completed", "is_current_focus": False},
            {"topic_id": "top_1_2", "coverage_status": "currently_studying", "is_current_focus": True},
            {"topic_id": "top_1_3", "coverage_status": "not_started", "is_current_focus": False}
        ]
    }
    cov_save_resp = client.post("/api/syllabus/sub_object_oriented_programming__java_/coverage", json=cov_payload, headers=headers_a)
    assert cov_save_resp.status_code == 200

    # Student A reads their coverage
    cov_a_resp = client.get("/api/syllabus/sub_object_oriented_programming__java_/coverage", headers=headers_a)
    assert cov_a_resp.status_code == 200
    cov_items = {c["topic_id"]: c["coverage_status"] for c in cov_a_resp.json()["coverage"]}
    assert cov_items["top_1_1"] == "completed"
    assert cov_items["top_1_2"] == "currently_studying"
    assert cov_items["top_1_3"] == "not_started"

    # Student B reads coverage for the same subject id: must be empty (isolated)
    cov_b_resp = client.get("/api/syllabus/sub_object_oriented_programming__java_/coverage", headers=headers_b)
    assert cov_b_resp.status_code == 200
    assert len(cov_b_resp.json()["coverage"]) == 0

def test_04_individual_topic_granularity_and_persistence():
    """Verify that individual topics are audited and updated separately without marking whole unit completed."""
    email = "granularity_student@learnmind.ai"
    u = get_user_by_email(email)
    if not u:
        u = create_user("Granularity Student", email, "hashed_pw")
    token = create_session(u["id"])
    headers = {"Authorization": f"Bearer {token}"}

    # Extract or confirm syllabus with 1 unit and 10 individual topics
    topic_names = [
        "Java buzzwords",
        "Data types, variables and arrays",
        "Operators",
        "Control statements",
        "Classes",
        "Constructors",
        "Methods",
        "Access specifiers",
        "Static members",
        "Method overloading"
    ]
    topics = [{"id": f"top_unit1_{i+1}", "name": name, "subtopics": []} for i, name in enumerate(topic_names)]

    confirm_payload = {
        "subject_name": "Java OOP Granular",
        "subject_code": "CS303-G",
        "original_filename": "Java_Granular.pdf",
        "hierarchy": {
            "units": [
                {
                    "id": "unit_1",
                    "title": "Unit 1: Classes and Object-Oriented Concepts",
                    "topics": topics
                }
            ],
            "validation": {"confidenceScore": 1.0, "needsReview": False}
        }
    }
    conf_resp = client.post("/api/syllabus/confirm", json=confirm_payload, headers=headers)
    assert conf_resp.status_code == 200

    subject_id = "sub_java_oop_granular"

    # 1. Initially coverage is empty
    init_cov = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    assert init_cov.status_code == 200

    # 2. Student completes ONLY topic 1 ("Java buzzwords")
    client.post(
        f"/api/syllabus/{subject_id}/topic/top_unit1_1/complete",
        json={"completed": True},
        headers=headers
    )

    # Verify partition state: completedTopics is 1 out of 10 (not whole unit!)
    me_resp = client.get("/api/auth/me", headers=headers)
    subj = next(s for s in me_resp.json()["partition"]["subjects"] if s["id"] == subject_id)
    assert subj["completedTopics"] == 1
    assert subj["totalTopics"] == 10
    assert subj["masteryScore"] == 10  # 1/10 = 10%

    # Verify top_unit1_1 is completed, but top_unit1_2 is NOT completed
    t1 = next(t for u in subj["units"] for t in u["topics"] if t["id"] == "top_unit1_1")
    t2 = next(t for u in subj["units"] for t in u["topics"] if t["id"] == "top_unit1_2")
    assert t1["completed"] is True
    assert t2["completed"] is False

    # 3. Student answers topic 2 ("Data types, variables and arrays") as "currently_studying"
    client.post(
        f"/api/syllabus/{subject_id}/coverage",
        json={"coverage": [{"topic_id": "top_unit1_2", "coverage_status": "currently_studying", "is_current_focus": True}]},
        headers=headers
    )

    # 4. Check coverage records
    cov_resp = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    records = {c["topic_id"]: c["coverage_status"] for c in cov_resp.json()["coverage"]}
    assert records["top_unit1_1"] == "completed"
    assert records["top_unit1_2"] == "currently_studying"

if __name__ == "__main__":
    test_01_strict_authentication_rejection()
    print("PASS: test_01_strict_authentication_rejection")
    test_02_demo_login_via_credentials()
    print("PASS: test_02_demo_login_via_credentials")
    test_03_cross_student_data_isolation()
    print("PASS: test_03_cross_student_data_isolation")
    test_04_individual_topic_granularity_and_persistence()
    print("PASS: test_04_individual_topic_granularity_and_persistence")
    print("\nALL SECURITY AND GRANULARITY TESTS PASSED SUCCESSFULLY!")
