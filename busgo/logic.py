"""
logic.py - all of BusGo's business rules, in plain Python.

The Flask routes in app.py never make decisions themselves; they call the
functions in this file and show the result. That keeps every rule
(searching, seat availability, fares, PNRs, booking, cancellation, refunds,
admin statistics) in one place that is easy to read and test.

Run `python logic.py` to see a demo search, booking and cancellation in the
terminal. The demo works on an in-memory copy and does not change data.json.
"""

import hashlib
import random
import re
import string
from collections import Counter
from datetime import date, datetime, timedelta

import data

# The live data (trips + bookings). Filled in by init().
db = None

MAX_SEATS_PER_BOOKING = 6
GST_RATE = 5  # percent

# Extra charge per seat depending on the kind of bus (rupees).
SERVICE_FEE = {
    "Non-AC Seater": 0,
    "Non-AC Sleeper": 30,
    "Volvo AC Seater": 50,
    "AC Sleeper": 100,
}

POPULAR_ROUTES = [
    ("Bengaluru", "Mysuru"),
    ("Bengaluru", "Goa"),
    ("Mumbai", "Pune"),
    ("Bengaluru", "Chennai"),
    ("Hyderabad", "Bengaluru"),
    ("Coimbatore", "Kochi"),
]


def init():
    """Load the data once when the app starts, and add demo bookings on the very first run."""
    global db
    if db is None:
        db = data.load_data()
        seed_demo_bookings()
    return db


def _save():
    data.save_data(db)


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def format_inr(amount):
    """Indian digit grouping: 123456 -> '1,23,456'."""
    n = int(round(amount))
    sign, s = ("-" if n < 0 else ""), str(abs(n))
    if len(s) <= 3:
        return sign + s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return sign + ",".join(groups) + "," + tail


def duration_label(minutes):
    """630 -> '10h 30m'."""
    return f"{minutes // 60}h {minutes % 60:02d}m"


def departure_time(trip):
    """The trip's departure as a datetime object."""
    return datetime.strptime(f"{trip['date']} {trip['depart']}", "%Y-%m-%d %H:%M")


def day_slot(hhmm):
    """Which part of the day a time falls in - used by the departure-time filter."""
    hour = int(hhmm[:2])
    if 5 <= hour < 12:
        return "morning"
    if 12 <= hour < 17:
        return "afternoon"
    if 17 <= hour < 21:
        return "evening"
    return "night"


def list_cities():
    return sorted(data.CITIES)


def get_user(user_id):
    for user in data.USERS:
        if user["id"] == user_id:
            return user
    return None


def get_trip(trip_id):
    return db["trips"].get(trip_id)


def trip_view(trip, now=None):
    """
    A copy of a trip with everything the pages need already worked out:
    the bus details, seats left, a readable duration, filter flags and so on.
    """
    now = now or datetime.now()
    bus = data.get_bus(trip["bus_id"])
    total = len(data.all_seat_ids(bus["layout"]))
    view = dict(trip)
    view.update({
        "bus": bus,
        "total_seats": total,
        "seats_left": total - len(trip["booked_seats"]),
        "duration": duration_label(trip["duration_min"]),
        "next_day": trip["arrive_date"] != trip["date"],
        "slot": day_slot(trip["depart"]),
        "is_ac": "AC" in bus["type"] and "Non-AC" not in bus["type"],
        "is_sleeper": bus["layout"] == "sleeper",
        "departed": departure_time(trip) <= now,
        "date_label": datetime.strptime(trip["date"], "%Y-%m-%d").strftime("%a, %d %b %Y"),
    })
    return view


# ---------------------------------------------------------------------------
# 1. Search
# ---------------------------------------------------------------------------

def search_buses(source, destination, travel_date, now=None):
    """
    Find every trip from `source` to `destination` on `travel_date` (YYYY-MM-DD).

    Steps:
      1. Go through all trips and keep the ones whose route and date match.
      2. Skip buses that have already left (matters when searching for today).
      3. Sort the rest by departure time.
    Returns a list of trip views (see trip_view).
    """
    now = now or datetime.now()
    results = []
    for trip in db["trips"].values():
        if trip["source"] == source and trip["destination"] == destination and trip["date"] == travel_date:
            view = trip_view(trip, now)
            if not view["departed"]:
                results.append(view)
    results.sort(key=lambda t: t["depart"])
    add_highlights(results)
    return results


