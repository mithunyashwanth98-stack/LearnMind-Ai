import os
import re
import json
import logging
from typing import List, Dict, Optional, Any
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

logger = logging.getLogger("learnmind.tutor")

# Path to environment file
env_path = os.path.join(os.path.dirname(__file__), ".env")

def get_gemini_client(api_key: Optional[str] = None) -> genai.Client:
    """Returns an authenticated Gemini client using current environment configuration."""
    load_dotenv(dotenv_path=env_path, override=True)
    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    
    if not key or key == "your_gemini_api_key_here":
        raise ValueError(
            "GEMINI_API_KEY is not configured in backend/.env. "
            "Please provide a valid Gemini API key in backend/.env to use the AI Tutor."
        )
    return genai.Client(api_key=key)

def build_system_instruction(
    student_name: str,
    subject: Optional[str],
    topic: Optional[str],
    partition: Optional[dict]
) -> str:
    """
    Constructs the pedagogical system instructions for Gemini incorporating
    authentic student data from the platform partition.
    """
    partition_data = partition or {}
    profile = partition_data.get("profile", {})
    mastery = profile.get("overallMastery", 0)
    
    # Extract actual misconceptions diagnosed in the student partition
    misconceptions = partition_data.get("misconceptions", [])
    active_misconceptions = [m for m in misconceptions if m.get("status") == "active"]
    
    misconception_notes = []
    if active_misconceptions:
        for m in active_misconceptions:
            misconception_notes.append(
                f"- Misconception on '{m.get('topic', 'Subject')}': {m.get('name', 'Conceptual error')}. "
                f"Evidence: {m.get('evidence', 'Observed in diagnostic')}. "
                f"Corrective focus: {m.get('correctiveExplanation', 'Clarify core principle')}."
            )
        misconception_str = "\n".join(misconception_notes)
    else:
        misconception_str = "None currently identified. Student is exploring fundamentals."

    # Subject details
    subjects = partition_data.get("subjects", [])
    current_sub = None
    if subject:
        current_sub = next(
            (s for s in subjects if s.get("name", "").lower() == subject.lower() or s.get("id") == subject),
            None
        )
    completed_topics = current_sub.get("completedTopics", 0) if current_sub else 0
    total_topics = current_sub.get("totalTopics", 0) if current_sub else 0

    syllabus = partition_data.get("uploadedSyllabus", "")
    syllabus_summary = syllabus[:400] if syllabus else "Standard Core Curriculum"

    return f"""You are the Holo-JARVIS AI Tutor for LearnMind AI — an advanced, futuristic cognitive learning companion.
You are a remarkably patient, master-class teacher who excels at helping beginner students develop deep conceptual mastery.

### AUTHENTIC STUDENT CONTEXT (LIVE FROM PLATFORM):
- Student Name: {student_name or 'Student'}
- Active Focus Subject: {subject or 'Calculus / Computer Science'}
- Active Focus Topic: {topic or 'Core Concepts'}
- Diagnosed Misconceptions (Verified Diagnostic Assessments):
{misconception_str}
- Completed Topics: {completed_topics} of {total_topics}
- Overall Mastery Level: {mastery}%
- Active Syllabus Context: {syllabus_summary}

### PEDAGOGICAL TEACHING MANDATES:
1. **Core Understanding First:** Always identify the core intent behind the student's question. Acknowledge what they are seeking to master.
2. **Beginner-Friendly Definitions:** Begin with the basic meaning or definition in plain, intuitive language before diving into deeper mechanics.
3. **Step-by-Step Logic (No Skipping):** Break down every explanation into explicit sequential steps. Explain *why* each step is performed. Never skip algebraic transitions or algorithmic leaps.
4. **Relatable Real-World Examples:** Anchor theoretical ideas into practical, concrete analogies that beginners can visualize.
5. **Programming Questions:**
   - Provide clean, functional code formatted in markdown code blocks with the language tag (e.g. ```python).
   - When requested or when introducing a new pattern, explain the code **line by line**, showing what each line does, the variables modified, and the runtime effect.
   - If the student provides buggy or incorrect code, clearly identify the exact error, explain the root cause, and demonstrate the correct fix.
6. **Mathematical Questions:**
   - Show the general formula explicitly using LaTeX math notation ($inline$ or $$block$$).
   - Detail the exact substitution of variables.
   - Walk through the arithmetic or algebraic calculation step-by-step.
   - State the final result clearly with units or concluding remarks.
7. **Conversational Continuity:**
   - Seamlessly connect follow-up questions to the preceding turns in conversation history.
   - If a student asks "Explain line 3" or "What about the second step?", refer directly to the previously discussed problem.
8. **Summary & Formative Check:**
   - Conclude with a concise 1-2 sentence takeaway summary when appropriate.
   - Include an engaging, beginner-appropriate practice question or challenge to verify comprehension.
9. **Adaptive Length:**
   - Match the depth and length of your explanation to the question: thorough and detailed for complex derivations, focused and punchy for quick clarifications. Do not force an artificial rigid template.
10. **Strict Platform Constraint:** Do NOT invent fictional student scores or modify platform diagnostics.

### FORMATTING FOR RICH RENDERING:
- Use clean Markdown: `##` for section headers, `**bold**` for key terms, bullet points for lists, and ```language code blocks.
- For math formulas, use `$formula$` for inline math and `$$formula$$` for display math equations.

### INTERACTIVE NEXT ACTIONS:
At the very end of your response, ALWAYS output exactly 3 to 4 short, relevant suggested follow-up student probes on a single line in this exact format:
[[ACTIONS: "Action 1", "Action 2", "Action 3"]]
Example:
[[ACTIONS: "Explain the code line by line", "Give me a practice problem on this", "Show another real-world example"]]
"""

