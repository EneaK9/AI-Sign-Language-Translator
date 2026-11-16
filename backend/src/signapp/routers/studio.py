import math
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from signapp.deps import get_session
from signapp.models import Clip, Lemma, Sign, SignOut
from signapp.pipeline.clean import clean_clip
from signapp.pipeline.extract import extract_video, store_clip
from signapp.services.albanian import normalize_text, slug
from signapp.services.serialize import dump_topics, sign_out

router = APIRouter(prefix="/v1/studio", tags=["studio"])

MAX_UPLOAD = 30 * 1024 * 1024
VIDEO_TYPES = {".mp4", ".webm", ".mov"}


class SignPatch(BaseModel):
    gloss: str | None = Field(default=None, min_length=1, max_length=80)
    lemmas: list[str] | None = Field(default=None, max_length=20)
    topics: list[str] | None = Field(default=None, max_length=12)
    notes: str | None = Field(default=None, max_length=500)
    status: Literal["draft", "approved"] | None = None


class ClipPatch(BaseModel):
    trim_start: int | None = Field(default=None, ge=0)
    trim_end: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=500)
    review: Literal["pending", "approved", "needs_fix"] | None = None
    dominant_hand: Literal["left", "right"] | None = None


class RecordIn(BaseModel):
    gloss: str = Field(min_length=1, max_length=80)
    lemmas: list[str] = Field(min_length=1, max_length=20)
    topics: list[str] = Field(default_factory=list, max_length=12)
    notes: str = Field(default="", max_length=500)
    kind: Literal["sign", "phrase", "number"] = "sign"
    sign_id: str | None = Field(default=None, max_length=80)
    fps: float = Field(default=30, gt=1, le=60)
    frames: list[dict[str, Any]] = Field(min_length=5, max_length=900)
    trim_start: int | None = Field(default=None, ge=0)
    trim_end: int | None = Field(default=None, ge=0)


def _points(value: Any, count: int) -> list[list[float]] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) != count:
        raise HTTPException(status_code=400, detail="landmark count is wrong")
    cleaned: list[list[float]] = []
    for point in value:
        if not isinstance(point, (list, tuple)) or len(point) < 3:
            raise HTTPException(status_code=400, detail="landmark point is wrong")
        coords: list[float] = []
        for raw in point[:3]:
            try:
                number = float(raw)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="landmark is not a number") from exc
            if not math.isfinite(number) or abs(number) > 50:
                raise HTTPException(status_code=400, detail="landmark is out of range")
            coords.append(round(number, 5))
        cleaned.append(coords)
    return cleaned


def _face(value: Any) -> dict[str, float]:
    if not value:
        return {}
    if not isinstance(value, dict) or len(value) > 80:
        raise HTTPException(status_code=400, detail="face payload is wrong")
    cleaned: dict[str, float] = {}
    for name, raw in value.items():
        if not isinstance(name, str) or len(name) > 40:
            continue
        try:
            score = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(score):
            cleaned[name] = round(min(1.0, max(0.0, score)), 4)
    return cleaned


def _frames(raw_frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []
    for raw in raw_frames:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="frame is wrong")
        head = raw.get("head") or [0.0, 0.0, 0.0]
        if not isinstance(head, list) or len(head) < 3:
            head = [0.0, 0.0, 0.0]
        frames.append(
            {
                "pose": _points(raw.get("pose"), 33),
                "lh": _points(raw.get("lh"), 21),
                "rh": _points(raw.get("rh"), 21),
                "face": _face(raw.get("face")),
                "head": [float(head[0]), float(head[1]), float(head[2])],
            }
        )
    return frames


def _claim_lemmas(session: Session, sign_id: str, lemmas: list[str]) -> None:
    for lemma in lemmas:
        text = normalize_text(lemma)
        if not text or len(text) > 80:
            raise HTTPException(status_code=400, detail="lemma is empty or too long")
        existing = session.exec(select(Lemma).where(Lemma.text == text)).first()
        if existing and existing.sign_id != sign_id:
            raise HTTPException(status_code=409, detail=f"word already used: {text}")


def _ensure_sign(session: Session, body: RecordIn) -> Sign:
    sign_id = body.sign_id or f"gjshsh-sign-{slug(body.gloss)}"
    lemmas = [normalize_text(lemma) for lemma in body.lemmas if normalize_text(lemma)]
    if not lemmas:
        raise HTTPException(status_code=400, detail="at least one word is required")
    _claim_lemmas(session, sign_id, lemmas)
    sign = session.get(Sign, sign_id)
    if sign is None:
        if body.sign_id:
            raise HTTPException(status_code=404, detail="sign not found")
        sign = Sign(
            id=sign_id,
            kind=body.kind,
            gloss=body.gloss.strip(),
            topics=dump_topics(body.topics),
            notes=body.notes,
            status="draft",
        )
        session.add(sign)
        session.commit()
    else:
        sign.gloss = body.gloss.strip()
        sign.topics = dump_topics(body.topics)
        sign.notes = body.notes
        session.add(sign)
        session.commit()
    current = session.exec(select(Lemma).where(Lemma.sign_id == sign.id)).all()
    current_text = {row.text for row in current}
    for lemma in lemmas:
        if lemma not in current_text:
            session.add(Lemma(sign_id=sign.id, text=lemma))
    session.commit()
    return sign


@router.get("/signs", response_model=list[SignOut])
def list_signs(session: Session = Depends(get_session)) -> list[SignOut]:
    signs = session.exec(select(Sign).order_by(Sign.gloss)).all()
    return [sign_out(session, sign) for sign in signs]


