from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..db import get_db
from ..models import CommissionSetting

router = APIRouter(prefix="/commissions", tags=["commissions"])

SERVICES = [
    "taxi",
    "courier",
    "cargo",
    "master",
    "car_rent",
    "flat_rent"
]

DEFAULTS = {
    "taxi": 10,
    "courier": 10,
    "cargo": 10,
    "master": 10,
    "car_rent": 10,
    "flat_rent": 10
}

class CommissionIn(BaseModel):
    service: str
    percent: float

def get_or_create(db: Session, service: str):
    row = db.query(CommissionSetting).filter(CommissionSetting.service == service).first()
    if not row:
        row = CommissionSetting(service=service, percent=DEFAULTS.get(service, 10))
        db.add(row)
        db.commit()
        db.refresh(row)
    return row

@router.get("")
def list_commissions(db: Session = Depends(get_db)):
    result = {}
    for service in SERVICES:
        row = get_or_create(db, service)
        result[service] = row.percent
    return result

@router.put("")
def update_commission(data: CommissionIn, db: Session = Depends(get_db)):
    if data.service not in SERVICES:
        raise HTTPException(400, "Неизвестная услуга")
    if not 0 <= data.percent <= 50:
        raise HTTPException(400, "Комиссия должна быть от 0 до 50%")
    row = get_or_create(db, data.service)
    row.percent = data.percent
    db.commit()
    return {"service": row.service, "percent": row.percent}
