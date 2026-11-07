import os
import re
import random
import logging
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from google.genai.errors import APIError

try:
    from tutor_service import get_gemini_client
except ImportError:
    from backend.tutor_service import get_gemini_client

from misconception_engine import MisconceptionFingerprintEngine
from database import (
    create_adaptive_session,
    get_adaptive_session,
    get_active_adaptive_session_for_user,
    update_adaptive_session,
    save_adaptive_question_response,
    get_adaptive_responses_for_session,
    get_student_partition,
    save_student_partition
)

logger = logging.getLogger("learnmind.adaptive")

# -------------------------------------------------------------
# STRICT PYDANTIC SCHEMAS FOR DYNAMIC QUESTION GENERATION
# -------------------------------------------------------------

class QuestionOptionSchema(BaseModel):
    id: str = Field(description="Unique option id e.g. opt_a, opt_b, opt_c, opt_d")
    text: str = Field(description="The option text (code, formula, explanation, or numerical result)")
    isCorrect: bool = Field(description="True if this is the scientifically/logically correct choice")
    misconceptionName: Optional[str] = Field(None, description="The cognitive trap or misconception name if incorrect")
    explanation: str = Field(description="Clear explanation of why this option is correct or incorrect")

class DynamicQuestionSchema(BaseModel):
    questionText: str = Field(description="Clear, subject-grounded question prompt (can include code snippets, equations, or problem scenarios)")
    difficulty: str = Field(description="'easy', 'medium', or 'hard'")
    conceptTested: str = Field(description="Exact concept or subtopic tested")
    pedagogicalIntent: str = Field(description="Reason why this question was formulated (e.g. baseline, escalate, probe misconception)")
    options: List[QuestionOptionSchema] = Field(description="Exactly 4 distinct multiple-choice options with 1 correct choice")

# -------------------------------------------------------------
# ADAPTIVE CONTROLLER CLASS
# -------------------------------------------------------------