def extract_actions_and_clean_reply(raw_text: str, topic: Optional[str] = None) -> tuple[str, List[str]]:
    """
    Extracts the [[ACTIONS: ...]] bracket block from Gemini's response
    and returns a clean markdown text along with the list of actions.
    """
    actions: List[str] = []
    clean_text = raw_text
    
    match = re.search(r'\[\[ACTIONS:\s*(.+?)\]\]', raw_text, re.DOTALL)
    if match:
        raw_actions = match.group(1).strip()
        clean_text = raw_text[:match.start()].strip()
        # Parse JSON-like strings
        try:
            parsed = json.loads(f"[{raw_actions}]")
            if isinstance(parsed, list):
                actions = [str(a).strip() for a in parsed if str(a).strip()]
        except Exception:
            # Fallback regex split
            items = re.findall(r'["\']([^"\']+)["\']', raw_actions)
            if items:
                actions = [i.strip() for i in items if i.strip()]

    # Fallback suggestions if none parsed
    if not actions:
        top = topic or "this concept"
        actions = [
            f"Give me a beginner practice problem on {top}",
            "Walk me through another example step-by-step",
            "Why is this concept important in practice?"
        ]

    return clean_text, actions[:4]

def generate_tutor_response(
    user_message: str,
    student_name: str,
    subject: Optional[str],
    topic: Optional[str],
    partition: Optional[dict],
    history: Optional[List[Dict[str, Any]]] = None,
    custom_api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends the student's inquiry to Google Gemini with pedagogical system instructions,
    active student context, and conversation history.
    """
    load_dotenv(dotenv_path=env_path, override=True)
    client = get_gemini_client(api_key=custom_api_key)
    
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
    candidate_models = [configured_model]
    for fallback in ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-2.5-flash"]:
        if fallback not in candidate_models:
            candidate_models.append(fallback)

    system_instruction = build_system_instruction(
        student_name=student_name,
        subject=subject,
        topic=topic,
        partition=partition
    )

    # Format multi-turn conversation history
    contents: List[types.Content] = []
    if history:
        for item in history[-8:]:  # keep last 8 messages for context window efficiency
            role = item.get("role") or item.get("sender")
            text = item.get("text") or item.get("content") or ""
            if not text.strip():
                continue
            if role in ["user", "student"]:
                contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=text)]
                    )
                )
            elif role in ["tutor", "model", "assistant"]:
                contents.append(
                    types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=text)]
                    )
                )

    # Add the current user question
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)]
        )
    )

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.7,
        max_output_tokens=1500,
    )

    last_error: Optional[Exception] = None
    successful_model: Optional[str] = None
    response_text: str = ""

    for model_name in candidate_models:
        try:
            resp = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config
            )
            if resp and resp.text:
                response_text = resp.text
                successful_model = model_name
                break
        except APIError as api_err:
            last_error = api_err
            # If 503 (high demand / overloaded) or 404 (model deprecated), try next fallback
            if api_err.code in (503, 404) and model_name != candidate_models[-1]:
                logger.warning(f"Model {model_name} returned {api_err.code}, attempting fallback...")
                continue
            raise api_err
        except Exception as exc:
            last_error = exc
            if model_name != candidate_models[-1]:
                continue
            raise exc

    if not response_text:
        if last_error:
            raise last_error
        raise RuntimeError("No response received from Gemini AI model.")

    clean_reply, suggested_actions = extract_actions_and_clean_reply(response_text, topic)

    return {
        "reply": clean_reply,
        "suggestedActions": suggested_actions,
        "model": successful_model or configured_model
    }

