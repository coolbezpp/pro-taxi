from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AddressEntry
from ..security import get_admin, get_staff

router = APIRouter(tags=["addresses"])


class AddressIn(BaseModel):
    city: str
    title: str
    lat: float
    lon: float
    active: bool = True


class AddressOut(BaseModel):
    id: int
    city: str
    title: str
    lat: float
    lon: float
    active: bool

    class Config:
        from_attributes = True


def _to_out(row: AddressEntry) -> dict:
    return {
        "id": row.id,
        "city": row.city,
        "title": row.title,
        "lat": row.lat,
        "lon": row.lon,
        "active": bool(row.active),
    }


@router.get("/api/admin/addresses", dependencies=[Depends(get_staff)])
def list_addresses(city: str | None = None, db: Session = Depends(get_db)):
    q = db.query(AddressEntry)
    if city:
        q = q.filter(AddressEntry.city == city.strip())
    rows = q.order_by(AddressEntry.city.asc(), AddressEntry.created_at.desc()).all()
    return {"addresses": [_to_out(r) for r in rows]}


@router.post("/api/admin/addresses", status_code=201, dependencies=[Depends(get_admin)])
def create_address(data: AddressIn, db: Session = Depends(get_db)):
    city = (data.city or "").strip()
    title = (data.title or "").strip()
    if not city or not title:
        raise HTTPException(422, "Город и название обязательны")
    row = AddressEntry(
        city=city,
        title=title[:300],
        lat=data.lat,
        lon=data.lon,
        active=data.active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "address": _to_out(row)}


@router.put("/api/admin/addresses/{addr_id}", dependencies=[Depends(get_admin)])
def update_address(addr_id: int, data: AddressIn, db: Session = Depends(get_db)):
    row = db.query(AddressEntry).get(addr_id)
    if not row:
        raise HTTPException(404, "Адрес не найден")
    row.city = (data.city or "").strip()
    row.title = (data.title or "").strip()[:300]
    row.lat = data.lat
    row.lon = data.lon
    row.active = data.active
    db.commit()
    db.refresh(row)
    return {"ok": True, "address": _to_out(row)}


@router.delete("/api/admin/addresses/{addr_id}", dependencies=[Depends(get_admin)])
def delete_address(addr_id: int, db: Session = Depends(get_db)):
    row = db.query(AddressEntry).get(addr_id)
    if not row:
        raise HTTPException(404, "Адрес не найден")
    db.delete(row)
    db.commit()
    return {"ok": True}
