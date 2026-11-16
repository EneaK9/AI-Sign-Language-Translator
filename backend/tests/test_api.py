import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("SIGNAPP_DATA_DIR", str(tmp_path))
    from signapp.config import get_settings
    from signapp.main import create_app

    get_settings.cache_clear()
    application = create_app()
    with TestClient(application) as test_client:
        yield test_client


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_fingerspell_shqiperia(client: TestClient) -> None:
    response = client.get("/v1/fingerspell", params={"text": "Shqipëri"})
    assert response.status_code == 200
    letters = [item["letter"] for item in response.json()["letters"]]
    assert letters == ["sh", "q", "i", "p", "ë", "r", "i"]
    assert response.json()["letters"][0]["sign_id"] == "gjshsh-letter-sh"
    assert response.json()["letters"][4]["sign_id"] == "gjshsh-letter-ee"


def test_search_strips_albanian_ending(client: TestClient) -> None:
    response = client.get("/v1/signs/search", params={"q": "spitalit"})
    assert response.status_code == 200
    hits = response.json()
    assert hits
    assert hits[0]["sign"]["gloss"] == "SPITAL"
    assert hits[0]["matched"] == "spital"


def test_translate_mixes_signs_and_fingerspelling(client: TestClient) -> None:
    response = client.post("/v1/translate", json={"text": "Si jeni sot, Enea?"})
    assert response.status_code == 200
    body = response.json()
    assert body["sentence_type"] == "question"
    kinds = [(segment["type"], segment.get("gloss") or segment.get("text")) for segment in body["segments"]]
    assert ("sign", "SI JENI") in kinds
    assert ("sign", "SOT") in kinds
    assert ("fingerspell", "enea") in kinds


def test_translate_spells_numbers(client: TestClient) -> None:
    response = client.post("/v1/translate", json={"text": "2"})
    segment = response.json()["segments"][0]
    assert segment["type"] == "sign"
    assert segment["gloss"] == "DY"


def test_media_path_traversal(client: TestClient) -> None:
    response = client.get("/media/videos/../../pyproject.toml")
    assert response.status_code in {400, 404}


def test_record_clip_and_find_it(client: TestClient) -> None:
    hand = [[0.0, 0.1 * finger, 0.0] for finger in range(21)]
    pose = [[0.0, 0.0, 0.0] for _ in range(33)]
    frames = []
    for index in range(8):
        moved = [pose[point][:] for point in range(33)]
        moved[16] = [0.3 if index > 2 else 0.0, 1.0, 0.0]
        frames.append({"pose": moved, "lh": None, "rh": hand, "face": {"jawOpen": 0.2}, "head": [0, 0, 0]})
    response = client.post(
        "/v1/studio/clips",
        json={
            "gloss": "PROVË",
            "lemmas": ["provë", "prova"],
            "topics": ["test"],
            "fps": 25,
            "frames": frames,
        },
    )
    assert response.status_code == 200, response.text
    sign = response.json()
    assert sign["clips"]
    clip_url = sign["clips"][0]["url"]
    clip = client.get(clip_url)
    assert clip.status_code == 200
    assert clip.json()["format"] == "lm-v1"
    found = client.get("/v1/signs/search", params={"q": "prova"})
    assert found.json()[0]["sign"]["id"] == sign["id"]


def test_letter_cannot_be_deleted(client: TestClient) -> None:
    response = client.delete("/v1/studio/signs/gjshsh-letter-a")
    assert response.status_code == 403
