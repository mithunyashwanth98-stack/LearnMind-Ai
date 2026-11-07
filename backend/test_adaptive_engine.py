import os
import sys
import json
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import init_db, create_user, get_user_by_email, create_session

init_db()
client = TestClient(app)

def test_adaptive_assessment_complete_flow():
    print("=" * 60)
    print("TESTING ADAPTIVE ASSESSMENT CONTROLLER & GEMINI 3.8 FLASH")
    print("=" * 60)

    # 1. Create authenticated test student
    email = "adaptive_tester@learnmind.ai"
    u = get_user_by_email(email)
    if not u:
        u = create_user("Adaptive Tester", email, "password123")
    token = create_session(u["id"])
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Confirm a Java OOP syllabus with individual topics
    syllabus_payload = {
        "subject_name": "Object-Oriented Programming (Java)",
        "subject_code": "25CS303",
        "original_filename": "Java_OOP_Syllabus.pdf",
        "hierarchy": {
            "units": [
                {
                    "id": "unit_1",
                    "title": "Unit 1: Classes and Object-Oriented Concepts",
                    "topics": [
                        {
                            "id": "top_1_1",
                            "name": "Classes and Constructors",
                            "subtopics": ["Default Constructors", "Parameterized Constructors", "Object Instantiation"]
                        },
                        {
                            "id": "top_1_2",
                            "name": "Method Overloading and Overriding",
                            "subtopics": ["Compile-Time Polymorphism", "Dynamic Method Dispatch", "Signature Rules"]
                        }
                    ]
                }
            ],
            "validation": {"confidenceScore": 1.0, "needsReview": False}
        }
    }
    conf_res = client.post("/api/syllabus/confirm", json=syllabus_payload, headers=headers)
    assert conf_res.status_code == 200
    subject_id = "sub_object_oriented_programming__java_"

    # Mark topic top_1_1 as completed
    client.post(
        f"/api/syllabus/{subject_id}/coverage",
        json={"coverage": [{"topic_id": "top_1_1", "coverage_status": "completed", "is_current_focus": True}]},
        headers=headers
    )

    # 3. Start Adaptive Assessment Session
    print("\n[Step 1] Starting Adaptive Assessment Session...")
    start_res = client.post(
        "/api/adaptive-assessment/start",
        json={"subject_id": subject_id, "topic_id": "top_1_1"},
        headers=headers
    )
    assert start_res.status_code == 200, f"Start failed: {start_res.text}"
    session_data = start_res.json()["session"]
    session_id = session_data["session_id"]
    active_q = session_data["current_question"]

    print(f"Session ID: {session_id}")
    print(f"Q1 Difficulty: {active_q['difficulty'].upper()} (Stage: {session_data['stage']})")
    print(f"Q1 Text: {active_q['questionText']}")
    for opt in active_q["options"]:
        mark = "✓ CORRECT" if opt["isCorrect"] else "✗ DISTRACTOR"
        print(f"   [{opt['letter']}] {opt['text'][:70]} ({mark})")

    assert active_q["difficulty"] == "easy", f"Expected initial difficulty 'easy', got {active_q['difficulty']}"
    assert len(active_q["options"]) == 4, f"Expected 4 options, got {len(active_q['options'])}"

    # 4. Answer Question 1 CORRECTLY -> Expect difficulty escalation to Medium!
    print("\n[Step 2] Answering Q1 CORRECTLY...")
    correct_opt = next(o for o in active_q["options"] if o["isCorrect"])
    step1_res = client.post(
        "/api/adaptive-assessment/submit",
        json={
            "session_id": session_id,
            "selected_option_id": correct_opt["id"],
            "active_question": active_q
        },
        headers=headers
    )
    assert step1_res.status_code == 200, f"Step 1 submit failed: {step1_res.text}"
    step1_data = step1_res.json()["data"]

    print(f"Evaluation: is_correct={step1_data['evaluated_answer']['is_correct']}")
    print(f"Pedagogical Decision: {step1_data['pedagogical_decision']['action']} -> {step1_data['pedagogical_decision']['next_difficulty'].upper()}")
    print(f"AI Reasoning: {step1_data['pedagogical_decision']['reasoning']}")

    assert step1_data["evaluated_answer"]["is_correct"] is True
    assert step1_data["pedagogical_decision"]["next_difficulty"] == "medium", "Difficulty should increase to medium on correct easy answer"

    # 5. Answer Question 2 INCORRECTLY -> Expect Remediation Probe on the same concept!
    q2 = step1_data["next_question"]
    print(f"\nQ2 Difficulty: {q2['difficulty'].upper()} (Stage: {step1_data['pedagogical_decision']['next_stage']})")
    print(f"Q2 Text: {q2['questionText']}")
    incorrect_opt = next(o for o in q2["options"] if not o["isCorrect"])
    print(f"\n[Step 3] Answering Q2 INCORRECTLY with option [{incorrect_opt['letter']}] (Trap: {incorrect_opt.get('misconceptionName')})...")

    step2_res = client.post(
        "/api/adaptive-assessment/submit",
        json={
            "session_id": session_id,
            "selected_option_id": incorrect_opt["id"],
            "active_question": q2
        },
        headers=headers
    )
    assert step2_res.status_code == 200, f"Step 2 submit failed: {step2_res.text}"
    step2_data = step2_res.json()["data"]

    print(f"Evaluation: is_correct={step2_data['evaluated_answer']['is_correct']}")
    print(f"Diagnosed Trap: {step2_data['evaluated_answer']['diagnosed_misconception']}")
    print(f"Pedagogical Decision: {step2_data['pedagogical_decision']['action']} -> Stage: {step2_data['pedagogical_decision']['next_stage']}")
    print(f"AI Reasoning: {step2_data['pedagogical_decision']['reasoning']}")

    assert step2_data["evaluated_answer"]["is_correct"] is False
    assert step2_data["pedagogical_decision"]["next_stage"] == "remediation", "Should enter remediation probe to investigate misconception"

    # 6. Verify that Q3 is a DIFFERENT question probing the misconception
    q3 = step2_data["next_question"]
    print(f"\nQ3 Probe Question: {q3['questionText']}")
    assert q3["questionText"] != q2["questionText"], "AI must not repeat the exact same question!"
    assert q3["questionText"] != active_q["questionText"], "AI must not repeat Q1!"

    # 7. Check Active Session Endpoint (Resume capability)
    print("\n[Step 4] Checking Active Session Endpoint (Resume capability)...")
    active_check_res = client.get(f"/api/adaptive-assessment/active/{subject_id}", headers=headers)
    assert active_check_res.status_code == 200
    active_info = active_check_res.json()
    assert active_info["has_active"] is True
    assert active_info["session"]["id"] == session_id
    assert len(active_info["responses"]) == 2, f"Expected 2 recorded responses, got {len(active_info['responses'])}"
    print(f"✓ Session resume successfully verified! In-flight responses preserved: {len(active_info['responses'])}")

    print("\n" + "=" * 60)
    print("ALL ADAPTIVE CONTROLLER TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_adaptive_assessment_complete_flow()