@router.post("/clips", response_model=SignOut)
def record_clip(
    body: RecordIn,
    request: Request,
    session: Session = Depends(get_session),
) -> SignOut:
    sign = _ensure_sign(session, body)
    payload = clean_clip({"fps": body.fps, "source": "webcam", "frames": _frames(body.frames)})
    frame_count = len(payload["frames"])
    if body.trim_start is not None:
        payload["meta"]["trimStart"] = min(body.trim_start, max(0, frame_count - 1))
    if body.trim_end is not None:
        payload["meta"]["trimEnd"] = min(max(body.trim_end, payload["meta"]["trimStart"] + 1), frame_count)
    relative = f"clips/gjshsh/sign/{slug(sign.id)}-{sign.id[-6:]}.json"
    store_clip(session, request.app.state.settings, sign.id, relative, payload)
    session.refresh(sign)
    return sign_out(session, sign)


@router.post("/import", response_model=SignOut)
async def import_video(
    request: Request,
    session: Session = Depends(get_session),
    file: UploadFile = File(...),
    gloss: str = Form(min_length=1, max_length=80),
    lemmas: str = Form(min_length=1, max_length=200),
    topics: str = Form(default=""),
    notes: str = Form(default="", max_length=500),
) -> SignOut:
    name = (file.filename or "").lower()
    suffix = "." + name.rsplit(".", 1)[-1] if "." in name else ""
    if suffix not in VIDEO_TYPES:
        raise HTTPException(status_code=400, detail="video must be mp4, webm, or mov")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="video is larger than 30 MB")
    settings = request.app.state.settings
    folder = settings.videos_dir / "gjshsh" / "uploads"
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / f"{slug(gloss)}{suffix}"
    destination.write_bytes(data)
    body = RecordIn(
        gloss=gloss,
        lemmas=[part.strip() for part in lemmas.split(",") if part.strip()],
        topics=[part.strip() for part in topics.split(",") if part.strip()],
        notes=notes,
        frames=[{"pose": None}] * 5,
    )
    sign = _ensure_sign(session, body)
    try:
        payload = extract_video(destination, settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail="could not read that video") from exc
    relative = f"clips/gjshsh/sign/{slug(sign.id)}.json"
    store_clip(session, settings, sign.id, relative, payload)
    return sign_out(session, sign)


@router.patch("/signs/{sign_id}", response_model=SignOut)
def update_sign(sign_id: str, body: SignPatch, session: Session = Depends(get_session)) -> SignOut:
    sign = session.get(Sign, sign_id)
    if sign is None:
        raise HTTPException(status_code=404, detail="sign not found")
    if body.gloss is not None:
        sign.gloss = body.gloss.strip()
    if body.notes is not None:
        sign.notes = body.notes
    if body.topics is not None:
        sign.topics = dump_topics(body.topics)
    if body.status is not None:
        sign.status = body.status
    if body.lemmas is not None:
        lemmas = [normalize_text(lemma) for lemma in body.lemmas if normalize_text(lemma)]
        _claim_lemmas(session, sign.id, lemmas)
        for row in session.exec(select(Lemma).where(Lemma.sign_id == sign.id)).all():
            session.delete(row)
        for lemma in lemmas:
            session.add(Lemma(sign_id=sign.id, text=lemma))
    session.add(sign)
    session.commit()
    return sign_out(session, sign)


@router.patch("/clips/{clip_id}", response_model=SignOut)
def update_clip(clip_id: int, body: ClipPatch, session: Session = Depends(get_session)) -> SignOut:
    clip = session.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="clip not found")
    if body.trim_start is not None:
        clip.trim_start = min(body.trim_start, max(0, clip.frames - 1))
    if body.trim_end is not None:
        clip.trim_end = min(body.trim_end, clip.frames)
    if clip.trim_end <= clip.trim_start:
        clip.trim_end = min(clip.frames, clip.trim_start + 1)
    if body.note is not None:
        clip.note = body.note
    if body.review is not None:
        clip.review = body.review
        if body.review == "approved":
            sign = session.get(Sign, clip.sign_id)
            if sign and sign.kind != "letter":
                sign.status = "approved"
                session.add(sign)
    if body.dominant_hand is not None:
        clip.dominant_hand = body.dominant_hand
    session.add(clip)
    session.commit()
    sign = session.get(Sign, clip.sign_id)
    if sign is None:
        raise HTTPException(status_code=404, detail="sign not found")
    return sign_out(session, sign)


@router.delete("/signs/{sign_id}")
def delete_sign(sign_id: str, request: Request, session: Session = Depends(get_session)) -> dict[str, bool]:
    sign = session.get(Sign, sign_id)
    if sign is None:
        raise HTTPException(status_code=404, detail="sign not found")
    if sign.kind == "letter":
        raise HTTPException(status_code=403, detail="alphabet letters stay in the lexicon")
    settings = request.app.state.settings
    clips = session.exec(select(Clip).where(Clip.sign_id == sign.id)).all()
    for clip in clips:
        file_path = (settings.data_dir / clip.path).resolve()
        if file_path.is_file() and file_path.is_relative_to(settings.clips_dir.resolve()):
            file_path.unlink()
        session.delete(clip)
    for lemma in session.exec(select(Lemma).where(Lemma.sign_id == sign.id)).all():
        session.delete(lemma)
    session.delete(sign)
    session.commit()
    return {"ok": True}
