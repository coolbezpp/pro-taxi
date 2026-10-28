import asyncio
import json
import logging
import math
import os
import time

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/geo", tags=["geo"])

OSRM_URL = os.getenv(
    "OSRM_URL", "https://router.project-osrm.org"
).rstrip("/")

NOMINATIM_URL = os.getenv(
    "NOMINATIM_URL", "https://nominatim.openstreetmap.org"
).rstrip("/")

# Пауза между запросами нужна только публичным сервисам (их правила
# запрещают частые запросы). Свой локальный стек ограничивать не нужно.
_IS_LOCAL_OSRM = OSRM_URL.startswith("http://osm-") or OSRM_URL.startswith(
    "http://nominatim"
)
_MIN_INTERVAL = float(
    os.getenv("GEO_MIN_INTERVAL", "0" if _IS_LOCAL_OSRM else "1.1")
)

_request_lock = asyncio.Lock()
_last_request = 0.0


class RouteIn(BaseModel):
    from_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    from_lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    to_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    to_lon: float = Field(ge=-180, le=180, allow_inf_nan=False)


@router.post("/route")
async def build_route(data: RouteIn):
    global _last_request

    coordinates = (
        f"{data.from_lon},{data.from_lat};"
        f"{data.to_lon},{data.to_lat}"
    )
    url = f"{OSRM_URL}/route/v1/driving/{coordinates}"

    async with _request_lock:
        delay = _MIN_INTERVAL - (time.monotonic() - _last_request)
        if delay > 0:
            await asyncio.sleep(delay)
        _last_request = time.monotonic()

        try:
            async with httpx.AsyncClient(
                timeout=20.0,
                headers={"User-Agent": "PRO-Taxi-Technical-Test/0.1"},
            ) as client:
                response = await client.get(
                    url,
                    params={
                        "overview": "full",
                        "geometries": "geojson",
                        "steps": "false",
                        "alternatives": "false",
                        "radiuses": "500;500",
                    },
                )
        except httpx.TimeoutException:
            raise HTTPException(504, "Сервис маршрутов не ответил вовремя")
        except httpx.RequestError:
            raise HTTPException(502, "Не удалось подключиться к сервису маршрутов")

    try:
        result = response.json()
    except ValueError:
        raise HTTPException(502, "Сервис маршрутов вернул некорректный ответ")

    if not isinstance(result, dict):
        raise HTTPException(502, "Некорректная структура ответа маршрутизатора")

    if result.get("code") in ("NoRoute", "NoSegment"):
        raise HTTPException(
            422,
            "Маршрут не найден. Выберите точки ближе к автомобильной дороге",
        )

    if response.status_code != 200 or result.get("code") != "Ok":
        raise HTTPException(502, "Сервис маршрутов временно недоступен")

    try:
        route = result["routes"][0]
        distance_m = float(route["distance"])
        duration_s = float(route["duration"])
        geometry = route["geometry"]
        if (
            not math.isfinite(distance_m)
            or not math.isfinite(duration_s)
            or distance_m < 0
            or duration_s < 0
            or geometry.get("type") != "LineString"
            or not geometry.get("coordinates")
        ):
            raise ValueError("Invalid route")
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        raise HTTPException(502, "Сервис вернул неполные данные маршрута")

    return {
        "distance_m": distance_m,
        "distance_km": round(distance_m / 1000, 3),
        "duration_s": duration_s,
        "duration_min": round(duration_s / 60, 1),
        "geometry": geometry,
        "waypoints": result.get("waypoints", []),
        "attribution": "Routing: OSRM; data: OpenStreetMap contributors",
    }


class SearchOut(BaseModel):
    title: str
    lat: float
    lon: float
    distance_km: float | None = None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Расстояние между точками в километрах."""
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return round(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 3)


@router.get("/search")
async def search_places(q: str, lat: float | None = None, lon: float | None = None):
    query = (q or "").strip()
    if len(query) < 3:
        return []

    providers = [
        {
            "name": "nominatim",
            "url": f"{NOMINATIM_URL}/search",
            "params": {
                "q": query,
                "format": "jsonv2",
                "limit": 10,
                "addressdetails": 1,
                "accept-language": "ru",
            },
        },
        {
            "name": "photon",
            "url": "https://photon.komoot.io/api/",
            "params": {"q": query, "lang": "default", "limit": 10},
        },
    ]

    async with httpx.AsyncClient(
        timeout=12.0,
        headers={"User-Agent": "PRO-Taxi/1.0 (technical test)"},
    ) as client:
        for provider in providers:
            try:
                response = await client.get(provider["url"], params=provider["params"])
                response.raise_for_status()
                data = response.json()
            except Exception:
                continue

            results = []

            if provider["name"] == "photon":
                for item in data.get("features", []):
                    props = item.get("properties", {})
                    coords = item.get("geometry", {}).get("coordinates", [])
                    if len(coords) != 2:
                        continue

                    title = ", ".join(filter(None, [
                        props.get("name"),
                        props.get("street"),
                        props.get("district"),
                        props.get("city"),
                        props.get("state"),
                    ])) or "Найденный адрес"

                    results.append(SearchOut(
                        title=title,
                        lat=float(coords[1]),
                        lon=float(coords[0]),
                    ))
            else:
                for item in data:
                    if not item.get("lat") or not item.get("lon"):
                        continue
                    results.append(SearchOut(
                        title=item.get("display_name", ""),
                        lat=float(item["lat"]),
                        lon=float(item["lon"]),
                    ))

            if results:
                # Ближайшие к клиенту — первыми
                if lat is not None and lon is not None:
                    for item in results:
                        item.distance_km = _haversine_km(lat, lon, item.lat, item.lon)
                    results.sort(key=lambda x: x.distance_km)
                return results

    raise HTTPException(503, "Поиск адресов временно недоступен")


_log = logging.getLogger("pro.geo.diag")


class DiagIn(BaseModel):
    # Произвольный отчёт вебвью: что видит JS (мост MAX, разрешения, GPS)
    data: dict = Field(default_factory=dict)


@router.post("/diag")
async def geo_diag(payload: DiagIn):
    """Разовая диагностика гео в вебвью MAX.

    Миниапп шлёт сюда результаты пробы: жив ли нативный мост SDK
    (WebAppGetViewportSize), отвечает ли запрос права location, что
    возвращает navigator.geolocation (фикс / код ошибки / молчание).
    Читаем в логах: docker compose logs api | grep GEO_DIAG
    """
    raw = json.dumps(payload.data, ensure_ascii=False, default=str)
    if len(raw) > 6000:
        raise HTTPException(413, "Отчёт диагностики слишком большой")
    _log.warning("GEO_DIAG %s", raw)
    return {"ok": True}
