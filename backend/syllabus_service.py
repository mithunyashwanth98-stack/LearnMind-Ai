import os
import re
import json
import logging
from typing import Dict, Any, List, Optional
import pymupdf
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

try:
    from tutor_service import get_gemini_client
except ImportError:
    from backend.tutor_service import get_gemini_client

logger = logging.getLogger("learnmind.syllabus")

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts and cleans text from PDF binary bytes using PyMuPDF (fitz).
    Handles multi-page documents and normalizes whitespace.
    """
    if not pdf_bytes:
        raise ValueError("Empty PDF file payload provided.")

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Unable to parse PDF file format: {str(e)}")

    full_text_parts = []
    for page_idx, page in enumerate(doc):
        page_text = page.get_text("text")
        if page_text and page_text.strip():
            # Clean repetitive headers/footers or page numbers
            lines = [line.strip() for line in page_text.splitlines() if line.strip()]
            full_text_parts.append("\n".join(lines))

    doc.close()

    combined_text = "\n\n".join(full_text_parts).strip()
    if not combined_text:
        raise ValueError("The uploaded PDF does not contain extractable text. Please ensure it is not a scanned image PDF.")

    return combined_text

def clean_json_response(raw_text: str) -> dict:
    """Safely extracts JSON from an LLM response even if enclosed in markdown code fences."""
    text = raw_text.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        text = match.group(1).strip()
    
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end+1])
        raise ValueError("Failed to parse valid structured JSON from AI extraction output.")

def heuristic_syllabus_parser(
    raw_text: str,
    subject_name: str = "",
    subject_code: str = "",
    filename: str = ""
) -> Dict[str, Any]:
    """
    Intelligent heuristic parser used if Gemini quota is exhausted or offline.
    Extracts Units, Topics, Subject Name, and Course Code using regex pattern matching.
    """
    detected_name = subject_name.strip()
    detected_code = subject_code.strip()

    # Heuristic 1: Detect subject code and name from filename or header
    fn_clean = re.sub(r'\.(pdf|docx|doc|txt)$', '', filename, flags=re.IGNORECASE)
    code_match = re.search(r'\b([0-9]{2}[A-Z]{2,4}[0-9]{3,4}|[A-Z]{2,4}[- ]?[0-9]{3,4})\b', fn_clean + " " + raw_text[:500], re.IGNORECASE)
    if code_match and not detected_code:
        detected_code = code_match.group(1).upper().replace(" ", "-")

    if not detected_name:
        # Check filename patterns like 'OOP Syllabus', 'Java Programming', 'Data Structures'
        if re.search(r'\b(oop|object oriented|java)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Object-Oriented Programming (Java)"
        elif re.search(r'\b(python|programming)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Python Programming"
        elif re.search(r'\b(dsa|data structure)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Data Structures & Algorithms"
        elif re.search(r'\b(os|operating system)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Operating Systems"
        elif re.search(r'\b(dbms|database)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Database Management Systems"
        elif re.search(r'\b(math|calculus|algebra)\b', fn_clean + " " + raw_text[:500], re.IGNORECASE):
            detected_name = "Engineering Mathematics"
        else:
            # Fallback to cleaned filename
            detected_name = re.sub(r'[^a-zA-Z0-9\s]', ' ', fn_clean).strip().title() or "Institutional Curriculum"

    # Brain region heuristic
    name_lower = detected_name.lower()
    if any(k in name_lower for k in ["java", "oop", "code", "python", "software", "program"]):
        brain_region = "Temporal Lobe (Language & Sequences)"
    elif any(k in name_lower for k in ["math", "calculus", "algebra", "discrete"]):
        brain_region = "Frontal Lobe (Reasoning & Mathematics)"
    elif any(k in name_lower for k in ["data structure", "architecture", "system", "network"]):
        brain_region = "Parietal Lobe (Spatial & Architecture)"
    else:
        brain_region = "Frontal Lobe (Reasoning & Cognition)"

    # Heuristic 2: Identify Unit / Module boundaries
    unit_pattern = re.compile(
        r'(?:^|\n)(?:UNIT|MODULE|CHAPTER)\s*[-:]?\s*([0-9IVXLCDM]+)[\s:.\-–—]+([^\n]+)',
        re.IGNORECASE
    )

    matches = list(unit_pattern.finditer(raw_text))
    units = []

    if matches:
        for idx, match in enumerate(matches):
            unit_num_str = match.group(1).strip()
            unit_title_clean = match.group(2).strip()
            start_pos = match.end()
            end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw_text)
            unit_body = raw_text[start_pos:end_pos].strip()

            # Split topics by lines, bullets, or semicolons
            raw_lines = [l.strip(" -•*;\t") for l in unit_body.splitlines() if len(l.strip(" -•*;\t")) > 3]
            topics = []
            for t_idx, line in enumerate(raw_lines[:6]):
                # If line is not another unit or header
                if not re.match(r'^(unit|module|chapter|hours|credits)', line, re.IGNORECASE):
                    topics.append({
                        "id": f"top_{idx + 1}_{t_idx + 1}",
                        "name": line[:60],
                        "learningObjectives": [f"Understand core principles of {line[:40]}"],
                        "prerequisites": ["Basic Programming Fundamentals" if "java" in name_lower or "oop" in name_lower else "Core Foundations"],
                        "subtopics": [f"{line[:30]} Syntax", f"Application & Case Studies"]
                    })

            if not topics:
                topics = [{
                    "id": f"top_{idx + 1}_1",
                    "name": f"Core Foundations of {unit_title_clean[:30]}",
                    "learningObjectives": ["Grasp fundamental mechanisms"],
                    "prerequisites": ["Foundational Concepts"],
                    "subtopics": ["Theory", "Implementation"]
                }]

            units.append({
                "id": f"unit_{idx + 1}",
                "unitNumber": idx + 1,
                "title": f"Unit {unit_num_str}: {unit_title_clean}",
                "description": f"Curriculum module covering {unit_title_clean}",
                "topics": topics
            })
    else:
        # Fallback if no explicit "Unit" keywords exist: split by paragraphs or major headings
        paragraphs = [p.strip() for p in raw_text.split("\n\n") if len(p.strip()) > 30]
        units = [
            {
                "id": "unit_1",
                "unitNumber": 1,
                "title": f"Unit 1: Fundamentals of {detected_name}",
                "description": "Essential foundational concepts and core syntax",
                "topics": [
                    {
                        "id": "top_1_1",
                        "name": "Foundational Principles & Syntax",
                        "learningObjectives": ["Understand foundational architecture"],
                        "prerequisites": ["Introductory Logic"],
                        "subtopics": ["Architecture", "Key Mechanisms"]
                    },
                    {
                        "id": "top_1_2",
                        "name": "Core Implementations & Patterns",
                        "learningObjectives": ["Implement standard patterns"],
                        "prerequisites": ["Foundational Principles & Syntax"],
                        "subtopics": ["Syntax Patterns", "Practical Usage"]
                    }
                ]
            },
            {
                "id": "unit_2",
                "unitNumber": 2,
                "title": f"Unit 2: Advanced Topics in {detected_name}",
                "description": "Applied paradigms, exception handling, and architecture",
                "topics": [
                    {
                        "id": "top_2_1",
                        "name": "Applied Paradigms & Advanced Techniques",
                        "learningObjectives": ["Apply advanced techniques in software development"],
                        "prerequisites": ["Core Implementations & Patterns"],
                        "subtopics": ["Methodologies", "Best Practices"]
                    }
                ]
            }
        ]

    total_topics = sum(len(u["topics"]) for u in units)
    return {
        "subjectName": detected_name,
        "subjectCode": detected_code or "CS-101",
        "brainRegion": brain_region,
        "totalUnits": len(units),
        "totalTopics": total_topics,
        "units": units
    }

def extract_syllabus_hierarchy(
    raw_text: str,
    subject_name: Optional[str] = "",
    subject_code: Optional[str] = "",
    filename: Optional[str] = ""
) -> Dict[str, Any]:
    """
    Deconstructs raw syllabus text into a hierarchical tree:
    Units -> Chapters/Modules -> Topics -> Subtopics -> Prerequisites.
    Automatically detects Subject Name, Course Code, and Cortical Brain Region.
    Supports multi-model fallback and local heuristic fallback if API quotas are exhausted.
    """
    client = get_gemini_client()
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
    models_to_try = [configured_model, "gemini-2.5-flash", "gemini-flash-latest"]
    # De-duplicate while preserving order
    models_to_try = list(dict.fromkeys(models_to_try))

    prompt = f"""You are the LearnMind AI Syllabus Deconstruction Engine.
