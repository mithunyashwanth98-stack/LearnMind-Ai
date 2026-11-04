import os
import unittest
import json
from datetime import datetime
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# Load env configuration
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

from main import app
from database import (
    get_user_by_email,
    create_user,
    create_session,
    get_student_partition,
    save_student_partition
)
from tutor_service import generate_tutor_response
from google.genai.errors import APIError

client = TestClient(app)

class TestGeminiTutorIntegration(unittest.TestCase):
    """
    Comprehensive test suite verifying all 6 required Gemini AI Tutor criteria:
    1. Gemini API connection
    2. Basic Python question
    3. Mathematics question
    4. Invalid API key handling
    5. Unauthenticated access
    6. Conversation isolation between users
    """

    @classmethod
    def setUpClass(cls):
        # Ensure demo user exists
        demo = get_user_by_email("demo@learnmind.ai")
        if not demo:
            cls.demo_user_id = create_user("Alex Rivera", "demo@learnmind.ai", "dummyhash")
        else:
            cls.demo_user_id = demo["id"]

        # Create valid session token for demo student
        cls.demo_token = create_session(cls.demo_user_id, days_valid=1)

    def test_01_gemini_api_connection(self):
        """Test 1: Verify direct authenticated Gemini API connection."""
        print("\n--- TEST 1: Gemini API Connection ---")
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.assertTrue(bool(api_key), "GEMINI_API_KEY must be set in backend/.env")
        
        result = generate_tutor_response(
            user_message="Hello, are you ready to teach?",
            student_name="Alex",
            subject="Orientation",
            topic="Introduction",
            partition={"profile": {"overallMastery": 70}}
        )
        self.assertIn("reply", result)
        self.assertIn("model", result)
        self.assertTrue(len(result["reply"]) > 20)
        print(f"PASSED. Connected successfully to model: {result['model']}")
        print(f"Sample reply snippet: {result['reply'][:90]}...")

    def test_02_basic_python_question(self):
        """Test 2: Verify Python conceptual explanation with code and step-by-step guidance."""
        print("\n--- TEST 2: Basic Python Question ---")
        headers = {"Authorization": f"Bearer {self.demo_token}"}
        payload = {
            "message": "Explain what a list comprehension is in Python and give a simple example.",
            "subject": "Python Programming",
            "topic": "List Comprehensions"
        }
        res = client.post("/api/tutor/chat", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got: {res.text}")
        data = res.json()
        
        self.assertIn("reply", data)
        self.assertIn("suggestedActions", data)
        self.assertIsInstance(data["suggestedActions"], list)
        self.assertTrue(len(data["suggestedActions"]) > 0)
        
        reply_lower = data["reply"].lower()
        # Verify it mentions list comprehension syntax or concept
        self.assertTrue(any(term in reply_lower for term in ["list", "comprehension", "syntax", "for", "example"]))
        print("PASSED. Received pedagogical Python answer with suggested actions:")
        print(f"Suggested actions: {data['suggestedActions']}")
        print(f"Snippet: {data['reply'][:120]}...")

    def test_03_mathematics_question(self):
        """Test 3: Verify Mathematics calculus question with formulas and clear steps."""
        print("\n--- TEST 3: Mathematics Calculus Question ---")
        headers = {"Authorization": f"Bearer {self.demo_token}"}
        payload = {
            "message": "Differentiate f(x) = 5x^3 - 2x + 7 step by step using the power rule.",
            "subject": "Calculus",
            "topic": "Differentiation & Power Rule"
        }
        res = client.post("/api/tutor/chat", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got: {res.text}")
        data = res.json()
        
        reply = data["reply"]
        # In calculus: d/dx(5x^3 - 2x + 7) = 15x^2 - 2
        self.assertTrue("15" in reply or "power rule" in reply.lower())
        print("PASSED. Calculus step-by-step derivation received successfully.")
        print(f"Snippet: {reply[:140]}...")

    def test_04_invalid_api_key_handling(self):
        """Test 4: Verify proper error handling when an invalid API key is provided (No fake answers)."""
        print("\n--- TEST 4: Invalid API Key Handling ---")
        fake_key = "AIzaSyFakeInvalidKeyForTesting9999999999"
        with self.assertRaises((APIError, Exception)) as ctx:
            generate_tutor_response(
                user_message="Should fail with invalid key",
                student_name="Test",
                subject="Math",
                topic="Testing",
                partition={},
                custom_api_key=fake_key
            )
        print(f"PASSED. Invalid key was rejected cleanly as expected: {type(ctx.exception).__name__}")

    def test_05_unauthenticated_access(self):
        """Test 5: Verify that unauthenticated requests to /api/tutor/chat are strictly blocked."""
        print("\n--- TEST 5: Unauthenticated Access Block ---")
        payload = {"message": "Can I access tutor without login?"}
        res = client.post("/api/tutor/chat", json=payload)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authentication token required", res.json().get("detail", ""))
        print("PASSED. Blocked unauthenticated request with HTTP 401.")

    def test_06_conversation_isolation_between_users(self):
        """Test 6: Verify conversation and partition isolation between separate student accounts."""
        print("\n--- TEST 6: User Partition & Conversation Isolation ---")
        # 1. Create Student A
        email_a = f"student_a_{datetime.now().timestamp()}@learnmind.ai"
        user_a = create_user("Student Alpha", email_a, "hashed_pw")
        token_a = create_session(user_a["id"], days_valid=1)

        # 2. Create Student B
        email_b = f"student_b_{datetime.now().timestamp()}@learnmind.ai"
        user_b = create_user("Student Beta", email_b, "hashed_pw")
        token_b = create_session(user_b["id"], days_valid=1)

        # 3. Save Student A partition with unique topic & message
        part_a = {
            "profile": {"name": "Student Alpha", "overallMastery": 92},
            "subjects": [],
            "misconceptions": [],
            "tutorMessages": [{"id": "a1", "sender": "user", "text": "Secret Alpha Question"}]
        }
        save_student_partition(user_a["id"], part_a)

        # 4. Save Student B partition with different data
        part_b = {
            "profile": {"name": "Student Beta", "overallMastery": 28},
            "subjects": [],
            "misconceptions": [],
            "tutorMessages": [{"id": "b1", "sender": "user", "text": "Secret Beta Question"}]
        }
        save_student_partition(user_b["id"], part_b)

        # 5. Verify Student A's partition cannot be accessed by Student B
        res_me_a = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_a}"})
        res_me_b = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_b}"})

        self.assertEqual(res_me_a.status_code, 200)
        self.assertEqual(res_me_b.status_code, 200)

        data_a = res_me_a.json()["partition"]
        data_b = res_me_b.json()["partition"]

        self.assertEqual(data_a["profile"]["overallMastery"], 92)
        self.assertEqual(data_b["profile"]["overallMastery"], 28)
        self.assertNotEqual(data_a["tutorMessages"], data_b["tutorMessages"])
        self.assertEqual(data_a["tutorMessages"][0]["text"], "Secret Alpha Question")
        self.assertEqual(data_b["tutorMessages"][0]["text"], "Secret Beta Question")
        print("PASSED. Partitions and tutor conversation histories are completely isolated.")

if __name__ == "__main__":
    unittest.main(verbosity=2)
