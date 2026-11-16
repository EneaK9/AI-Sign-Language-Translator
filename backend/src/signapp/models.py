from sqlmodel import Field, SQLModel


class Sign(SQLModel, table=True):
    __tablename__ = "sign"

    id: str = Field(primary_key=True)
    language: str = Field(default="gjshsh", index=True)
    kind: str = Field(index=True)
    gloss: str
    topics: str = ""
    notes: str = ""
    status: str = Field(default="draft", index=True)


class Lemma(SQLModel, table=True):
    __tablename__ = "lemma"

    id: int | None = Field(default=None, primary_key=True)
    sign_id: str = Field(foreign_key="sign.id", index=True)
    text: str = Field(index=True, unique=True)


class Clip(SQLModel, table=True):
    __tablename__ = "clip"

    id: int | None = Field(default=None, primary_key=True)
    sign_id: str = Field(foreign_key="sign.id", index=True)
    path: str
    fps: float = 25
    frames: int = 0
    trim_start: int = 0
    trim_end: int = 0
    dominant_hand: str = "right"
    source: str = "video"
    quality: float = 0
    note: str = ""
    review: str = "pending"


class ClipOut(SQLModel):
    id: int
    url: str
    fps: float
    frames: int
    trim_start: int
    trim_end: int
    dominant_hand: str
    source: str
    quality: float
    note: str
    review: str


class SignOut(SQLModel):
    id: str
    language: str
    kind: str
    gloss: str
    topics: list[str]
    notes: str
    status: str
    lemmas: list[str]
    clips: list[ClipOut]


class SearchHit(SQLModel):
    sign: SignOut
    score: float
    matched: str


class LetterHit(SQLModel):
    letter: str
    sign_id: str


class FingerspellOut(SQLModel):
    text: str
    letters: list[LetterHit]


class AlphabetItem(SQLModel):
    letter: str
    sign_id: str
    video_url: str | None
    clip: ClipOut | None


class SegmentOut(SQLModel):
    type: str
    sign_id: str | None = None
    gloss: str | None = None
    text: str | None = None
    letters: list[str] = Field(default_factory=list)


class SignPlanOut(SQLModel):
    source: str
    language: str = "gjshsh"
    sentence_type: str
    segments: list[SegmentOut]
    confidence: float
    used_llm: bool = False