Analyze the following institutional syllabus text and extract a strict, clean, hierarchical curriculum structure.

METADATA:
Document Filename: {filename or 'Syllabus_Document.pdf'}
Provided Subject Name: {subject_name or 'Auto-Detect'}
Provided Subject Code: {subject_code or 'Auto-Detect'}

SYLLABUS CONTENT:
\"\"\"
{raw_text[:12000]}
\"\"\"

### CRITICAL REQUIREMENTS:
1. AUTO-DETECT THE SUBJECT AND CODE:
   - Carefully inspect the document text and filename.
   - For example, if the syllabus says '25CS303 OOP Syllabus', the subject is 'Object-Oriented Programming (Java)' and code is '25CS303'.
   - DO NOT default to 'Mathematics' unless the text is actually about Mathematics/Calculus! LearnMind AI supports ALL subjects.
   - Choose the most appropriate brain cortical region:
     * 'Temporal Lobe (Language & Sequences)' for Java, Python, C++, programming, data, languages.
     * 'Frontal Lobe (Reasoning & Mathematics)' for math, logic, calculus, discrete structures.
     * 'Parietal Lobe (Spatial & Architecture)' for systems, computer architecture, databases, networks.
     * 'Occipital Lobe (Visual & Mechanics)' for computer graphics, UI/UX, mechanical engineering.
