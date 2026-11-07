import re
from typing import Dict, Any, List, Optional

class MisconceptionFingerprintEngine:
    """
    Cognitive Misconception Analysis & Bayesian Mastery Engine.
    Identifies WHY a student is making errors rather than simply tallying percentages.
    Accumulates evidence before confirming a cognitive trap.
    """

    @staticmethod
    def update_bayesian_parameters(
        alpha: float,
        beta: float,
        is_correct: bool,
        difficulty: str
    ) -> Dict[str, float]:
        """
        Bayesian update based on question difficulty weighting:
        - Answering hard questions correctly provides stronger mastery evidence.
        - Failing easy questions provides stronger weakness evidence.
        """
        diff = difficulty.lower()
        if is_correct:
            increment = 2.0 if diff == "hard" else (1.5 if diff == "medium" else 1.0)
            new_alpha = alpha + increment
            new_beta = beta
        else:
            increment = 2.0 if diff == "easy" else (1.5 if diff == "medium" else 1.0)
            new_alpha = alpha
            new_beta = beta + increment

        # Posterior statistics
        denom = new_alpha + new_beta
        mean = new_alpha / denom
        variance = (new_alpha * new_beta) / (pow(denom, 2) * (denom + 1))
        # Variance decreases as sample size grows; certainty increases
        certainty = max(5, min(99, round((1.0 - (variance * 10)) * 100)))

        return {
            "alpha": round(new_alpha, 2),
            "beta": round(new_beta, 2),
            "posterior_mean": round(mean, 3),
            "variance": round(variance, 4),
            "certainty": certainty
        }

    @staticmethod
    def analyze_student_error(
        selected_option: Dict[str, Any],
        question_text: str,
        topic_name: str,
        evidence_summary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyzes the chosen distractor to isolate the student's cognitive misconception.
        Updates evidence accumulator:
        - 1 occurrence -> Provisional Diagnosis (requires follow-up investigation)
        - >=2 occurrences -> Confirmed Cognitive Trap
        """
        misconception_name = selected_option.get("misconceptionName") or "Conceptual Execution Error"
        explanation = selected_option.get("explanation") or "Student selected an option with conceptual inaccuracies."
        
        # Derive a canonical key for this misconception
        clean_key = re.sub(r'[^a-zA-Z0-9]', '_', misconception_name.lower()).strip('_')
        if not clean_key:
            clean_key = f"mis_{re.sub(r'[^a-zA-Z0-9]', '_', topic_name.lower())[:10]}"

        active_misconceptions = evidence_summary.setdefault("misconceptions", {})
        
        if clean_key in active_misconceptions:
            record = active_misconceptions[clean_key]
            record["count"] += 1
            record["status"] = "confirmed"
            record["confidence"] = min(98, record["confidence"] + 15)
            record["evidence"].append(f"In '{question_text[:70]}...': Selected '{selected_option.get('text', '')[:60]}'.")
        else:
            record = {
                "id": clean_key,
                "name": misconception_name,
                "topic": topic_name,
                "count": 1,
                "status": "provisional",  # Needs targeted probe before confirmation
                "confidence": 68,
                "correctiveExplanation": explanation,
                "evidence": [f"In '{question_text[:70]}...': Selected '{selected_option.get('text', '')[:60]}'."]
            }
            active_misconceptions[clean_key] = record

        return {
            "key": clean_key,
            "misconception": record,
            "is_confirmed": record["count"] >= 2,
            "updated_evidence": evidence_summary
        }

    @staticmethod
    def generate_recommendations(
        evaluated_topics: List[str],
        evidence_summary: Dict[str, Any],
        final_alpha: float,
        final_beta: float,
        total_questions: int,
        streak_correct: int
    ) -> Dict[str, Any]:
        """
        Produces diagnostic conclusions and prioritized learning roadmap.
        Considers Bayesian certainty, confirmed vs provisional misconceptions, and prerequisite order.
        """
        misconceptions_map = evidence_summary.get("misconceptions", {})
        confirmed_gaps = [m for m in misconceptions_map.values() if m.get("count", 0) >= 2 or m.get("status") == "confirmed"]
        provisional_gaps = [m for m in misconceptions_map.values() if m.get("count", 0) == 1 and m.get("status") == "provisional"]

        denom = final_alpha + final_beta
        mastery_rate = round((final_alpha / denom) * 100) if denom > 0 else 50
        variance = (final_alpha * final_beta) / (pow(denom, 2) * (denom + 1))
        confidence = max(10, min(99, round((1.0 - (variance * 10)) * 100)))

        is_conclusive = total_questions >= 5 and (confidence >= 75 or len(confirmed_gaps) > 0)

        mastered = []
        developing = []
        struggling = []

        if mastery_rate >= 75 and confidence >= 70:
            mastered.extend(evaluated_topics)
        elif mastery_rate >= 50:
            developing.extend(evaluated_topics)
        else:
            struggling.extend(evaluated_topics)

        # Prioritized revision plan
        revision_order = []
        # 1. Confirmed cognitive traps first
        for gap in confirmed_gaps:
            revision_order.append({
                "concept": gap.get("name"),
                "priority": "HIGH (Remediation Needed)",
                "reason": f"Repeated misconception: {gap.get('correctiveExplanation', '')[:80]}",
                "recommendedAction": f"Review foundational rules of {gap.get('topic')}"
            })
        # 2. Developing / Provisional concepts
        for p in provisional_gaps:
            revision_order.append({
                "concept": p.get("name"),
                "priority": "MEDIUM (Practice Needed)",
                "reason": "Single error observed; strengthen concept with targeted practice.",
                "recommendedAction": f"Practice worked examples in {p.get('topic')}"
            })

        return {
            "masteryScore": mastery_rate,
            "confidenceScore": confidence,
            "isConclusive": is_conclusive,
            "statusLabel": "Mastered" if mastery_rate >= 80 and confidence >= 75 else ("Developing" if mastery_rate >= 50 else "Needs Targeted Guidance"),
            "masteredConcepts": mastered,
            "developingConcepts": developing,
            "strugglingConcepts": struggling,
            "confirmedMisconceptions": confirmed_gaps,
            "provisionalMisconceptions": provisional_gaps,
            "prioritizedRevisionPlan": revision_order,
            "aiTutorBrief": (
                f"Student scored {mastery_rate}% mastery across {total_questions} adaptive questions. "
                f"Isolated {len(confirmed_gaps)} confirmed misconception(s): {', '.join([g['name'] for g in confirmed_gaps]) or 'None'}. "
                f"Immediate focus should be on {revision_order[0]['concept'] if revision_order else 'advancing to the next unit'}."
            )
        }

