import os
import re
import json
import logging
from typing import Dict, Any, List, Optional
import pymupdf
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

try:
    from tutor_service import get_gemini_client
except ImportError:
    from backend.tutor_service import get_gemini_client

logger = logging.getLogger("learnmind.syllabus")

# -------------------------------------------------------------
# STRICT PYDANTIC SCHEMAS FOR STRUCTURED EXTRACTION
# -------------------------------------------------------------

class TopicSchema(BaseModel):
    id: str = Field(description="Unique topic ID, e.g. top_1_1")
    name: str = Field(description="Exact academic topic title from document")
    page_number: Optional[int] = Field(None, description="1-based page number where this topic appears in document")
    learning_objectives: List[str] = Field(default_factory=list, description="Explicit learning outcomes")
    prerequisites: List[str] = Field(default_factory=list, description="Prerequisite concepts")
    subtopics: List[str] = Field(default_factory=list, description="Detailed subtopics or concepts covered")

class UnitSchema(BaseModel):
    id: str = Field(description="Unique unit ID, e.g. unit_1")
    unit_number: int = Field(description="Sequential unit number: 1, 2, 3...")
    title: str = Field(description="Full unit title, e.g. 'Unit 1: Object-Oriented Principles'")
    page_number: Optional[int] = Field(None, description="Page number where this unit begins")
    topics: List[TopicSchema]

class SyllabusDeconstructionSchema(BaseModel):
    subject_name: str = Field(description="Detected subject name from document content (e.g. Java, Python, C, C++, Mathematics, Physics, Chemistry, DBMS, Operating Systems, etc.)")
    subject_code: str = Field(description="Course or subject code from document, e.g. 25CS303, CS201, PHY101")
    academic_level: Optional[str] = Field(None, description="Academic level, e.g. Undergraduate, Higher Secondary, Diploma")
    total_units: int
    total_topics: int
    confidence_score: float = Field(ge=0.0, le=1.0, description="Extraction confidence from 0.0 to 1.0 based on clarity and structure")
    confidence_reason: Optional[str] = Field(None, description="Explanation if confidence is lower than 0.85")
    units: List[UnitSchema]

# -------------------------------------------------------------
# PYMUPDF PAGE-CHUNKED EXTRACTION & SCANNED DETECTION
# -------------------------------------------------------------

def extract_text_and_pages_from_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Extracts text page-by-page from binary bytes using PyMuPDF (fitz).
    Measures text density to detect scanned image PDFs.
    Returns:
    {
        "full_text": str with --- PAGE X --- delimiters,
        "pages": [{"page_number": int, "text": str, "char_count": int, "is_scanned": bool}],
        "total_pages": int,
        "is_scanned_document": bool
    }
    """
    if not pdf_bytes:
        raise ValueError("Empty PDF file payload provided.")

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Unable to parse PDF file format: {str(e)}")

    pages_info = []
    scanned_pages_count = 0
    full_text_parts = []

    for page_idx, page in enumerate(doc):
        page_num = page_idx + 1
        page_text = page.get_text("text") or ""
        lines = [line.strip() for line in page_text.splitlines() if line.strip()]
        cleaned_page_text = "\n".join(lines)
        char_count = len(cleaned_page_text)

        # A page is likely a scanned image if it has fewer than 40 extractable characters
        is_scanned = char_count < 40
        if is_scanned:
            scanned_pages_count += 1

        pages_info.append({
            "page_number": page_num,
            "text": cleaned_page_text,
            "char_count": char_count,
            "is_scanned": is_scanned
        })

        if cleaned_page_text:
            full_text_parts.append(f"--- PAGE {page_num} ---\n{cleaned_page_text}")

    total_pages = len(doc)
    doc.close()

    is_scanned_document = total_pages > 0 and (scanned_pages_count / total_pages) > 0.6
    combined_text = "\n\n".join(full_text_parts).strip()

    return {
        "full_text": combined_text,
        "pages": pages_info,
        "total_pages": total_pages,
        "is_scanned_document": is_scanned_document
    }

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Compatibility wrapper returning combined raw text."""
    result = extract_text_and_pages_from_pdf(pdf_bytes)
    return result["full_text"]

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
            candidate = text[start:end+1]
            candidate_cleaned = re.sub(r',\s*([\]}])', r'\1', candidate)
            try:
                return json.loads(candidate_cleaned)
            except json.JSONDecodeError:
                pass
        # Attempt bracket repair if truncated
        open_braces = text.count('{') - text.count('}')
        open_brackets = text.count('[') - text.count(']')
        if open_braces > 0 or open_brackets > 0:
            repaired = text.rstrip(', \r\n\t') + (']' * max(0, open_brackets)) + ('}' * max(0, open_braces))
            try:
                return json.loads(repaired)
            except Exception:
                pass
        raise ValueError("Failed to parse valid structured JSON from AI extraction output.")

