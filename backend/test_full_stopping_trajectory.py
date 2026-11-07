import os
import sys
import json
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import init_db, create_user, get_user_by_email, create_session, get_adaptive_session

init_db()
client = TestClient(app)

def test_full_adaptive_stopping_trajectory():
    print("=" * 70)
    print("TEST: FULL 5-QUESTION ADAPTIVE STOPPING TRAJECTORY & MASTERY CONCLUSION")
    print("=" * 70)

    # 1. Authenticate student
    email = "trajectory_tester@learnmind.ai"
    u = get_user_by_email(email)
    if not u:
        u = create_user("Trajectory Tester", email, "password123")
    token = create_session(u["id"])
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Upload/Confirm Java OOP Syllabus
    syllabus_payload = {
        "subject_name": "Java Object-Oriented Programming",
        "subject_code": "CS201",
        "original_filename": "Java_OOP.pdf",
        "hierarchy": {
            "units": [
                {
                    "id": "unit_oop",
                    "title": "Unit 1: Object-Oriented Foundations",
                    "topics": [
                        {
                            "id": "top_polymorphism",
                            "name": "Polymorphism and Dynamic Binding",
                            "subtopics": ["Method Overriding", "Dynamic Method Dispatch", "Virtual Method Invocation"]
                        }
                    ]
                }
            ],
            "validation": {"confidenceScore": 1.0, "needsReview": False}
        }
    }
    client.post("/api/syllabus/confirm", json=syllabus_payload, headers=headers)
    subject_id = "sub_java_object_oriented_programming"

    # Set coverage
    client.post(
        f"/api/syllabus/{subject_id}/coverage",
        json={"coverage": [{"topic_id": "top_polymorphism", "coverage_status": "completed", "is_current_focus": True}]},
        headers=headers
    )

    # 3. Start Adaptive Session
    print("\n--> Starting Adaptive Assessment Session...")
    start_res = client.post(
        "/api/adaptive-assessment/start",
        json={"subject_id": subject_id, "topic_id": "top_polymorphism"},
        headers=headers
    )
    assert start_res.status_code == 200, f"Start failed: {start_res.text}"
    session_data = start_res.json()["session"]
    session_id = session_data["session_id"]
    current_q = session_data["current_question"]

    trajectory_history = []

    # Target responses for 5 questions:
    # Q1: Correct (Easy) -> expect Medium
    # Q2: Incorrect (Medium) -> expect Remediation on same concept
    # Q3: Correct (Medium probe) -> expect recovery
    # Q4: Correct (Medium) -> expect Hard
    # Q5: Correct (Hard) -> expect Conclusion (5 questions answered, mastery achieved)
    target_behavior = [
        {"intent": "correct", "label": "Q1 (Easy Baseline -> Answer Correctly)"},
        {"intent": "incorrect", "label": "Q2 (Medium Application -> Answer Incorrectly with Trap)"},
        {"intent": "correct", "label": "Q3 (Targeted Remediation Probe -> Answer Correctly to Recover)"},
        {"intent": "correct", "label": "Q4 (Medium Verification -> Answer Correctly)"},
        {"intent": "correct", "label": "Q5 (Hard Edge Case -> Answer Correctly for Mastery)"},
    ]

    for step_num, step_cfg in enumerate(target_behavior, 1):
        print(f"\n--- STEP {step_num}: {step_cfg['label']} ---")
        print(f"Question {step_num}: [{current_q['difficulty'].upper()}] {current_q['questionText']}")
        
        # Pick option based on intent
        if step_cfg["intent"] == "correct":
            selected_opt = next(o for o in current_q["options"] if o["isCorrect"])
        else:
            selected_opt = next(o for o in current_q["options"] if not o["isCorrect"])

        print(f"Student Selects: [{selected_opt['letter']}] {selected_opt['text'][:70]} (Expected: {step_cfg['intent'].upper()})")

        # Submit answer
        submit_res = client.post(
            "/api/adaptive-assessment/submit",
            json={
                "session_id": session_id,
                "selected_option_id": selected_opt["id"],
                "active_question": current_q
            },
            headers=headers
        )
        assert submit_res.status_code == 200, f"Step {step_num} failed: {submit_res.text}"
        res_data = submit_res.json()["data"]

        eval_data = res_data["evaluated_answer"]
        bayes_data = res_data["bayesian_telemetry"]
        ped_decision = res_data["pedagogical_decision"]
        is_concluded = res_data.get("is_concluded", False)

        print(f"AI Decision: {ped_decision['reasoning']}")
        print(f"Bayesian Certainty: {bayes_data['certainty']}% | Posterior Mean: {bayes_data['posterior_mean']:.3f} | Variance: {bayes_data['variance']:.4f}")
        print(f"Next Target Difficulty: {ped_decision['next_difficulty']} | Concluded: {is_concluded}")

        trajectory_history.append({
            "step": step_num,
            "difficulty": current_q["difficulty"],
            "question_text": current_q["questionText"],
            "chosen_letter": selected_opt["letter"],
            "is_correct": eval_data["is_correct"],
            "pedagogical_reason": ped_decision["reasoning"],
            "certainty": bayes_data["certainty"],
            "is_concluded": is_concluded
        })

        if is_concluded:
            print("\n" + "=" * 70)
            print("*** ADAPTIVE STOPPING RULE TRIGGERED ***")
            print("=" * 70)
            report = res_data.get("final_report")
            assert report is not None, "Expected final_report upon conclusion!"
            print(f"Overall Status: {report.get('statusLabel')}")
            print(f"Mastery Score: {report.get('masteryScore')}% | Bayesian Confidence: {report.get('confidenceScore')}%")
            print(f"Prioritized Revision Plan: {json.dumps(report.get('prioritizedRevisionPlan', []), indent=2)}")
            print(f"AI Tutor Brief:\n{report.get('aiTutorBrief')}")
            break
        else:
            current_q = res_data.get("next_question")
            assert current_q is not None, f"Expected next_question at step {step_num}"

    # Verify trajectory assertions
    assert len(trajectory_history) == 5, f"Expected exactly 5 questions before conclusion, got {len(trajectory_history)}"
    assert trajectory_history[0]["difficulty"] == "easy"
    assert trajectory_history[1]["difficulty"] == "medium"  # Escalated after Q1 correct
    assert trajectory_history[-1]["is_concluded"] == True, "Final question should have concluded the assessment"

    # Verify database state
    db_session = get_adaptive_session(session_id)
    assert db_session["status"] == "completed", f"Expected db session status 'completed', got {db_session['status']}"
    assert db_session["total_questions_answered"] == 5
    assert db_session["final_report"] is not None and len(db_session["final_report"]) > 0

    print("\n" + "=" * 70)
    print("TRAJECTORY VERIFICATION COMPLETE: ALL 5 STEPS PASSED PERFECTLY!")
    print("=" * 70)

if __name__ == "__main__":
    test_full_adaptive_stopping_trajectory()
