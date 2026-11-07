import os
import sys
import json
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import init_db, create_session, get_user_by_email, create_user
from adaptive_controller import AdaptiveAssessmentController

init_db()
client = TestClient(app)

TEST_SUBJECTS = [
    {
        "subject_name": "Java Object-Oriented Programming",
        "subject_code": "CS-201",
        "topic_name": "Classes and Objects",
        "subtopics": ["Class Definition", "Object Instantiation", "Constructors", "Instance vs Static Fields", "Method Invocation"]
    },
    {
        "subject_name": "Python Programming",
        "subject_code": "PY-101",
        "topic_name": "Functions",
        "subtopics": ["def Keyword", "Positional and Keyword Arguments", "Default Arguments", "*args and **kwargs", "Return Values and Scope"]
    },
    {
        "subject_name": "Calculus and Analytical Geometry",
        "subject_code": "MATH-201",
        "topic_name": "Differentiation",
        "subtopics": ["Power Rule", "Product and Quotient Rules", "Chain Rule", "Trigonometric and Exponential Derivatives", "Tangents and Rates of Change"]
    },
    {
        "subject_name": "Classical Mechanics & Physics",
        "subject_code": "PHYS-101",
        "topic_name": "Laws of Motion",
        "subtopics": ["Newton's First Law and Inertia", "Newton's Second Law (F=ma)", "Newton's Third Law (Action-Reaction)", "Friction and Normal Forces", "Impulse and Momentum"]
    },
    {
        "subject_name": "General and Inorganic Chemistry",
        "subject_code": "CHEM-101",
        "topic_name": "Chemical Bonding",
        "subtopics": ["Ionic and Covalent Bonding", "Lewis Dot Structures", "Octet Rule and Exceptions", "VSEPR Theory and Molecular Shapes", "Hybridization (sp, sp2, sp3)"]
    }
]

