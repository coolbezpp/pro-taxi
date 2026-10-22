import os
from app.db import SessionLocal
from app import models
from app.security import hash_password
db=SessionLocal()
email=os.getenv("ADMIN_EMAIL","admin@pro.local")
u=db.query(models.User).filter_by(phone=email).first()
if not u:
    u=models.User(max_user_id="admin",phone=email,role="admin"); db.add(u)
db.add(models.Setting(key="commission_percent",value=os.getenv("COMMISSION_PERCENT","15")))
db.add(models.Tariff(code="standard",name="Стандарт",base_price=150,included_km=1.5,city_per_km=15,out_city_per_km=20,min_price=150))
db.add(models.Tariff(code="intercity",name="Межгород",base_price=1000,included_km=0,per_km=40,min_price=1000))
db.commit(); print("admin ready")
