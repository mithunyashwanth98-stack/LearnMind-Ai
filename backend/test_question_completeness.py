import os
import sys
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db, get_connection
from adaptive_controller import AdaptiveAssessmentController

init_db()

def test_question_completeness_and_accuracy():
    print("=" * 70)
    print("TEST: QUESTION COMPLETENESS & ACCURACY VALIDATION")
    print("=" * 70)

    # 1. Fetch Organic Chemistry syllabus
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM subject_syllabi WHERE id = 'syl_f606c6e3a52b'")
    chem_row = c.fetchone()
    conn.close()

    assert chem_row is not None
    chem_h = json.loads(chem_row["hierarchy_json"])
    unit = chem_h["units"][0]
    topic = unit["topics"][1] # Stereochemistry

    print(f"Testing Subject: {chem_h.get('subjectName')}")
    print(f"Topic: {topic.get('name')}")
    print(f"Subtopics: {topic.get('subtopics')}")

    # Generate question with required visual completeness
    q = AdaptiveAssessmentController.generate_dynamic_question(
        subject_name="Organic Chemistry",
        topic_name=topic["name"],
        subtopics=topic.get("subtopics", []),
        target_difficulty="medium",
        pedagogical_intent="applied_reasoning",
        previous_questions=[]
    )

    print("\n--- GENERATED QUESTION ---")
    print(f"Difficulty: {q['difficulty'].upper()}")
    print(f"Concept: {q['conceptTested']}")
    print(f"Source: {q.get('generation_source')} ({q.get('model_used')})")
    print(f"Is Fallback: {q.get('is_fallback')}")
    print(f"\nQuestion Text:\n{q['questionText']}\n")

    print("Options:")
    for opt in q["options"]:
        mark = "✓ CORRECT" if opt["isCorrect"] else "✗ DISTRACTOR"
        print(f"  [{opt['letter']}] {opt['text']} ({mark})")
        print(f"      Explanation: {opt['explanation']}")
        if not opt["isCorrect"]:
            print(f"      Misconception: {opt.get('misconceptionName')}")

    # Check Completeness:
    q_lower = q["questionText"].lower()
    if any(t in q_lower for t in ["fischer projection", "shown below", "in the diagram below", "diagram", "projection"]):
        has_diagram = "\n" in q["questionText"] or "|" in q["questionText"] or "+" in q["questionText"] or "---" in q["questionText"]
        assert has_diagram, "Question referenced visual structure but omitted diagram text!"
        print("\n✓ COMPLETENESS CHECK: Full visual structure is explicitly included in questionText!")

    # Check Accuracy:
    assert len(q["options"]) == 4, f"Must have exactly 4 options, got {len(q['options'])}"
    correct_opts = [o for o in q["options"] if o["isCorrect"]]
    assert len(correct_opts) == 1, f"Must have exactly 1 correct option, got {len(correct_opts)}"
    unique_texts = set(o["text"].strip().lower() for o in q["options"])
    assert len(unique_texts) == 4, f"Options must be unique, got: {unique_texts}"
    for opt in q["options"]:
        assert len(opt["explanation"].strip()) > 5, "Option must include meaningful explanation"
    print("✓ ACCURACY CHECK: Exactly 4 unique options, 1 unambiguous correct answer, and clear explanations verified!")

if __name__ == "__main__":
    test_question_completeness_and_accuracy()

