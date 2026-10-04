"""Rebuild browser-readable lectures from the original DOCX files (stdlib only)."""
from pathlib import Path
import html
import json
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"
# Migrate bookmarks from the earlier reader; these are never rendered as sections.
LEGACY_SECTION_STARTS = {
    1: [0, 5, 9, 17, 34], 2: [0, 4, 9, 14, 26, 29],
    3: [0, 3, 5, 12, 18], 4: [0, 2, 10, 15, 19],
    5: [0, 2, 6, 8, 10], 6: [0, 7, 10, 14, 17],
    7: [0, 4, 8, 21, 25], 8: [0, 5, 15, 25, 26],
    9: [0, 4, 13, 15], 10: [0, 6, 9, 12, 13],
    11: [0, 2, 4, 8, 10, 13, 15], 12: [0, 5, 13, 16, 21],
    13: [0, 4, 12, 19, 20, 29], 14: [0, 3, 7, 10, 12],
    15: [0, 3, 5, 7, 10, 12, 16],
}


def value(element, fallback=None):
    return element.get(W + "val", fallback) if element is not None else fallback


def inline(paragraph):
    chunks = []
    for run in paragraph.findall(".//w:r", NS):
        text = "".join(node.text or "" if node.tag == W + "t" else "\n" if node.tag == W + "br" else " " if node.tag == W + "tab" else "" for node in run)
        if not text:
            continue
        escaped = html.escape(text).replace("\n", "<br>")
        for property_name, tag in [("b", "strong"), ("i", "em")]:
            setting = run.find(f"w:rPr/w:{property_name}", NS)
            if setting is not None and value(setting, "1") not in ("0", "false", "off"):
                escaped = f"<{tag}>{escaped}</{tag}>"
        chunks.append(escaped)
    return "".join(chunks).strip()


def import_lecture(number):
    file = ROOT / "Лекции" / f"{number}-лекция.docx"
    with zipfile.ZipFile(file) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        # Fail rather than silently discard new non-text source content.
        assert not document.findall(".//w:tbl", NS), f"Tables need conversion: {file}"
        assert not document.findall(".//w:drawing", NS), f"Images need conversion: {file}"
        numbering = ET.fromstring(archive.read("word/numbering.xml")) if "word/numbering.xml" in archive.namelist() else None
        formats = {}
        if numbering is not None:
            for num in numbering.findall("w:num", NS):
                abstract_id = value(num.find("w:abstractNumId", NS))
                abstract = numbering.find(f"w:abstractNum[@w:abstractNumId='{abstract_id}']", NS)
                if abstract is not None:
                    for level in abstract.findall("w:lvl", NS):
                        marker = value(level.find("w:lvlText", NS), "•")
                        # Word uses Wingdings private-use glyphs for check-mark bullets.
                        marker = {"\uf0fc": "✓"}.get(marker, marker)
                        override = num.find(f"w:lvlOverride[@w:ilvl='{level.get(W + 'ilvl')}']/w:startOverride", NS)
                        formats[(num.get(W + "numId"), level.get(W + "ilvl"))] = {
                            "ordered": value(level.find("w:numFmt", NS), "bullet") != "bullet",
                            "marker": marker,
                            "start": int(value(override, value(level.find("w:start", NS), "1"))),
                        }
        paragraphs = []
        for paragraph in document.findall("w:body/w:p", NS):
            text = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
            if not text:
                continue
            block = {"text": text, "html": inline(paragraph)}
            number_id = value(paragraph.find("w:pPr/w:numPr/w:numId", NS))
            if number_id is not None:
                level = value(paragraph.find("w:pPr/w:numPr/w:ilvl", NS), "0")
                block["list"] = {"id": number_id, **formats.get((number_id, level), {"ordered": False, "marker": "•", "start": 1})}
            paragraphs.append(block)
        title, paragraphs = paragraphs[0]["text"], paragraphs[1:]
        for index, paragraph in enumerate(paragraphs):
            paragraph["id"] = f"lesson-{number}-paragraph-{index + 1}"
        legacy_anchors = {
            f"lesson-{number}-section-{index + 1}": paragraphs[start]["id"]
            for index, start in enumerate(LEGACY_SECTION_STARTS[number])
        }
        # Verify that escaping and inline formatting have preserved every word.
        for paragraph in paragraphs:
            rendered = html.unescape(re.sub(r"<[^>]+>", " ", paragraph["html"]))
            assert re.sub(r"\s+", "", rendered) == re.sub(r"\s+", "", paragraph["text"]), file
        words = sum(len(paragraph["text"].split()) for paragraph in paragraphs)
        return {"title": title, "blocks": paragraphs, "words": words, "legacyAnchors": legacy_anchors}


if __name__ == "__main__":
    lectures = {number: import_lecture(number) for number in range(1, 16)}
    output = ROOT / "assets" / "lecture-texts.js"
    output.parent.mkdir(exist_ok=True)
    output.write_text("// Generated by scripts/import_lectures.py from the original DOCX files.\nwindow.lectureTexts = " + json.dumps(lectures, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Imported {len(lectures)} lectures, {sum(len(l['blocks']) for l in lectures.values())} paragraphs, {sum(l['words'] for l in lectures.values())} words. Verified full text preservation.")