def run_multi_subject_rigor_test():
    print("=" * 85)
    print("LEARNMIND AI - MULTI-SUBJECT RIGOR & TOPIC GROUNDING VERIFICATION")
    print("=" * 85)

    all_subject_results = []

    for subj_idx, subj_cfg in enumerate(TEST_SUBJECTS, 1):
        subj_name = subj_cfg["subject_name"]
        topic_name = subj_cfg["topic_name"]
        subtopics = subj_cfg["subtopics"]
        
        print("\n" + "#" * 80)
        print(f"SUBJECT {subj_idx}/5: {subj_name.upper()}")
        print(f"Syllabus Topic: '{topic_name}'")
        print(f"Subtopics: {', '.join(subtopics)}")
        print("#" * 80)

        # 1. Create or authenticate student
        email = f"student_{subj_cfg['subject_code'].lower()}@learnmind.ai"
        u = get_user_by_email(email)
        if not u:
            u = create_user(f"Student {subj_cfg['subject_code']}", email, "password123")
        token = create_session(u["id"])
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Upload and confirm syllabus
        topic_id = f"top_{subj_idx}_1"
        hierarchy = {
            "subjectName": subj_name,
            "courseCode": subj_cfg["subject_code"],
            "units": [
                {
                    "id": f"unit_{subj_idx}",
                    "title": f"Unit 1: Core {topic_name}",
                    "topics": [
                        {
                            "id": topic_id,
                            "name": topic_name,
                            "subtopics": subtopics
                        }
                    ]
                }
            ],
            "validation": {"confidenceScore": 1.0, "needsReview": False}
        }

        conf_res = client.post("/api/syllabus/confirm", json={
            "subject_name": subj_name,
            "subject_code": subj_cfg["subject_code"],
            "original_filename": f"{subj_cfg['subject_code']}_Syllabus.pdf",
            "hierarchy": hierarchy
        }, headers=headers)
        assert conf_res.status_code == 200, f"Confirm failed: {conf_res.text}"
        subject_id = conf_res.json()["syllabus"]["subject_id"]

        # Set coverage
        client.post(f"/api/syllabus/{subject_id}/coverage", json={
            "coverage": [{"topic_id": topic_id, "coverage_status": "currently_studying", "is_current_focus": True}]
        }, headers=headers)

        # 3. Start Adaptive Session
        start_res = client.post("/api/adaptive-assessment/start", json={
            "subject_id": subject_id,
            "topic_id": topic_id
        }, headers=headers)
        assert start_res.status_code == 200, f"Start failed: {start_res.text}"
        sess_data = start_res.json()["session"]
        session_id = sess_data["session_id"]
        current_q = sess_data["current_question"]

        trajectory = []
        # Simulate: Q1 (Correct), Q2 (Incorrect with Trap), Q3 (Correct probe), Q4 (Correct), Q5 (Correct)
        simulated_actions = ["correct", "incorrect", "correct", "correct", "correct"]

        for step in range(1, 6):
            print(f"\n--- [{subj_name}] Question {step}/5: [{current_q['difficulty'].upper()}] ---")
            print(f"Concept Tested: {current_q.get('conceptTested')}")
            print(f"Engine: {current_q.get('generation_source')} ({current_q.get('model_used')})")
            print(f"Question Text:\n{current_q['questionText']}\n")

            # Independent relevance validation
            is_rel, rel_reason = AdaptiveAssessmentController.validate_question_relevance(
                question_dict=current_q,
                subject_name=subj_name,
                topic_name=topic_name,
                subtopics=subtopics
            )
            print(f"Relevance Validation: {'✓ PASS' if is_rel else '✗ FAIL'} ({rel_reason})")
            assert is_rel, f"Question relevance failed for {subj_name} on {topic_name}: {rel_reason}"

            # Validate 4 options & 1 correct key
            assert len(current_q["options"]) == 4, f"Must have 4 options, got {len(current_q['options'])}"
            assert sum(1 for o in current_q["options"] if o["isCorrect"]) == 1, "Must have exactly 1 correct option"
            assert len(set(o["text"].strip().lower() for o in current_q["options"])) == 4, "Options must be distinct"

            for opt in current_q["options"]:
                mark = "✓" if opt["isCorrect"] else "✗"
                trap_str = f" [Trap: {opt.get('misconceptionName')}]" if not opt["isCorrect"] else ""
                print(f"  [{opt['letter']}] {opt['text'][:75]} ({mark}){trap_str}")

            action = simulated_actions[step - 1]
            if action == "correct":
                chosen_opt = next(o for o in current_q["options"] if o["isCorrect"])
            else:
                chosen_opt = next(o for o in current_q["options"] if not o["isCorrect"])

            print(f"Student Selects: [{chosen_opt['letter']}] (Intent: {action.upper()})")

            # Submit answer
            sub_res = client.post("/api/adaptive-assessment/submit", json={
                "session_id": session_id,
                "selected_option_id": chosen_opt["id"],
                "active_question": current_q
            }, headers=headers)
            assert sub_res.status_code == 200, f"Submit failed: {sub_res.text}"
            res_data = sub_res.json()["data"]

            eval_ans = res_data["evaluated_answer"]
            ped = res_data["pedagogical_decision"]
            bayes = res_data["bayesian_telemetry"]
            is_concluded = res_data.get("is_concluded", False)

            print(f"Evaluation: {'CORRECT' if eval_ans['is_correct'] else 'INCORRECT'}")
            if eval_ans.get("diagnosed_misconception"):
                print(f"Diagnosed Trap: '{eval_ans['diagnosed_misconception']}'")
            print(f"AI Decision: {ped['reasoning']}")
            print(f"Bayesian Posterior: Beta(α={bayes['alpha']}, β={bayes['beta']}) | Mean: {bayes['posterior_mean']*100:.2f}% | Var: {bayes['variance']:.5f} | Certainty: {bayes['certainty']}%")

            trajectory.append({
                "step": step,
                "question": current_q,
                "action": action,
                "eval": eval_ans,
                "decision": ped,
                "bayes": bayes,
                "is_concluded": is_concluded
            })

            if is_concluded:
                print(f"\n*** STOPPING RULE TRIGGERED AT QUESTION {step} FOR {subj_name.upper()} ***")
                final_rep = res_data.get("final_report")
                assert final_rep is not None
                print(f"Final Status: {final_rep.get('statusLabel')} (Mastery: {final_rep.get('masteryScore')}%, Confidence: {final_rep.get('confidenceScore')}%)")
                print("Prioritized Revision Plan:")
                for item in final_rep.get("prioritizedRevisionPlan", []):
                    print(f"  • [{item.get('priority')}] {item.get('concept')}: {item.get('recommendedAction')}")
                break
            else:
                current_q = res_data.get("next_question")

        all_subject_results.append({
            "subject": subj_name,
            "topic": topic_name,
            "trajectory_length": len(trajectory),
            "final_certainty": trajectory[-1]["bayes"]["certainty"],
            "final_mean": trajectory[-1]["bayes"]["posterior_mean"]
        })

    print("\n" + "=" * 85)
    print("MULTI-SUBJECT RIGOR TEST COMPLETED: ALL 5 SUBJECTS PASSED CLEANLY!")
    print("=" * 85)
    for res in all_subject_results:
        print(f"• {res['subject']}: Topic '{res['topic']}' -> {res['trajectory_length']} Questions -> Posterior Mean: {res['final_mean']*100:.2f}%, Certainty: {res['final_certainty']}%")

if __name__ == "__main__":
    run_multi_subject_rigor_test()

