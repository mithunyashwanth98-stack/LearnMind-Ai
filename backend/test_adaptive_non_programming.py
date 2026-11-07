import os
import sys
import json
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app
from database import init_db, create_user, get_user_by_email, create_session

init_db()
client = TestClient(app)

def test_adaptive_os_syllabus():
    print("=" * 60)
    print("TESTING ADAPTIVE ENGINE ON NON-PROGRAMMING SUBJECT (OPERATING SYSTEMS)")
    print("=" * 60)

    email = "os_student@learnmind.ai"
    u = get_user_by_email(email)
    if not u:
        u = create_user("OS Student", email, "password123")
    token = create_session(u["id"])
    headers = {"Authorization": f"Bearer {token}"}

    # Confirm OS Syllabus
    os_syllabus = {
        "subject_name": "Operating Systems",
        "subject_code": "CS401",
        "original_filename": "OS_Syllabus.pdf",
        "hierarchy": {
            "units": [
                {
                    "id": "unit_1",
                    "title": "Unit 1: Process Synchronization & Deadlocks",
                    "topics": [
                        {
                            "id": "top_os_1",
                            "name": "Semaphores and Mutex Locks",
                            "subtopics": ["Binary vs Counting Semaphores", "Wait and Signal Operations", "Race Conditions"]
                        }
                    ]
                }
            ],
            "validation": {"confidenceScore": 1.0, "needsReview": False}
        }
    }
    client.post("/api/syllabus/confirm", json=os_syllabus, headers=headers)
    subject_id = "sub_operating_systems"

    # Start session
    start_res = client.post(
        "/api/adaptive-assessment/start",
        json={"subject_id": subject_id, "topic_id": "top_os_1"},
        headers=headers
    )
    assert start_res.status_code == 200
    session_data = start_res.json()["session"]
    q1 = session_data["current_question"]

    print(f"Subject: {session_data['subject_name']}")
    print(f"Topic: {session_data['current_topic']['name']}")
    print(f"Q1 Difficulty: {q1['difficulty'].upper()}")
    print(f"Q1 Question: {q1['questionText']}")
    for opt in q1["options"]:
        mark = "✓ CORRECT" if opt["isCorrect"] else "✗ DISTRACTOR"
        print(f"   [{opt['letter']}] {opt['text'][:70]} ({mark})")

    assert "semaphor" in q1["questionText"].lower() or "mutex" in q1["questionText"].lower() or "synchroniz" in q1["questionText"].lower()
    print("\n✓ Non-programming syllabus verified: Question is strictly grounded in Operating Systems concepts!")

if __name__ == "__main__":
    test_adaptive_os_syllabus()

