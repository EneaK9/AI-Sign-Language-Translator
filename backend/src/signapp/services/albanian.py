import re
import unicodedata

ALPHABET: tuple[str, ...] = (
    "a",
    "b",
    "c",
    "ç",
    "d",
    "dh",
    "e",
    "ë",
    "f",
    "g",
    "gj",
    "h",
    "i",
    "j",
    "k",
    "l",
    "ll",
    "m",
    "n",
    "nj",
    "o",
    "p",
    "q",
    "r",
    "rr",
    "s",
    "sh",
    "t",
    "th",
    "u",
    "v",
    "x",
    "xh",
    "y",
    "z",
    "zh",
)

DIGRAPHS: frozenset[str] = frozenset({"dh", "gj", "ll", "nj", "rr", "sh", "th", "xh", "zh"})
LETTER_SET: frozenset[str] = frozenset(ALPHABET)

# Source clips use ASCII names. ç and ë are doubled.
LETTER_FILES: dict[str, str] = {
    "ç": "k_cc.mp4",
    "ë": "k_ee.mp4",
    **{letter: f"k_{letter}.mp4" for letter in ALPHABET if letter not in {"ç", "ë"}},
}

FILE_TO_LETTER: dict[str, str] = {name: letter for letter, name in LETTER_FILES.items()}

NUMBER_WORDS: dict[str, str] = {
    "0": "zero",
    "1": "një",
    "2": "dy",
    "3": "tre",
    "4": "katër",
    "5": "pesë",
    "6": "gjashtë",
    "7": "shtatë",
    "8": "tetë",
    "9": "nëntë",
    "10": "dhjetë",
}

# Longer endings first. A stem shorter than 3 characters is rejected by the caller.
ENDINGS: tuple[str, ...] = ("të", "së", "ve", "it", "ut", "ja", "ëve", "s", "t", "i", "u", "a")


def letter_id(letter: str) -> str:
    return f"gjshsh-letter-{letter_slug(letter)}"


def letter_slug(letter: str) -> str:
    return {"ç": "cc", "ë": "ee"}.get(letter, letter)


def slug(text: str) -> str:
    folded = text.lower().translate(str.maketrans({"ë": "e", "ç": "c"}))
    folded = unicodedata.normalize("NFKD", folded)
    folded = "".join(ch for ch in folded if not unicodedata.combining(ch))
    folded = re.sub(r"[^a-z0-9]+", "-", folded).strip("-")
    return folded or "sign"


def to_letters(word: str) -> list[str]:
    """Split an Albanian word into manual-alphabet letters, keeping digraphs intact."""
    lowered = word.lower()
    out: list[str] = []
    index = 0
    while index < len(lowered):
        pair = lowered[index : index + 2]
        if pair in DIGRAPHS:
            out.append(pair)
            index += 2
            continue
        char = lowered[index]
        if char in LETTER_SET:
            out.append(char)
        index += 1
    return out


def normalize_text(text: str) -> str:
    cleaned = text.replace("ë", "ë").replace("Ë", "ë").replace("Ç", "ç")
    cleaned = cleaned.lower()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def stem(word: str) -> str | None:
    for ending in ENDINGS:
        if word.endswith(ending) and len(word) - len(ending) >= 3:
            return word[: -len(ending)]
    return None
