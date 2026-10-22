def calc_standard(distance, city_km, out_km, tariff, children, animals, child_seats, manual_increase):
    base = tariff.base_price
    extra_km = max(0, distance - tariff.included_km)
    price = base + city_km*tariff.city_per_km + out_km*tariff.out_city_per_km
    price = max(price, base)
    price *= tariff.coefficient
    options = 50*int(bool(children or animals)) + 50*child_seats
    return round(price + options + manual_increase, 2)

def calc_intercity(distance, tariff, children, animals, child_seats, manual_increase):
    price = max(tariff.min_price, distance*tariff.per_km) * tariff.coefficient
    options = 50*int(bool(children or animals)) + 50*child_seats
    return round(price + options + manual_increase, 2)

def calc_waiting(started_minutes):
    if started_minutes <= 3: return 50
    billable = min(started_minutes-3, 10)
    return 50 + billable*15

def commission(total, percent):
    return round(total*percent/100, 2)