# -------------------------------------------------------------
# POST-EXTRACTION VALIDATION & ANTI-HALLUCINATION ENGINE
# -------------------------------------------------------------

def validate_extracted_hierarchy(hierarchy: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
    """
    Validates the extracted syllabus against the source document text:
    1. Detects invented/hallucinated topics by checking word overlap against raw text.
    2. Identifies duplicate topics across units.
    3. Flags empty units or missing topics.
    4. Calculates an empirical confidence score from 0.0 to 1.0.
    5. Flags needs_review=True if confidence < 0.85.
    """
    issues = []
    warnings = []
    raw_text_lower = raw_text.lower()

    subject_name = hierarchy.get("subjectName", "").strip()
    if not subject_name or subject_name.lower() in ("subject", "unknown", "curriculum"):
        issues.append("Subject name could not be reliably identified from document header.")

    units = hierarchy.get("units", [])
    if not units:
        issues.append("No academic units or modules were extracted from the document.")

    total_topics = 0
    grounded_topics_count = 0
    all_topic_names = []

    for u_idx, unit in enumerate(units):
        unit_title = unit.get("title", f"Unit {u_idx + 1}")
        topics = unit.get("topics", [])
        if not topics:
            warnings.append(f"Unit '{unit_title}' contains no discrete topics.")

        for topic in topics:
            total_topics += 1
            t_name = topic.get("name", "").strip()
            if not t_name:
                continue

            all_topic_names.append(t_name.lower())

            # Grounding check: verify that key words from topic title actually appear in source text
            tokens = [t for t in re.findall(r'[a-zA-Z]{3,}', t_name.lower()) if t not in ("and", "the", "for", "with", "into", "from")]
            if tokens:
                found_tokens = [tok for tok in tokens if tok in raw_text_lower]
                overlap_ratio = len(found_tokens) / len(tokens)
                if overlap_ratio >= 0.5:
                    grounded_topics_count += 1
                else:
                    warnings.append(f"Topic '{t_name}' has low token overlap ({overlap_ratio:.0%}) with source document.")
            else:
                grounded_topics_count += 1

    # Duplicate topic detection
    seen_names = set()
    duplicates = set()
    for name in all_topic_names:
        if name in seen_names:
            duplicates.add(name)
        seen_names.add(name)

    if duplicates:
        warnings.append(f"Duplicate topics detected across curriculum: {', '.join(duplicates)}")

    # Compute validation score
    grounding_score = (grounded_topics_count / total_topics) if total_topics > 0 else 0.0
    structure_score = 1.0 if units and total_topics >= 2 else 0.4
    deduction = (len(issues) * 0.25) + (len(warnings) * 0.05)
    final_confidence = max(0.1, min(1.0, (grounding_score * 0.6 + structure_score * 0.4) - deduction))

    # If confidence < 0.85 or issues exist, student review is mandatory
    needs_review = final_confidence < 0.85 or len(issues) > 0 or len(warnings) > 1

    return {
        "isValid": len(issues) == 0,
        "confidenceScore": round(final_confidence, 2),
        "needsReview": needs_review,
        "totalUnits": len(units),
        "totalTopics": total_topics,
        "groundedTopicsCount": grounded_topics_count,
        "issues": issues,
        "warnings": warnings
    }

# -------------------------------------------------------------
# HEURISTIC PARSER (FALLBACK FOR QUOTA EXHAUSTION / OFFLINE)
# -------------------------------------------------------------

def heuristic_syllabus_parser(
    raw_text: str,
    subject_name: str = "",
    subject_code: str = "",
    filename: str = "",
    pages_info: Optional[List[dict]] = None
) -> Dict[str, Any]:
    """
    Intelligent heuristic fallback that parses units, topics, and page references
    directly from document patterns without defaulting to any hardcoded subject.
    Works for any academic subject: Java, Python, C, C++, Math, Physics, Chemistry, DBMS, OS, Networks, etc.
    """
    detected_name = subject_name.strip()
    detected_code = subject_code.strip()

    fn_clean = re.sub(r'\.(pdf|docx|doc|txt)$', '', filename, flags=re.IGNORECASE)
    fn_clean = re.sub(r'[_\-]+', ' ', fn_clean).strip()
    search_string = fn_clean + " " + raw_text[:800]
    code_match = re.search(r'\b([0-9]{2}[A-Z]{2,4}[0-9]{2,4}|[A-Z]{2,4}[- ]?[0-9]{2,4})\b', search_string, re.IGNORECASE)
    if code_match and not detected_code:
        detected_code = code_match.group(1).upper().replace(" ", "-")

    if detected_code:
        fn_clean = re.sub(r'\b' + re.escape(detected_code.replace("-", "")) + r'\b', '', fn_clean, flags=re.IGNORECASE).strip()

    if not detected_name:
        # Check domain-specific keywords dynamically
        lower_sample = (fn_clean + " " + raw_text[:800]).lower()
        if re.search(r'\b(oop|object oriented|java)\b', lower_sample):
            detected_name = "Object-Oriented Programming (Java)"
        elif re.search(r'\b(python)\b', lower_sample):
            detected_name = "Python Programming"
        elif re.search(r'\b(c\+\+|cpp)\b', lower_sample):
            detected_name = "C++ Programming"
        elif re.search(r'\b( c programming|ansi c)\b', lower_sample):
            detected_name = "C Programming"
        elif re.search(r'\b(dsa|data structure)\b', lower_sample):
            detected_name = "Data Structures & Algorithms"
        elif re.search(r'\b(os|operating system)\b', lower_sample):
            detected_name = "Operating Systems"
        elif re.search(r'\b(dbms|database)\b', lower_sample):
            detected_name = "Database Management Systems"
        elif re.search(r'\b(network|computer networks)\b', lower_sample):
            detected_name = "Computer Networks"
        elif re.search(r'\b(physics)\b', lower_sample):
            detected_name = "Engineering Physics"
        elif re.search(r'\b(chemistry)\b', lower_sample):
            detected_name = "Engineering Chemistry"
        elif re.search(r'\b(math|calculus|algebra|discrete)\b', lower_sample):
            detected_name = "Engineering Mathematics"
        else:
            detected_name = re.sub(r'[^a-zA-Z0-9\s]', ' ', fn_clean).strip().title() or "Academic Syllabus"

    unit_pattern = re.compile(
        r'(?:^|\n)(?:UNIT|MODULE|CHAPTER)\s*[-:]?\s*([0-9IVXLCDM]+)[\s:.\-–—]+([^\n]+)',
        re.IGNORECASE
    )

    matches = list(unit_pattern.finditer(raw_text))
    units = []

    # If standard UNIT/MODULE headings not found, check for ALL-CAPS section headers with colons
    if not matches:
        caps_pattern = re.compile(
            r'(?:^|\n)([A-Z][A-Z\s,/&-]{4,60}):\s*([^\n]+(?:\n(?![A-Z][A-Z\s,/&-]{4,60}:)[^\n]+)*)',
            re.MULTILINE
        )
        caps_matches = [
            m for m in caps_pattern.finditer(raw_text)
            if not re.search(r'\b(textbooks?|references?|outcomes?|assessments?|credits?|periods?|hours?|objectives?|experiments?|pattern)\b', m.group(1), re.IGNORECASE)
        ]
        if len(caps_matches) >= 2:
            for idx, match in enumerate(caps_matches):
                unit_title_clean = match.group(1).strip()
                unit_body = match.group(2).strip()

                approx_page = 1
                if pages_info:
                    for p in pages_info:
                        if match.group(0).strip()[:30] in p.get("text", ""):
                            approx_page = p.get("page_number", 1)
                            break

                # Extract topics inside this section
                raw_topics = [t.strip(" -•*;\t\r\n\u200b") for t in re.split(r'[-–—•;]+', unit_body) if len(t.strip(" -•*;\t\r\n\u200b")) > 3]
                topics = []
                for t_idx, topic_str in enumerate(raw_topics[:8]):
                    # Strip trailing hour counts like (6) or [4]
                    clean_top = re.sub(r'\s*\([0-9]+\)\s*$', '', topic_str).strip()
                    if clean_top and len(clean_top) > 2 and not re.match(r'^[0-9\s()]+$', clean_top):
                        topics.append({
                            "id": f"top_{idx + 1}_{t_idx + 1}",
                            "name": clean_top[:70],
                            "page_number": approx_page,
                            "learningObjectives": [f"Understand core mechanisms of {clean_top[:40]}"],
                            "prerequisites": ["Foundational Subject Principles"],
                            "subtopics": [f"{clean_top[:30]} Principles", "Applications & Analysis"]
                        })

                if not topics:
                    topics = [{
                        "id": f"top_{idx + 1}_1",
                        "name": f"Foundations of {unit_title_clean.title()[:40]}",
                        "page_number": approx_page,
                        "learningObjectives": ["Master fundamental principles"],
                        "prerequisites": ["Introductory Concepts"],
                        "subtopics": ["Theoretical Basis", "Implementation"]
                    }]

                units.append({
                    "id": f"unit_{idx + 1}",
                    "unitNumber": idx + 1,
                    "title": f"Unit {idx + 1}: {unit_title_clean.title()}",
                    "page_number": approx_page,
                    "topics": topics
                })

    if matches:
        for idx, match in enumerate(matches):
            unit_num_str = match.group(1).strip()
            unit_title_clean = match.group(2).strip()
            start_pos = match.end()
            end_pos = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw_text)
            unit_body = raw_text[start_pos:end_pos].strip()

            # Find approximate page number for this unit
            approx_page = 1
            if pages_info:
                for p in pages_info:
                    if match.group(0).strip() in p.get("text", ""):
                        approx_page = p.get("page_number", 1)
                        break

            raw_lines = [l.strip(" -•*;\t") for l in unit_body.splitlines() if len(l.strip(" -•*;\t")) > 3]
            topics = []
            for t_idx, line in enumerate(raw_lines[:6]):
                if not re.match(r'^(unit|module|chapter|hours|credits)', line, re.IGNORECASE):
                    topics.append({
                        "id": f"top_{idx + 1}_{t_idx + 1}",
                        "name": line[:70],
                        "page_number": approx_page,
                        "learningObjectives": [f"Understand core mechanisms of {line[:40]}"],
                        "prerequisites": ["Foundational Subject Principles"],
                        "subtopics": [f"{line[:30]} Principles", "Applications & Analysis"]
                    })

            if not topics:
                topics = [{
                    "id": f"top_{idx + 1}_1",
                    "name": f"Foundations of {unit_title_clean[:40]}",
                    "page_number": approx_page,
                    "learningObjectives": ["Master fundamental principles"],
                    "prerequisites": ["Introductory Concepts"],
                    "subtopics": ["Theoretical Basis", "Implementation"]
                }]

            units.append({
                "id": f"unit_{idx + 1}",
                "unitNumber": idx + 1,
                "title": f"Unit {unit_num_str}: {unit_title_clean}",
                "page_number": approx_page,
                "topics": topics
            })
    elif not units:
        # Paragraph fallback
        units = [
            {
                "id": "unit_1",
                "unitNumber": 1,
                "title": f"Unit 1: Fundamentals of {detected_name}",
                "page_number": 1,
                "topics": [
                    {
                        "id": "top_1_1",
                        "name": "Foundational Principles & Syntax",
                        "page_number": 1,
                        "learningObjectives": ["Grasp basic syntax and operational structure"],
                        "prerequisites": ["Introductory Problem Solving"],
                        "subtopics": ["Architecture", "Key Mechanisms"]
                    },
                    {
                        "id": "top_1_2",
                        "name": "Core Implementations & Patterns",
                        "page_number": 1,
                        "learningObjectives": ["Implement standard patterns"],
                        "prerequisites": ["Foundational Principles & Syntax"],
                        "subtopics": ["Standard Patterns", "Practical Usage"]
                    }
                ]
            },
            {
                "id": "unit_2",
                "unitNumber": 2,
                "title": f"Unit 2: Applied Methodologies in {detected_name}",
                "page_number": 2 if pages_info and len(pages_info) > 1 else 1,
                "topics": [
                    {
                        "id": "top_2_1",
                        "name": "Advanced Techniques & Best Practices",
                        "page_number": 2 if pages_info and len(pages_info) > 1 else 1,
                        "learningObjectives": ["Apply advanced methodologies systematically"],
                        "prerequisites": ["Core Implementations & Patterns"],
                        "subtopics": ["Advanced Paradigms", "Error Handling"]
                    }
                ]
            }
        ]

    total_topics = sum(len(u["topics"]) for u in units)
    hierarchy = {
        "subjectName": detected_name,
        "subjectCode": detected_code or "MOD-101",
        "totalUnits": len(units),
        "totalTopics": total_topics,
        "units": units
    }

    validation = validate_extracted_hierarchy(hierarchy, raw_text)
    hierarchy["validation"] = validation
    return hierarchy

