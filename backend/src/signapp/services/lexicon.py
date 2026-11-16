from rapidfuzz import fuzz
from sqlmodel import Session, select

from signapp.models import Lemma, SearchHit, Sign
from signapp.services.albanian import normalize_text, stem
from signapp.services.serialize import sign_out

FUZZY_MIN = 88


def _lemma_map(session: Session) -> list[tuple[str, Sign]]:
    rows = session.exec(select(Lemma, Sign).join(Sign, Lemma.sign_id == Sign.id)).all()
    return [(lemma.text, sign) for lemma, sign in rows]


def find_sign(session: Session, word: str) -> tuple[Sign, str, float] | None:
    query = normalize_text(word)
    if not query:
        return None
    pairs = _lemma_map(session)
    for text, sign in pairs:
        if text == query:
            return sign, text, 100.0
    stemmed = stem(query)
    if stemmed:
        for text, sign in pairs:
            if text == stemmed:
                return sign, text, 95.0
    if len(query) < 4:
        return None
    best: tuple[Sign, str, float] | None = None
    for text, sign in pairs:
        if abs(len(text) - len(query)) > 4:
            continue
        score = float(fuzz.ratio(query, text))
        if score >= FUZZY_MIN and (best is None or score > best[2]):
            best = (sign, text, score)
    return best


def search(session: Session, query: str, topic: str | None, limit: int) -> list[SearchHit]:
    cleaned = normalize_text(query)
    topic_norm = normalize_text(topic) if topic else ""
    hits: list[SearchHit] = []
    seen: set[str] = set()
    if cleaned:
        found = find_sign(session, cleaned)
        if found:
            sign, matched, score = found
            if not topic_norm or topic_norm in sign.topics:
                hits.append(SearchHit(sign=sign_out(session, sign), score=score, matched=matched))
                seen.add(sign.id)
    pairs = _lemma_map(session)
    for text, sign in pairs:
        if sign.id in seen:
            continue
        if topic_norm and topic_norm not in sign.topics:
            continue
        if not cleaned:
            score = 70.0
        elif text == cleaned:
            score = 100.0
        elif cleaned in text or (len(text) >= 3 and text in cleaned):
            score = 80.0
        elif len(cleaned) >= 4 and len(text) >= 4 and fuzz.partial_ratio(cleaned, text) >= 80:
            score = float(fuzz.partial_ratio(cleaned, text))
        else:
            continue
        hits.append(SearchHit(sign=sign_out(session, sign), score=score, matched=text))
        seen.add(sign.id)
    hits.sort(
        key=lambda hit: (hit.score, hit.sign.kind in {"sign", "phrase"}),
        reverse=True,
    )
    return hits[:limit]
