"""Рекламные блоки на главной странице миниаппа клиента.

Публичная часть (`GET /api/ads`) отдаёт только активные блоки без
каких-либо персональных данных. Управление — через админпанель
(требуется админ-cookie).
"""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Ad
from ..security import get_admin, get_staff

router = APIRouter(prefix="/api", tags=["ads"])

ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 МБ


def _media_dir() -> str:
    """Каталог хранения изображений.

    В контейнере — /app/media (named volume, переживает пересборку),
    при локальном запуске — ./media рядом с backend/.
    """
    configured = os.getenv("MEDIA_DIR", "")
    candidates = [configured] if configured else ["/app/media"]
    candidates.append(os.path.join(os.getcwd(), "media"))

    for path in candidates:
        try:
            os.makedirs(path, exist_ok=True)
            if os.access(path, os.W_OK):
                return path
        except OSError:
            continue

    raise HTTPException(status_code=500, detail="Каталог изображений недоступен")


def _clean_placement(value: str | None) -> str:
    v = (value or "home").strip().lower()
    if v not in ("home", "events"):
        raise HTTPException(status_code=400, detail="Раздел должен быть home или events")
    return v


def _clean_event_date(value: str | None) -> str | None:
    v = (value or "").strip()
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректная дата мероприятия")


def _ad_to_public(ad: Ad) -> dict:
    return {
        "id": ad.id,
        "title": ad.title,
        "description": ad.description or "",
        "link": ad.link or "",
        "placement": ad.placement or "home",
        "event_date": ad.event_date.isoformat() if ad.event_date else None,
        "image_url": f"/api/ads/{ad.id}/image" if ad.image_name else None,
        "position": ad.position,
    }


def _ad_to_admin(ad: Ad) -> dict:
    payload = _ad_to_public(ad)
    payload.update(
        {
            "active": bool(ad.active),
            "image": bool(ad.image_name),
            "created_at": ad.created_at.isoformat() if ad.created_at else None,
        }
    )
    return payload


def _clean_title(value: str) -> str:
    value = (value or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Укажите заголовок")
    if len(value) > 160:
        raise HTTPException(status_code=400, detail="Заголовок длиннее 160 символов")
    return value


def _clean_link(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if len(value) > 500:
        raise HTTPException(status_code=400, detail="Ссылка длиннее 500 символов")
    if not (value.startswith("/") or value.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="Ссылка должна начинаться с / или https://",
        )
    return value


async def _save_image(image: UploadFile | None) -> str | None:
    if image is None or not image.filename:
        return None

    ext = os.path.splitext(image.filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(
            status_code=400,
            detail="Допустимы только png, jpg, jpeg, webp, gif",
        )

    content = await image.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Изображение больше 5 МБ")
    if not content:
        raise HTTPException(status_code=400, detail="Пустой файл")

    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(_media_dir(), name), "wb") as handle:
        handle.write(content)
    return name


def _remove_image(name: str | None) -> None:
    if not name:
        return
    try:
        os.remove(os.path.join(_media_dir(), os.path.basename(name)))
    except OSError:
        pass


# --- публичная часть ---


@router.get("/ads")
def list_ads(kind: str | None = None, db: Session = Depends(get_db)):
    """kind=events → афиша (сортировка по дате мероприятия);
    иначе → бизнес-реклама. Персональных данных нет."""
    query = db.query(Ad).filter(Ad.active.is_(True))

    if kind == "events":
        rows = (
            query.filter(Ad.placement == "events")
            .order_by(Ad.event_date.asc().nullslast(), Ad.id.desc())
            .limit(30)
            .all()
        )
    else:
        rows = (
            query.filter(Ad.placement != "events")
            .order_by(Ad.position.asc(), Ad.id.desc())
            .limit(20)
            .all()
        )

    return {"ads": [_ad_to_public(ad) for ad in rows]}


@router.get("/ads/{ad_id}/image")
def ad_image(ad_id: int, db: Session = Depends(get_db)):
    ad = db.query(Ad).get(ad_id)
    if not ad or not ad.image_name:
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    path = os.path.join(_media_dir(), os.path.basename(ad.image_name))
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Файл изображения отсутствует")

    return FileResponse(
        path,
        headers={"Cache-Control": "public, max-age=3600"},
    )


# --- управление из админки ---


@router.get("/admin/ads", dependencies=[Depends(get_staff)])
def admin_list_ads(db: Session = Depends(get_db)):
    rows = db.query(Ad).order_by(Ad.position.asc(), Ad.id.desc()).all()
    return {"ads": [_ad_to_admin(ad) for ad in rows]}


@router.post("/admin/ads", status_code=201, dependencies=[Depends(get_admin)])
async def create_ad(
    title: str = Form(...),
    description: str = Form(""),
    link: str = Form(""),
    position: int = Form(0),
    active: str = Form("true"),
    placement: str = Form("home"),
    event_date: str = Form(""),
    image: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    ad = Ad(
        title=_clean_title(title),
        description=(description or "").strip()[:400],
        link=_clean_link(link),
        placement=_clean_placement(placement),
        event_date=_clean_event_date(event_date),
        position=position,
        active=active.lower() != "false",
        image_name=await _save_image(image),
    )
    db.add(ad)
    db.commit()
    db.refresh(ad)
    return {"ok": True, "ad": _ad_to_admin(ad)}


class AdUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    link: str | None = None
    position: int | None = None
    active: bool | None = None
    placement: str | None = None
    event_date: str | None = None


@router.put("/admin/ads/{ad_id}", dependencies=[Depends(get_admin)])
def update_ad(ad_id: int, data: AdUpdate, db: Session = Depends(get_db)):
    ad = db.query(Ad).get(ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Реклама не найдена")

    if data.title is not None:
        ad.title = _clean_title(data.title)
    if data.description is not None:
        ad.description = data.description.strip()[:400]
    if data.link is not None:
        ad.link = _clean_link(data.link)
    if data.position is not None:
        ad.position = data.position
    if data.active is not None:
        ad.active = data.active
    if data.placement is not None:
        ad.placement = _clean_placement(data.placement)
    if data.event_date is not None:
        ad.event_date = _clean_event_date(data.event_date)

    db.commit()
    db.refresh(ad)
    return {"ok": True, "ad": _ad_to_admin(ad)}


@router.delete("/admin/ads/{ad_id}", dependencies=[Depends(get_admin)])
def delete_ad(ad_id: int, db: Session = Depends(get_db)):
    ad = db.query(Ad).get(ad_id)
    if not ad:
        raise HTTPException(status_code=404, detail="Реклама не найдена")

    image_name = ad.image_name
    db.delete(ad)
    db.commit()
    _remove_image(image_name)
    return {"ok": True}
