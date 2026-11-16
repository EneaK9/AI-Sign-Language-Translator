import json

from sqlmodel import Session, select

from signapp.models import Lemma, Sign
from signapp.services.albanian import ALPHABET, NUMBER_WORDS, letter_id, slug
from signapp.services.serialize import dump_topics

# Test lexicon only. These rows have no motion until someone records them in Studio.
STARTER: list[dict[str, object]] = [
    {"gloss": "PËRSHËNDETJE", "lemmas": ["përshëndetje", "tungjatjeta"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "FALEMINDERIT", "lemmas": ["faleminderit"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "MË FAL", "lemmas": ["më fal", "me fal"], "topics": ["përshëndetje"], "kind": "phrase"},
    {"gloss": "SI JENI", "lemmas": ["si jeni", "si je"], "topics": ["përshëndetje"], "kind": "phrase"},
    {"gloss": "MIRËMËNGJES", "lemmas": ["mirëmëngjes"], "topics": ["përshëndetje"], "kind": "phrase"},
    {"gloss": "MIRËDITA", "lemmas": ["mirëdita"], "topics": ["përshëndetje"], "kind": "phrase"},
    {"gloss": "NATËN E MIRË", "lemmas": ["natën e mirë"], "topics": ["përshëndetje"], "kind": "phrase"},
    {"gloss": "PO", "lemmas": ["po"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "JO", "lemmas": ["jo"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "NDIHMË", "lemmas": ["ndihmë", "ndihme"], "topics": ["shëndeti"], "kind": "sign"},
    {"gloss": "UJË", "lemmas": ["ujë", "uje"], "topics": ["ushqimi"], "kind": "sign"},
    {"gloss": "BUKË", "lemmas": ["bukë", "buke"], "topics": ["ushqimi"], "kind": "sign"},
    {"gloss": "SHTËPI", "lemmas": ["shtëpi", "shtepi"], "topics": ["shtëpia"], "kind": "sign"},
    {"gloss": "FAMILJE", "lemmas": ["familje", "familja"], "topics": ["familja"], "kind": "sign"},
    {"gloss": "NËNË", "lemmas": ["nënë", "nene", "nëna"], "topics": ["familja"], "kind": "sign"},
    {"gloss": "BABA", "lemmas": ["baba", "babai"], "topics": ["familja"], "kind": "sign"},
    {"gloss": "SPITAL", "lemmas": ["spital"], "topics": ["shëndeti"], "kind": "sign"},
    {"gloss": "MJEK", "lemmas": ["mjek", "mjeku"], "topics": ["shëndeti"], "kind": "sign"},
    {"gloss": "SHKOLLË", "lemmas": ["shkollë", "shkolla"], "topics": ["shkolla"], "kind": "sign"},
    {"gloss": "PUNË", "lemmas": ["punë", "puna"], "topics": ["puna"], "kind": "sign"},
    {"gloss": "SOT", "lemmas": ["sot"], "topics": ["koha"], "kind": "sign"},
    {"gloss": "NESËR", "lemmas": ["nesër", "neser"], "topics": ["koha"], "kind": "sign"},
    {"gloss": "KU", "lemmas": ["ku"], "topics": ["pyetje"], "kind": "sign"},
    {"gloss": "ÇFARË", "lemmas": ["çfarë", "cfare"], "topics": ["pyetje"], "kind": "sign"},
    {"gloss": "EMËR", "lemmas": ["emër", "emri", "emer"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "UNË", "lemmas": ["unë", "une"], "topics": ["përshëndetje"], "kind": "sign"},
    {"gloss": "TI", "lemmas": ["ti"], "topics": ["përshëndetje"], "kind": "sign"},
]


def _add_lemma(session: Session, sign_id: str, text: str) -> None:
    existing = session.exec(select(Lemma).where(Lemma.text == text)).first()
    if existing is None:
        session.add(Lemma(sign_id=sign_id, text=text))


def seed(session: Session) -> None:
    for letter in ALPHABET:
        sign_id = letter_id(letter)
        if session.get(Sign, sign_id) is None:
            session.add(
                Sign(
                    id=sign_id,
                    kind="letter",
                    gloss=letter.upper(),
                    topics=json.dumps(["alfabeti"], ensure_ascii=False),
                    notes="Shkronjë e alfabetit të gjuhës shqipe të shenjave.",
                    status="approved",
                )
            )
        _add_lemma(session, sign_id, letter)

    for digit, word in NUMBER_WORDS.items():
        sign_id = f"gjshsh-number-{digit}"
        if session.get(Sign, sign_id) is None:
            session.add(
                Sign(
                    id=sign_id,
                    kind="number",
                    gloss=word.upper(),
                    topics=json.dumps(["numra"], ensure_ascii=False),
                    notes="Numër pa video. Studio mund ta regjistrojë.",
                    status="draft",
                )
            )
        _add_lemma(session, sign_id, word)
        _add_lemma(session, sign_id, digit)

    for item in STARTER:
        gloss = str(item["gloss"])
        sign_id = f"gjshsh-sign-{slug(gloss)}"
        lemmas = [str(lemma) for lemma in item["lemmas"]]  # type: ignore[union-attr]
        topics = [str(topic) for topic in item["topics"]]  # type: ignore[union-attr]
        if session.get(Sign, sign_id) is None:
            session.add(
                Sign(
                    id=sign_id,
                    kind=str(item["kind"]),
                    gloss=gloss,
                    topics=dump_topics(topics),
                    notes="Hyrje prove pa lëvizje. Regjistroje te Studio.",
                    status="draft",
                )
            )
        for lemma in lemmas:
            _add_lemma(session, sign_id, lemma)
    session.commit()
