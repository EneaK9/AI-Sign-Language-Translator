import json
import math
import urllib.request
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from signapp.config import Settings
from signapp.models import Clip, Sign
from signapp.pipeline.clean import clean_clip
from signapp.services.albanian import FILE_TO_LETTER, letter_id, letter_slug

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/"
    "holistic_landmarker/float16/latest/holistic_landmarker.task"
)


def ensure_model(settings: Settings) -> Path:
    path = settings.model_path
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 0:
        return path
    urllib.request.urlretrieve(MODEL_URL, path)
    return path


def _xyz(landmark: Any) -> list[float]:
    return [round(float(landmark.x), 5), round(float(landmark.y), 5), round(float(landmark.z), 5)]


def _hand(landmarks: list[Any] | None) -> list[list[float]] | None:
    if not landmarks:
        return None
    return [_xyz(point) for point in landmarks]


def _hand_image(landmarks: list[Any] | None, width: int, height: int) -> list[list[float]] | None:
    """Hand landmarks in image space, in units of image width so x, y and z share one scale.

    MediaPipe's image landmarks track finger curl far better than its world landmarks (the world model
    flattens fingers that fold toward the camera), so the avatar solver prefers them for handshapes.
    """
    if not landmarks:
        return None
    aspect = height / width if width else 1.0
    return [[round(float(p.x), 5), round(float(p.y) * aspect, 5), round(float(p.z), 5)] for p in landmarks]


def _head(pose: list[list[float]] | None) -> list[float]:
    if not pose or len(pose) < 13:
        return [0.0, 0.0, 0.0]
    nose, left_ear, right_ear = pose[0], pose[7], pose[8]
    left_shoulder, right_shoulder = pose[11], pose[12]
    ear = [left_ear[axis] - right_ear[axis] for axis in range(3)]
    shoulder = [left_shoulder[axis] - right_shoulder[axis] for axis in range(3)]

    def yaw(vector: list[float]) -> float:
        return math.atan2(vector[0], vector[2] if abs(vector[2]) > 1e-6 else 1e-6)

    pitch = math.atan2(nose[1] - (left_ear[1] + right_ear[1]) / 2, 0.2)
    roll = math.atan2(ear[1], math.hypot(ear[0], ear[2]) + 1e-6)
    return [round(pitch, 4), round(yaw(ear) - yaw(shoulder), 4), round(roll, 4)]


def extract_video(path: Path, settings: Settings, source: str = "video") -> dict[str, Any]:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python.vision import (
        HolisticLandmarker,
        HolisticLandmarkerOptions,
        RunningMode,
    )

    model = ensure_model(settings)
    options = HolisticLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model)),
        running_mode=RunningMode.VIDEO,
        output_face_blendshapes=True,
    )
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video {path.name}")
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    if fps < 1:
        fps = 25.0
    frames: list[dict[str, Any]] = []
    index = 0
    with HolisticLandmarker.create_from_options(options) as landmarker:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp = int(index * 1000 / fps)
            if frames:
                timestamp = max(timestamp, index)
            result = landmarker.detect_for_video(image, timestamp)
            pose = _hand(result.pose_world_landmarks) if result.pose_world_landmarks else None
            face: dict[str, float] = {}
            for category in result.face_blendshapes or []:
                name = category.category_name or ""
                if name and name != "_neutral":
                    face[name] = round(float(category.score or 0.0), 4)
            frames.append(
                {
                    "pose": pose,
                    "lh": _hand(result.left_hand_world_landmarks),
                    "rh": _hand(result.right_hand_world_landmarks),
                    "lhi": _hand_image(result.left_hand_landmarks, width, height),
                    "rhi": _hand_image(result.right_hand_landmarks, width, height),
                    "face": face,
                    "head": _head(pose),
                }
            )
            index += 1
    capture.release()
    if not frames:
        raise RuntimeError(f"No frames in {path.name}")
    return clean_clip({"fps": fps, "source": source, "frames": frames})


def _write_clip(settings: Settings, relative: str, payload: dict[str, Any]) -> Path:
    destination = settings.data_dir / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return destination


def _upsert_clip(session: Session, sign_id: str, relative: str, payload: dict[str, Any]) -> Clip:
    meta = payload["meta"]
    existing = session.exec(select(Clip).where(Clip.path == relative)).first()
    if existing is None:
        existing = Clip(sign_id=sign_id, path=relative)
        session.add(existing)
    existing.sign_id = sign_id
    existing.fps = float(payload["fps"])
    existing.frames = len(payload["frames"])
    existing.trim_start = int(meta["trimStart"])
    existing.trim_end = int(meta["trimEnd"])
    existing.dominant_hand = str(meta["dominant"])
    existing.source = str(meta["source"])
    existing.quality = float(meta["handDetected"])
    session.commit()
    session.refresh(existing)
    return existing


def store_clip(
    session: Session,
    settings: Settings,
    sign_id: str,
    relative: str,
    payload: dict[str, Any],
) -> Clip:
    if session.get(Sign, sign_id) is None:
        raise ValueError(f"Unknown sign {sign_id}")
    _write_clip(settings, relative, payload)
    return _upsert_clip(session, sign_id, relative, payload)


def extract_alphabet(session: Session, settings: Settings, folder: Path) -> list[str]:
    done: list[str] = []
    for video in sorted(folder.glob("*.mp4")):
        letter = FILE_TO_LETTER.get(video.name)
        if letter is None:
            continue
        payload = extract_video(video, settings)
        relative = f"clips/gjshsh/letter/{letter_slug(letter)}.json"
        store_clip(session, settings, letter_id(letter), relative, payload)
        quality = payload["meta"]["handDetected"]
        print(f"{video.name} -> {relative} hand={quality}")
        done.append(letter_id(letter))
    return done
