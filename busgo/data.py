"""
data.py - BusGo's "database".

There is no real database in this project. Everything lives in ordinary
Python lists and dictionaries:

    USERS, CITIES, BUSES, ROUTES   -> fixed reference data (written in code)
    db["trips"]                    -> every scheduled journey   (dict: id -> trip)
    db["bookings"]                 -> every ticket ever booked  (dict: PNR -> booking)

Trips and bookings change while the app runs, so they are written to
data.json after every change (save_data) and read back on start-up
(load_data). That way a booking survives a restart of the server.
"""

import json
import os
import random
from datetime import date, datetime, timedelta

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")

# How many days of trips to keep around today.
# Past days are kept so "Past" bookings and the admin stats have something to show.
PAST_DAYS = 3
FUTURE_DAYS = 14

# The terminal demo in logic.py switches this off so it never touches data.json.
AUTOSAVE = True


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

# Mock login: no passwords, you just pick one of these profiles.
USERS = [
    {
        "id": "u1",
        "name": "Aarav Sharma",
        "role": "passenger",
        "email": "aarav.sharma@example.com",
        "phone": "98450 12345",
        "city": "Bengaluru",
        "tagline": "Weekend explorer",
    },
    {
        "id": "u2",
        "name": "Priya Nair",
        "role": "passenger",
        "email": "priya.nair@example.com",
        "phone": "99860 67890",
        "city": "Kochi",
        "tagline": "Frequent commuter",
    },
    {
        "id": "admin",
        "name": "Meera Iyer",
        "role": "admin",
        "email": "ops@busgo.example",
        "phone": "80 4000 1234",
        "city": "Bengaluru",
        "tagline": "Operations admin",
    },
]

# Each city has a short code (used in trip ids) and its pickup / drop points.
CITIES = {
    "Bengaluru": {"code": "BLR", "points": ["Majestic Bus Stand", "Anand Rao Circle", "Hebbal Flyover", "Silk Board Junction", "Electronic City"]},
    "Mysuru": {"code": "MYS", "points": ["Suburban Bus Stand", "Bannimantap", "Hunsur Road Circle", "Ring Road Junction"]},
    "Chennai": {"code": "MAA", "points": ["Koyambedu CMBT", "Guindy", "Porur", "Tambaram"]},
    "Hyderabad": {"code": "HYD", "points": ["Ameerpet", "Lakdikapul", "Kukatpally KPHB", "Miyapur"]},
    "Goa": {"code": "GOI", "points": ["Panaji Kadamba Stand", "Porvorim", "Mapusa", "Margao"]},
    "Mumbai": {"code": "BOM", "points": ["Dadar TT", "Sion Circle", "Vashi Plaza", "Borivali East"]},
    "Pune": {"code": "PNQ", "points": ["Swargate", "Shivajinagar", "Wakad Bridge", "Katraj"]},
    "Coimbatore": {"code": "CJB", "points": ["Gandhipuram", "Avinashi Road", "Singanallur", "Ukkadam"]},
    "Kochi": {"code": "COK", "points": ["Vyttila Hub", "Kaloor", "Edappally", "Aluva"]},
}

# 10 invented operators. "layout" decides the seat map: 2+2 seater or 2+1 sleeper.
BUSES = [
    {"id": "B01", "name": "Kaveri Express Travels", "type": "AC Sleeper", "layout": "sleeper", "model": "Volvo 9600 Multi-axle Sleeper", "rating": 4.6, "reviews": 2140, "amenities": ["wifi", "charging", "water", "blanket", "tracking"]},
    {"id": "B02", "name": "Nandi Hills Roadlines", "type": "Volvo AC Seater", "layout": "seater", "model": "Volvo B11R Multi-axle", "rating": 4.4, "reviews": 1873, "amenities": ["wifi", "charging", "water", "tracking"]},
    {"id": "B03", "name": "Konkan Breeze Travels", "type": "AC Sleeper", "layout": "sleeper", "model": "Scania Metrolink Sleeper", "rating": 4.7, "reviews": 3051, "amenities": ["wifi", "charging", "water", "blanket", "snacks", "tracking"]},
    {"id": "B04", "name": "Deccan Star Lines", "type": "Non-AC Seater", "layout": "seater", "model": "Ashok Leyland Viking", "rating": 3.9, "reviews": 642, "amenities": ["water", "tracking"]},
    {"id": "B05", "name": "Sahyadri Comfort Coaches", "type": "Volvo AC Seater", "layout": "seater", "model": "Volvo 9400 B8R", "rating": 4.3, "reviews": 1288, "amenities": ["charging", "water", "snacks", "tracking"]},
    {"id": "B06", "name": "Malabar Coastliner", "type": "AC Sleeper", "layout": "sleeper", "model": "BharatBenz 1624 Sleeper", "rating": 4.5, "reviews": 1735, "amenities": ["charging", "water", "blanket", "tracking"]},
    {"id": "B07", "name": "Golconda Luxury Liners", "type": "Volvo AC Seater", "layout": "seater", "model": "Volvo B11R Multi-axle", "rating": 4.2, "reviews": 954, "amenities": ["wifi", "charging", "water"]},
    {"id": "B08", "name": "Western Ghats Travels", "type": "Non-AC Sleeper", "layout": "sleeper", "model": "Eicher Skyline Sleeper", "rating": 4.0, "reviews": 811, "amenities": ["water", "blanket"]},
    {"id": "B09", "name": "Coromandel Night Rider", "type": "AC Sleeper", "layout": "sleeper", "model": "Volvo 9600 Multi-axle Sleeper", "rating": 4.8, "reviews": 4126, "amenities": ["wifi", "charging", "water", "blanket", "snacks", "tracking"]},
    {"id": "B10", "name": "Tulsi Tourist Roadways", "type": "Non-AC Seater", "layout": "seater", "model": "Tata Starbus Ultra", "rating": 3.8, "reviews": 517, "amenities": ["water"]},
]

