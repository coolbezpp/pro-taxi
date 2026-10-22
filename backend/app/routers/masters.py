from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import MasterService, Executor, ExecutorRole

router = APIRouter(tags=["masters"])

class ServiceIn(BaseModel):
    title: str
    description: str = ""
    price: float = 0
    is_active: bool = True

@router.get("/masters/services")
def public_services(db: Session = Depends(get_db)):
    rows = db.query(MasterService).filter(MasterService.is_active == True).all()
    result = []

    for s in rows:
        executor = db.query(Executor).get(s.executor_id)
        result.append({
            "id": s.id,
            "executor_id": s.executor_id,
            "master_name": executor.name if executor else "Мастер",
            "title": s.title,
            "description": s.description,
            "price": s.price
        })

    return result

@router.get("/masters/{executor_id}/services")
def my_services(executor_id: int, db: Session = Depends(get_db)):
    return db.query(MasterService).filter(MasterService.executor_id == executor_id).all()

@router.post("/masters/{executor_id}/services")
def create_service(executor_id: int, data: ServiceIn, db: Session = Depends(get_db)):
    executor = db.query(Executor).get(executor_id)
    if not executor:
        raise HTTPException(404, "Исполнитель не найден")

    roles = [r.role for r in db.query(ExecutorRole).filter_by(executor_id=executor_id).all()]
    if "master" not in roles:
        raise HTTPException(403, "Роль «Мастер» не добавлена")

    service = MasterService(
        executor_id=executor_id,
        title=data.title,
        description=data.description,
        price=data.price,
        is_active=data.is_active
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service

@router.put("/masters/services/{service_id}")
def update_service(service_id: int, data: ServiceIn, db: Session = Depends(get_db)):
    service = db.query(MasterService).get(service_id)
    if not service:
        raise HTTPException(404, "Услуга не найдена")

    service.title = data.title
    service.description = data.description
    service.price = data.price
    service.is_active = data.is_active
    db.commit()
    return service

@router.delete("/masters/services/{service_id}")
def delete_service(service_id: int, db: Session = Depends(get_db)):
    service = db.query(MasterService).get(service_id)
    if not service:
        raise HTTPException(404, "Услуга не найдена")

    db.delete(service)
    db.commit()
    return {"deleted": True}
