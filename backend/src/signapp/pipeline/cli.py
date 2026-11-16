from pathlib import Path

import typer
from sqlmodel import Session

from signapp.main import create_app
from signapp.pipeline.extract import extract_alphabet, extract_video, store_clip
from signapp.services.albanian import slug

app = typer.Typer(add_completion=False, help="Turn local sign videos into landmark clips.")


@app.callback()
def cli() -> None:
    """Turn local sign videos into landmark clips."""


def _session() -> tuple[Session, object]:
    application = create_app()
    return Session(application.state.engine), application.state.settings


@app.command()
def extract(path: Path, sign_id: str | None = None, gloss: str | None = None) -> None:
    """Extract one video, or every alphabet clip in a folder."""
    session, settings = _session()
    target = path.expanduser().resolve()
    if target.is_dir():
        ids = extract_alphabet(session, settings, target)
        typer.echo(f"Extracted {len(ids)} alphabet clips")
        return
    if not target.is_file():
        raise typer.BadParameter(f"Not a file or directory: {path}")
    if sign_id is None:
        raise typer.BadParameter("Pass --sign-id when extracting a single video")
    payload = extract_video(target, settings)
    name = slug(gloss or sign_id)
    relative = f"clips/gjshsh/sign/{name}.json"
    store_clip(session, settings, sign_id, relative, payload)
    typer.echo(f"Wrote {relative}")


if __name__ == "__main__":
    app()