# How a bus type scales the route's base price.
TYPE_PRICE_FACTOR = {
    "AC Sleeper": 1.25,
    "Non-AC Sleeper": 0.95,
    "Volvo AC Seater": 1.05,
    "Non-AC Seater": 0.75,
}

# Routes: (from, to, journey minutes, base price in rupees, departure times).
# Every route runs in both directions; the return trips leave 15 minutes later.
ROUTES = [
    ("Bengaluru", "Mysuru", 180, 380, ["06:00", "09:30", "14:00", "18:30"]),
    ("Bengaluru", "Chennai", 360, 780, ["07:00", "13:30", "22:00", "23:15"]),
    ("Bengaluru", "Hyderabad", 630, 1150, ["19:30", "21:00", "22:30"]),
    ("Bengaluru", "Goa", 660, 1290, ["18:45", "20:30", "21:45"]),
    ("Bengaluru", "Coimbatore", 420, 720, ["08:00", "21:15", "22:45"]),
    ("Bengaluru", "Kochi", 630, 1090, ["19:00", "20:45", "22:15"]),
    ("Bengaluru", "Pune", 840, 1450, ["16:30", "18:00"]),
    ("Mysuru", "Kochi", 540, 920, ["20:00", "22:00"]),
    ("Mumbai", "Pune", 210, 480, ["06:30", "10:00", "15:30", "19:45"]),
    ("Mumbai", "Goa", 690, 1250, ["17:30", "19:30", "21:30"]),
    ("Pune", "Goa", 540, 990, ["20:00", "21:30"]),
    ("Chennai", "Coimbatore", 510, 830, ["21:00", "22:30"]),
    ("Chennai", "Hyderabad", 660, 1180, ["18:30", "20:15"]),
    ("Hyderabad", "Mumbai", 720, 1320, ["17:00", "19:15"]),
    ("Coimbatore", "Kochi", 270, 520, ["07:30", "13:00", "23:00"]),
]


# ---------------------------------------------------------------------------
# Seat layouts
# ---------------------------------------------------------------------------

def build_layout(layout):
    """
    Return the seat plan of a bus as decks -> rows -> cells.
    A cell is a seat number (string) or None for the aisle.

    seater : one deck, 10 rows of 2 + aisle + 2  -> seats 1..40
    sleeper: two decks (Lower L1..L18, Upper U1..U18), 6 rows of 1 + aisle + 2
    """
    if layout == "seater":
        rows, n = [], 1
        for _ in range(10):
            rows.append([str(n), str(n + 1), None, str(n + 2), str(n + 3)])
            n += 4
        return [{"name": "Seats", "rows": rows}]

    decks = []
    for name, prefix in (("Lower deck", "L"), ("Upper deck", "U")):
        rows, n = [], 1
        for _ in range(6):
            rows.append([f"{prefix}{n}", None, f"{prefix}{n + 1}", f"{prefix}{n + 2}"])
            n += 3
        decks.append({"name": name, "rows": rows})
    return decks


def all_seat_ids(layout):
    """Flat list of every seat number on a bus with this layout."""
    return [cell for deck in build_layout(layout) for row in deck["rows"] for cell in row if cell]


def get_bus(bus_id):
    for bus in BUSES:
        if bus["id"] == bus_id:
            return bus
    return None


# ---------------------------------------------------------------------------
# Trip generation
# ---------------------------------------------------------------------------

def _shift_time(hhmm, minutes):
    t = datetime.strptime(hhmm, "%H:%M") + timedelta(minutes=minutes)
    return t.strftime("%H:%M")