class AdaptiveAssessmentController:
    """
    Pedagogical controller for real-time adaptive diagnostic assessments.
    Dynamically generates subject-grounded questions using Gemini 3.8 Flash,
    evaluates student performance, investigates misconceptions, and adjusts difficulty.
    """

    @classmethod
    def get_configured_models(cls) -> List[str]:
        configured = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
        models = [configured, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]
        return list(dict.fromkeys(models))

    @classmethod
    def validate_question_relevance(
        cls,
        question_dict: Dict[str, Any],
        subject_name: str,
        topic_name: str,
        subtopics: List[str]
    ) -> Tuple[bool, str]:
        """
        Independently verifies that a generated question is strictly relevant
        to the selected syllabus topic and subtopics.
        Rejects questions that ask about general subject topics outside the topic scope.
        """
        q_text = question_dict.get("questionText", "").lower()
        concept = question_dict.get("conceptTested", "").lower()
        topic_lower = topic_name.lower()
        subtopics_lower = [st.lower() for st in subtopics]

        # 1. Concept tested check: must relate to topic name or subtopic
        concept_match = (
            topic_lower in concept or 
            concept in topic_lower or 
            any(st in concept or concept in st for st in subtopics_lower)
        )

        # 2. Extract key domain terms from topic and subtopics
        topic_words = set(re.findall(r'[a-zA-Z]{3,}', topic_lower))
        for st in subtopics_lower:
            topic_words.update(re.findall(r'[a-zA-Z]{3,}', st))
        topic_words.difference_update({"and", "the", "for", "with", "from", "intro", "introduction", "basics", "concepts"})

        full_content = q_text + " " + " ".join(o.get("text", "").lower() for o in question_dict.get("options", []))
        content_matches = [w for w in topic_words if w in full_content]

        # 3. Detect and reject cross-topic contamination
        if "buzzword" in topic_lower:
            forbidden = ["extends ", "implements ", "interface ", "try-catch", "catch(", "throws exception", "filereader", "arraylist"]
            has_forbidden = any(f in full_content for f in forbidden)
            has_buzzword = any(k in full_content for k in ["architecture", "bytecode", "portable", "robust", "secure", "multithread", "distributed", "interpreted", "platform"])
            if has_forbidden and not has_buzzword:
                return False, f"Question tested OOP inheritance/interfaces instead of Java buzzwords"

        if "differentiation" in topic_lower or "derivative" in topic_lower:
            if any(k in full_content for k in ["integral", "matrix", "determinant", "probability"]) and not any(k in full_content for k in ["derivative", "dy/dx", "d/dx", "tangent", "rate of change", "chain rule", "slope"]):
                return False, f"Question tested non-calculus/integration concepts instead of Differentiation"

        if "laws of motion" in topic_lower or "newton" in topic_lower:
            if any(k in full_content for k in ["capacitance", "optics", "refraction", "magnetic flux", "electric potential"]):
                return False, f"Question tested electromagnetism/optics instead of Laws of Motion"

        if "chemical bonding" in topic_lower or "bonding" in topic_lower:
            if any(k in full_content for k in ["titration", "sn1", "sn2", "equilibrium constant", "fischer projection"]) and not any(k in full_content for k in ["bond", "ionic", "covalent", "vsepr", "lewis", "hybridization", "electronegativity", "octet"]):
                return False, f"Question tested organic reactions instead of Chemical Bonding"

        # General relevance assertion
        if not concept_match and len(content_matches) == 0:
            return False, f"Question did not match any keywords for topic '{topic_name}' ({', '.join(subtopics[:4])})"

        return True, "Valid topic alignment"

    @classmethod
    def generate_dynamic_question(
        cls,
        subject_name: str,
        topic_name: str,
        subtopics: List[str],
        target_difficulty: str,
        pedagogical_intent: str,
        previous_questions: List[str],
        probe_concept: Optional[str] = None,
        misconception_trap: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Dynamically synthesizes a high-quality, syllabus-grounded question.
        Ensures options are randomly mapped across A, B, C, and D.
        Prevents repeated questions using history.
        """
        client = get_gemini_client()
        models = cls.get_configured_models()

        subtopics_str = ", ".join(subtopics) if subtopics else topic_name
        history_str = "\n".join([f"- {q[:120]}" for q in previous_questions[-6:]]) if previous_questions else "None (First Question)"

        probe_instruction = ""
        if pedagogical_intent == "probe_misconception" and misconception_trap:
            probe_instruction = f"""
CRITICAL REMEDIATION PROBE:
The student previously made a mistake related to: '{misconception_trap}' on concept '{probe_concept or topic_name}'.
Do NOT repeat the previous question!
Formulate a DIFFERENT targeted diagnostic problem that isolates this exact underlying mechanism in '{topic_name}' so we can confirm if this is an authentic misconception or a careless slip.
"""
        elif pedagogical_intent == "test_prerequisite":
            probe_instruction = f"""
PREREQUISITE INVESTIGATION:
The student struggled with intermediate concepts in '{topic_name}'.
Formulate a simpler question that tests the prerequisite foundation or fundamental property that must be understood before applying advanced rules.
"""

        prompt = f"""You are the LearnMind AI Adaptive Assessment Engine.
Synthesize a single, rigorous multiple-choice diagnostic question for a student studying:

SUBJECT: {subject_name}
SELECTED TOPIC: {topic_name}
MANDATORY SUBTOPICS: {subtopics_str}
TARGET DIFFICULTY: {target_difficulty.upper()}
PEDAGOGICAL INTENT: {pedagogical_intent}
{probe_instruction}

### PREVIOUS QUESTIONS IN THIS SESSION (STRICTLY PROHIBITED TO REPEAT OR REPHRASE):
{history_str}

### INSTRUCTIONS:
1. STRICT SYLLABUS TOPIC RESTRICTION:
   - The question MUST test the selected topic: '{topic_name}' and specifically one of its subtopics: {subtopics_str}.
   - DO NOT generate questions about other topics or general subject concepts.
   - For example, if the topic is "Java buzzwords", DO NOT ask about OOP inheritance, encapsulation, interfaces, or file I/O. Focus exclusively on Java's core buzzwords (Architecture-neutral, Bytecode, Portability, Robustness, Multithreading, Security, Distributed, High performance).
   - If the topic is "Differentiation", DO NOT ask about integration or matrix algebra.
   - If the topic is "Chemical Bonding", DO NOT ask about organic reactions or thermodynamics.
   - If the topic is "Laws of Motion", DO NOT ask about optics or electromagnetism.

2. SUBJECT-SPECIFIC REASONING:
   - For Programming: Include real code snippets, trace variable states, constructors, or method calls.
   - For Mathematics: Include concrete equations, derivations, calculus steps, or geometric reasoning.
   - For OS/DBMS: Include scheduling scenarios, transaction anomalies, normalization dependencies, or lock modes.
   - For Sciences: Include principles, reaction steps, or quantitative calculations.
   - NEVER generate generic placeholder questions like "What is the primary rule of X?". Ask concrete, realistic questions!

3. DIFFICULTY GUIDELINES:
   - EASY: Direct recall of definition, basic syntax rule, or standard single-step application.
   - MEDIUM: Multi-step reasoning, code execution trace, calculating a result, or comparing two alternatives.
   - HARD: Complex edge cases, subtle concurrency/memory bugs, synthesis of multiple rules, or deep problem solving.

4. OPTIONS & DISTRACTORS:
   - Provide EXACTLY 4 options (A, B, C, D).
   - Exactly ONE option must be scientifically correct (`isCorrect: true`).
   - The remaining THREE options must be realistic distractors representing common cognitive misconceptions or slips.
   - For each distractor, specify `misconceptionName` explaining the exact trap the student fell into.
   - Randomize which option is correct so it is not always option 1.

5. MANDATORY SELF-CONTAINED QUESTION COMPLETENESS (NO MISSING INFORMATION):
   - The question must be 100% self-contained. A student must be able to solve it completely from the text provided without guessing missing diagrams or data.
   - If the question refers to a diagram, chemical structure, Fischer projection, stereocenter layout, truth table, state table, matrix, or code snippet, YOU MUST EXPLICITLY INCLUDE THE FULL ASCII/TEXT DIAGRAM, FORMULA, TABLE, OR CODE SNIPPET DIRECTLY INSIDE `questionText`.
   - FOR ORGANIC CHEMISTRY / STEREOCHEMISTRY: NEVER say "represented in a standard Fischer projection" or "shown below" without drawing the projection! Draw it explicitly in ASCII, for example:
       CHO
        |
     H--+--OH   (C2)
        |
    HO--+--H    (C3)
        |
       CH2OH
   - FOR PROGRAMMING: Always include the full code block.
   - FOR NETWORKING/OS: Always include the packet headers, arrival sequence, or table.
   - NEVER refer to an external figure or "shown below" without including it in full within `questionText`.
"""

        config = types.GenerateContentConfig(
            temperature=0.35,
            max_output_tokens=3000,
            response_mime_type="application/json",
            response_schema=DynamicQuestionSchema
        )

        for model_name in models:
            try:
                logger.info(f"Generating adaptive question via model '{model_name}'...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config
                )
                if response and response.text:
                    import json
                    from syllabus_service import clean_json_response
                    data = clean_json_response(response.text)
                    question_text = data.get("questionText", "").strip()

                    # Completeness validation: reject if refers to a diagram/projection without providing it
                    q_lower = question_text.lower()
                    visual_triggers = ["fischer projection", "shown below", "in the diagram below", "in the table below", "in the following diagram", "refer to the figure"]
                    has_trigger = any(t in q_lower for t in visual_triggers)
                    has_visual = "\n" in question_text or "---" in question_text or "|" in question_text or "+" in question_text or "{" in question_text
                    if has_trigger and not has_visual:
                        logger.warning(f"Model '{model_name}' generated incomplete question missing diagram/table. Rejecting.")
                        continue

                    raw_options = data.get("options", [])
                    if len(raw_options) >= 2:
                        # Normalize and ensure random shuffling of option letters
                        shuffled_opts = list(raw_options)
                        random.shuffle(shuffled_opts)
                        formatted_opts = []
                        letter_map = ["A", "B", "C", "D"]
                        for i, opt in enumerate(shuffled_opts[:4]):
                            formatted_opts.append({
                                "id": f"opt_{letter_map[i % 4].lower()}_{uuid.uuid4().hex[:6]}",
                                "letter": letter_map[i % 4],
                                "text": opt.get("text", "").strip(),
                                "isCorrect": bool(opt.get("isCorrect", False)),
                                "misconceptionName": opt.get("misconceptionName") or ("Conceptual Trap" if not opt.get("isCorrect") else None),
                                "explanation": opt.get("explanation", "").strip()
                            })

                        # Pad to exactly 4 if model gave 3
                        while len(formatted_opts) < 4:
                            idx = len(formatted_opts)
                            formatted_opts.append({
                                "id": f"opt_{letter_map[idx].lower()}_{uuid.uuid4().hex[:6]}",
                                "letter": letter_map[idx],
                                "text": "Insufficient operational parameters provided",
                                "isCorrect": False,
                                "misconceptionName": "Parameter insufficiency assumption",
                                "explanation": "Distractor choice indicating incomplete operational data."
                            })

                        # Safety verification: ensure exactly 1 correct option
                        correct_count = sum(1 for o in formatted_opts if o["isCorrect"])
                        if correct_count != 1:
                            # Ensure exactly first item is marked correct if none or multiple
                            for idx, o in enumerate(formatted_opts):
                                o["isCorrect"] = (idx == 0)

                        # Enforce unique option texts
                        unique_texts = set(o["text"].strip().lower() for o in formatted_opts)
                        if len(unique_texts) != 4:
                            logger.warning(f"Model '{model_name}' produced duplicate options. Rejecting.")
                            continue

                        # Completeness validation: reject if refers to a diagram/projection without providing it
                        q_lower = question_text.lower()
                        visual_triggers = ["fischer projection", "shown below", "in the diagram below", "in the table below", "in the following diagram", "refer to the figure"]
                        has_trigger = any(t in q_lower for t in visual_triggers)
                        has_visual = "\n" in question_text or "---" in question_text or "|" in question_text or "+" in question_text or "{" in question_text
                        if has_trigger and not has_visual:
                            logger.warning(f"Model '{model_name}' generated incomplete question missing diagram/table. Rejecting.")
                            continue

                        # Independent Topic Relevance Validation
                        candidate_q = {
                            "questionText": question_text,
                            "conceptTested": data.get("conceptTested", topic_name).strip(),
                            "options": formatted_opts
                        }
                        is_relevant, rejection_reason = cls.validate_question_relevance(
                            question_dict=candidate_q,
                            subject_name=subject_name,
                            topic_name=topic_name,
                            subtopics=subtopics
                        )
                        if not is_relevant:
                            logger.warning(f"Relevance Validator REJECTED question from '{model_name}': {rejection_reason}. Regenerating...")
                            continue

                        return {
                            "id": f"q_adapt_{uuid.uuid4().hex[:12]}",
                            "questionText": question_text,
                            "difficulty": data.get("difficulty", target_difficulty).lower(),
                            "conceptTested": data.get("conceptTested", topic_name).strip(),
                            "pedagogicalIntent": data.get("pedagogicalIntent", pedagogical_intent).strip(),
                            "options": formatted_opts,
                            "is_fallback": False,
                            "generation_source": "gemini",
                            "model_used": model_name
                        }
            except APIError as api_err:
                logger.warning(f"Model '{model_name}' API notice: {api_err.code} - {api_err.message}. Trying next...")
                continue
            except Exception as exc:
                logger.warning(f"Model '{model_name}' question generation notice: {exc}. Trying next...")
                continue

        # Intelligent Fallback if API models temporarily unreachable
        return cls.generate_heuristic_fallback_question(
            subject_name=subject_name,
            topic_name=topic_name,
            subtopics=subtopics,
            target_difficulty=target_difficulty,
            pedagogical_intent=pedagogical_intent
        )

    @classmethod
    def generate_heuristic_fallback_question(
        cls,
        subject_name: str,
        topic_name: str,
        subtopics: List[str],
        target_difficulty: str,
        pedagogical_intent: str
    ) -> Dict[str, Any]:
        """Subject- and subtopic-aware fallback questions when network or quota is restricted."""
        top_lower = topic_name.lower()
        letter_map = ["A", "B", "C", "D"]

        # 1. Java Buzzwords
        if "buzzword" in top_lower:
            q_text = "Which architectural mechanism enables Java to fulfill its 'Architecture-Neutral' and 'Portable' buzzwords across different operating systems and CPU architectures?"
            correct_text = "The Java compiler generates platform-independent bytecode (.class) instructions executed by an architecture-specific Java Virtual Machine (JVM)."
            distractors = [
                ("Java source code is directly cross-compiled into native binary machine code for all target CPUs at install time.", "Native cross-compilation fallacy"),
                ("Java utilizes an in-kernel CPU translator that dynamically converts x86 registers into ARM opcodes.", "Hardware translation assumption"),
                ("Java omits data type size specifications, letting host operating systems choose integer sizes at runtime.", "Platform-dependent typing trap")
            ]
            concept = "Architecture-Neutral & Portability"

        # 2. Java Classes and Objects
        elif "class" in top_lower or "object" in top_lower or "constructor" in top_lower:
            q_text = (
                "Consider the following Java class definition:\n\n"
                "public class Box {\n"
                "    int width;\n"
                "    public Box(int w) {\n"
                "        this.width = w;\n"
                "    }\n"
                "    public static void main(String[] args) {\n"
                "        Box b1 = new Box(10);\n"
                "        Box b2 = b1;\n"
                "        b2.width = 25;\n"
                "        System.out.println(b1.width);\n"
                "    }\n"
                "}\n\n"
                "What is the output when this program is executed?"
            )
            correct_text = "25"
            distractors = [
                ("10", "Pass-by-value / Reference copy isolation misconception"),
                ("Compilation Error", "Static context access error confusion"),
                ("0", "Default uninitialized primitive misconception")
            ]
            concept = "Object Reference & Heap Mutation"

        # 3. Python Functions
        elif "function" in top_lower or "def" in top_lower or "python" in subject_name.lower():
            q_text = (
                "Consider the following Python function definition:\n\n"
                "def append_item(val, items=[]):\n"
                "    items.append(val)\n"
                "    return items\n\n"
                "print(append_item(1))\n"
                "print(append_item(2))\n\n"
                "What is the exact output of running this code?"
            )
            correct_text = "[1]\n[1, 2]"
            distractors = [
                ("[1]\n[2]", "Mutable default argument re-evaluation misconception"),
                ("[1, 2]\n[1, 2]", "Static return value alias confusion"),
                ("TypeError: default parameter cannot be mutable", "Static analysis error confusion")
            ]
            concept = "Default Mutable Arguments in Python Functions"

        # 4. Mathematics: Differentiation
        elif "differentiat" in top_lower or "derivative" in top_lower or "calculus" in subject_name.lower():
            q_text = (
                "Find the first derivative dy/dx of the composite function:\n"
                "y = (3x^2 + 2x)^4\n"
                "using the chain rule."
            )
            correct_text = "4(3x^2 + 2x)^3 * (6x + 2)"
            distractors = [
                ("4(3x^2 + 2x)^3", "Omitting inner derivative in chain rule"),
                ("4(6x + 2)^3", "Differentiating inside power incorrectly"),
                ("12x(3x^2 + 2x)^3", "Incomplete inner derivative evaluation")
            ]
            concept = "Chain Rule for Composite Functions"

        # 5. Physics: Laws of Motion
        elif "motion" in top_lower or "newton" in top_lower or "force" in top_lower:
            q_text = (
                "A 5 kg block rests on a horizontal frictionless surface. A constant horizontal force "
                "of 20 N is applied for 3 seconds. Starting from rest, what is the block's final velocity?"
            )
            correct_text = "12 m/s"
            distractors = [
                ("4 m/s", "Confusing acceleration with final velocity"),
                ("60 m/s", "Failing to divide force by mass (v = F * t)"),
                ("15 m/s", "Arithmetic acceleration error")
            ]
            concept = "Newton's Second Law: Acceleration and Impulse"

        # 6. Chemistry: Chemical Bonding
        elif "bonding" in top_lower or "bond" in top_lower:
            q_text = (
                "According to VSEPR theory, what is the electron-pair geometry and the molecular shape "
                "of a water (H2O) molecule, and what is its approximate H-O-H bond angle?"
            )
            correct_text = "Tetrahedral electron geometry, Bent molecular shape, approximately 104.5 degrees."
            distractors = [
                ("Linear electron geometry, Linear molecular shape, 180 degrees.", "Ignoring lone pair repulsion in VSEPR"),
                ("Trigonal planar electron geometry, Bent molecular shape, 120 degrees.", "Counting only one lone pair on Oxygen"),
                ("Tetrahedral electron geometry, Trigonal pyramidal shape, 107 degrees.", "Confusing Ammonia (NH3) with Water (H2O)")
            ]
            concept = "VSEPR Molecular Geometry & Lone Pair Repulsion"

        # 7. Chemistry: Stereochemistry
        elif "stereo" in top_lower or "chiral" in top_lower:
            q_text = (
                "Consider the following Fischer projection of tartaric acid:\n"
                "       COOH\n"
                "        |\n"
                "    H---+---OH   (C2)\n"
                "        |\n"
                "    H---+---OH   (C3)\n"
                "        |\n"
                "       COOH\n\n"
                "What are the absolute configurations (CIP rules) for C2 and C3, and is this compound optically active?"
            )
            correct_text = "C2 is (2R), C3 is (3S); it is an optically inactive meso compound due to an internal mirror plane."
            distractors = [
                ("C2 is (2R), C3 is (3R); it is an optically active chiral enantiomer.", "Failing to observe the internal plane of symmetry"),
                ("C2 is (2S), C3 is (3S); it is a racemic mixture.", "Confusing single meso molecules with equimolar mixtures"),
                ("C2 is (2S), C3 is (3R); it is a diastereomer without symmetry.", "Inverting horizontal priority designations incorrectly")
            ]
            concept = "CIP Stereocenter Configuration & Meso Symmetry"

        # 8. Dynamic Syllabus Subtopic Grounding Fallback
        else:
            tested_sub = subtopics[0] if subtopics else topic_name
            q_text = f"In {subject_name}, which statement accurately characterizes the core operational rules of '{tested_sub}'?"
            correct_text = f"It systematically establishes verified preconditions, defined boundary transitions, and domain invariants for {tested_sub}."
            distractors = [
                (f"It bypasses standard verification prerequisites, treating {tested_sub} as statically invariant under all states.", "Precondition bypass trap"),
                (f"It relies solely on runtime approximation without adhering to formal rules for {tested_sub}.", "Heuristic shortcut fallacy"),
                (f"It restricts {tested_sub} execution to isolated unit scenarios without modular integration.", "Scope isolation trap")
            ]
            concept = f"Core Foundations of {tested_sub}"

        raw_opts = []
        raw_opts.append({"text": correct_text, "isCorrect": True, "misconceptionName": None, "explanation": "Valid, scientifically sound domain principle."})
        for dt, mn in distractors:
            raw_opts.append({"text": dt, "isCorrect": False, "misconceptionName": mn, "explanation": f"Misconception: {mn} violates domain standards."})

        # Shuffle
        random.shuffle(raw_opts)
        opts = []
        for i, o in enumerate(raw_opts):
            opts.append({
                "id": f"opt_{letter_map[i].lower()}_{uuid.uuid4().hex[:6]}",
                "letter": letter_map[i],
                "text": o["text"],
                "isCorrect": o["isCorrect"],
                "misconceptionName": o["misconceptionName"],
                "explanation": o["explanation"]
            })

        return {
            "id": f"q_fallback_{uuid.uuid4().hex[:12]}",
            "questionText": q_text,
            "difficulty": target_difficulty.lower(),
            "conceptTested": concept,
            "pedagogicalIntent": pedagogical_intent,
            "options": opts,
            "is_fallback": True,
            "generation_source": "heuristic_fallback",
            "model_used": "offline_heuristic",
            "fallback_notice": f"Offline Subject Fallback: Grounded strictly in syllabus topic '{topic_name}'."
        }

    @classmethod
    def start_session(
        cls,
        user_id: str,
        subject_id: str,
        subject_name: str,
        hierarchy: Dict[str, Any],
        topic_coverage: List[Dict[str, Any]],
        target_topic_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Initializes an adaptive assessment session:
        - Selects topics marked 'completed', 'currently_studying', or 'partially_covered'.
        - If no topics studied, selects foundational topics without penalty.
        - Generates Stage 1 (Easy) question.
        - Persists to SQLite.
        """
        # Determine topics to evaluate
        covered_ids = [
            c["topic_id"] for c in topic_coverage
            if c.get("coverage_status") in ("completed", "currently_studying", "partially_covered")
        ]

        all_topics = []
        for u in hierarchy.get("units", []):
            for t in u.get("topics", []):
                all_topics.append({
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "unitTitle": u.get("title", ""),
                    "subtopics": t.get("subtopics", [])
                })

        if target_topic_id:
            eval_topics = [t for t in all_topics if t["id"] == target_topic_id]
        else:
            eval_topics = [t for t in all_topics if t["id"] in covered_ids]

        if not eval_topics:
            eval_topics = all_topics[:2] if all_topics else [{
                "id": "top_base_1",
                "name": f"Foundations of {subject_name}",
                "unitTitle": "Unit 1: Foundations",
                "subtopics": ["Core Definitions", "Basic Operations"]
            }]

        current_topic = eval_topics[0]
        topic_ids = [t["id"] for t in eval_topics]
        session_id = f"asess_{uuid.uuid4().hex[:16]}"

        # Create session in database
        session_record = create_adaptive_session(
            session_id=session_id,
            user_id=user_id,
            subject_id=subject_id,
            topic_ids=topic_ids,
            current_topic_id=current_topic["id"]
        )

        # Stage 1: Generate initial Easy question
        first_question = cls.generate_dynamic_question(
            subject_name=subject_name,
            topic_name=current_topic["name"],
            subtopics=current_topic.get("subtopics", []),
            target_difficulty="easy",
            pedagogical_intent="initial_baseline",
            previous_questions=[]
        )

        return {
            "session_id": session_id,
            "subject_id": subject_id,
            "subject_name": subject_name,
            "current_topic": current_topic,
            "stage": "easy",
            "difficulty": "easy",
            "total_questions_answered": 0,
            "min_questions": 5,
            "max_questions": 8,
            "current_question": first_question
        }

    @classmethod
    def submit_answer_and_step(
        cls,
        user_id: str,
        session_id: str,
        subject_name: str,
        hierarchy: Dict[str, Any],
        selected_option_id: str,
        active_question: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Core Adaptive Decision Engine:
        1. Evaluates correctness and analyzes misconceptions.
        2. Updates Bayesian mastery parameters.
        3. Evaluates stopping rules (min 5, max 8, conclusive evidence).
        4. Dynamically chooses next action:
           - Escalate to Medium / Hard if correct.
           - Targeted Remediation Probe on same concept if incorrect.
           - Prerequisite Step-Down if repeated failure.
           - Conclude and generate learning roadmap if evidence complete.
        """
        session = get_adaptive_session(session_id)
        if not session:
            raise ValueError(f"Adaptive assessment session '{session_id}' not found.")
        if session["user_id"] != user_id:
            raise PermissionError("Access denied to another student's assessment session.")

        # Match selected option
        options = active_question.get("options", [])
        chosen_opt = next((o for o in options if o["id"] == selected_option_id), None)
        if not chosen_opt:
            raise ValueError(f"Option '{selected_option_id}' does not match active question.")

        is_correct = bool(chosen_opt.get("isCorrect", False))
        correct_opt = next((o for o in options if o.get("isCorrect")), chosen_opt)
        topic_name = active_question.get("conceptTested") or "Subject Concept"
        curr_difficulty = active_question.get("difficulty", "easy").lower()

        # Telemetry updates
        evidence_summary = session.get("evidence_summary") or {}
        diagnosed_trap = None

        if not is_correct:
            err_analysis = MisconceptionFingerprintEngine.analyze_student_error(
                selected_option=chosen_opt,
                question_text=active_question.get("questionText", ""),
                topic_name=topic_name,
                evidence_summary=evidence_summary
            )
            evidence_summary = err_analysis["updated_evidence"]
            diagnosed_trap = err_analysis["misconception"]["name"]

        # Bayesian update
        bayes = MisconceptionFingerprintEngine.update_bayesian_parameters(
            alpha=session.get("posterior_alpha", 1.0),
            beta=session.get("posterior_beta", 1.0),
            is_correct=is_correct,
            difficulty=curr_difficulty
        )

        # Update counters
        streak_correct = (session.get("streak_correct", 0) + 1) if is_correct else 0
        consecutive_incorrect = (session.get("consecutive_incorrect", 0) + 1) if not is_correct else 0
        total_answered = session.get("total_questions_answered", 0) + 1

        # Pedagogical Decision Logic
        action = "maintain"
        next_difficulty = curr_difficulty
        next_stage = session.get("current_stage", "easy")
        pedagogical_reason = ""
        should_conclude = False

        # Stopping Rules: Min 5, Max 8
        if total_answered >= 5:
            # If student consistently aced Medium/Hard questions with high certainty (Beta(5,2) -> mean 71.4%, certainty 69.4%)
            if is_correct and bayes["certainty"] >= 65 and bayes["posterior_mean"] >= 0.70 and (curr_difficulty in ("medium", "hard")):
                should_conclude = True
                pedagogical_reason = f"Student demonstrated consistent understanding across {total_answered} questions with {bayes['certainty']}% Bayesian confidence."
            # If a specific weakness was investigated and remediated
            elif not is_correct and consecutive_incorrect >= 2 and total_answered >= 6:
                should_conclude = True
                pedagogical_reason = f"Identified and investigated persistent knowledge gap '{diagnosed_trap}'. Prescribing remediation."
            elif total_answered >= 8:
                should_conclude = True
                pedagogical_reason = "Reached maximum 8 question threshold. Synthesizing diagnostic evaluation."

        # If not concluded, decide the next pedagogical move
        if not should_conclude:
            if is_correct:
                if curr_difficulty == "easy":
                    next_difficulty = "medium"
                    next_stage = "medium"
                    pedagogical_reason = "Answered foundational question correctly. Advancing to Medium difficulty to test application and deeper reasoning."
                elif curr_difficulty == "medium":
                    if streak_correct >= 2:
                        next_difficulty = "hard"
                        next_stage = "difficult"
                        pedagogical_reason = "Demonstrated solid medium application. Escalating to Hard difficulty to assess edge cases and problem solving."
                    else:
                        next_difficulty = "medium"
                        next_stage = "medium"
                        pedagogical_reason = "Correct on medium question. Verifying consistency with a second medium problem before escalating."
                else:  # hard
                    next_difficulty = "hard"
                    next_stage = "difficult"
                    pedagogical_reason = "Excellent! Correct on challenging question. Continuing high-level verification."
            else:  # incorrect
                if consecutive_incorrect == 1:
                    # PROBE MISCONCEPTION: do not jump away, test the same concept with a fresh problem
                    next_difficulty = curr_difficulty
                    next_stage = "remediation"
                    pedagogical_reason = f"Investigating potential misconception '{diagnosed_trap}'. Formulating a targeted follow-up on '{topic_name}' to verify understanding."
                else:
                    # STEP DOWN TO PREREQUISITES
                    next_difficulty = "easy" if curr_difficulty == "medium" else "easy"
                    next_stage = "prerequisite"
                    pedagogical_reason = f"Consecutive difficulty observed. Stepping down to investigate foundational prerequisites for '{topic_name}'."

        # Save student response telemetry to database
        save_adaptive_question_response(
            session_id=session_id,
            user_id=user_id,
            topic_id=session.get("current_topic_id", "top_1"),
            concept_tested=topic_name,
            difficulty=curr_difficulty,
            question_text=active_question.get("questionText", ""),
            options=options,
            selected_option_id=selected_option_id,
            is_correct=is_correct,
            correct_option_id=correct_opt.get("id", ""),
            explanation=chosen_opt.get("explanation", ""),
            diagnosed_misconception=diagnosed_trap,
            pedagogical_reasoning=pedagogical_reason
        )

        final_report = None
        next_question = None

        if should_conclude:
            # Generate final diagnostic report
            final_report = MisconceptionFingerprintEngine.generate_recommendations(
                evaluated_topics=[topic_name],
                evidence_summary=evidence_summary,
                final_alpha=bayes["alpha"],
                final_beta=bayes["beta"],
                total_questions=total_answered,
                streak_correct=streak_correct
            )
            update_adaptive_session(
                session_id=session_id,
                current_stage="concluded",
                streak_correct=streak_correct,
                consecutive_incorrect=consecutive_incorrect,
                total_questions_answered=total_answered,
                posterior_alpha=bayes["alpha"],
                posterior_beta=bayes["beta"],
                status="completed",
                evidence_summary=evidence_summary,
                final_report=final_report
            )

            # Sync confirmed misconceptions and next concept into student partition
            try:
                part = get_student_partition(user_id) or {}
                part_mis = part.setdefault("misconceptions", [])
                for cm in final_report.get("confirmedMisconceptions", []):
                    if not any(m.get("id") == cm["id"] for m in part_mis):
                        part_mis.append(cm)
                if final_report.get("prioritizedRevisionPlan"):
                    part.setdefault("profile", {})["recommendedNextConcept"] = final_report["prioritizedRevisionPlan"][0]["concept"]
                save_student_partition(user_id, part)
            except Exception as e:
                logger.warning(f"Notice updating partition from final report: {e}")
        else:
            # Update session state in DB
            update_adaptive_session(
                session_id=session_id,
                current_stage=next_stage,
                current_difficulty=next_difficulty,
                streak_correct=streak_correct,
                consecutive_incorrect=consecutive_incorrect,
                total_questions_answered=total_answered,
                posterior_alpha=bayes["alpha"],
                posterior_beta=bayes["beta"],
                evidence_summary=evidence_summary
            )

            # Retrieve prior questions in session to avoid repeats
            responses = get_adaptive_responses_for_session(session_id)
            prior_questions = [r["question_text"] for r in responses]

            # Look up current topic and subtopics from hierarchy to preserve topic grounding
            curr_topic_id = session.get("current_topic_id")
            active_subtopics = []
            active_topic_name = topic_name

            for u in hierarchy.get("units", []):
                for t in u.get("topics", []):
                    if t.get("id") == curr_topic_id:
                        active_topic_name = t.get("name", topic_name)
                        active_subtopics = t.get("subtopics", [])
                        break
                if active_subtopics:
                    break

            # Generate next question dynamically
            next_question = cls.generate_dynamic_question(
                subject_name=subject_name,
                topic_name=active_topic_name,
                subtopics=active_subtopics,
                target_difficulty=next_difficulty,
                pedagogical_intent=next_stage,
                previous_questions=prior_questions,
                probe_concept=active_topic_name if next_stage in ("remediation", "prerequisite") else None,
                misconception_trap=diagnosed_trap if next_stage == "remediation" else None
            )

        return {
            "session_id": session_id,
            "evaluated_answer": {
                "is_correct": is_correct,
                "selected_option_id": selected_option_id,
                "correct_option_id": correct_opt.get("id"),
                "explanation": chosen_opt.get("explanation", ""),
                "diagnosed_misconception": diagnosed_trap
            },
            "bayesian_telemetry": bayes,
            "pedagogical_decision": {
                "action": "conclude" if should_conclude else ("escalate" if is_correct else "investigate"),
                "reasoning": pedagogical_reason,
                "next_difficulty": next_difficulty,
                "next_stage": next_stage
            },
            "total_questions_answered": total_answered,
            "is_concluded": should_conclude,
            "next_question": next_question,
            "final_report": final_report
        }

