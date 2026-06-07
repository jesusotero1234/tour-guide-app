import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    text: str
    boundary: str


def sanitize_text(text: str) -> str:
    cleaned = text
    cleaned = re.sub(r"https?://\S+|www\.\S+", " [link] ", cleaned)
    cleaned = re.sub(r"\[[^\]]*\]", " ", cleaned)
    cleaned = re.sub(r"\{[^\}]*\}", " ", cleaned)
    cleaned = re.sub(r"(\d+)\s*km\b", r"\1 kilometers", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\d+)\s*m\b", r"\1 meters", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bSt\.\s", "Saint ", cleaned)
    cleaned = re.sub(r"\bAve\.\s", "Avenue ", cleaned)
    cleaned = "".join(
        ch
        for ch in cleaned
        if (
            ch == "\n"
            or (
                ord(ch) >= 32
                and unicodedata.category(ch) not in {"So", "Cn", "Cc", "Cs"}
            )
        )
    )
    cleaned = re.sub(r"#+\s+(.*)", r"\1", cleaned)
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
    cleaned = re.sub(r"---+", "", cleaned)
    cleaned = re.sub(r"^\s*[\*\-•]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*\d+[\.)]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*>\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"\r\n?", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"([^\n])\n([^\n])", r"\1 \2", cleaned)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)
    cleaned = re.sub(r"\n\s+", "\n", cleaned)
    cleaned = re.sub(r"\s+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _split_long_sentence(sentence: str, max_chars: int) -> list[TextChunk]:
    clause_parts = [part.strip() for part in re.split(r"(?<=[,;:])\s+", sentence) if part.strip()]
    if len(clause_parts) <= 1:
        return _hard_split_sentence(sentence, max_chars)

    chunks: list[TextChunk] = []
    buf = ""
    for part in clause_parts:
        candidate = f"{buf} {part}".strip()
        if len(candidate) > max_chars and buf:
            chunks.append(TextChunk(text=buf, boundary="split"))
            buf = part
        else:
            buf = candidate
    if buf:
        chunks.append(TextChunk(text=buf, boundary="split"))
    return chunks


def _hard_split_sentence(sentence: str, max_chars: int) -> list[TextChunk]:
    words = sentence.split()
    if not words:
        return []

    chunks: list[TextChunk] = []
    buf = words[0]
    for word in words[1:]:
        candidate = f"{buf} {word}".strip()
        if len(candidate) > max_chars and buf:
            chunks.append(TextChunk(text=buf, boundary="split"))
            buf = word
        else:
            buf = candidate
    if buf:
        chunks.append(TextChunk(text=buf, boundary="split"))
    return chunks


def chunk_text(text: str, max_chars: int = 360) -> list[TextChunk]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    out: list[TextChunk] = []

    for paragraph_index, paragraph in enumerate(paragraphs):
        sentences = [part.strip() for part in re.split(r"(?<=[\.\!\?])\s+", paragraph) if part.strip()]
        paragraph_chunks: list[TextChunk] = []
        buf = ""

        for sentence in sentences:
            if len(sentence) > max_chars:
                if buf:
                    paragraph_chunks.append(TextChunk(text=buf, boundary="sentence"))
                    buf = ""
                paragraph_chunks.extend(_split_long_sentence(sentence, max_chars))
                continue

            candidate = f"{buf} {sentence}".strip()
            if len(candidate) > max_chars and buf:
                paragraph_chunks.append(TextChunk(text=buf, boundary="sentence"))
                buf = sentence
            else:
                buf = candidate

        if buf:
            paragraph_chunks.append(TextChunk(text=buf, boundary="sentence"))

        if paragraph_chunks:
            last_boundary = "paragraph" if paragraph_index < len(paragraphs) - 1 else "sentence"
            last_chunk = paragraph_chunks[-1]
            paragraph_chunks[-1] = TextChunk(text=last_chunk.text, boundary=last_boundary)
            out.extend(paragraph_chunks)

    return out
