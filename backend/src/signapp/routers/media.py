from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from signapp.config import Settings

router = APIRouter(prefix="/media", tags=["media"])

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov"}
CLIP_SUFFIXES = {".json"}
AUDIO_SUFFIXES = {".mp3"}
MODEL_SUFFIXES = {".task"}


def _resolve(root: Path, relative: str, allowed: set[str]) -> Path:
    if not relative or relative.startswith(("/", "\\")) or "\\" in relative:
        raise HTTPException(status_code=400, detail="invalid path")
    base = root.resolve()
    candidate = (base / relative).resolve()
    if not candidate.is_relative_to(base):
        raise HTTPException(status_code=400, detail="invalid path")
    if candidate.suffix.lower() not in allowed:
        raise HTTPException(status_code=400, detail="unsupported file")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return candidate


def _settings(request: Request) -> Settings:
    return request.app.state.settings


@router.get("/clips/{relative:path}")
def get_clip(relative: str, request: Request) -> FileResponse:
    path = _resolve(_settings(request).clips_dir, relative, CLIP_SUFFIXES)
    return FileResponse(path, media_type="application/json")


@router.get("/videos/{relative:path}")
def get_video(relative: str, request: Request) -> FileResponse:
    path = _resolve(_settings(request).videos_dir, relative, VIDEO_SUFFIXES)
    return FileResponse(path)


@router.get("/tts/{name}")
def get_tts(name: str, request: Request) -> FileResponse:
    path = _resolve(_settings(request).tts_dir, name, AUDIO_SUFFIXES)
    return FileResponse(path, media_type="audio/mpeg")


@router.get("/models/{name}")
def get_model(name: str, request: Request) -> FileResponse:
    path = _resolve(_settings(request).data_dir / "models", name, MODEL_SUFFIXES)
    return FileResponse(path, media_type="application/octet-stream")
