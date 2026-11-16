from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, create_engine

from signapp.config import get_settings
from signapp.routers import media, signs, studio, translate, tts
from signapp.services.seed import seed

ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


def create_app() -> FastAPI:
    get_settings.cache_clear()
    settings = get_settings()
    for folder in (
        settings.data_dir,
        settings.clips_dir,
        settings.videos_dir,
        settings.tts_dir,
        settings.model_path.parent,
    ):
        folder.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{settings.database_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA journal_mode=WAL")
    with Session(engine) as session:
        seed(session)

    app = FastAPI(title="Sign avatar prototype", version="0.1.0")
    app.state.engine = engine
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(signs.router)
    app.include_router(translate.router)
    app.include_router(tts.router)
    app.include_router(studio.router)
    app.include_router(media.router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    settings = get_settings()
    uvicorn.run("signapp.main:app", host=settings.host, port=settings.port, reload=False)