def add_highlights(results):
    """
    Label the stand-out buses in a result list so the page can show badges:
    cheapest fare, shortest journey, best rating, and "filling fast"
    (8 or fewer seats left).
    """
    for trip in results:
        trip["highlights"] = []
    if len(results) > 1:
        min(results, key=lambda t: t["base_fare"])["highlights"].append("Cheapest")
        min(results, key=lambda t: t["duration_min"])["highlights"].append("Fastest")
        max(results, key=lambda t: t["bus"]["rating"])["highlights"].append("Top rated")
    for trip in results:
        if 0 < trip["seats_left"] <= 8:
            trip["highlights"].append("Filling fast")


def booking_window(today=None):
    """First and last day a ticket can be booked for (today .. 13 days ahead)."""
    today = today or date.today()
    return today, today + timedelta(days=data.FUTURE_DAYS - 1)


def validate_search(source, destination, travel_date):
    """Check the search form. Returns (ok, error message)."""
    if source not in data.CITIES or destination not in data.CITIES:
        return False, "Please choose both a From and a To city."
    if source == destination:
        return False, "From and To can't be the same city."
    try:
        day = datetime.strptime(travel_date or "", "%Y-%m-%d").date()
    except ValueError:
        return False, "Please pick a valid travel date."
    first, last = booking_window()
    if day < first:
        return False, "That date has already passed — please pick today or later."
    if day > last:
        return False, f"Bookings are open up to {last:%d %b} ({data.FUTURE_DAYS} days ahead)."
    return True, ""


def destinations_from(source):
    """Cities with a direct bus from `source` (used for defaults and 'no buses' suggestions)."""
    found = set()
    for a, b, *_ in data.ROUTES:
        if a == source:
            found.add(b)
        elif b == source:
            found.add(a)
    return sorted(found)


def fare_calendar(source, destination, travel_date, days=7):
    """
    A strip of nearby dates with the cheapest fare on each day, so the user
    can jump to a cheaper day. The strip stays inside the booking window.
    """
    selected = datetime.strptime(travel_date, "%Y-%m-%d").date()
    first, last = booking_window()
    start = max(first, min(selected - timedelta(days=3), last - timedelta(days=days - 1)))
    strip = []
    for i in range(days):
        day = start + timedelta(days=i)
        if day > last:
            break
        trips = search_buses(source, destination, day.isoformat())
        strip.append({
            "date": day.isoformat(),
            "weekday": day.strftime("%a"),
            "day": day.day,
            "month": day.strftime("%b"),
            "min_fare": min((t["base_fare"] for t in trips), default=None),
            "count": len(trips),
            "selected": day == selected,
        })
    return strip


def quick_dates(today=None):
    """Shortcut buttons under the date field: Today, Tomorrow and the coming Friday."""
    today = today or date.today()
    friday = today + timedelta(days=(4 - today.weekday()) % 7 or 7)
    options = [("Today", today), ("Tomorrow", today + timedelta(days=1))]
    if friday > today + timedelta(days=1):
        options.append((f"Fri {friday.day} {friday:%b}", friday))
    return [{"label": label, "date": day.isoformat()} for label, day in options]


def home_stats(now=None):
    """Headline numbers for the landing page, counted from the live trip data."""
    now = now or datetime.now()
    upcoming = [t for t in db["trips"].values() if departure_time(t) > now]
    seats_free = sum(len(data.all_seat_ids(data.get_bus(t["bus_id"])["layout"])) - len(t["booked_seats"])
                     for t in upcoming)
    return {
        "cities": len(data.CITIES),
        "operators": len(data.BUSES),
        "days": data.FUTURE_DAYS,
        "routes": len(data.ROUTES) * 2,
        "trips": len(upcoming),
        "seats_free": seats_free,
        "rating": round(sum(b["rating"] for b in data.BUSES) / len(data.BUSES), 1),
    }


def popular_routes():
    """Route chips for the landing page, each with tomorrow's lowest fare."""
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    chips = []
    for src, dst in POPULAR_ROUTES:
        fares = [t["base_fare"] for t in db["trips"].values()
                 if t["source"] == src and t["destination"] == dst and t["date"] == tomorrow]
        chips.append({"source": src, "destination": dst, "from_fare": min(fares) if fares else None})
    return chips


# ---------------------------------------------------------------------------
# 2. Seats
# ---------------------------------------------------------------------------

