from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, select

from signapp.config import Settings
from signapp.deps import get_session
from signapp.models import AlphabetItem, FingerspellOut, LetterHit, SearchHit, Sign, SignOut
from signapp.services.albanian import ALPHABET, LETTER_FILES, letter_id, to_letters
from signapp.services.lexicon import search
from signapp.services.serialize import best_clip, sign_out

router = APIRouter(prefix="/v1", tags=["signs"])


def _settings(request: Request) -> Settings:
    return request.app.state.settings


@router.get("/signs/search", response_model=list[SearchHit])
def search_signs(
    q: str = "",
    topic: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[SearchHit]:
    return search(session, q, topic, limit)


@router.get("/signs/{sign_id}", response_model=SignOut)
def get_sign(sign_id: str, session: Session = Depends(get_session)) -> SignOut:
    sign = session.get(Sign, sign_id)
    if sign is None:
        raise HTTPException(status_code=404, detail="sign not found")
    return sign_out(session, sign)


@router.get("/alphabet", response_model=list[AlphabetItem])
def alphabet(request: Request, session: Session = Depends(get_session)) -> list[AlphabetItem]:
    settings = _settings(request)
    items: list[AlphabetItem] = []
    for letter in ALPHABET:
        sign = session.get(Sign, letter_id(letter))
        if sign is None:
            continue
        payload = sign_out(session, sign)
        video_name = LETTER_FILES[letter]
        video_path = settings.videos_dir / "gjshsh" / "alphabet" / video_name
        items.append(
            AlphabetItem(
                letter=letter,
                sign_id=sign.id,
                video_url=f"/media/videos/gjshsh/alphabet/{video_name}" if video_path.is_file() else None,
                clip=best_clip(payload.clips),
            )
        )
    return items


@router.get("/fingerspell", response_model=FingerspellOut)
def fingerspell(text: str, session: Session = Depends(get_session)) -> FingerspellOut:
    letters = to_letters(text)
    hits: list[LetterHit] = []
    for letter in letters:
        sign_id = letter_id(letter)
        if session.get(Sign, sign_id) is None:
            continue
        hits.append(LetterHit(letter=letter, sign_id=sign_id))
    return FingerspellOut(text=text, letters=hits)


@router.get("/topics", response_model=list[str])
def topics(session: Session = Depends(get_session)) -> list[str]:
    found: set[str] = set()
    for sign in session.exec(select(Sign)).all():
        found.update(sign_out(session, sign).topics)
    return sorted(found)

