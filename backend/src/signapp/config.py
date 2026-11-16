from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


def default_data_dir() -> Path:
    return REPO_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SIGNAPP_", extra="ignore")

    data_dir: Path = Field(default_factory=default_data_dir)
    host: str = "127.0.0.1"
    port: int = 8010

    @property
    def database_path(self) -> Path:
        return self.data_dir / "signapp.db"

    @property
    def model_path(self) -> Path:
        return self.data_dir / "models" / "holistic_landmarker.task"

    @property
    def clips_dir(self) -> Path:
        return self.data_dir / "clips"

    @property
    def videos_dir(self) -> Path:
        return self.data_dir / "videos"

    @property
    def tts_dir(self) -> Path:
        return self.data_dir / "tts"


@lru_cache
def get_settings() -> Settings:
    return Settings()
