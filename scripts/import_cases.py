"""Rebuild case exercises without rewriting the original document text."""
import argparse
import io
import json
import os
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"


def read_source(path):
    try:
        return path.read_bytes()
    except PermissionError:
        if os.name != "nt":
            raise
        # Word may hold the document open. Share its handle without changing it.
        import ctypes
        from ctypes import wintypes
        import msvcrt
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                      wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD,
                                      wintypes.HANDLE]
        kernel.CreateFileW.restype = wintypes.HANDLE
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.CreateFileW(str(path), 0x80000000, 7, None, 3, 0x80, None)
        if handle == wintypes.HANDLE(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
        except Exception:
            kernel.CloseHandle(handle)
            raise
        with os.fdopen(descriptor, "rb") as source:
            return source.read()


def source_from_docx(path):
    with zipfile.ZipFile(io.BytesIO(read_source(path))) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        numbering = ET.fromstring(archive.read("word/numbering.xml")) if "word/numbering.xml" in archive.namelist() else None
    for tag in ("tbl", "drawing", "pict", "object"):
        assert not document.findall(f".//w:{tag}", NS), f"Unsupported content ({tag}): {path}"
    paragraphs, paragraph_numbers, counters = [], [], {}
    for paragraph in document.findall("w:body/w:p", NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
        number = None
        properties = paragraph.find("w:pPr/w:numPr", NS)
        if properties is not None:
            num_id = properties.find("w:numId", NS).get(W + "val")
            level_id = properties.find("w:ilvl", NS).get(W + "val")
            definition = numbering.find(f'w:num[@w:numId="{num_id}"]', NS)
            abstract_id = definition.find("w:abstractNumId", NS).get(W + "val")
            level = numbering.find(f'w:abstractNum[@w:abstractNumId="{abstract_id}"]/w:lvl[@w:ilvl="{level_id}"]', NS)
            assert level_id == "0" and level.find("w:numFmt", NS).get(W + "val") == "decimal"
            assert level.find("w:lvlText", NS).get(W + "val") == "%1."
            assert not definition.findall("w:lvlOverride", NS), f"Numbering override requires conversion: {path}"
            key = (num_id, level_id)
            number = counters.get(key, int(level.find("w:start", NS).get(W + "val")) - 1) + 1
            counters[key] = number
        if text:
            paragraphs.append(text)
            paragraph_numbers.append(number)
    return paragraphs, paragraph_numbers


def paragraphs_from_docx(path):
    return source_from_docx(path)[0]


def parse_cases(paragraphs, paragraph_numbers=None):
    cases = []
    def new_case(title=""):
        return {"sourceTitle": title, "scenario": [], "questionHeading": "", "prompts": [],
                "sourceAnswers": [], "promptNumbers": [], "sourceAnswerNumbers": []}
    current = new_case()
    phase = "scenario"
    if paragraph_numbers is None:
        paragraph_numbers = [None] * len(paragraphs)
    assert len(paragraph_numbers) == len(paragraphs)
    for text, number in zip(paragraphs, paragraph_numbers):
        if re.fullmatch(r"Кейс\s*\d+", text):
            if current["scenario"] or current["prompts"]:
                cases.append(current)
            current = new_case(text)
            phase = "scenario"
            continue
        if re.match(r"^Сұрақ\s*:", text):
            phase = "prompts"
            if re.fullmatch(r"Сұрақ\s*:\s*", text):
                current["questionHeading"] = text
                continue
        elif re.match(r"^(?:Жауап|Жауабы)\s*:", text):
            phase = "sourceAnswers"
        if phase == "prompts":
            if current["prompts"] and not current["prompts"][-1][-1].endswith("?"):
                assert number is None, "A numbered paragraph cannot continue a question"
                current["prompts"][-1].append(text)
            else:
                current["prompts"].append([text])
                current["promptNumbers"].append(number)
        else:
            current[phase].append(text)
            if phase == "sourceAnswers":
                current["sourceAnswerNumbers"].append(number)
            else:
                assert number is None, "Numbered scenario requires conversion"
    if current["scenario"] or current["prompts"]:
        cases.append(current)
    return cases


def answer_groups(case, lesson, case_index):
    paragraphs = case["sourceAnswers"].copy()
    if re.fullmatch(r"(?:Жауап|Жауабы)\s*:\s*", paragraphs[0]):
        paragraphs.pop(0)
    else:
        paragraphs[0] = re.sub(r"^(?:Жауап|Жауабы)\s*:\s*", "", paragraphs[0])
    count = len(case["prompts"])
    if count == 1:
        return [paragraphs]
    if (lesson, case_index) == (14, 2):
        assert len(paragraphs) == 4
        return [paragraphs[:2], paragraphs[2:]]
    assert len(paragraphs) == count, (lesson, case_index, "Answer count")
    return [[text] for text in paragraphs]


def build(sources, distractors, numbering=None):
    data = {}
    total_questions = 0
    for lesson in range(1, 16):
        paragraphs = sources[str(lesson)]
        parsed = parse_cases(paragraphs, numbering[str(lesson)] if numbering else None)
        assert len(parsed) == len(distractors[str(lesson)])
        data[str(lesson)] = []
        restored = []
        for case_index, case in enumerate(parsed, 1):
            if case["sourceTitle"]:
                restored.append(case["sourceTitle"])
            restored.extend(case["scenario"])
            if case["questionHeading"]:
                restored.append(case["questionHeading"])
            for prompt in case["prompts"]:
                restored.extend(prompt)
            restored.extend(case["sourceAnswers"])
            answers = answer_groups(case, lesson, case_index)
            wrong_answers = distractors[str(lesson)][case_index - 1]
            assert len(answers) == len(wrong_answers)
            questions = []
            for prompt, answer, wrong, prompt_number in zip(case["prompts"], answers, wrong_answers, case["promptNumbers"]):
                # List markers belong to document formatting; retain every word of the answer.
                if len(answers) > 1:
                    answer[0] = re.sub(r"^\d+[.)]\s*", "", answer[0])
                original_answer = "\n".join(answer)
                assert len(wrong) == 3 and len(set(wrong + [original_answer])) == 4
                question = {"prompt": "\n".join(prompt), "options": [original_answer, *wrong], "answer": 0}
                if prompt_number is not None:
                    question["promptNumber"] = prompt_number
                questions.append(question)
                total_questions += 1
            data[str(lesson)].append({
                "id": case_index,
                "title": case["sourceTitle"] or f"Кейс {case_index}",
                "sourceTitle": case["sourceTitle"],
                "scenario": case["scenario"],
                "questionHeading": case["questionHeading"],
                "questions": questions,
                "sourceAnswers": case["sourceAnswers"],
            })
            if any(number is not None for number in case["sourceAnswerNumbers"]):
                data[str(lesson)][-1]["sourceAnswerNumbers"] = case["sourceAnswerNumbers"]
        assert restored == paragraphs, f"Original text changed in lecture {lesson}"
    assert total_questions == 43
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-snapshot", type=Path, help="Previously extracted paragraphs when Word holds a document open")
    args = parser.parse_args()
    live = {str(number): source_from_docx(ROOT / "Кейсы" / f"{number}-кейс.docx") for number in range(1, 16)}
    numbering = {key: content[1] for key, content in live.items()}
    if args.source_snapshot:
        # Refuse an outdated snapshot if a source document has since changed.
        snapshot_time = args.source_snapshot.stat().st_mtime
        assert all((ROOT / "Кейсы" / f"{number}-кейс.docx").stat().st_mtime <= snapshot_time for number in range(1, 16))
        sources = json.loads(args.source_snapshot.read_text(encoding="utf-8-sig"))
        assert sources == {key: content[0] for key, content in live.items()}, "Snapshot differs from current source documents"
    else:
        sources = {key: content[0] for key, content in live.items()}
    distractors = json.loads((ROOT / "scripts" / "case_distractors.json").read_text(encoding="utf-8-sig"))
    data = build(sources, distractors, numbering)
    output = ROOT / "assets" / "case-exercises.js"
    output.write_text("// Original case text from Word; only the three distractors per question are added.\nwindow.caseExercises = "
                      + json.dumps(data, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print("Restored all original paragraphs: 31 cases, 43 questions, 129 added distractors. No source text rewritten.")
