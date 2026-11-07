"""
Complete Syllabus Upload & Gemini Analysis Verification Suite:
Tests file selection, validation, drag-and-drop equivalent payload,
Gemini dynamic multi-subject analysis, student review & confirmation,
and topic-by-topic coverage audit persistence.
"""

import os
import sys
import uuid
import json
from fastapi.testclient import TestClient

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import (
    create_user,
    create_session,
    init_db,
    get_syllabus_by_subject,
    get_student_topic_coverage_list,
    save_student_topic_coverage_entry,
    get_student_partition
)

client = TestClient(app)

def setup_module():
    init_db()

def get_auth_headers():
    unique_email = f"e2e_student_{uuid.uuid4().hex[:8]}@learnmind.ai"
    user = create_user(
        name="E2E Test Student",
        email=unique_email,
        password_hash="testhash_pw12345"
    )
    user_id = user["id"]
    token = create_session(user_id=user_id, days_valid=3)
    return {"Authorization": f"Bearer {token}"}, user_id

def test_01_invalid_file_handling():
    """
    Test 1: Backend validates and rejects non-PDF or empty files with clear error messages.
    """
    headers, user_id = get_auth_headers()

    # Case A: Non-PDF text file
    response = client.post(
        "/api/syllabus/extract-preview",
        headers=headers,
        files={"file": ("syllabus.txt", b"Invalid syllabus contents", "text/plain")}
    )
    assert response.status_code == 400
    assert "only pdf" in response.json().get("detail", "").lower()

    # Case B: Empty PDF file (0 bytes)
    response_empty = client.post(
        "/api/syllabus/extract-preview",
        headers=headers,
        files={"file": ("empty.pdf", b"", "application/pdf")}
    )
    assert response_empty.status_code == 400
    assert "empty" in response_empty.json().get("detail", "").lower()

    print("\n[PASS] test_01: Invalid file formats and 0-byte files properly rejected.")

def test_02_java_oop_syllabus_upload_and_gemini_analysis():
    """
    Test 2: Upload real Java OOP syllabus (25CS303 OOP Syllabus.docx.pdf).
    Backend receives multipart file, Gemini analyzes the document,
    and returns authentic Java OOP curriculum (Classes, Inheritance, Exceptions, Generics).
    """
    pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_syllabi", "25CS303 OOP Syllabus.docx.pdf")
    if not os.path.exists(pdf_path):
        # Check download folder fallback
        pdf_path = r"C:\Users\mithu\Downloads\25CS303 OOP Syllabus.docx.pdf"

    assert os.path.exists(pdf_path), f"Sample syllabus not found at {pdf_path}"

    headers, user_id = get_auth_headers()
    with open(pdf_path, "rb") as f:
        file_bytes = f.read()

    response = client.post(
        "/api/syllabus/extract-preview",
        headers=headers,
        files={"file": ("25CS303 OOP Syllabus.docx.pdf", file_bytes, "application/pdf")},
        data={"force_reprocess": "true"}
    )

    assert response.status_code == 200, f"Extraction failed: {response.text}"
    data = response.json()
    assert data["success"] is True
    assert "25CS303" in data["subject_code"].upper()
    
    sub_name = data["subject_name"].lower()
    assert any(term in sub_name for term in ["object", "programming", "java", "oop"]), f"Unexpected subject: {sub_name}"
    assert "math" not in sub_name, "Subject mistakenly identified as Mathematics!"

    units = data["hierarchy"]["units"]
    assert len(units) >= 4, f"Expected at least 4 units, got {len(units)}"
    
    all_subtopics = []
    for u in units:
        assert "title" in u and len(u["title"]) > 0
        for t in u.get("topics", []):
            all_subtopics.extend([s.lower() for s in t.get("subtopics", [])])

    joined_text = " ".join(all_subtopics)
    # Verify genuine Java concepts extracted by Gemini
    assert any(term in joined_text for term in ["class", "constructor", "method", "inheritance", "exception", "generic", "thread"]), \
        f"Key Java OOP concepts missing from extracted subtopics: {joined_text[:200]}"

    print(f"\n[PASS] test_02: Real Java OOP syllabus analyzed by Gemini: {data['subject_name']} ({data['subject_code']}) - {len(units)} units")

