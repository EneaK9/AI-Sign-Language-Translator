import math
from typing import Any

Point = list[float]
Frame = dict[str, Any]


def _copy_frames(frames: list[Frame]) -> list[Frame]:
    copied: list[Frame] = []
    for frame in frames:
        item: Frame = {
            "pose": _copy_points(frame.get("pose")),
            "lh": _copy_points(frame.get("lh")),
            "rh": _copy_points(frame.get("rh")),
            "lhi": _copy_points(frame.get("lhi")),
            "rhi": _copy_points(frame.get("rhi")),
            "face": dict(frame.get("face") or {}),
            "head": [float(value) for value in (frame.get("head") or [0.0, 0.0, 0.0])],
        }
        copied.append(item)
    return copied


def _copy_points(points: Any) -> list[Point] | None:
    if not points:
        return None
    return [[float(coord) for coord in point[:3]] for point in points]


def _lerp(a: list[Point], b: list[Point], weight: float) -> list[Point]:
    mixed: list[Point] = []
    for left, right in zip(a, b, strict=True):
        mixed.append(
            [
                round(left[axis] + (right[axis] - left[axis]) * weight, 5)
                for axis in range(3)
            ]
        )
    return mixed


def _interpolate(frames: list[Frame], key: str, max_gap: int = 4) -> None:
    present = [index for index, frame in enumerate(frames) if frame.get(key)]
    for left, right in zip(present, present[1:], strict=False):
        gap = right - left - 1
        if gap <= 0 or gap > max_gap:
            continue
        start = frames[left][key]
        end = frames[right][key]
        if start is None or end is None or len(start) != len(end):
            continue
        for step in range(1, gap + 1):
            frames[left + step][key] = _lerp(start, end, step / (gap + 1))


def _smooth(frames: list[Frame], key: str, window: int = 3) -> None:
    radius = window // 2
    original = [frame.get(key) for frame in frames]
    for index, points in enumerate(original):
        if not points:
            continue
        samples = []
        for offset in range(index - radius, index + radius + 1):
            if 0 <= offset < len(original) and original[offset] and len(original[offset]) == len(points):
                samples.append(original[offset])
        if len(samples) < 2:
            continue
        averaged: list[Point] = []
        for point_index in range(len(points)):
            averaged.append(
                [
                    round(
                        sum(sample[point_index][axis] for sample in samples) / len(samples),
                        5,
                    )
                    for axis in range(3)
                ]
            )
        frames[index][key] = averaged


def _motion(frames: list[Frame], key: str) -> float:
    total = 0.0
    previous: Point | None = None
    for frame in frames:
        points = frame.get(key)
        if not points:
            continue
        wrist = points[0]
        if previous is not None:
            total += math.dist(previous, wrist)
        previous = wrist
    return total


def dominant_hand(frames: list[Frame]) -> str:
    left = sum(1 for frame in frames if frame.get("lh"))
    right = sum(1 for frame in frames if frame.get("rh"))
    if left == right:
        return "right" if _motion(frames, "rh") >= _motion(frames, "lh") else "left"
    return "left" if left > right else "right"


def _trim(frames: list[Frame], dominant: str) -> tuple[int, int]:
    wrist_index = 15 if dominant == "left" else 16
    samples: list[tuple[int, Point]] = []
    for index, frame in enumerate(frames):
        pose = frame.get("pose")
        if pose and len(pose) > wrist_index:
            samples.append((index, pose[wrist_index]))
    if len(samples) < 5:
        return 0, len(frames)
    base = samples[0][1]
    moving = [index for index, point in samples if math.dist(base, point) > 0.04]
    if not moving:
        return 0, len(frames)
    start = max(0, moving[0] - 2)
    end = min(len(frames), moving[-1] + 3)
    if end - start < 5:
        return 0, len(frames)
    return start, end


def _hand_span(frames: list[Frame], key: str, edge: int = 3) -> tuple[int, int] | None:
    """Longest run where the hand was tracked, minus blurred frames as it enters and leaves."""
    best: tuple[int, int] | None = None
    start: int | None = None
    for index, frame in enumerate([*frames, {}]):
        if frame.get(key):
            if start is None:
                start = index
            continue
        if start is not None and (best is None or index - start > best[1] - best[0]):
            best = (start, index)
        start = None
    if best is None:
        return None
    first, last = best
    if last - first - 2 * edge >= 5:
        first, last = first + edge, last - edge
    if last - first < 5:
        return None
    return first, last


def _hold(frames: list[Frame], key: str) -> None:
    last = None
    for frame in frames:
        if frame.get(key):
            last = frame[key]
        elif last is not None:
            frame[key] = _copy_points(last)
    first = next((frame[key] for frame in frames if frame.get(key)), None)
    if not first:
        return
    for frame in frames:
        if frame.get(key):
            break
        frame[key] = _copy_points(first)


def clean_clip(raw: dict[str, Any]) -> dict[str, Any]:
    frames = _copy_frames(list(raw.get("frames") or []))
    for key in ("pose", "lh", "rh", "lhi", "rhi"):
        _interpolate(frames, key)
        _smooth(frames, key)
    dominant = dominant_hand(frames)
    hand_key = "lh" if dominant == "left" else "rh"
    start, end = _hand_span(frames, hand_key) or _trim(frames, dominant)
    detected = sum(1 for frame in frames if frame.get(hand_key))
    quality = detected / len(frames) if frames else 0.0
    for key in ("pose", "lh", "rh", "lhi", "rhi"):
        _hold(frames, key)
    return {
        "format": "lm-v1",
        "fps": float(raw.get("fps") or 25),
        "frames": frames,
        "meta": {
            "trimStart": start,
            "trimEnd": end if end else len(frames),
            "dominant": dominant,
            "source": raw.get("source") or "video",
            "handDetected": round(quality, 3),
        },
    }
