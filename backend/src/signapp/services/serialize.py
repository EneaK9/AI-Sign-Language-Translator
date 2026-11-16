import json

from sqlmodel import Session, select

from signapp.models import Clip, ClipOut, Lemma, Sign, SignOut


def topic_list(raw: str) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return [part for part in raw.split(",") if part]
    if isinstance(parsed, list):
        return [str(item) for item in parsed]
    return []


def dump_topics(topics: list[str]) -> str:
    cleaned = [topic.strip() for topic in topics if topic.strip()]
    return json.dumps(cleaned, ensure_ascii=False)


def clip_out(clip: Clip) -> ClipOut:
    return ClipOut(
        id=clip.id or 0,
        url=f"/media/clips/{clip.path.removeprefix('clips/')}",
        fps=clip.fps,
        frames=clip.frames,
        trim_start=clip.trim_start,
        trim_end=clip.trim_end,
        dominant_hand=clip.dominant_hand,
        source=clip.source,
        quality=clip.quality,
        note=clip.note,
        review=clip.review,
    )


def sign_out(session: Session, sign: Sign) -> SignOut:
    lemmas = session.exec(select(Lemma).where(Lemma.sign_id == sign.id)).all()
    clips = session.exec(select(Clip).where(Clip.sign_id == sign.id)).all()
    return SignOut(
        id=sign.id,
        language=sign.language,
        kind=sign.kind,
        gloss=sign.gloss,
        topics=topic_list(sign.topics),
        notes=sign.notes,
        status=sign.status,
        lemmas=[row.text for row in lemmas],
        clips=[clip_out(row) for row in clips],
    )


def best_clip(clips: list[ClipOut]) -> ClipOut | None:
    if not clips:
        return None
    approved = [clip for clip in clips if clip.review == "approved"]
    pool = approved or clips
    return max(pool, key=lambda clip: clip.id)
