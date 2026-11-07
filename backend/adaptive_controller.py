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
        configured = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
        models = [configured, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]
        return list(dict.fromkeys(models))

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
Formulate a DIFFERENT targeted diagnostic problem that isolates this exact underlying mechanism so we can confirm if this is an authentic misconception or a careless slip.
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
TOPIC: {topic_name}
SUBTOPICS / KEY CONCEPTS: {subtopics_str}
TARGET DIFFICULTY: {target_difficulty.upper()}
PEDAGOGICAL INTENT: {pedagogical_intent}
{probe_instruction}

### PREVIOUS QUESTIONS IN THIS SESSION (STRICTLY PROHIBITED TO REPEAT OR REPHRASE):
{history_str}

### INSTRUCTIONS:
1. SUBJECT-SPECIFIC REASONING:
   - For Programming: Include real code snippets, trace variable states, constructors, method overrides, or bug detection.
   - For Mathematics: Include concrete equations, derivations, calculus steps, or geometric reasoning.
   - For OS/DBMS: Include scheduling scenarios, transaction anomalies, normalization dependencies, or lock modes.
   - For Sciences: Include principles, reaction steps, or quantitative calculations.
   - NEVER generate generic placeholder questions like "What is the primary rule of X?". Ask concrete, realistic questions!
2. DIFFICULTY GUIDELINES:
   - EASY: Direct recall of definition, basic syntax rule, or standard single-step application.
   - MEDIUM: Multi-step reasoning, code execution trace, calculating a result, or comparing two alternatives.
   - HARD: Complex edge cases, subtle concurrency/memory bugs, synthesis of multiple rules, or deep problem solving.
3. OPTIONS & DISTRACTORS:
   - Provide EXACTLY 4 options (A, B, C, D).
   - Exactly ONE option must be scientifically correct (`isCorrect: true`).
   - The remaining THREE options must be realistic distractors representing common cognitive misconceptions or slips.
   - For each distractor, specify `misconceptionName` explaining the exact trap the student fell into.
   - Randomize which option is correct so it is not always option 1.
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
                    raw_options = data.get("options", [])
                    if len(raw_options) >= 2:
                        # Normalize and ensure random shuffling of option letters
                        shuffled_opts = list(raw_options)
                        random.shuffle(shuffled_opts)
                        formatted_opts = []
                        letter_map = ["A", "B", "C", "D"]
                        for i, opt in enumerate(shuffled_opts):
                            formatted_opts.append({
                                "id": f"opt_{letter_map[i % 4].lower()}_{uuid.uuid4().hex[:6]}",
                                "letter": letter_map[i % 4],
                                "text": opt.get("text", "").strip(),
                                "isCorrect": bool(opt.get("isCorrect", False)),
                                "misconceptionName": opt.get("misconceptionName") or ("Conceptual Trap" if not opt.get("isCorrect") else None),
                                "explanation": opt.get("explanation", "").strip()
                            })

                        # Safety verification: ensure exactly 1 correct option
                        correct_count = sum(1 for o in formatted_opts if o["isCorrect"])
                        if correct_count != 1:
                            # Default first to correct if model produced 0 or multiple
                            for idx, o in enumerate(formatted_opts):
                                o["isCorrect"] = (idx == 0)

                        return {
                            "id": f"q_adapt_{uuid.uuid4().hex[:12]}",
                            "questionText": data.get("questionText", "").strip(),
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
            target_difficulty=target_difficulty,
            pedagogical_intent=pedagogical_intent
        )

    @classmethod
    def generate_heuristic_fallback_question(
        cls,
        subject_name: str,
        topic_name: str,
        target_difficulty: str,
        pedagogical_intent: str
    ) -> Dict[str, Any]:
        """Subject-aware fallback question when network is offline."""
        is_prog = any(k in subject_name.lower() for k in ["java", "python", "c++", "prog", "code", "dsa"])
        letter_map = ["A", "B", "C", "D"]
        correct_idx = random.randint(0, 3)

        if is_prog:
            q_text = f"In {subject_name}, which code pattern accurately reflects proper architectural design and execution for '{topic_name}'?"
            correct_text = f"Declaring modular structures with explicit scope, proper encapsulation, and handling null/edge cases."
            distractors = [
                (f"Making all member variables public and global to bypass accessor methods.", "Encapsulation Bypass"),
                (f"Ignoring parameter validation and assuming inputs are always well-formed.", "Defensive Programming Omission"),
                (f"Relying on hardcoded string literals rather than structured constants or enums.", "Hardcoding Trap")
            ]
        else:
            q_text = f"In {subject_name}, what principle governs the correct application of '{topic_name}'?"
            correct_text = f"It enforces systematic boundary conditions and verified transformations according to core domain rules."
            distractors = [
                (f"It assumes conditions remain invariant even when operational parameters shift.", "Static Invariance Fallacy"),
                (f"It allows omitting foundational prerequisites if an intuitive approximation is available.", "Approximation Shortcut"),
                (f"It applies only in isolated test scenarios and fails in broader applications.", "Scope Limitation Trap")
            ]

        raw_opts = []
        raw_opts.append({"text": correct_text, "isCorrect": True, "misconceptionName": None, "explanation": "Valid, robust domain principle."})
        for dt, mn in distractors:
            raw_opts.append({"text": dt, "isCorrect": False, "misconceptionName": mn, "explanation": f"Misconception: {mn} violates standards."})

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
            "conceptTested": topic_name,
            "pedagogicalIntent": pedagogical_intent,
            "options": opts,
            "is_fallback": True,
            "generation_source": "heuristic_fallback",
            "model_used": "offline_heuristic",
            "fallback_notice": "Offline Heuristic Fallback: Live Gemini AI API was temporarily unreachable. This question was generated using offline heuristics, not live Gemini syllabus analysis."
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

            # Generate next question dynamically
            next_question = cls.generate_dynamic_question(
                subject_name=subject_name,
                topic_name=topic_name,
                subtopics=[],
                target_difficulty=next_difficulty,
                pedagogical_intent=next_stage,
                previous_questions=prior_questions,
                probe_concept=topic_name if next_stage in ("remediation", "prerequisite") else None,
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