def test_03_student_review_edit_and_confirmation():
    """
    Test 3: Student edits extracted curriculum (adds a missing topic, edits title)
    and calls /api/syllabus/confirm. Verifies persistence in SQLite and student partition.
    """
    headers, user_id = get_auth_headers()
    subject_name = "Object-Oriented Programming (Java)"
    subject_code = "25CS303"
    subject_id = "sub_object_oriented_programming__java_"

    hierarchy_payload = {
        "subjectName": subject_name,
        "subjectCode": subject_code,
        "totalUnits": 2,
        "totalTopics": 3,
        "units": [
            {
                "id": "u_1",
                "unitNumber": 1,
                "title": "Unit 1: Classes & Objects",
                "page_number": 1,
                "topics": [
                    {
                        "id": "top_1_1",
                        "name": "Classes, Constructors & Methods",
                        "page_number": 1,
                        "subtopics": ["Constructors", "Method Overloading", "Access Specifiers"]
                    },
                    {
                        "id": "top_1_2",
                        "name": "Static Members & Arrays",
                        "page_number": 1,
                        "subtopics": ["Static variables", "Arrays in Java"]
                    }
                ]
            },
            {
                "id": "u_2",
                "unitNumber": 2,
                "title": "Unit 2: Inheritance & Polymorphism",
                "page_number": 2,
                "topics": [
                    {
                        "id": "top_2_1",
                        "name": "Super Keyword & Method Overriding",
                        "page_number": 2,
                        "subtopics": ["Dynamic Method Dispatch", "Abstract Classes"]
                    }
                ]
            }
        ],
        "validation": {
            "confidenceScore": 1.0,
            "warnings": [],
            "needsReview": False
        }
    }

    response = client.post(
        "/api/syllabus/confirm",
        headers=headers,
        json={
            "subject_name": subject_name,
            "subject_code": subject_code,
            "original_filename": "25CS303 OOP Syllabus.docx.pdf",
            "hierarchy": hierarchy_payload
        }
    )

    assert response.status_code == 200, f"Confirmation failed: {response.text}"
    res_data = response.json()
    assert res_data["success"] is True

    # Verify directly from database
    db_syl = get_syllabus_by_subject(user_id, subject_id)
    assert db_syl is not None
    assert db_syl["subject_code"] == subject_code
    assert db_syl["extraction_status"] == "confirmed"

    # Verify student partition was synced
    part = get_student_partition(user_id)
    assert part is not None
    subj_entry = next((s for s in part.get("subjects", []) if s["id"] == subject_id), None)
    assert subj_entry is not None
    assert subj_entry["totalTopics"] == 3

    print(f"\n[PASS] test_03: Syllabus confirmed, persisted in SQLite, and synced to student partition.")

def test_04_topic_coverage_workflow_and_persistence():
    """
    Test 4: Topic-by-topic coverage walkthrough.
    Student answers questions for topics:
    - top_1_1: completed
    - top_1_2: currently_studying (focus)
    - top_2_1: not_started (zero penalty)
    Verifies auto-save, reload/resume on refresh, and status update later.
    """
    headers, user_id = get_auth_headers()
    subject_id = "sub_object_oriented_programming__java_"

    # Step A: Student answers top_1_1 as completed
    batch1 = [{"topic_id": "top_1_1", "coverage_status": "completed", "is_current_focus": False}]
    res1 = client.post(f"/api/syllabus/{subject_id}/coverage", headers=headers, json={"coverage": batch1})
    assert res1.status_code == 200

    # Step B: Student answers top_1_2 as currently_studying
    batch2 = [{"topic_id": "top_1_2", "coverage_status": "currently_studying", "is_current_focus": True}]
    res2 = client.post(f"/api/syllabus/{subject_id}/coverage", headers=headers, json={"coverage": batch2})
    assert res2.status_code == 200

    # Step C: Student leaves halfway and returns (simulating browser refresh)
    reload_res = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    assert reload_res.status_code == 200
    cov_items = reload_res.json().get("coverage", [])
    assert len(cov_items) == 2

    saved_top1 = next(c for c in cov_items if c["topic_id"] == "top_1_1")
    assert saved_top1["coverage_status"] == "completed"

    saved_top2 = next(c for c in cov_items if c["topic_id"] == "top_1_2")
    assert saved_top2["coverage_status"] == "currently_studying"
    assert saved_top2["is_current_focus"] == 1

    # Step D: Student resumes and answers top_2_1 as not_started
    batch3 = [{"topic_id": "top_2_1", "coverage_status": "not_started", "is_current_focus": False}]
    res3 = client.post(f"/api/syllabus/{subject_id}/coverage", headers=headers, json={"coverage": batch3})
    assert res3.status_code == 200

    # Step E: Allow updating topic status later (e.g. marking top_2_1 completed)
    update_batch = [{"topic_id": "top_2_1", "coverage_status": "completed", "is_current_focus": False}]
    res4 = client.post(f"/api/syllabus/{subject_id}/coverage", headers=headers, json={"coverage": update_batch})
    assert res4.status_code == 200

    final_res = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    final_cov = final_res.json().get("coverage", [])
    assert len(final_cov) == 3
    updated_item = next(c for c in final_cov if c["topic_id"] == "top_2_1")
    assert updated_item["coverage_status"] == "completed"

    print(f"\n[PASS] test_04: Topic coverage auto-save, resume after reload, and late updates verified.")

if __name__ == "__main__":
    setup_module()
    print("=" * 60)
    print("RUNNING COMPLETE SYLLABUS UPLOAD & GEMINI ANALYSIS SUITE")
    print("=" * 60)
    test_01_invalid_file_handling()
    test_02_java_oop_syllabus_upload_and_gemini_analysis()
    test_03_student_review_edit_and_confirmation()
    test_04_topic_coverage_workflow_and_persistence()
    print("\n" + "=" * 60)
    print("ALL WORKFLOW TESTS PASSED CLEANLY!")
    print("=" * 60)
