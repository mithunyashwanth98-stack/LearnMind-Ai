"""
Milestone 2 Automated Verification Suite:
End-to-End Test for Syllabus Review & Individual Topic Coverage Workflow
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
    save_student_topic_coverage_entry
)

client = TestClient(app)

def setup_module():
    init_db()

def get_auth_headers():
    unique_email = f"m2_tester_{uuid.uuid4().hex[:8]}@learnmind.ai"
    user = create_user(
        name="Milestone 2 Student",
        email=unique_email,
        password_hash="fakehash_m2_12345"
    )
    user_id = user["id"]
    token = create_session(user_id=user_id, days_valid=2)
    return {"Authorization": f"Bearer {token}"}, user_id

def test_01_extract_preview_java_syllabus():
    pdf_path = r"C:\Users\mithu\Downloads\25CS303 OOP Syllabus.docx.pdf"
    if not os.path.exists(pdf_path):
        print("Skipping file test: file not found.")
        return

    headers, user_id = get_auth_headers()
    with open(pdf_path, "rb") as f:
        file_bytes = f.read()

    response = client.post(
        "/api/syllabus/extract-preview",
        headers=headers,
        files={"file": ("25CS303 OOP Syllabus.docx.pdf", file_bytes, "application/pdf")},
        data={"force_reprocess": "true"}
    )

    assert response.status_code == 200, f"Preview failed: {response.text}"
    data = response.json()
    assert data["success"] is True
    assert "25CS303" in data["subject_code"].upper()
    sub_name = data["subject_name"].lower()
    assert any(term in sub_name for term in ["object", "programming", "java", "oop"]), f"Unexpected subject: {sub_name}"
    assert "math" not in sub_name, "Subject mistakenly identified as Mathematics!"

    units = data["hierarchy"]["units"]
    assert len(units) >= 3, f"Expected at least 3 units, got {len(units)}"
    unit_titles = " ".join(u["title"].lower() for u in units)
    assert any(t in unit_titles for t in ["class", "inheritance", "exception", "generic", "object"]), \
        f"Units do not reflect Java curriculum: {unit_titles}"

    print(f"[PASS] test_01: Preview extracted {data['subject_name']} ({data['subject_code']}) with {len(units)} units")

def test_02_confirm_syllabus_workflow():
    headers, user_id = get_auth_headers()
    subject_name = "Object-Oriented Programming (Java)"
    subject_code = "25CS303"
    subject_id = "sub_object_oriented_programming__java_"

    hierarchy_payload = {
        "subjectName": subject_name,
        "subjectCode": subject_code,
        "totalUnits": 2,
        "totalTopics": 4,
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
                        "subtopics": ["Constructors", "Method Overloading"]
                    },
                    {
                        "id": "top_1_2",
                        "name": "Static Members & Access Specifiers",
                        "page_number": 1,
                        "subtopics": ["Private vs Public", "Static variables"]
                    }
                ]
            },
            {
                "id": "u_2",
                "unitNumber": 2,
                "title": "Unit 2: Inheritance & Interfaces",
                "page_number": 2,
                "topics": [
                    {
                        "id": "top_2_1",
                        "name": "Super Keyword & Method Overriding",
                        "page_number": 2,
                        "subtopics": ["Dynamic Method Dispatch", "Abstract Classes"]
                    },
                    {
                        "id": "top_2_2",
                        "name": "Java Packages & Interfaces",
                        "page_number": 2,
                        "subtopics": ["Importing packages", "Interface contracts"]
                    }
                ]
            }
        ]
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

    assert response.status_code == 200, f"Confirm failed: {response.text}"
    res_data = response.json()
    assert res_data["success"] is True

    db_syl = get_syllabus_by_subject(user_id, subject_id)
    assert db_syl is not None
    assert db_syl["subject_code"] == subject_code
    assert db_syl["extraction_status"] == "confirmed"
    print(f"[PASS] test_02: Syllabus confirmed and persisted in SQLite for user {user_id}")

def test_03_save_topic_coverage_halfway_and_resume():
    headers, user_id = get_auth_headers()
    subject_id = "sub_object_oriented_programming__java_"

    # Step A: Student reviews first 2 topics
    first_batch = [
        {"topic_id": "top_1_1", "coverage_status": "completed", "is_current_focus": False},
        {"topic_id": "top_1_2", "coverage_status": "currently_studying", "is_current_focus": True}
    ]

    res1 = client.post(
        f"/api/syllabus/{subject_id}/coverage",
        headers=headers,
        json={"coverage": first_batch}
    )
    assert res1.status_code == 200
    assert res1.json()["success"] is True

    # Step B: Student leaves halfway and returns later -> GET coverage
    res2 = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    assert res2.status_code == 200
    cov_list = res2.json()["coverage"]
    assert len(cov_list) == 2

    top1 = next(c for c in cov_list if c["topic_id"] == "top_1_1")
    assert top1["coverage_status"] == "completed"

    top2 = next(c for c in cov_list if c["topic_id"] == "top_1_2")
    assert top2["coverage_status"] == "currently_studying"
    assert top2["is_current_focus"] == 1

    # Step C: Student resumes and finishes remaining topics
    second_batch = [
        {"topic_id": "top_2_1", "coverage_status": "partially_covered", "is_current_focus": False},
        {"topic_id": "top_2_2", "coverage_status": "not_started", "is_current_focus": False}
    ]
    res3 = client.post(
        f"/api/syllabus/{subject_id}/coverage",
        headers=headers,
        json={"coverage": second_batch}
    )
    assert res3.status_code == 200

    # Step D: Verify all 4 topics are recorded
    res4 = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    assert res4.status_code == 200
    all_cov = res4.json()["coverage"]
    assert len(all_cov) == 4

    # Step E: Allow updating topic status later
    update_batch = [
        {"topic_id": "top_2_2", "coverage_status": "completed", "is_current_focus": False}
    ]
    res5 = client.post(
        f"/api/syllabus/{subject_id}/coverage",
        headers=headers,
        json={"coverage": update_batch}
    )
    assert res5.status_code == 200
    res6 = client.get(f"/api/syllabus/{subject_id}/coverage", headers=headers)
    updated_top = next(c for c in res6.json()["coverage"] if c["topic_id"] == "top_2_2")
    assert updated_top["coverage_status"] == "completed"

    print("[PASS] test_03: Halfway save, resume, and topic-status update verified cleanly")

if __name__ == "__main__":
    setup_module()
    print("Running Milestone 2 Automated Tests...")
    test_01_extract_preview_java_syllabus()
    test_02_confirm_syllabus_workflow()
    test_03_save_topic_coverage_halfway_and_resume()
    print("\nALL MILESTONE 2 TESTS COMPLETED SUCCESSFULLY!")