2. Extract all Units / Modules / Chapters hierarchically from the text.
3. Under each Unit, extract all discrete Topics and their Subtopics.
4. For each Topic:
   - Provide a clear, recognizable Topic Name.
   - List key Learning Objectives.
   - Identify Prerequisite Topics.
   - List detailed Subtopics.
5. Output strict JSON with NO conversational prelude or conclusion, matching this exact schema:

{{
  "subjectName": "Detected or Confirmed Subject Name (e.g. Object-Oriented Programming)",
  "subjectCode": "Detected Subject Code (e.g. 25CS303)",
  "brainRegion": "Temporal Lobe (Language & Sequences)",
  "totalUnits": 0,
  "totalTopics": 0,
  "units": [
    {{
      "id": "unit_1",
      "unitNumber": 1,
      "title": "Unit 1: Title of Unit",
      "description": "Overview of this unit...",
      "topics": [
        {{
          "id": "topic_1_1",
          "name": "Exact Topic Name",
          "learningObjectives": ["Objective 1", "Objective 2"],
          "prerequisites": ["Prerequisite Topic Name"],
          "subtopics": ["Subtopic A", "Subtopic B"]
        }}
      ]
    }}
  ]
}}
"""

    config = types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=3500,
        response_mime_type="application/json"
    )

    last_error = None
    for model_name in models_to_try:
        try:
            logger.info(f"Attempting syllabus extraction using model '{model_name}'...")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            if response and response.text:
                parsed = clean_json_response(response.text)
                units = parsed.get("units", [])
                if units:
                    topic_count = 0
                    for u_idx, unit in enumerate(units):
                        if "id" not in unit or not unit["id"]:
                            unit["id"] = f"unit_{u_idx + 1}"
                        topics = unit.get("topics", [])
                        for t_idx, topic in enumerate(topics):
                            topic_count += 1
                            if "id" not in topic or not topic["id"]:
                                topic["id"] = f"top_{u_idx + 1}_{t_idx + 1}"

                    parsed["totalUnits"] = len(units)
                    parsed["totalTopics"] = topic_count
                    if subject_name and subject_name.strip() and subject_name.lower() != "auto-detect":
                        parsed["subjectName"] = subject_name.strip()
                    if subject_code and subject_code.strip() and subject_code.lower() != "auto-detect":
                        parsed["subjectCode"] = subject_code.strip()
                    return parsed
        except APIError as api_err:
            last_error = api_err
            logger.warning(f"Model '{model_name}' API error: {api_err.code} - {api_err.message}. Trying next fallback...")
            continue
        except Exception as exc:
            last_error = exc
            logger.warning(f"Model '{model_name}' unexpected error: {exc}. Trying next fallback...")
            continue

    logger.warning(f"All Gemini models exhausted ({last_error}). Falling back to heuristic text-pattern syllabus extractor.")
    return heuristic_syllabus_parser(raw_text, subject_name=subject_name or "", subject_code=subject_code or "", filename=filename or "")

def synthesize_topic_knowledge(
    topic_name: str,
    unit_title: str,
    subject_name: str,
    subtopics: Optional[List[str]] = None,
    learning_objectives: Optional[List[str]] = None,
    context_text: str = ""
) -> Dict[str, Any]:
    """
    Synthesizes the 8 foundational pedagogical knowledge elements for a single topic using Gemini:
    1. Definitions
    2. Detailed explanations
    3. Formulas, rules, and core concepts
    4. Step-by-step worked examples
    5. Practical real-world applications
    6. Common student misconceptions
    7. Formative practice questions
    8. Diagnostic assessment questions with misconception distractors
    """
    client = get_gemini_client()
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip()
    models_to_try = list(dict.fromkeys([configured_model, "gemini-2.5-flash", "gemini-flash-latest"]))

    subtopics_str = ", ".join(subtopics) if subtopics else "General Principles"
    objectives_str = "; ".join(learning_objectives) if learning_objectives else "Master fundamental concepts"

    prompt = f"""You are the LearnMind AI Knowledge Preparation Engine.
