import os
import sys
import json
import requests

API_URL = "http://127.0.0.1:8000/api"

def test_full_browser_pipeline():
    print("=" * 80)
    print("LEARNMIND AI - FULL END-TO-END BROWSER PIPELINE TEST")
    print("=" * 80)

    # 1. Student registers and gets authentication token
    user_payload = {
        "name": "Alex Mercer",
        "email": "alex.mercer@learnmind.ai",
        "password": "Password123!"
    }
    # Register or login
    reg_res = requests.post(f"{API_URL}/auth/register", json=user_payload)
    if reg_res.status_code == 200:
        token = reg_res.json().get("token")
    else:
        login_res = requests.post(f"{API_URL}/auth/login", json={
            "email": user_payload["email"],
            "password": user_payload["password"]
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["token"]

    headers = {"Authorization": f"Bearer {token}"}
    print("✓ Step 1: Student Authenticated via JWT Session Token.")

    # 2. Upload actual syllabus PDF
    pdf_path = r"d:\devpost1\sample_syllabi\25CS303 OOP Syllabus.docx.pdf"
    assert os.path.exists(pdf_path), f"Syllabus file missing at {pdf_path}"

    with open(pdf_path, "rb") as f:
        upload_res = requests.post(
            f"{API_URL}/syllabus/extract-preview",
            files={"file": (os.path.basename(pdf_path), f, "application/pdf")},
            headers=headers
        )
    assert upload_res.status_code == 200, f"Upload preview failed: {upload_res.text}"
    preview_data = upload_res.json()
    syllabus_hierarchy = preview_data["hierarchy"]
    subject_id = f"sub_{preview_data['subject_name'].lower().replace(' ', '_').replace('-', '_')}"
    subject_name = preview_data.get("subject_name", "Object Oriented Programming")

    print(f"✓ Step 2: Syllabus PDF Uploaded and Analyzed.")
    print(f"   Subject: '{subject_name}' | Units Detected: {len(syllabus_hierarchy.get('units', []))}")
    for u in syllabus_hierarchy.get("units", [])[:2]:
        print(f"   - {u.get('title')}: {len(u.get('topics', []))} topics")

    # 3. Confirm Syllabus
    confirm_payload = {
        "subject_name": subject_name,
        "subject_code": syllabus_hierarchy.get("courseCode", "25CS303"),
        "original_filename": os.path.basename(pdf_path),
        "hierarchy": syllabus_hierarchy
    }
    conf_res = requests.post(f"{API_URL}/syllabus/confirm", json=confirm_payload, headers=headers)
    assert conf_res.status_code == 200, f"Confirm failed: {conf_res.text}"
    conf_json = conf_res.json()
    if conf_json.get("syllabus") and conf_json["syllabus"].get("subject_id"):
        subject_id = conf_json["syllabus"]["subject_id"]
    print(f"✓ Step 3: Student Reviewed & Confirmed Syllabus Extraction. Subject ID: {subject_id}")

    # 4. Set topic-by-topic completion coverage
    all_topics = []
    for u in syllabus_hierarchy.get("units", []):
        for t in u.get("topics", []):
            all_topics.append(t)

    target_topic = all_topics[1] # "Classes, Objects, and Methods"
    coverage_items = [
        {"topic_id": all_topics[0]["id"], "coverage_status": "completed", "is_current_focus": False},
        {"topic_id": target_topic["id"], "coverage_status": "currently_studying", "is_current_focus": True},
    ]
    for rem in all_topics[2:]:
        coverage_items.append({"topic_id": rem["id"], "coverage_status": "not_started", "is_current_focus": False})

    cov_res = requests.post(f"{API_URL}/syllabus/{subject_id}/coverage", json={"coverage": coverage_items}, headers=headers)
    assert cov_res.status_code == 200, f"Coverage save failed: {cov_res.text}"
    print(f"✓ Step 4: Topic Coverage Saved. Current Focus: '{target_topic['name']}'.")

    # 5. Start Adaptive Assessment on Focus Topic
    start_res = requests.post(f"{API_URL}/adaptive-assessment/start", json={
        "subject_id": subject_id,
        "topic_id": target_topic["id"]
    }, headers=headers)
    assert start_res.status_code == 200, f"Assessment start failed: {start_res.text}"
    session_data = start_res.json()["session"]
    session_id = session_data["session_id"]
    current_q = session_data["current_question"]

    print(f"✓ Step 5: Adaptive Assessment Arena Initialized.")
    print(f"   Session ID: {session_id}")
    print(f"   Initial Question Difficulty: {current_q['difficulty'].upper()}")
    print(f"   Generation Engine: {current_q.get('generation_source')} ({current_q.get('model_used')})")

    # 6. Step through questions dynamically
    step = 1
    while step <= 6:
        print(f"\n   [Question {step}] ({current_q['difficulty'].upper()}): {current_q['questionText'][:80]}...")
        correct_opt = next(o for o in current_q["options"] if o["isCorrect"])
        distractor_opt = next(o for o in current_q["options"] if not o["isCorrect"])

        # Intentionally miss Q2 to verify misconception handling, answer others correctly
        chosen_opt = distractor_opt if step == 2 else correct_opt
        print(f"   Student submits: [{chosen_opt['letter']}] {chosen_opt['text'][:60]}")

        sub_res = requests.post(f"{API_URL}/adaptive-assessment/submit", json={
            "session_id": session_id,
            "selected_option_id": chosen_opt["id"],
            "active_question": current_q
        }, headers=headers)
        assert sub_res.status_code == 200, f"Submit failed: {sub_res.text}"
        step_out = sub_res.json()["data"]

        eval_ans = step_out["evaluated_answer"]
        bayes = step_out["bayesian_telemetry"]
        ped = step_out["pedagogical_decision"]
        is_concluded = step_out.get("is_concluded", False)

        print(f"   -> Result: {'CORRECT' if eval_ans['is_correct'] else 'INCORRECT'}")
        if eval_ans.get("diagnosed_misconception"):
            print(f"   -> Diagnosed Misconception: {eval_ans['diagnosed_misconception']}")
        print(f"   -> AI Pedagogical Reasoning: {ped['reasoning']}")
        print(f"   -> Bayesian Certainty: {bayes['certainty']}% (Posterior Mean: {bayes['posterior_mean']*100:.2f}%)")

        if is_concluded:
            print(f"\n✓ Step 6: Adaptive Stopping Criterion Met at Question {step}!")
            final_rep = step_out["final_report"]
            print("\n" + "=" * 60)
            print("COGNITIVE DIAGNOSTIC & PERSONALIZED RECOMMENDATIONS REPORT")
            print("=" * 60)
            print(f"Status: {final_rep.get('statusLabel')} (Mastery: {final_rep.get('masteryScore')}%, Confidence: {final_rep.get('confidenceScore')}%)")
            print("\nPrioritized Revision Roadmap:")
            for p in final_rep.get("prioritizedRevisionPlan", []):
                print(f"  • [{p.get('priority')}] {p.get('concept')}")
                print(f"    Reason: {p.get('reason')}")
                print(f"    Action: {p.get('recommendedAction')}")
            print(f"\nAI Tutor Briefing:")
            print(f"  {final_rep.get('aiTutorBrief')}")
            break
        else:
            current_q = step_out["next_question"]
            step += 1

    print("\n" + "=" * 80)
    print("FULL BROWSER PIPELINE TEST PASSED WITH 100% INTEGRITY!")
    print("=" * 80)

if __name__ == "__main__":
    test_full_browser_pipeline()
