from signapp.pipeline.clean import clean_clip


def _pose(x: float) -> list[list[float]]:
    points = [[0.0, 0.0, 0.0] for _ in range(33)]
    points[16] = [x, 1.0, 0.0]
    return points


def _hand() -> list[list[float]]:
    return [[0.0, 0.0, 0.0] for _ in range(21)]


def test_trim_and_dominant_hand() -> None:
    frames = []
    for index in range(12):
        moved = 0.2 if 3 <= index <= 8 else 0.0
        frames.append({"pose": _pose(moved), "lh": None, "rh": _hand(), "face": {}, "head": [0, 0, 0]})
    frames[5]["rh"] = None
    cleaned = clean_clip({"fps": 25, "source": "video", "frames": frames})
    assert cleaned["format"] == "lm-v1"
    assert cleaned["meta"]["dominant"] == "right"
    assert cleaned["meta"]["trimStart"] <= 3
    assert cleaned["meta"]["trimEnd"] >= 8
    assert cleaned["frames"][5]["rh"] is not None


def test_trim_keeps_only_frames_where_the_hand_is_seen() -> None:
    frames = []
    for index in range(40):
        hand = _hand() if 10 <= index < 30 else None
        frames.append({"pose": _pose(0.1), "lh": None, "rh": hand, "face": {}, "head": [0, 0, 0]})
    cleaned = clean_clip({"fps": 25, "source": "video", "frames": frames})
    assert cleaned["meta"]["trimStart"] == 13
    assert cleaned["meta"]["trimEnd"] == 27


def test_short_gap_is_filled() -> None:
    frames = []
    for index in range(6):
        hand = None if index in {2, 3} else _hand()
        frames.append({"pose": _pose(0.1), "lh": None, "rh": hand, "face": {}, "head": [0, 0, 0]})
    cleaned = clean_clip({"fps": 30, "source": "webcam", "frames": frames})
    assert cleaned["frames"][2]["rh"] is not None
    assert cleaned["meta"]["source"] == "webcam"