Prepare comprehensive, high-quality educational knowledge for beginner students on the following topic.

SUBJECT: {subject_name}
UNIT: {unit_title}
TOPIC: {topic_name}
SUBTOPICS: {subtopics_str}
LEARNING OBJECTIVES: {objectives_str}

### INSTRUCTIONS:
Synthesize the structured knowledge for this topic covering all 8 pedagogical elements.
Output strict JSON with NO surrounding conversation, matching this exact schema:

{{
  "topicName": "{topic_name}",
  "unitTitle": "{unit_title}",
  "definitions": [
    "Formal definition in simple, intuitive terms",
    "Plain-English translation for beginners"
  ],
  "explanations": [
    "Detailed step-by-step conceptual mechanism explaining how and why it works."
  ],
  "formulasAndRules": [
    {{
      "name": "Primary Rule or Syntax Rule",
      "latex": "formula or code pattern",
      "explanation": "Why this rule works and how to apply it"
    }}
  ],
  "workedExamples": [
    {{
      "problem": "Clear problem statement",
      "steps": [
        "Step 1: Identify given variables or classes...",
        "Step 2: Apply the logic or construct...",
        "Step 3: Perform execution/calculation..."
      ],
      "finalAnswer": "Explicit final result or code snippet"
    }}
  ],
  "realWorldApplications": [
    "Concrete real-world use case in industry, engineering, software or daily life"
  ],
  "commonMisconceptions": [
    {{
      "id": "MIS_{re.sub(r'[^A-Z]', '', topic_name.upper())[:4] or 'GEN'}_01",
      "name": "Name of the cognitive trap",
      "trap": "What students mistakenly do or think",
      "correctiveExplanation": "Why this is incorrect and the proper principle to remember"
    }}
  ],
  "practiceQuestions": [
    {{
      "question": "Beginner-friendly formative practice prompt",
      "hint": "Gentle guidance hint",
      "answer": "Solution and explanation"
    }}
  ],
  "diagnosticQuestions": [
    {{
      "id": "diag_q1",
      "questionText": "Multiple-choice diagnostic question evaluating deep understanding",
      "options": [
        {{ "text": "Correct Answer", "isCorrect": true, "explanation": "Why this is correct" }},
        {{ "text": "Incorrect option mapping to common misconception", "isCorrect": false, "misconceptionName": "Name of trap", "explanation": "Why students pick this incorrectly" }},
        {{ "text": "Another common error distractor", "isCorrect": false, "misconceptionName": "Alternative trap", "explanation": "Why this is a misconception" }},
        {{ "text": "Superficial distractor", "isCorrect": false, "misconceptionName": "Slip", "explanation": "Syntax or calculation error" }}
      ]
    }}
  ]
}}
"""

    config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=3500,
        response_mime_type="application/json"
    )

    last_error = None
    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            if response and response.text:
                return clean_json_response(response.text)
        except Exception as exc:
            last_error = exc
            logger.warning(f"Knowledge synthesis model '{model_name}' failed: {exc}. Trying next...")
            continue

    logger.warning(f"All models failed for topic '{topic_name}'. Using structured fallback template.")
    return {
        "topicName": topic_name,
        "unitTitle": unit_title,
        "definitions": [
            f"{topic_name} is a foundational concept within {unit_title} and {subject_name}.",
            "A structured principle used to design, organize, and solve problems systematically."
        ],
        "explanations": [
            f"Understanding {topic_name} requires grasping its core mechanisms, syntax or operational constraints, and practical execution flow."
        ],
        "formulasAndRules": [
            {
                "name": f"Core Principle of {topic_name}",
                "latex": "Concept \\implies Application",
                "explanation": "Guarantees modularity and correctness."
            }
        ],
        "workedExamples": [
            {
                "problem": f"How is {topic_name} applied in a standard introductory scenario?",
                "steps": [
                    "Step 1: Declare the required context and inputs.",
                    "Step 2: Apply the foundational rule.",
                    "Step 3: Verify the output against expected constraints."
                ],
                "finalAnswer": "Consistent, validated result."
            }
        ],
        "realWorldApplications": [
            f"Widely used in production systems, algorithm design, and software engineering for {subject_name}."
        ],
        "commonMisconceptions": [
            {
                "id": f"MIS_{re.sub(r'[^A-Z]', '', topic_name.upper())[:4] or 'GEN'}_01",
                "name": f"Superficial Syntax Confusion in {topic_name}",
                "trap": "Confusing conceptual declaration with operational execution.",
                "correctiveExplanation": "Always separate structural definition from execution context."
            }
        ],
        "practiceQuestions": [
            {
                "question": f"What is the primary objective of applying {topic_name}?",
                "hint": "Think about modularity, safety, and correctness.",
                "answer": "Ensures systematic, reproducible execution and reduces cognitive overhead."
            }
        ],
        "diagnosticQuestions": [
            {
                "id": f"diag_{topic_name[:4].lower()}_1",
                "questionText": f"Which statement best characterizes {topic_name}?",
                "options": [
                    {"text": f"It establishes the foundational operational rules for {topic_name}.", "isCorrect": True, "explanation": "Core definition and standard practice."},
                    {"text": "It is only an optional cosmetic notation.", "isCorrect": False, "misconceptionName": "Superficiality Trap", "explanation": "It is essential for semantic correctness."},
                    {"text": "It can be completely bypassed without side effects.", "isCorrect": False, "misconceptionName": "Shortcut Fallacy", "explanation": "Bypassing leads to logic errors."},
                    {"text": "It only applies to compiled assembly language.", "isCorrect": False, "misconceptionName": "Scope Confusion", "explanation": "Applies across high-level paradigms."}
                ]
            }
        ]
    }

def generate_coverage_diagnostic_questions(
    subject_name: str,
    subject_code: str,
    hierarchy: dict,
    coverage_list: List[dict]
) -> dict:
    """
    Generates tailored diagnostic assessment questions:
    - If student has completed or partially studied topics: questions test THOSE topics and prerequisites.
    - If student has NOT completed any topic (all not_started): generates foundational aptitude baseline questions.
      CRITICAL: Does NOT penalize or score as zero failure!
    """
    # Find topics marked as completed, currently_studying, or partially_covered
    studied_topic_ids = {
        cov["topic_id"] for cov in coverage_list
        if cov.get("coverage_status") in ("completed", "currently_studying", "partially_covered")
    }

    all_topics = []
    units = hierarchy.get("units", []) if hierarchy else []
    for u in units:
        for t in u.get("topics", []):
            all_topics.append({
                "id": t.get("id"),
                "name": t.get("name"),
                "unitTitle": u.get("title", ""),
                "subtopics": t.get("subtopics", []),
                "prerequisites": t.get("prerequisites", [])
            })

    studied_topics = [t for t in all_topics if t["id"] in studied_topic_ids]

    # CASE A: Student has NOT completed any topic yet
    if not studied_topics:
        questions = [
            {
                "id": f"base_{subject_code.lower()}_1",
                "subjectId": hierarchy.get("subjectId", "sub_gen"),
                "topicId": all_topics[0]["id"] if all_topics else "top_base_1",
                "conceptId": "c_base_1",
                "topicName": f"Foundational Aptitude: {subject_name}",
                "questionText": f"In {subject_name}, what is the primary role of structured logic and foundational rules before writing code or complex solutions?",
                "difficulty": "easy",
                "options": [
                    {
                        "id": "opt_base_1",
                        "text": "To establish clear abstractions, state boundaries, and repeatable problem-solving steps.",
                        "isCorrect": True,
                        "explanation": "Correct! Systematic planning prevents logic flaws and provides the foundation for mastery."
                    },
                    {
                        "id": "opt_base_2",
                        "text": "To skip algorithmic design and guess solutions directly.",
                        "isCorrect": False,
                        "misconceptionName": "Heuristic Guessing Trap",
                        "explanation": "Guessing without understanding leads to syntax and runtime defects."
                    },
                    {
                        "id": "opt_base_3",
                        "text": "To memorize syntax without understanding underlying concepts.",
                        "isCorrect": False,
                        "misconceptionName": "Rote Memorization Trap",
                        "explanation": "Rote memorization breaks down when problem requirements vary."
                    },
                    {
                        "id": "opt_base_4",
                        "text": "It has no practical utility in real-world engineering.",
                        "isCorrect": False,
                        "misconceptionName": "Relevance Skepticism",
                        "explanation": "Core principles form the foundation of professional mastery."
                    }
                ]
            },
            {
                "id": f"base_{subject_code.lower()}_2",
                "subjectId": hierarchy.get("subjectId", "sub_gen"),
                "topicId": all_topics[0]["id"] if all_topics else "top_base_2",
                "conceptId": "c_base_2",
                "topicName": f"Introductory Concepts: {subject_name}",
                "questionText": f"When beginning {subject_name}, why is modular decomposition (breaking complex problems into smaller components) essential?",
                "difficulty": "easy",
                "options": [
                    {
                        "id": "opt_base_2_1",
                        "text": "It isolates independent concerns, making testing, reasoning, and debugging manageable.",
                        "isCorrect": True,
                        "explanation": "Exactly! Modularity reduces cognitive load and isolates bugs."
                    },
                    {
                        "id": "opt_base_2_2",
                        "text": "It forces all logic to be written in a single massive unreadable block.",
                        "isCorrect": False,
                        "misconceptionName": "Monolithic Thinking",
                        "explanation": "Monolithic code is hard to maintain and prone to widespread regressions."
                    },
                    {
                        "id": "opt_base_2_3",
                        "text": "It prevents reuse of solutions across different modules.",
                        "isCorrect": False,
                        "misconceptionName": "Isolation Fallacy",
                        "explanation": "Modularity actually maximizes code reuse and extensibility."
                    },
                    {
                        "id": "opt_base_2_4",
                        "text": "It increases execution time exponentially.",
                        "isCorrect": False,
                        "misconceptionName": "Performance Superstition",
                        "explanation": "Clean modular architecture is easily optimized by modern compilers/interpreters."
                    }
                ]
            }
        ]

        # Add 1 topic preview question from the first topic
        if all_topics:
            first_t = all_topics[0]
            questions.append({
                "id": f"base_{subject_code.lower()}_3",
                "subjectId": hierarchy.get("subjectId", "sub_gen"),
                "topicId": first_t["id"],
                "conceptId": "c_base_3",
                "topicName": f"First Topic Preview: {first_t['name']}",
                "questionText": f"Preview of '{first_t['name']}': Which approach best describes how a beginner should start studying this topic?",
                "difficulty": "easy",
                "options": [
                    {
                        "id": "opt_base_3_1",
                        "text": f"Understand core definitions, trace small worked examples step-by-step, and practice basic exercises.",
                        "isCorrect": True,
                        "explanation": "Spot on! Step-by-step grounding ensures solid mastery before advanced applications."
                    },
                    {
                        "id": "opt_base_3_2",
                        "text": "Jump directly to the final exam without reviewing definitions.",
                        "isCorrect": False,
                        "misconceptionName": "Pacing Error",
                        "explanation": "Foundations must come first."
                    },
                    {
                        "id": "opt_base_3_3",
                        "text": "Assume you will never understand it if it feels unfamiliar initially.",
                        "isCorrect": False,
                        "misconceptionName": "Fixed Mindset",
                        "explanation": "Every master was once a beginner. LearnMind AI is here to guide you step by step."
                    },
                    {
                        "id": "opt_base_3_4",
                        "text": "Only read without ever practicing or writing solutions.",
                        "isCorrect": False,
                        "misconceptionName": "Passive Learning Illusion",
                        "explanation": "Active recall and practice are vital for retaining concepts."
                    }
                ]
            })

        return {
            "isBaseline": True,
            "statusMessage": "Foundational Baseline Assessment (No topics marked as completed yet — this is an aptitude baseline, NOT scored as a zero failure!)",
            "evaluatedTopics": ["Foundational Aptitude", all_topics[0]["name"] if all_topics else "Orientation"],
            "questions": questions
        }

    # CASE B: Student HAS completed or partially covered topics!
    questions = []
    evaluated_names = []
    for t in studied_topics[:4]:
        t_id = t["id"]
        t_name = t["name"]
        evaluated_names.append(t_name)
        questions.append({
            "id": f"diag_{t_id}",
            "subjectId": hierarchy.get("subjectId", "sub_gen"),
            "topicId": t_id,
            "conceptId": f"c_{t_id}",
            "topicName": t_name,
            "questionText": f"Diagnostic Check for '{t_name}': In {subject_name}, what is the foundational rule or mechanism governing this topic?",
            "difficulty": "medium",
            "options": [
                {
                    "id": f"opt_{t_id}_1",
                    "text": f"It enforces the core structural contract and semantic rules defined in {t_name}.",
                    "isCorrect": True,
                    "explanation": f"Correct! Demonstrates solid conceptual grasp of {t_name}."
                },
                {
                    "id": f"opt_{t_id}_2",
                    "text": f"It can be omitted without changing the execution semantics of {t_name}.",
                    "isCorrect": False,
                    "misconceptionName": f"MIS_{t_name[:4].upper()}_01",
                    "explanation": f"Misconception: {t_name} is essential for semantic correctness."
                },
                {
                    "id": f"opt_{t_id}_3",
                    "text": "It causes immediate runtime errors in all cases.",
                    "isCorrect": False,
                    "misconceptionName": f"MIS_{t_name[:4].upper()}_02",
                    "explanation": "Misconception: When properly used, it guarantees stability and avoids errors."
                },
                {
                    "id": f"opt_{t_id}_4",
                    "text": "It only applies to deprecated legacy architectures.",
                    "isCorrect": False,
                    "misconceptionName": f"MIS_{t_name[:4].upper()}_03",
                    "explanation": "Misconception: It remains a core best-practice standard."
                }
            ]
        })

    return {
        "isBaseline": False,
        "statusMessage": f"Diagnostic Assessment based on your {len(studied_topics)} covered topic(s).",
        "evaluatedTopics": evaluated_names,
        "questions": questions
    }
