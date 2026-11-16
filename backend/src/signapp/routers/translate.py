from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from signapp.deps import get_session
from signapp.models import SignPlanOut
from signapp.services.planner import plan_text

router = APIRouter(prefix="/v1", tags=["translate"])


class TranslateIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    use_llm: bool = False


@router.post("/translate", response_model=SignPlanOut)
def translate(body: TranslateIn, session: Session = Depends(get_session)) -> SignPlanOut:
    return plan_text(session, body.text, body.use_llm)
