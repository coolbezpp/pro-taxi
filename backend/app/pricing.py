import math

# Бесплатное ожидание клиента от «Я на месте», дальше — поминутно
FREE_WAITING_MINUTES = 2
WAITING_MINUTE_PRICE = 15
WAITING_MAX_BILLABLE_MINUTES = 10


def rub(value):
    """Сумма в целых рублях: копеек в проекте нет, половина округляется вверх."""
    return int(math.floor(float(value or 0) + 0.5))


def calc_standard(distance, city_km, out_km, tariff, children, animals, child_seats, manual_increase):
    base = tariff.base_price
    extra_km = max(0, distance - tariff.included_km)
    price = base + city_km*tariff.city_per_km + out_km*tariff.out_city_per_km
    price = max(price, base)
    price *= tariff.coefficient
    options = 50*int(bool(children or animals)) + 50*child_seats
    return rub(price + options + manual_increase)

def calc_intercity(distance, tariff, children, animals, child_seats, manual_increase):
    price = max(tariff.min_price, distance*tariff.per_km) * tariff.coefficient
    options = 50*int(bool(children or animals)) + 50*child_seats
    return rub(price + options + manual_increase)

def calc_waiting(minutes):
    billable = min(max(0, int(minutes) - FREE_WAITING_MINUTES), WAITING_MAX_BILLABLE_MINUTES)
    return billable * WAITING_MINUTE_PRICE

def commission(total, percent):
    return rub(float(total or 0) * float(percent or 0) / 100)