def get_seat_map(trip_id):
    """
    Build the seat map for one trip.

    Every seat gets one status:
      "booked"    - someone already has it (cannot be selected)
      "ladies"    - free, but reserved for a female passenger
      "available" - free for anyone
    The shape (decks, rows, aisle gaps) comes from the bus layout in data.py.
    """
    trip = get_trip(trip_id)
    if not trip:
        return None
    bus = data.get_bus(trip["bus_id"])
    booked, ladies = set(trip["booked_seats"]), set(trip["ladies_seats"])
    kind = "berth" if bus["layout"] == "sleeper" else "seat"
    counts = Counter()

    decks = []
    for deck in data.build_layout(bus["layout"]):
        rows = []
        for row in deck["rows"]:
            cells = []
            for seat in row:
                if seat is None:
                    cells.append(None)  # aisle
                    continue
                if seat in booked:
                    status = "booked"
                elif seat in ladies:
                    status = "ladies"
                else:
                    status = "available"
                counts[status] += 1
                cells.append({"id": seat, "status": status, "kind": kind,
                              "label": seat_label(bus, seat)})
            rows.append(cells)
        decks.append({"name": deck["name"], "rows": rows})

    return {"trip": trip_view(trip), "decks": decks, "counts": dict(counts)}


def seat_label(bus, seat):
    """
    Describe a seat in words, e.g. "Lower berth · Window" or "Seat · Aisle".
    A seat is a window seat if it is the first or last cell of its row.
    """
    for deck in data.build_layout(bus["layout"]):
        for row in deck["rows"]:
            if seat in row:
                position = "Window" if seat in (row[0], row[-1]) else "Aisle"
                if bus["layout"] == "sleeper":
                    return f"{deck['name'].split()[0]} berth · {position}"
                return f"Seat · {position}"
    return "Seat"


def get_boarding_points(trip_id):
    """
    Pickup points in the source city and drop points in the destination city,
    each with a time. Pickups are 15 minutes apart starting at departure;
    drops are 15 minutes apart, ending at the arrival time.
    """
    trip = get_trip(trip_id)
    start = departure_time(trip)
    end = start + timedelta(minutes=trip["duration_min"])
    pickups = data.CITIES[trip["source"]]["points"]
    drops = data.CITIES[trip["destination"]]["points"]
    boarding = [{"name": p, "time": (start + timedelta(minutes=15 * i)).strftime("%H:%M")}
                for i, p in enumerate(pickups)]
    dropping = [{"name": p, "time": (end - timedelta(minutes=15 * (len(drops) - 1 - i))).strftime("%H:%M")}
                for i, p in enumerate(drops)]
    return boarding, dropping


def validate_points(trip_id, boarding, dropping):
    """The chosen pickup and drop points must be real stops for this trip."""
    boarding_points, dropping_points = get_boarding_points(trip_id)
    if boarding not in [b["name"] for b in boarding_points]:
        return False, "Please choose a boarding point."
    if dropping not in [d["name"] for d in dropping_points]:
        return False, "Please choose a dropping point."
    return True, ""


def validate_seat_selection(trip_id, seats, now=None):
    """
    Check a seat selection before going further. Returns (ok, error message).
    Rules: the trip exists and has not left, 1 to 6 seats, no duplicates,
    every seat exists on this bus, and none of them is already booked.
    """
    trip = get_trip(trip_id)
    if not trip:
        return False, "That trip does not exist."
    if departure_time(trip) <= (now or datetime.now()):
        return False, "This bus has already departed."
    if not seats:
        return False, "Please select at least one seat."
    if len(seats) > MAX_SEATS_PER_BOOKING:
        return False, f"You can book at most {MAX_SEATS_PER_BOOKING} seats at a time."
    if len(set(seats)) != len(seats):
        return False, "The same seat was selected twice."
    valid = set(data.all_seat_ids(data.get_bus(trip["bus_id"])["layout"]))
    unknown = [s for s in seats if s not in valid]
    if unknown:
        return False, f"Seat {unknown[0]} does not exist on this bus."
    taken = [s for s in seats if s in trip["booked_seats"]]
    if taken:
        return False, f"Sorry, seat {', '.join(taken)} was just booked by someone else."
    return True, ""


# ---------------------------------------------------------------------------
# 3. Fare
# ---------------------------------------------------------------------------

def calculate_fare(base_fare, seats, bus_type):
    """
    Work out the full price.

        base total  = base fare x number of seats
        service fee = per-seat fee for this bus type x number of seats
        GST         = 5% of (base total + service fee)
        total       = base total + service fee + GST

    `seats` can be a list of seat numbers or just a count.
    Amounts are rounded to whole rupees.
    """
    count = len(seats) if isinstance(seats, (list, tuple, set)) else int(seats)
    fee_per_seat = SERVICE_FEE.get(bus_type, 0)
    base_total = base_fare * count
    service_fee = fee_per_seat * count
    gst = round((base_total + service_fee) * GST_RATE / 100)
    return {
        "seat_count": count,
        "base_fare": base_fare,
        "base_total": base_total,
        "service_fee_per_seat": fee_per_seat,
        "service_fee": service_fee,
        "gst_rate": GST_RATE,
        "gst": gst,
        "total": base_total + service_fee + gst,
    }


