import os
import sys
import json
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import init_db, get_connection, create_session, get_user_by_email, create_user, get_adaptive_session

init_db()
client = TestClient(app)

def run_complete_adaptive_trajectory():
    print("=" * 80)
    print("COMPLETE END-TO-END ADAPTIVE TRAJECTORY TEST (Q1 TO STOPPING CRITERIA)")
    print("=" * 80)

    # 1. Setup authenticated student
    email = "trajectory_full_student@learnmind.ai"
    u = get_user_by_email(email)
    if not u:
        u = create_user("Full Trajectory Student", email, "password123")
    token = create_session(u["id"])
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get actual Java OOP syllabus
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM subject_syllabi WHERE id = 'syl_05e78e93d9e6'")
    java_row = c.fetchone()
    conn.close()

    assert java_row is not None
    java_h = json.loads(java_row["hierarchy_json"])
    subject_id = java_row["subject_id"]

    # Confirm syllabus for this user
    client.post("/api/syllabus/confirm", json={
        "subject_name": java_h["subjectName"],
        "subject_code": "25CS303",
        "original_filename": "25CS303 OOP Syllabus.docx.pdf",
        "hierarchy": java_h
    }, headers=headers)

    # Select topic top_1_2: Classes, Objects, and Methods
    selected_topic_id = "top_1_2"
    client.post(f"/api/syllabus/{subject_id}/coverage", json={
        "coverage": [{"topic_id": selected_topic_id, "coverage_status": "currently_studying", "is_current_focus": True}]
    }, headers=headers)

    # 3. Start Adaptive Session
    start_res = client.post("/api/adaptive-assessment/start", json={
        "subject_id": subject_id,
        "topic_id": selected_topic_id
    }, headers=headers)
    assert start_res.status_code == 200
    s_data = start_res.json()["session"]
    session_id = s_data["session_id"]
    current_q = s_data["current_question"]

    trajectory_steps = []
    # Test strategy:
    # Q1 (Easy): Student answers CORRECT -> AI escalates to Medium
    # Q2 (Medium): Student answers INCORRECT with distractor trap -> AI investigates misconception, launches targeted remediation probe
    # Q3 (Remediation Medium): Student answers CORRECT -> AI evaluates recovery
    # Q4 (Medium): Student answers CORRECT -> AI escalates to Hard
    # Q5 (Hard): Student answers CORRECT -> High Bayesian certainty achieved -> Stopping rule triggers!
    simulated_intents = ["correct", "incorrect", "correct", "correct", "correct"]

    step = 1
    while step <= 8:
        print(f"\n" + "=" * 75)
        print(f"QUESTION {step} [{current_q['difficulty'].upper()}] - {current_q.get('conceptTested')}")
        print(f"Source: {current_q.get('generation_source')} ({current_q.get('model_used')})")
        print("=" * 75)
        print(f"Prompt:\n{current_q['questionText']}\n")

        print("Options:")
        for opt in current_q["options"]:
            mark = "✓" if opt["isCorrect"] else "✗"
            trap = f" [Trap: {opt.get('misconceptionName')}]" if not opt["isCorrect"] else ""
            print(f"  [{opt['letter']}] {opt['text']} ({mark}){trap}")

        intent = simulated_intents[step - 1] if step <= len(simulated_intents) else "correct"
        if intent == "correct":
            chosen_opt = next(o for o in current_q["options"] if o["isCorrect"])
        else:
            chosen_opt = next(o for o in current_q["options"] if not o["isCorrect"])

        print(f"\nStudent Selection: [{chosen_opt['letter']}] {chosen_opt['text']} (Simulated Intent: {intent.upper()})")

        # Submit answer
        sub_res = client.post("/api/adaptive-assessment/submit", json={
            "session_id": session_id,
            "selected_option_id": chosen_opt["id"],
            "active_question": current_q
        }, headers=headers)
        assert sub_res.status_code == 200, f"Submit failed: {sub_res.text}"
        res_data = sub_res.json()["data"]

        eval_ans = res_data["evaluated_answer"]
        bayes = res_data["bayesian_telemetry"]
        ped = res_data["pedagogical_decision"]
        is_concluded = res_data.get("is_concluded", False)

        print(f"\nEvaluation: {'CORRECT' if eval_ans['is_correct'] else 'INCORRECT'}")
        if eval_ans.get("diagnosed_misconception"):
            print(f"Diagnosed Cognitive Trap: {eval_ans['diagnosed_misconception']}")
        print(f"AI Pedagogical Reasoning: {ped['reasoning']}")
        print(f"Next Target Difficulty: {ped['next_difficulty'].upper()} | Next Stage: {ped['next_stage']}")
        print(f"Bayesian Posterior: Beta(α={bayes['alpha']}, β={bayes['beta']}) | Mean: {bayes['posterior_mean']*100:.2f}% | Var: {bayes['variance']:.5f} | Certainty: {bayes['certainty']}%")

        trajectory_steps.append({
            "step": step,
            "question": current_q,
            "selected_option": chosen_opt,
            "is_correct": eval_ans["is_correct"],
            "bayes": bayes,
            "decision": ped,
            "is_concluded": is_concluded
        })

        if is_concluded:
            print(f"\n" + "#" * 75)
            print(f"ADAPTIVE STOPPING RULE TRIGGERED AT QUESTION {step}")
            print("#" * 75)
            final_report = res_data.get("final_report")
            assert final_report is not None
            print(f"Status Label: {final_report.get('statusLabel')}")
            print(f"Mastery Score: {final_report.get('masteryScore')}% | Confidence Score: {final_report.get('confidenceScore')}%")
            print(f"Mastered Concepts: {final_report.get('masteredConcepts')}")
            print(f"Struggling Concepts: {final_report.get('strugglingConcepts')}")
            print("\nPrioritized Revision Plan:")
            for item in final_report.get("prioritizedRevisionPlan", []):
                print(f"  • [{item.get('priority')}] {item.get('concept')}: {item.get('reason')}")
                print(f"    Action: {item.get('recommendedAction')}")
            print(f"\nAI Tutor Briefing:\n{final_report.get('aiTutorBrief')}")
            break
        else:
            current_q = res_data.get("next_question")
            assert current_q is not None
            step += 1

    assert len(trajectory_steps) == 5, f"Expected session to conclude at 5 questions, took {len(trajectory_steps)}"
    assert trajectory_steps[-1]["is_concluded"] is True

    # Verify session status in SQLite
    sess = get_adaptive_session(session_id)
    assert sess["status"] == "completed"
    print("\n✓ COMPLETE 5-QUESTION ADAPTIVE TRAJECTORY TEST FINISHED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_complete_adaptive_trajectory()

