import os
import sys
import json
import hashlib
import unittest
import uuid
import pymupdf
from unittest.mock import patch

# Set path to backend
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BACKEND_DIR)

from database import (
    init_db,
    create_user,
    get_user_by_email,
    create_or_update_syllabus,
    get_syllabus_by_file_hash,
    get_syllabus_by_id,
    create_session,
    save_student_topic_coverage_entry,
    get_student_topic_coverage_list,
    get_student_partition
)
from syllabus_service import (
    extract_text_and_pages_from_pdf,
    extract_syllabus_hierarchy,
    heuristic_syllabus_parser,
    validate_extracted_hierarchy,
    generate_coverage_diagnostic_questions,
    SyllabusDeconstructionSchema
)
from fastapi.testclient import TestClient
from main import app

def create_sample_pdf_bytes(title: str, units_text: list) -> bytes:
    """Creates a genuine multi-page PDF in memory using PyMuPDF."""
    doc = pymupdf.open()
    for page_idx, u_text in enumerate(units_text):
        page = doc.new_page(width=595, height=842) # A4
        text_content = f"{title}\nPage {page_idx + 1}\n\n{u_text}"
        page.insert_text((50, 72), text_content, fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

class TestMilestone1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.test_email = f"tester_{uuid.uuid4().hex[:10]}@learnmind.ai"
        user = create_user("Test Student", cls.test_email, "hashed_pw")
        cls.user_id = user["id"]
        cls.session_token = create_session(cls.user_id, days_valid=1)
        cls.client = TestClient(app)

    def test_01_pymupdf_page_extraction_and_density(self):
        """1. Verify PyMuPDF extracts text page-by-page, tags pages, and computes density."""
        pdf_bytes = create_sample_pdf_bytes(
            "Course Title: Advanced Operating Systems (CS-401)",
            [
                "UNIT I: Kernel Architecture & Process Scheduling\nProcesses, Threads, Context Switching, CFS Scheduler, Real-time Scheduling.",
                "UNIT II: Memory Virtualization & Paging\nVirtual Memory, TLB, Page Tables, Multi-level Paging, Swapping, Inverted Page Tables.",
                "UNIT III: Concurrency & Storage Subsystems\nSemaphores, Mutexes, Deadlocks, File Systems, Inodes, Journaling, RAID Systems."
            ]
        )
        res = extract_text_and_pages_from_pdf(pdf_bytes)
        self.assertEqual(res["total_pages"], 3)
        self.assertFalse(res["is_scanned_document"])
        self.assertIn("--- PAGE 1 ---", res["full_text"])
        self.assertIn("--- PAGE 2 ---", res["full_text"])
        self.assertIn("--- PAGE 3 ---", res["full_text"])
        self.assertIn("Kernel Architecture", res["full_text"])

    def test_02_idempotent_sha256_caching(self):
        """2. Verify SHA-256 cache avoids redundant reprocessing for identical files."""
        sample_text = "UNIT I: Python Basics\nVariables, Data Types, Lists, Dicts."
        fake_pdf_bytes = create_sample_pdf_bytes("Python Programming", [sample_text])
        file_hash = hashlib.sha256(fake_pdf_bytes).hexdigest()

        # Initially no cached syllabus exists for this hash
        cached_before = get_syllabus_by_file_hash(self.user_id, file_hash)
        self.assertIsNone(cached_before)

        # Save syllabus with file_hash
        syl = create_or_update_syllabus(
            user_id=self.user_id,
            subject_id="sub_python_prog",
            subject_name="Python Programming",
            subject_code="PY-101",
            original_filename="Python_Syllabus.pdf",
            raw_text=sample_text,
            hierarchy_dict={"units": [{"title": "Unit 1", "topics": [{"name": "Variables"}]}]},
            file_hash=file_hash,
            confidence_score=0.95
        )
        self.assertIsNotNone(syl)

        # Lookup by hash should succeed instantly
        cached_after = get_syllabus_by_file_hash(self.user_id, file_hash)
        self.assertIsNotNone(cached_after)
        self.assertEqual(cached_after["file_hash"], file_hash)
        self.assertEqual(cached_after["subject_name"], "Python Programming")

    def test_03_subject_agnostic_detection(self):
        """3. Verify extraction auto-detects subject dynamically and NEVER defaults to Mathematics."""
        test_cases = [
            ("25CS303 OOP Syllabus.docx.pdf", "UNIT I: Introduction to Java, JVM, Classes, Inheritance.", "Object-Oriented Programming (Java)", "25CS303"),
            ("PY202_Python_Data_Science.pdf", "UNIT I: Python NumPy Arrays, Pandas DataFrames, Matplotlib.", "Python Programming", "PY202"),
            ("CS105_C_Programming.pdf", "UNIT I: ANSI C Syntax, Pointers, Memory Allocation with malloc.", "C Programming", "CS105"),
            ("PHY101_Engineering_Physics.pdf", "UNIT I: Quantum Mechanics, Wave Particle Duality, Laser Optics.", "Engineering Physics", "PHY101")
        ]

        for filename, content, expected_subj, expected_code in test_cases:
            pdf_bytes = create_sample_pdf_bytes(f"Institutional Syllabus: {filename}", [content])
            # Direct heuristic or service evaluation
            hierarchy = heuristic_syllabus_parser(raw_text=content, filename=filename)
            self.assertEqual(hierarchy["subjectName"], expected_subj)
            self.assertEqual(hierarchy["subjectCode"], expected_code)
            self.assertNotEqual(hierarchy["subjectName"], "Engineering Mathematics")
            self.assertGreater(len(hierarchy["units"]), 0)

    def test_04_anti_hallucination_and_grounding_validation(self):
        """4. Verify validation engine detects hallucinated topics and computes confidence."""
        raw_text = "UNIT I: Java Classes and Objects. Methods, Constructors, Garbage Collection."
        
        # Valid grounded hierarchy
        valid_hierarchy = {
            "subjectName": "Java Programming",
            "units": [
                {
                    "title": "Unit 1: Java Classes and Objects",
                    "topics": [
                        {"name": "Java Classes and Objects"},
                        {"name": "Constructors and Methods"}
                    ]
                }
            ]
        }
        res_valid = validate_extracted_hierarchy(valid_hierarchy, raw_text)
        self.assertTrue(res_valid["isValid"])
        self.assertGreaterEqual(res_valid["confidenceScore"], 0.85)

        # Hallucinated hierarchy containing invented topics not in the text
        hallucinated_hierarchy = {
            "subjectName": "Java Programming",
            "units": [
                {
                    "title": "Unit 1: Quantum Astrophysics & Dark Matter",
                    "topics": [
                        {"name": "Black Hole Singularities"},
                        {"name": "General Relativity Tensor Field"}
                    ]
                }
            ]
        }
        res_invalid = validate_extracted_hierarchy(hallucinated_hierarchy, raw_text)
        self.assertTrue(res_invalid["needsReview"])
        self.assertGreater(len(res_invalid["warnings"]), 0)

    def test_05_page_references_preserved(self):
        """5. Verify page numbers are preserved across extracted units and topics."""
        pdf_bytes = create_sample_pdf_bytes(
            "DBMS Syllabus",
            [
                "UNIT I: Relational Model\nEntity Relationship Diagrams, Relational Algebra.",
                "UNIT II: SQL & Normalization\nDDL, DML, 1NF, 2NF, 3NF, BCNF Normalization.",
                "UNIT III: Transaction Management\nACID Properties, Concurrency Control, Two Phase Locking."
            ]
        )
        pdf_data = extract_text_and_pages_from_pdf(pdf_bytes)
        hierarchy = heuristic_syllabus_parser(
            raw_text=pdf_data["full_text"],
            filename="CS304_DBMS.pdf",
            pages_info=pdf_data["pages"]
        )
        for unit in hierarchy["units"]:
            self.assertIn("page_number", unit)
            self.assertGreaterEqual(unit["page_number"], 1)
            for topic in unit["topics"]:
                self.assertIn("page_number", topic)
                self.assertGreaterEqual(topic["page_number"], 1)

    def test_06_zero_penalty_baseline_diagnostics(self):
        """6. Verify unstudied topics are NEVER scored as zero failure."""
        hierarchy = {
            "subjectName": "C++ Programming",
            "subjectCode": "CS-202",
            "units": [
                {"title": "Unit 1", "topics": [{"id": "top_1", "name": "Pointers & References"}]}
            ]
        }
        # Student has not completed any topic
        coverage = []
        diag_res = generate_coverage_diagnostic_questions(
            subject_name=hierarchy["subjectName"],
            subject_code=hierarchy["subjectCode"],
            hierarchy=hierarchy,
            coverage_list=coverage
        )
        self.assertTrue(diag_res["isBaseline"])
        self.assertIn("NOT scored as a zero failure", diag_res["statusMessage"])
        self.assertGreater(len(diag_res["questions"]), 0)

    def test_07_two_stage_preview_and_confirm_api(self):
        """7. Verify extract-preview does not auto-save, and confirm endpoint saves and syncs partition."""
        pdf_bytes = create_sample_pdf_bytes(
            "Course: Computer Networks (25CS305)",
            [
                "UNIT I: Network Architecture & OSI Model\nPhysical Layer, Data Link Layer, MAC, Framing.",
                "UNIT II: Routing & Transport Protocols\nIP Addressing, Subnetting, TCP 3-Way Handshake, UDP, Congestion Control."
            ]
        )

        headers = {"Authorization": f"Bearer {self.session_token}"}
        files = {"file": ("25CS305_Networks.pdf", pdf_bytes, "application/pdf")}

        # Stage 1: Extract Preview
        res_preview = self.client.post("/api/syllabus/extract-preview", headers=headers, files=files)
        self.assertEqual(res_preview.status_code, 200)
        data_preview = res_preview.json()
        self.assertTrue(data_preview["success"])
        self.assertIn("file_hash", data_preview)
        self.assertIn("hierarchy", data_preview)
        file_hash = data_preview["file_hash"]

        # Verify not yet confirmed in database
        saved_before = get_syllabus_by_file_hash(self.user_id, file_hash)
        self.assertIsNone(saved_before)

        # Stage 2: Student Reviews & Confirms
        confirm_payload = {
            "file_hash": file_hash,
            "subject_name": data_preview["subject_name"],
            "subject_code": data_preview["subject_code"],
            "original_filename": "25CS305_Networks.pdf",
            "raw_text": "Extracted text content",
            "hierarchy": data_preview["hierarchy"]
        }
        res_confirm = self.client.post("/api/syllabus/confirm", headers=headers, json=confirm_payload)
        self.assertEqual(res_confirm.status_code, 200)
        data_confirm = res_confirm.json()
        self.assertTrue(data_confirm["success"])
        self.assertEqual(data_confirm["syllabus"]["extraction_status"], "confirmed")

        # Verify now cached in database
        saved_after = get_syllabus_by_file_hash(self.user_id, file_hash)
        self.assertIsNotNone(saved_after)
        self.assertEqual(saved_after["subject_name"], data_preview["subject_name"])

        # Stage 3: Second upload with same PDF should return cached: True instantly
        files_repeat = {"file": ("25CS305_Networks.pdf", pdf_bytes, "application/pdf")}
        res_cached = self.client.post("/api/syllabus/extract-preview", headers=headers, files=files_repeat)
        self.assertEqual(res_cached.status_code, 200)
        data_cached = res_cached.json()
        self.assertTrue(data_cached["cached"])
        self.assertEqual(data_cached["file_hash"], file_hash)

if __name__ == "__main__":
    unittest.main()