# ---------------------------------------------------------------------------
# 4. PNR
# ---------------------------------------------------------------------------

def generate_pnr():
    """
    A PNR (Passenger Name Record) is the ticket's unique code, e.g. BG7K29XQ1M:
    "BG" for BusGo + 8 random capital letters / digits.
    If the code already exists (very unlikely) we simply try again.
    """
    alphabet = string.ascii_uppercase + string.digits
    while True:
        pnr = "BG" + "".join(random.choices(alphabet, k=8))
        if pnr not in db["bookings"]:
            return pnr


# ---------------------------------------------------------------------------
# 5. Booking
# ---------------------------------------------------------------------------

def validate_passengers(seats, passengers, trip):
    """One passenger per seat, with a name, a sensible age and a gender. Ladies seats need a female passenger."""
    if len(passengers) != len(seats):
        return False, "Please enter details for every seat."
    for p in passengers:
        label = f"seat {p.get('seat', '?')}"
        if len(str(p.get("name", "")).strip()) < 2:
            return False, f"Please enter the passenger name for {label}."
        try:
            age = int(p.get("age"))
        except (TypeError, ValueError):
            return False, f"Please enter a valid age for {label}."
        if not 1 <= age <= 110:
            return False, f"Age for {label} must be between 1 and 110."
        if p.get("gender") not in ("Male", "Female", "Other"):
            return False, f"Please choose a gender for {label}."
        if p.get("seat") in trip["ladies_seats"] and p["gender"] != "Female":
            return False, f"Seat {p['seat']} is reserved for ladies."
    return True, ""


def validate_contact(contact):
    email = (contact or {}).get("email", "").strip()
    phone = re.sub(r"[\s\-]", "", (contact or {}).get("phone", ""))
    phone = re.sub(r"^(\+91|0)", "", phone)
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return False, "Please enter a valid email address."
    if not re.fullmatch(r"[6-9]\d{9}", phone):
        return False, "Please enter a valid 10-digit mobile number."
    return True, ""


def book_seats(trip_id, seats, passengers, user, contact=None, boarding=None, dropping=None,
               payment_method="UPI", now=None):
    """
    Book seats on a trip. Returns (True, booking) or (False, error message).

      1. Check the seats again - someone may have booked them while this
         user was typing passenger details. Already-booked seats are rejected.
      2. Check passenger and contact details.
      3. Work out the fare with calculate_fare().
      4. Mark the seats as booked on the trip, store the booking under a
         new PNR, and save everything to data.json.
    """
    now = now or datetime.now()
    ok, error = validate_seat_selection(trip_id, seats, now)
    if not ok:
        return False, error
    trip = get_trip(trip_id)
    ok, error = validate_passengers(seats, passengers, trip)
    if not ok:
        return False, error
    contact = contact or {"email": user.get("email", ""), "phone": user.get("phone", "")}
    ok, error = validate_contact(contact)
    if not ok:
        return False, error

    bus = data.get_bus(trip["bus_id"])
    boarding_points, dropping_points = get_boarding_points(trip_id)
    boarding = next((b for b in boarding_points if b["name"] == boarding), boarding_points[0])
    dropping = next((d for d in dropping_points if d["name"] == dropping), dropping_points[-1])

    pnr = generate_pnr()
    booking = {
        "pnr": pnr,
        "trip_id": trip_id,
        "user_id": user["id"],
        "seats": list(seats),
        "passengers": [{"seat": p["seat"], "name": p["name"].strip().title(), "age": int(p["age"]),
                        "gender": p["gender"]} for p in passengers],
        "contact": {"email": contact["email"].strip(), "phone": contact["phone"].strip()},
        "boarding": boarding,
        "dropping": dropping,
        "fare": calculate_fare(trip["base_fare"], seats, bus["type"]),
        "payment_method": payment_method,
        "status": "Confirmed",
        "booked_at": now.isoformat(timespec="seconds"),
        "cancelled_at": None,
        "refund": None,
    }
    trip["booked_seats"] = sorted(trip["booked_seats"] + list(seats), key=data.seat_sort_key)
    db["bookings"][pnr] = booking
    _save()
    return True, booking


def get_booking(pnr):
    return db["bookings"].get((pnr or "").strip().upper())


