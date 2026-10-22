import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Client

router = APIRouter(tags=["clients"])

class ClientAuthIn(BaseModel):
    initData: str

def parse_max_user(init_data: str):
    try:
        data = json.loads(init_data)
        user = data.get("user") or {}
        max_id = str(user.get("id") or user.get("user_id") or "")
        name = user.get("name") or user.get("username") or "Клиент"
        return max_id, name
    except Exception:
        raise HTTPException(400, "Не удалось прочитать данные авторизации MAX")

@router.post("/clients/auth")
def auth_client(data: ClientAuthIn, db: Session = Depends(get_db)):
    max_id, name = parse_max_user(data.initData)

    if not max_id:
        raise HTTPException(400, "В initData нет ID пользователя")

    client = db.query(Client).filter(Client.max_id == max_id).first()
    if not client:
        client = Client(max_id=max_id, name=name)
        db.add(client)
        db.commit()
        db.refresh(client)
    else:
        client.name = name
        db.commit()

    return {
        "id": client.id,
        "max_id": client.max_id,
        "name": client.name
    }
