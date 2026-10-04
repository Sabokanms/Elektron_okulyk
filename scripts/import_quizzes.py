"""Import original questions, choices and answer keys from the supplied Word files."""
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
LETTERS = {"A": 0, "А": 0, "B": 1, "В": 1, "C": 2, "С": 2, "D": 3}
CHOICE = re.compile(r"(?<!\S)([AАBВCСD])\)\s*")
ANSWER = re.compile(r"Дұрыс (?:жауап|жауабы|жауаб)\s*:\s*([AАBВCСD])\s*")


def read_paragraphs(path):
    with zipfile.ZipFile(path) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
    assert not document.findall(".//w:tbl", NS), f"Unexpected table: {path}"
    texts = ["".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
             for paragraph in document.findall("w:body/w:p", NS)]
    return [text for text in texts if text]


def parse_quiz(paragraphs, lesson):
    headings = [index for index, text in enumerate(paragraphs)
                if re.fullmatch(r"\d+-тақырып бойынша бақылау тест сұрақтары", text)]
    assert len(headings) <= 1
    start = headings[0] + 1 if headings else 0
    review = None
    if headings and headings[0]:
        preface = paragraphs[:headings[0]]
        assert len(preface) == 11 and preface[0].endswith("бақылау сұрақтары")
        review = {"title": preface[0], "questions": preface[1:]}

    questions, pending = [], []
    for text in paragraphs[start:]:
        answer = ANSWER.fullmatch(text)
        if not answer:
            pending.append(text)
            continue
        body = "\n".join(pending)
        markers = list(CHOICE.finditer(body))
        assert [LETTERS[match[1]] for match in markers] == [0, 1, 2, 3], (lesson, body)
        prompt = re.sub(r"^\d+[.)]\s*", "", body[:markers[0].start()].strip())
        options = [body[marker.end():markers[index + 1].start() if index < 3 else len(body)].strip()
                   for index, marker in enumerate(markers)]
        assert prompt and len(set(options)) == 4 and all(options)
        questions.append({"id": f"l{lesson:02d}-q{len(questions) + 1:02d}", "type": "single",
                          "q": prompt, "options": options, "answer": LETTERS[answer[1]]})
        pending = []
    assert not pending and len(questions) == 10, (lesson, pending, len(questions))
    return questions, review, paragraphs[headings[0]] if headings else None


def read_assignment(path, marker):
    text = path.read_text(encoding="utf-8-sig")
    start = text.index(marker) + len(marker)
    data, length = json.JSONDecoder().raw_decode(text[start:])
    return text, start, length, data


if __name__ == "__main__":
    path = ROOT / "lectures.js"
    text, start, length, course = read_assignment(path, "const courseData = ")
    _, _, _, lectures = read_assignment(ROOT / "assets" / "lecture-texts.js", "window.lectureTexts = ")
    changed_questions = changed_options = changed_keys = review_count = 0
    for lesson in course:
        if lesson["type"] != "lecture":
            continue
        number = lesson["id"]
        quiz, review, title = parse_quiz(read_paragraphs(ROOT / lesson["quizSource"]), number)
        for before, after in zip(lesson["quiz"], quiz):
            changed_questions += before["q"] != after["q"]
            changed_options += sum(a != b for a, b in zip(before["options"], after["options"]))
            changed_keys += before["answer"] != after["answer"]
        lesson["quiz"] = quiz
        lesson["title"] = lectures[str(number)]["title"]
        if title:
            lesson["quizTitle"] = title
        else:
            lesson.pop("quizTitle", None)
        # These former web-development assignments are unused; the original labs have their own asset.
        lesson.pop("labWork", None)
        if review:
            lesson["quizReview"] = review
            review_count += len(review["questions"])
        else:
            lesson.pop("quizReview", None)
    encoded = json.dumps(course, ensure_ascii=False, indent=4).replace("\n", "\n    ")
    output = text[:start] + encoded + text[start + length:]
    output = output.replace(
        "// Тесттер жобаға берілген 1–15 нұсқадан бейімделді; әр дәрісте 10 сұрақ.\n"
        "    // Нақтыланған құқықтық ережелер: https://old.adilet.zan.kz/kaz/docs/K940001000_",
        "// Тест сұрақтары, жауап нұсқалары және дұрыс жауаптар Word файлдарынан өзгеріссіз алынды.")
    path.write_text(output, encoding="utf-8")
    print(f"Imported 150 original questions, 600 choices, 150 answer keys and {review_count} review questions.")
    print(f"Restored text/formatting in {changed_questions} prompts and {changed_options} choices; "
          f"restored {changed_keys} answer keys.")