def qr_matrix(text, size=21):
    """
    A QR-code-LOOKING square pattern for the ticket (not a real, scannable QR).

    The PNR is hashed with SHA-256, the hash bits fill a size x size grid
    (1 = dark square), and the three big "finder" squares are drawn in the
    corners like a real QR code. The same PNR always gives the same pattern.
    Returns a list of rows, each a list of True/False.
    """
    digest = hashlib.sha256(text.encode()).digest()
    bits = "".join(f"{byte:08b}" for byte in digest * (size * size // 256 + 1))
    grid = [[bits[r * size + c] == "1" for c in range(size)] for r in range(size)]

    def finder(top, left):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = top + r, left + c
                if 0 <= rr < size and 0 <= cc < size:
                    ring = max(abs(r - 3), abs(c - 3))  # 0 = centre, 3 = outer edge
                    grid[rr][cc] = ring in (0, 1, 3)

    finder(0, 0)
    finder(0, size - 7)
    finder(size - 7, 0)
    return grid


def time_until(trip, now=None):
    """Friendly countdown to departure, e.g. "2 days 4 hrs" or "45 min". None if it has left."""
    seconds = (departure_time(trip) - (now or datetime.now())).total_seconds()
    if seconds <= 0:
        return None
    days, rest = divmod(int(seconds), 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    if days:
        return f"{days} day{'s' if days > 1 else ''} {hours} hr{'s' if hours != 1 else ''}"
    if hours:
        return f"{hours} hr{'s' if hours != 1 else ''} {minutes} min"
    return f"{max(minutes, 1)} min"


def booking_view(booking, now=None):
    """A booking together with its trip details, whether it is upcoming and the time left."""
    trip = get_trip(booking["trip_id"])
    view = dict(booking)
    view["trip"] = trip_view(trip, now)
    view["upcoming"] = not view["trip"]["departed"]
    view["departs_in"] = time_until(trip, now)
    return view


def get_user_bookings(user_id, now=None):
    """Split a user's bookings into the three My Bookings tabs."""
    tabs = {"upcoming": [], "past": [], "cancelled": []}
    for booking in db["bookings"].values():
        if booking["user_id"] != user_id:
            continue
        view = booking_view(booking, now)
        if booking["status"] == "Cancelled":
            tabs["cancelled"].append(view)
        elif view["upcoming"]:
            tabs["upcoming"].append(view)
        else:
            tabs["past"].append(view)
    tabs["upcoming"].sort(key=lambda b: departure_time(b["trip"]))
    tabs["past"].sort(key=lambda b: departure_time(b["trip"]), reverse=True)
    tabs["cancelled"].sort(key=lambda b: b["cancelled_at"] or "", reverse=True)
    return tabs


# ---------------------------------------------------------------------------
# 6. Cancellation and refund
# ---------------------------------------------------------------------------

def refund_policy(hours_left):
    """
    The refund rule:
        more than 24 hours before departure -> 90% back
        6 to 24 hours before departure      -> 50% back
        less than 6 hours                   -> cancellation not allowed (None)
    """
    if hours_left > 24:
        return 90
    if hours_left >= 6:
        return 50
    return None


def refund_quote(pnr, now=None):
    """Work out what a cancellation would refund, without cancelling anything."""
    booking = get_booking(pnr)
    if not booking:
        return {"ok": False, "message": "No booking found with that PNR."}
    if booking["status"] == "Cancelled":
        return {"ok": False, "message": "This booking is already cancelled."}
    hours_left = (departure_time(get_trip(booking["trip_id"])) - (now or datetime.now())).total_seconds() / 3600
    total = booking["fare"]["total"]
    percent = refund_policy(hours_left)
    quote = {"pnr": booking["pnr"], "total": total, "hours_left": round(hours_left, 1), "percent": percent}
    if hours_left <= 0:
        return dict(quote, ok=False, message="This bus has already departed.")
    if percent is None:
        return dict(quote, ok=False, message="Cancellation closes 6 hours before departure.")
    refund = round(total * percent / 100)
    return dict(quote, ok=True, refund=refund, deduction=total - refund,
                message=f"You will get {percent}% back: ₹{format_inr(refund)}")


def cancel_booking(pnr, now=None):
    """
    Cancel a booking. Returns (ok, message, quote).
    Uses refund_quote() for the amount, frees the seats on the trip so others
    can book them, marks the booking Cancelled and saves.
    """
    now = now or datetime.now()
    quote = refund_quote(pnr, now)
    if not quote["ok"]:
        return False, quote["message"], quote
    booking = get_booking(pnr)
    trip = get_trip(booking["trip_id"])
    trip["booked_seats"] = [s for s in trip["booked_seats"] if s not in booking["seats"]]
    booking["status"] = "Cancelled"
    booking["cancelled_at"] = now.isoformat(timespec="seconds")
    booking["refund"] = {"percent": quote["percent"], "amount": quote["refund"]}
    _save()
    return True, f"Booking {booking['pnr']} cancelled. ₹{format_inr(quote['refund'])} will be refunded.", quote


# ---------------------------------------------------------------------------
# 7. Admin
# ---------------------------------------------------------------------------

def get_stats(now=None):
    """
    Numbers for the admin dashboard:
      - confirmed bookings and tickets sold
      - revenue = confirmed fares + the part kept from cancelled tickets
      - occupancy % over the next 7 days (booked seats / all seats)
      - number of trips running today
      - bookings per route (for the bar chart) and the latest bookings
    """
    now = now or datetime.now()
    today = now.date()
    bookings = list(db["bookings"].values())
    confirmed = [b for b in bookings if b["status"] == "Confirmed"]
    cancelled = [b for b in bookings if b["status"] == "Cancelled"]

    revenue = sum(b["fare"]["total"] for b in confirmed) + \
        sum(b["fare"]["total"] - b["refund"]["amount"] for b in cancelled)

    week_end = (today + timedelta(days=6)).isoformat()
    booked_seats = total_seats = 0
    for trip in db["trips"].values():
        if today.isoformat() <= trip["date"] <= week_end:
            booked_seats += len(trip["booked_seats"])
            total_seats += len(data.all_seat_ids(data.get_bus(trip["bus_id"])["layout"]))
    occupancy = round(100 * booked_seats / total_seats, 1) if total_seats else 0

    todays = [t for t in db["trips"].values() if t["date"] == today.isoformat()]

    per_route = Counter()
    for b in confirmed:
        trip = get_trip(b["trip_id"])
        per_route[f"{trip['source']} → {trip['destination']}"] += 1
    top = per_route.most_common(8)
    highest = top[0][1] if top else 1
    routes = [{"route": r, "count": c, "percent": round(100 * c / highest)} for r, c in top]

    recent = sorted(bookings, key=lambda b: b["booked_at"], reverse=True)[:10]

    # Trips with at least one BusGo booking, soonest first, for the manifest picker.
    with_bookings = {b["trip_id"] for b in confirmed}
    manifest_trips = sorted((trip_view(get_trip(t), now) for t in with_bookings),
                            key=lambda t: (t["departed"], t["date"], t["depart"]))

    return {
        "bookings": len(confirmed),
        "tickets": sum(len(b["seats"]) for b in confirmed),
        "cancelled": len(cancelled),
        "revenue": revenue,
        "occupancy": occupancy,
        "todays_trips": len(todays),
        "todays_departed": sum(1 for t in todays if departure_time(t) <= now),
        "routes": routes,
        "recent": [booking_view(b, now) for b in recent],
        "manifest_trips": manifest_trips[:20],
    }


def get_manifest(trip_id):
    """Passenger list for one trip, in seat order - what the conductor would carry."""
    trip = get_trip(trip_id)
    if not trip:
        return None
    rows = []
    for b in db["bookings"].values():
        if b["trip_id"] == trip_id and b["status"] == "Confirmed":
            for p in b["passengers"]:
                rows.append(dict(p, pnr=b["pnr"], boarding=b["boarding"], phone=b["contact"]["phone"]))
    rows.sort(key=lambda r: data.seat_sort_key(r["seat"]))
    return {
        "trip": trip_view(trip),
        "passengers": rows,
        # Seats taken outside BusGo (pre-booked seed data = counter / partner sales).
        "other_sales": len(trip["booked_seats"]) - len(rows),
    }


def add_trip(form, now=None):
    """
    Add a new trip from the admin form. Returns (ok, message, trip).
    Validates every field, builds the trip with data.make_trip() and saves it.
    It shows up in search results straight away.
    """
    now = now or datetime.now()
    bus = data.get_bus(form.get("bus_id", ""))
    source, destination = form.get("source", ""), form.get("destination", "")
    if not bus:
        return False, "Please choose a bus.", None
    if source not in data.CITIES or destination not in data.CITIES:
        return False, "Please choose both cities.", None
    if source == destination:
        return False, "From and To cannot be the same city.", None
    try:
        day = datetime.strptime(form.get("date", ""), "%Y-%m-%d").date()
        depart = datetime.strptime(form.get("depart", ""), "%H:%M").strftime("%H:%M")
    except ValueError:
        return False, "Please enter a valid date and departure time.", None
    if datetime.combine(day, datetime.strptime(depart, "%H:%M").time()) <= now:
        return False, "The departure must be in the future.", None
    try:
        duration_min = int(round(float(form.get("duration_hours", "")) * 60))
        fare = int(form.get("base_fare", ""))
    except ValueError:
        return False, "Duration and fare must be numbers.", None
    if not 30 <= duration_min <= 24 * 60:
        return False, "Duration must be between 0.5 and 24 hours.", None
    if not 100 <= fare <= 10000:
        return False, "Fare must be between ₹100 and ₹10,000.", None

    trip_id = f"{data.CITIES[source]['code']}-{data.CITIES[destination]['code']}-{day:%Y%m%d}-{depart.replace(':', '')}"
    base_id, n = trip_id, 2
    while trip_id in db["trips"]:
        trip_id, n = f"{base_id}-{n}", n + 1

    ladies = random.Random(trip_id).sample(data.all_seat_ids(bus["layout"]), 2)
    trip = data.make_trip(trip_id, bus, source, destination, day, depart, duration_min, fare, ladies=ladies)
    trip["custom"] = True
    db["trips"][trip_id] = trip
    _save()
    return True, f"Trip {source} → {destination} on {day:%d %b} at {depart} added.", trip


# ---------------------------------------------------------------------------
# Demo bookings (first run only)
# ---------------------------------------------------------------------------

GUEST_NAMES = [
    ("Rohan Kulkarni", "Male"), ("Sneha Reddy", "Female"), ("Arjun Menon", "Male"), ("Kavya Rao", "Female"),
    ("Vikram Singh", "Male"), ("Divya Pillai", "Female"), ("Karthik Subramanian", "Male"), ("Ishita Joshi", "Female"),
    ("Nikhil Deshpande", "Male"), ("Pooja Hegde", "Female"), ("Siddharth Iyer", "Male"), ("Meghna Das", "Female"),
    ("Aditya Patil", "Male"), ("Lakshmi Narayanan", "Female"), ("Farhan Qureshi", "Male"), ("Tanvi Shetty", "Female"),
    ("Rahul Verma", "Male"), ("Neha Gowda", "Female"), ("Sameer Khan", "Male"), ("Anjali Krishnan", "Female"),
]


def _find_trip(source, destination, day, slot=0):
    trips = sorted((t for t in db["trips"].values()
                    if t["source"] == source and t["destination"] == destination and t["date"] == day.isoformat()),
                   key=lambda t: t["depart"])
    return trips[min(slot, len(trips) - 1)] if trips else None


def _demo_book(rng, trip, user, people, real_now, cancel=False):
    """Book a demo ticket through the normal book_seats() so it obeys every rule."""
    free = [s for s in data.all_seat_ids(data.get_bus(trip["bus_id"])["layout"])
            if s not in trip["booked_seats"] and s not in trip["ladies_seats"]]
    if len(free) < len(people):
        return None
    seats = rng.sample(free, len(people))
    passengers = [{"seat": s, "name": n, "age": a, "gender": g} for s, (n, a, g) in zip(seats, people)]
    dep = departure_time(trip)
    booked_at = min(dep - timedelta(days=rng.randint(2, 9), hours=rng.randint(0, 12)),
                    real_now - timedelta(hours=rng.randint(1, 30)))
    email = user["email"] if user["id"] != "guest" else people[0][0].split()[0].lower() + "@example.com"
    phone = user["phone"] if user["id"] != "guest" else f"9{rng.randint(100000000, 999999999)}"
    ok, booking = book_seats(trip["id"], seats, passengers, user, {"email": email, "phone": phone},
                             payment_method=rng.choice(["UPI", "Card", "Wallet"]), now=booked_at)
    if ok and cancel:
        cancel_booking(booking["pnr"], now=booked_at + timedelta(hours=20))
    return booking if ok else None


def seed_demo_bookings():
    """
    On the very first run, create some bookings so My Bookings and the admin
    dashboard are not empty. They go through book_seats() like real ones.
    """
    if db["meta"].get("demo_seeded"):
        return
    rng = random.Random(2024)
    real_now = datetime.now()
    today = real_now.date()
    aarav, priya, guest = get_user("u1"), get_user("u2"), {"id": "guest", "email": "", "phone": ""}
    d = lambda n: today + timedelta(days=n)

    plan = [
        (aarav, ("Bengaluru", "Goa", d(5), 1), [("Aarav Sharma", 27, "Male"), ("Ananya Sharma", 24, "Female")], False),
        (aarav, ("Bengaluru", "Mysuru", d(1), 2), [("Aarav Sharma", 27, "Male")], False),
        (aarav, ("Mysuru", "Bengaluru", d(-2), 3), [("Aarav Sharma", 27, "Male")], False),
        (aarav, ("Bengaluru", "Chennai", d(4), 0), [("Aarav Sharma", 27, "Male"), ("Kabir Sharma", 31, "Male")], True),
        (priya, ("Kochi", "Bengaluru", d(2), 1), [("Priya Nair", 26, "Female")], False),
        (priya, ("Coimbatore", "Kochi", d(-1), 0), [("Priya Nair", 26, "Female"), ("Lakshmi Nair", 54, "Female")], False),
    ]
    for user, (src, dst, day, slot), people, cancel in plan:
        trip = _find_trip(src, dst, day, slot)
        if trip:
            _demo_book(rng, trip, user, people, real_now, cancel)

    # Guest bookings spread over the last few days and the coming week.
    routes = [(a, b) for a, b, *_ in data.ROUTES] + [(b, a) for a, b, *_ in data.ROUTES]
    weights = [6 if "Bengaluru" in r and ("Goa" in r or "Mysuru" in r) else 3 if "Bengaluru" in r else 2 for r in routes]
    for _ in range(70):
        src, dst = rng.choices(routes, weights)[0]
        trip = _find_trip(src, dst, d(rng.randint(-data.PAST_DAYS, 6)), rng.randint(0, 3))
        if trip:
            people = []
            for name, gender in rng.sample(GUEST_NAMES, rng.choice([1, 1, 2, 2, 3, 4])):
                people.append((name, rng.randint(19, 62), gender))
            _demo_book(rng, trip, guest, people, real_now, cancel=rng.random() < 0.12)

    db["meta"]["demo_seeded"] = True
    _save()


# ---------------------------------------------------------------------------
# Terminal demo: python logic.py
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    data.AUTOSAVE = False  # work in memory only
    init()
    line = "-" * 72
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    print(line)
    print(f"SEARCH  Bengaluru -> Goa on {tomorrow}")
    print(line)
    results = search_buses("Bengaluru", "Goa", tomorrow)
    for t in results:
        print(f"{t['depart']} -> {t['arrive']}{' (+1)' if t['next_day'] else '':5} {t['bus']['name']:<26}"
              f"{t['bus']['type']:<16} Rs.{format_inr(t['base_fare']):>6}  {t['seats_left']:>2} seats left")

    trip = results[0]
    seat_map = get_seat_map(trip["id"])
    print(f"\nSEAT MAP  {trip['id']}  counts: {seat_map['counts']}")
    for deck in seat_map["decks"]:
        print(f"  {deck['name']}")
        for row in deck["rows"]:
            print("   ", " ".join("   " if c is None else
                                  {"booked": " ##", "ladies": " ♀ ", "available": f"{c['id']:>3}"}[c["status"]]
                                  for c in row))

    free = [c["id"] for d_ in seat_map["decks"] for r in d_["rows"] for c in r if c and c["status"] == "available"]
    seats = free[:2]
    fare = calculate_fare(trip["base_fare"], seats, trip["bus"]["type"])
    print(f"\nFARE for seats {seats}: {fare}")

    user = get_user("u1")
    passengers = [{"seat": seats[0], "name": "aarav sharma", "age": 27, "gender": "Male"},
                  {"seat": seats[1], "name": "ananya sharma", "age": 24, "gender": "Female"}]
    ok, booking = book_seats(trip["id"], seats, passengers, user)
    print(f"\nBOOK  ok={ok}  PNR={booking['pnr']}  total=Rs.{format_inr(booking['fare']['total'])}")

    ok, error = book_seats(trip["id"], seats[:1], passengers[:1], user)
    print(f"BOOK the same seat again -> ok={ok}: {error}")

    lady_seat = trip["ladies_seats"][0]
    ok, error = book_seats(trip["id"], [lady_seat], [{"seat": lady_seat, "name": "Rahul", "age": 30, "gender": "Male"}], user)
    print(f"BOOK ladies seat as male  -> ok={ok}: {error}")

    print(f"\nREFUND QUOTE now          : {refund_quote(booking['pnr'])['message']}")
    dep = departure_time(trip)
    print(f"REFUND QUOTE 10h before   : {refund_quote(booking['pnr'], dep - timedelta(hours=10))['message']}")
    print(f"REFUND QUOTE 3h before    : {refund_quote(booking['pnr'], dep - timedelta(hours=3))['message']}")
    ok, message, _ = cancel_booking(booking["pnr"])
    print(f"CANCEL -> ok={ok}: {message}")
    print(f"Seats free again? {all(s not in get_trip(trip['id'])['booked_seats'] for s in seats)}")

    stats = get_stats()
    print(f"\nADMIN STATS  bookings={stats['bookings']}  revenue=Rs.{format_inr(stats['revenue'])}  "
          f"occupancy={stats['occupancy']}%  today's trips={stats['todays_trips']}")
    for r in stats["routes"][:5]:
        print(f"  {r['route']:<26} {'█' * r['count']} {r['count']}")
    print(f"\nTotal trips in memory: {len(db['trips'])}, bookings: {len(db['bookings'])}  (data.json untouched)")
