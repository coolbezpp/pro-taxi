from datetime import datetime, timedelta
from math import radians, sin, cos, asin, sqrt

def haversine_km(lat1, lon1, lat2, lon2):
    try:
        lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    except (TypeError, ValueError):
        return None

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6371 * 2 * asin(sqrt(a))

def estimate_completion(order):
    """Оценка времени завершения заказа.

    Город: 25 минут + 1 минута на каждый км.
    Межгород: расстояние / 70 км/ч + 20 минут.
    Если координат нет, используется консервативная оценка.
    """
    now = datetime.utcnow()

    tariff = (getattr(order, "tariff_code", "") or "").lower()
    intercity = "intercity" in tariff or "межгород" in tariff

    distance_km = None

    lat_from = getattr(order, "from_lat", None)
    lon_from = getattr(order, "from_lon", None)
    lat_to = getattr(order, "to_lat", None)
    lon_to = getattr(order, "to_lon", None)

    if all(v is not None for v in [lat_from, lon_from, lat_to, lon_to]):
        distance_km = haversine_km(lat_from, lon_from, lat_to, lon_to)

    if intercity:
        if distance_km:
            minutes = 20 + (distance_km / 70) * 60
        else:
            minutes = 240
    else:
        if distance_km:
            minutes = 25 + distance_km
        else:
            minutes = 45

    return now + timedelta(minutes=max(15, round(minutes)))
