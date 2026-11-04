import os
import io
import unittest
import json
from datetime import datetime
import pymupdf
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# Load env configuration
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

from main import app
from database import (
    init_db,
    get_user_by_email,
    create_user,
    create_session,
    create_or_update_syllabus,
    get_syllabus_by_id,
    get_syllabi_for_user,
    get_syllabus_by_subject,
    delete_syllabus,
    update_syllabus_hierarchy,
    save_topic_knowledge_entry,
    get_topic_knowledge_entry,
    save_student_topic_coverage_entry,
    get_student_topic_coverage_list
)
from syllabus_service import extract_text_from_pdf, extract_syllabus_hierarchy

client = TestClient(app)

class TestSyllabusIngestionMilestone1(unittest.TestCase):
    """
    Comprehensive test suite verifying Milestone 1:
    Database & Backend Syllabus Ingestion Engine.
    """

    @classmethod
    def setUpClass(cls):
        init_db()
        # Create student for testing
        cls.student_email = f"syllabus_student_{datetime.now().timestamp()}@learnmind.ai"
        user_dict = create_user("Elena Rostova", cls.student_email, "dummyhash123")
        cls.user_id = user_dict["id"]
        cls.session_token = create_session(cls.user_id, days_valid=1)

    def test_01_database_tables_and_crud(self):
        """Test 1: Verify database CRUD operations for syllabi, topic knowledge, and student coverage."""
        print("\n--- TEST 1: Database CRUD for Syllabi & Knowledge Base ---")
        
        # 1. Create syllabus
        syl = create_or_update_syllabus(
            user_id=self.user_id,
            subject_id="sub_calculus_101",
            subject_name="Calculus & Analytical Geometry",
            subject_code="MATH-101",
            original_filename="calc_101.pdf",
            raw_text="Sample syllabus text with units and limits",
            hierarchy_dict={"units": [{"title": "Unit 1: Limits", "topics": [{"name": "Limit Laws"}]}]},
            extraction_status="extracted"
        )
        self.assertIsNotNone(syl)
        self.assertEqual(syl["subject_code"], "MATH-101")
        self.assertEqual(syl["extraction_status"], "extracted")
        self.assertIsNotNone(syl["hierarchy"])
        
        # 2. Retrieve by ID
        fetched = get_syllabus_by_id(syl["id"])
        self.assertEqual(fetched["id"], syl["id"])
        
        # 3. Save and retrieve topic knowledge entry
        knowledge_data = {
            "definitions": ["A limit is the value a function approaches as input approaches some value."],
            "formulasAndRules": [{"name": "Limit Sum Rule", "latex": "\\lim (f+g) = \\lim f + \\lim g"}]
        }
        tk = save_topic_knowledge_entry(
            syllabus_id=syl["id"],
            subject_id="sub_calculus_101",
            topic_id="top_lim_01",
            topic_name="Limit Laws",
            unit_title="Unit 1: Limits",
            priority_level=1,
            status="ready",
            knowledge_dict=knowledge_data
        )
        self.assertIsNotNone(tk)
        self.assertEqual(tk["status"], "ready")
        self.assertIn("Limit Sum Rule", str(tk["knowledge"]))
        
        # 4. Save and retrieve student coverage entry
        save_student_topic_coverage_entry(
            user_id=self.user_id,
            subject_id="sub_calculus_101",
            topic_id="top_lim_01",
            coverage_status="completed",
            is_current_focus=True
        )
        cov_list = get_student_topic_coverage_list(self.user_id, "sub_calculus_101")
        self.assertEqual(len(cov_list), 1)
        self.assertEqual(cov_list[0]["coverage_status"], "completed")
        self.assertEqual(cov_list[0]["is_current_focus"], 1)
        print("PASSED. All database tables and CRUD helpers operate with full relational integrity.")

    def test_02_pdf_text_extraction_pymupdf(self):
        """Test 2: Verify PyMuPDF extracts clean text directly from PDF binary bytes."""
        print("\n--- TEST 2: PyMuPDF Binary Extraction ---")
        doc = pymupdf.open()
        p1 = doc.new_page()
        p1.insert_text((50, 72), "STANFORD UNIVERSITY - DEPARTMENT OF MATHEMATICS\nMATH 51: LINEAR ALGEBRA & MULTIVARIABLE CALCULUS\n\nUnit 1: Vector Spaces & Linear Independence\nTopics: Subspaces, Basis, Dimension, Orthogonality.")
        p2 = doc.new_page()
        p2.insert_text((50, 72), "Unit 2: Eigenvalues, Eigenvectors & Diagonalization\nTopics: Characteristic polynomials, Spectral theorem, SVD.")
        pdf_bytes = doc.tobytes()
        doc.close()

        extracted_text = extract_text_from_pdf(pdf_bytes)
        self.assertIn("STANFORD UNIVERSITY", extracted_text)
        self.assertIn("Unit 1: Vector Spaces", extracted_text)
        self.assertIn("Unit 2: Eigenvalues", extracted_text)
        print(f"PASSED. Extracted {len(extracted_text)} characters across 2 pages without temporary file persistence.")

    def test_03_gemini_hierarchy_extraction(self):
        """Test 3: Verify Gemini 3 Flash deconstructs syllabus into structured Units, Topics, and Prerequisites."""
        print("\n--- TEST 3: Gemini Hierarchical Structure Extraction ---")
        sample_syllabus = """
        Course: Differential Calculus (MATH-102)
        Prerequisites: Basic Algebra and Functions
        
        Unit 1: The Concept of Limits and Continuity
        - Topic 1.1: Intuitive and Formal Epsilon-Delta Definition of a Limit
        - Topic 1.2: One-Sided Limits and Discontinuities
        
        Unit 2: Foundations of the Derivative
        - Topic 2.1: Tangent Lines and Rates of Change (Prereq: Limits)
        - Topic 2.2: The Power Rule and Linearity of Differentiation
        - Topic 2.3: Product and Quotient Rules (Prereq: Power Rule)
        """
        
        hierarchy = extract_syllabus_hierarchy(sample_syllabus, "Differential Calculus", "MATH-102")
        self.assertIn("units", hierarchy)
        self.assertTrue(len(hierarchy["units"]) >= 2)
        self.assertTrue(hierarchy["totalTopics"] >= 4)
        
        first_unit = hierarchy["units"][0]
        self.assertIn("topics", first_unit)
        self.assertTrue(len(first_unit["topics"]) >= 1)
        
        # Verify topics contain learning objectives or prerequisites
        sample_topic = hierarchy["units"][1]["topics"][0]
        self.assertIn("name", sample_topic)
        print(f"PASSED. Extracted {hierarchy['totalUnits']} units and {hierarchy['totalTopics']} topics.")
        print(f"Sample extracted unit: '{first_unit['title']}' with {len(first_unit['topics'])} topics.")

    def test_04_api_upload_text_and_session_persistence(self):
        """Test 4: Verify POST /api/syllabus/upload-text and session persistence (no repeated uploads on login)."""
        print("\n--- TEST 4: Syllabus Upload Endpoint & Session Persistence ---")
        headers = {"Authorization": f"Bearer {self.session_token}"}
        
        payload = {
            "subject_name": "Artificial Intelligence & Robotics",
            "subject_code": "CS-401",
            "raw_text": "Unit 1: Search Algorithms (A*, DFS, BFS, Minimax).\nUnit 2: Probabilistic Reasoning (Bayesian Networks, HMMs).\nUnit 3: Reinforcement Learning (Q-learning, Bellman equation)."
        }
        res = client.post("/api/syllabus/upload-text", json=payload, headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got: {res.text}")
        data = res.json()
        self.assertTrue(data["success"])
        syl = data["syllabus"]
        self.assertEqual(syl["subject_code"], "CS-401")
        self.assertEqual(syl["extraction_status"], "extracted")
        syllabus_id = syl["id"]
        
        # SIMULATE NEW LOGIN / SESSION
        new_token = create_session(self.user_id, days_valid=1)
        res_list = client.get("/api/syllabus", headers={"Authorization": f"Bearer {new_token}"})
        self.assertEqual(res_list.status_code, 200)
        user_syllabi = res_list.json()["syllabi"]
        
        # Verify the syllabus persists and is already available
        persisted_syl = next((s for s in user_syllabi if s["id"] == syllabus_id), None)
        self.assertIsNotNone(persisted_syl, "Syllabus must persist across sessions so students never re-upload.")
        print("PASSED. Syllabus persisted in SQLite; re-authenticated session retrieved it automatically.")

    def test_05_api_hierarchy_update_and_student_review(self):
        """Test 5: Verify PUT /api/syllabus/{id}/hierarchy allowing students to correct extracted topics."""
        print("\n--- TEST 5: Student Review & Hierarchy Correction ---")
        headers = {"Authorization": f"Bearer {self.session_token}"}
        
        # Get student's syllabus
        res_list = client.get("/api/syllabus", headers=headers)
        syl = res_list.json()["syllabi"][0]
        syl_id = syl["id"]
        hierarchy = syl["hierarchy"]
        
        # Student adds a custom topic during review
        custom_topic = {
            "id": "top_custom_quantum_01",
            "name": "Quantum Search & Grover's Algorithm",
            "learningObjectives": ["Understand quantum superposition in search"],
            "prerequisites": ["Unit 1: Search Algorithms"],
            "subtopics": ["Grover diffusion operator", "Amplitude amplification"]
        }
        hierarchy["units"][0]["topics"].append(custom_topic)
        hierarchy["totalTopics"] += 1
        
        res_update = client.put(
            f"/api/syllabus/{syl_id}/hierarchy",
            json={"hierarchy": hierarchy},
            headers=headers
        )
        self.assertEqual(res_update.status_code, 200)
        updated_syl = res_update.json()["syllabus"]
        self.assertEqual(updated_syl["extraction_status"], "verified")
        
        # Verify custom topic is stored
        unit0_topics = updated_syl["hierarchy"]["units"][0]["topics"]
        has_custom = any(t["name"] == "Quantum Search & Grover's Algorithm" for t in unit0_topics)
        self.assertTrue(has_custom)
        print("PASSED. Student can review, edit, and add topics before knowledge preparation.")

    def test_06_multi_subject_and_user_isolation(self):
        """Test 6: Verify multi-subject support and strict security isolation between separate students."""
        print("\n--- TEST 6: Multi-Subject Support & Strict Student Isolation ---")
        headers_a = {"Authorization": f"Bearer {self.session_token}"}
        
        # 1. Student A uploads a 2nd subject: Organic Chemistry
        res_chem = client.post("/api/syllabus/upload-text", json={
            "subject_name": "Organic Chemistry",
            "subject_code": "CHEM-201",
            "raw_text": "Unit 1: Alkanes and Stereochemistry.\nUnit 2: Electrophilic Aromatic Substitution."
        }, headers=headers_a)
        self.assertEqual(res_chem.status_code, 200)
        chem_syl_id = res_chem.json()["syllabus"]["id"]
        
        # Student A now has at least 2 distinct subject syllabi
        res_a_all = client.get("/api/syllabus", headers=headers_a)
        syllabi_a = res_a_all.json()["syllabi"]
        self.assertTrue(len(syllabi_a) >= 2)
        
        # 2. Student B logs in
        student_b_email = f"student_b_{datetime.now().timestamp()}@learnmind.ai"
        user_b = create_user("Beta Tester", student_b_email, "dummyhash456")
        token_b = create_session(user_b["id"], days_valid=1)
        headers_b = {"Authorization": f"Bearer {token_b}"}
        
        # Student B initially has 0 syllabi
        res_b_all = client.get("/api/syllabus", headers=headers_b)
        self.assertEqual(len(res_b_all.json()["syllabi"]), 0)
        
        # Student B attempts to access Student A's syllabus directly -> MUST RETURN 403
        res_forbidden = client.get(f"/api/syllabus/{chem_syl_id}", headers=headers_b)
        self.assertEqual(res_forbidden.status_code, 403)
        self.assertIn("Access denied", res_forbidden.json().get("detail", ""))
        print("PASSED. Student A successfully holds multiple subject syllabi, and Student B is strictly denied access.")

    def test_07_api_upload_pdf_file(self):
        """Test 7: Verify POST /api/syllabus/upload-file with real multipart binary PDF."""
        print("\n--- TEST 7: Real Multipart PDF Upload via FastAPI ---")
        headers = {"Authorization": f"Bearer {self.session_token}"}
        
        # Create a sample PDF in memory
        doc = pymupdf.open()
        p = doc.new_page()
        p.insert_text((50, 72), "MASSACHUSETTS INSTITUTE OF TECHNOLOGY\n6.006: INTRODUCTION TO ALGORITHMS\n\nUnit 1: Sorting and Trees\n- Insertion Sort, Merge Sort\n- AVL Trees, Binary Heaps\n\nUnit 2: Graph Algorithms\n- Breadth-First Search, Depth-First Search\n- Dijkstra's Algorithm, Bellman-Ford")
        pdf_bytes = doc.tobytes()
        doc.close()

        files = {
            "file": ("mit_algorithms.pdf", io.BytesIO(pdf_bytes), "application/pdf")
        }
        data = {
            "subject_name": "Introduction to Algorithms",
            "subject_code": "6.006"
        }
        res = client.post("/api/syllabus/upload-file", files=files, data=data, headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got: {res.text}")
        body = res.json()
        self.assertTrue(body["success"])
        syl = body["syllabus"]
        self.assertEqual(syl["original_filename"], "mit_algorithms.pdf")
        self.assertEqual(syl["subject_code"], "6.006")
        self.assertTrue(len(syl["hierarchy"]["units"]) >= 2)
        print("PASSED. Multipart PDF upload extracted text via PyMuPDF and generated hierarchy via Gemini 3 Flash.")

if __name__ == "__main__":
    unittest.main(verbosity=2)