# -------------------------------------------------------------
# MAIN SYLLABUS DECONSTRUCTION ENGINE
# -------------------------------------------------------------

def extract_syllabus_hierarchy(
    raw_text: str = "",
    pdf_bytes: Optional[bytes] = None,
    subject_name: Optional[str] = "",
    subject_code: Optional[str] = "",
    filename: Optional[str] = ""
) -> Dict[str, Any]:
    """
    Deconstructs institutional syllabus documents into a clean hierarchical tree.
    Supports PyMuPDF text stream extraction, Gemini native PDF vision fallback for scanned docs,
    strict Pydantic structured output, and anti-hallucination validation.
    """
    pages_info = None
    is_scanned_doc = False

    # Step 1: In-memory PyMuPDF extraction if binary bytes are provided
    if pdf_bytes:
        try:
            pdf_data = extract_text_and_pages_from_pdf(pdf_bytes)
            raw_text = pdf_data["full_text"]
            pages_info = pdf_data["pages"]
            is_scanned_doc = pdf_data["is_scanned_document"]
        except Exception as e:
            logger.warning(f"PyMuPDF binary parse notice: {e}")

    client = get_gemini_client()
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    models_to_try = list(dict.fromkeys([configured_model, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]))

    prompt_instructions = f"""You are the LearnMind AI Syllabus Deconstruction Engine.
Analyze the following institutional syllabus document and extract a strict, clean, hierarchical curriculum structure.

METADATA:
Document Filename: {filename or 'Syllabus_Document.pdf'}
Provided Subject Name: {subject_name or 'Auto-Detect'}
Provided Subject Code: {subject_code or 'Auto-Detect'}

DOCUMENT CONTENT:
\"\"\"
{raw_text[:14000]}
\"\"\"

### CRITICAL REQUIREMENTS:
1. AUTO-DETECT THE SUBJECT AND CODE:
   - Carefully inspect the document title, header, and unit topics.
   - For example:
     * If document is '25CS303 OOP Syllabus.docx.pdf', subject is 'Object-Oriented Programming (Java)' and code is '25CS303'.
     * If document covers Python, subject is 'Python Programming'.
     * If document covers Chemistry, subject is 'Engineering Chemistry'.
     * If document covers Calculus, subject is 'Engineering Mathematics'.
   - NEVER default to Mathematics or Java unless the text explicitly details that subject.
2. Extract all Units / Modules / Chapters hierarchically from the document.
3. Under each Unit, extract all discrete Topics and their Subtopics.
4. For each Topic:
   - Provide a clear, recognizable Topic Name.
   - Record the 1-based page number where this topic appears (look for --- PAGE X --- delimiters).
   - List key Learning Objectives and Prerequisites.
   - List detailed Subtopics.
5. Provide a confidence_score between 0.0 and 1.0 reflecting how clearly the curriculum was stated.
6. Output strict JSON matching the requested schema.
"""

    config = types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=8192,
        response_mime_type="application/json",
        response_schema=SyllabusDeconstructionSchema
    )

    for model_name in models_to_try:
        try:
            logger.info(f"Attempting syllabus deconstruction with model '{model_name}'...")

            # If document is a scanned image PDF and bytes are present, send native PDF part for vision OCR
            if is_scanned_doc and pdf_bytes:
                logger.info("Scanned document detected. Passing PDF binary bytes natively to Gemini vision...")
                pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
                response = client.models.generate_content(
                    model=model_name,
                    contents=[pdf_part, prompt_instructions],
                    config=config
                )
            else:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt_instructions,
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

                    # Override if user explicitly provided a verified subject name
                    if subject_name and subject_name.strip() and subject_name.lower() != "auto-detect":
                        parsed["subjectName"] = subject_name.strip()
                    else:
                        parsed["subjectName"] = parsed.get("subject_name") or parsed.get("subjectName") or "Academic Curriculum"

                    if subject_code and subject_code.strip() and subject_code.lower() != "auto-detect":
                        parsed["subjectCode"] = subject_code.strip()
                    else:
                        parsed["subjectCode"] = parsed.get("subject_code") or parsed.get("subjectCode") or "MOD-101"

                    # Run anti-hallucination and grounding validation
                    validation = validate_extracted_hierarchy(parsed, raw_text)
                    parsed["validation"] = validation
                    return parsed
        except APIError as api_err:
            logger.warning(f"Model '{model_name}' API notice: {api_err.code} - {api_err.message}. Trying next...")
            continue
        except Exception as exc:
            logger.warning(f"Model '{model_name}' execution notice: {exc}. Trying next...")
            continue

    logger.warning("All Gemini models exhausted. Executing heuristic document analyzer fallback.")
    return heuristic_syllabus_parser(
        raw_text=raw_text,
        subject_name=subject_name or "",
        subject_code=subject_code or "",
        filename=filename or "",
        pages_info=pages_info
    )

# -------------------------------------------------------------
# TOPIC KNOWLEDGE SYNTHESIS & COVERAGE-GROUNDED ASSESSMENT
# -------------------------------------------------------------

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
    1. Definitions, 2. Explanations, 3. Formulas/Rules, 4. Worked Examples,
    5. Real-World Applications, 6. Misconceptions, 7. Formative Practice, 8. Diagnostic Questions.
    """
    client = get_gemini_client()
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    models_to_try = list(dict.fromkeys([configured_model, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"]))

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
            logger.warning(f"Knowledge synthesis model '{model_name}' notice: {exc}. Trying next...")
            continue

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
                    {"text": "It only applies to deprecated legacy architectures.", "isCorrect": False, "misconceptionName": "Scope Confusion", "explanation": "Applies across high-level paradigms."}
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
                "pageNumber": t.get("page_number", 1),
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
