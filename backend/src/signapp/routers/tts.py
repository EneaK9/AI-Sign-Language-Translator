import hashlib

import edge_tts
from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter(prefix="/v1", tags=["tts"])

VOICES = {"sq-AL-AnilaNeural", "sq-AL-IlirNeural"}


@router.get("/tts")
async def text_to_speech(
    request: Request,
    text: str = Query(min_length=1, max_length=400),
    voice: str = "sq-AL-AnilaNeural",
) -> dict[str, str]:
    spoken = " ".join(text.split())
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail="unsupported voice")
    if not spoken:
        raise HTTPException(status_code=400, detail="text is empty")
    settings = request.app.state.settings
    settings.tts_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(f"{voice}:{spoken}".encode()).hexdigest()
    destination = settings.tts_dir / f"{digest}.mp3"
    if not destination.exists():
        try:
            await edge_tts.Communicate(spoken, voice).save(str(destination))
        except Exception as exc:
            raise HTTPException(status_code=503, detail="speech synthesis unavailable") from exc
    return {"url": f"/media/tts/{destination.name}", "voice": voice}