def _buses_for(duration_min):
    """Long night routes get sleepers and Volvos; short hops get seaters."""
    if duration_min >= 480:
        return [b for b in BUSES if b["layout"] == "sleeper" or b["type"] == "Volvo AC Seater"]
    return [b for b in BUSES if b["layout"] == "seater"]


def _price(route_price, bus_type, day):
    """Route price x bus type factor, +10% on Fri/Sat/Sun, ending in 9 (e.g. 1449)."""
    price = route_price * TYPE_PRICE_FACTOR[bus_type]
    if day.weekday() >= 4:
        price *= 1.10
    return int(round(price / 50.0) * 50) - 1


def make_trip(trip_id, bus, source, destination, day, depart, duration_min, base_fare, booked=(), ladies=()):
    """Build one trip dictionary. Arrival time and date are worked out from the duration."""
    start = datetime.combine(day, datetime.strptime(depart, "%H:%M").time())
    end = start + timedelta(minutes=duration_min)
    return {
        "id": trip_id,
        "bus_id": bus["id"],
        "source": source,
        "destination": destination,
        "date": day.isoformat(),
        "depart": depart,
        "arrive": end.strftime("%H:%M"),
        "arrive_date": end.date().isoformat(),
        "duration_min": duration_min,
        "base_fare": base_fare,
        "booked_seats": sorted(booked, key=seat_sort_key),
        "ladies_seats": sorted(ladies, key=seat_sort_key),
    }


def seat_sort_key(seat):
    """Sort '2' before '10' and 'L3' before 'U1'."""
    prefix = seat.rstrip("0123456789")
    return (prefix, int(seat[len(prefix):]))


def _generate_day(day, today):
    """Create every scheduled trip for one calendar day."""
    trips = []
    for r_index, (a, b, minutes, price, times) in enumerate(ROUTES):
        for direction, (src, dst) in enumerate(((a, b), (b, a))):
            choices = _buses_for(minutes)
            for slot, depart in enumerate(times):
                if direction == 1:
                    depart = _shift_time(depart, 15)
                bus = choices[(r_index * 3 + slot + direction) % len(choices)]
                trip_id = f"{CITIES[src]['code']}-{CITIES[dst]['code']}-{day:%Y%m%d}-{depart.replace(':', '')}"

                # Pre-book some seats so the seat maps look realistic.
                # The same trip id always gives the same "random" seats.
                rng = random.Random(trip_id)
                seats = all_seat_ids(bus["layout"])
                days_ahead = max((day - today).days, 0)
                fill = 0.55 - 0.03 * days_ahead + rng.uniform(-0.12, 0.15)
                if day.weekday() >= 4:
                    fill += 0.10
                fill = min(max(fill, 0.08), 0.85)
                booked = rng.sample(seats, int(len(seats) * fill))
                free = [s for s in seats if s not in booked]
                ladies = rng.sample(free, min(len(free), rng.randint(2, 4)))

                trips.append(make_trip(trip_id, bus, src, dst, day, depart, minutes,
                                       _price(price, bus["type"], day), booked, ladies))
    return trips


def ensure_trip_window(db, today=None):
    """
    Make sure there are trips from PAST_DAYS ago up to FUTURE_DAYS ahead.
    Runs on every start-up, so the demo never "runs out" of future trips.
    Old trips with no bookings are dropped to keep data.json small.
    Returns True if anything changed.
    """
    today = today or date.today()
    have_days = {t["date"] for t in db["trips"].values() if not t.get("custom")}
    changed = False

    for offset in range(-PAST_DAYS, FUTURE_DAYS):
        day = today + timedelta(days=offset)
        if day.isoformat() not in have_days:
            for trip in _generate_day(day, today):
                db["trips"].setdefault(trip["id"], trip)
            changed = True

    oldest = (today - timedelta(days=PAST_DAYS)).isoformat()
    used = {b["trip_id"] for b in db["bookings"].values()}
    for trip_id in [t["id"] for t in db["trips"].values() if t["date"] < oldest and t["id"] not in used]:
        del db["trips"][trip_id]
        changed = True
    return changed


# ---------------------------------------------------------------------------
# Load / save
# ---------------------------------------------------------------------------

def empty_db():
    return {"trips": {}, "bookings": {}, "meta": {"created": datetime.now().isoformat(timespec="seconds")}}


def load_data():
    """Read data.json (or start fresh), then top up the trip window."""
    db = empty_db()
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, encoding="utf-8") as f:
                stored = json.load(f)
            db.update({k: stored.get(k, db[k]) for k in db})
        except (OSError, ValueError):
            print("[data] data.json was unreadable - starting with fresh data")
    if ensure_trip_window(db):
        save_data(db)
    return db


def save_data(db):
    """Write trips and bookings to data.json (write to a temp file, then swap, so a crash can't corrupt it)."""
    if not AUTOSAVE:
        return
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=1, ensure_ascii=False)
    os.replace(tmp, DATA_FILE)
