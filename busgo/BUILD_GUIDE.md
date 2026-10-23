# BusGo — How It Was Built (and Where Python Is Used)

This guide explains **how BusGo was put together, step by step**, and **exactly
where Python does the work**. Read it alongside the code; every function named
here exists in the files listed. For setup instructions see `README.md`.

---

## Contents

1. [The big picture](#1-the-big-picture)
2. [How it was built — the 10 phases](#2-how-it-was-built--the-10-phases)
3. [Python libraries used, and where](#3-python-libraries-used-and-where)
4. [Python concepts used, with examples from the code](#4-python-concepts-used-with-examples-from-the-code)
5. [The data model](#5-the-data-model)
6. [One booking, start to finish](#6-one-booking-start-to-finish)
7. [Key code, explained line by line](#7-key-code-explained-line-by-line)
8. [What is *not* Python, and why it is still controlled by Python](#8-what-is-not-python-and-why-it-is-still-controlled-by-python)
9. [How it was tested](#9-how-it-was-tested)
10. [How to change or extend it](#10-how-to-change-or-extend-it)

---

## 1. The big picture

BusGo has three Python files, each with one job:

```
                 ┌──────────────────────────────────────────────┐
   Browser  ───▶ │ app.py   — ROUTES                            │
  (HTML/CSS/JS)  │  reads the request, calls logic.py,          │
       ▲         │  renders a template                          │
       │         └───────────────┬──────────────────────────────┘
       │                         │ calls
       │         ┌───────────────▼──────────────────────────────┐
       │         │ logic.py — BUSINESS RULES                    │
       │         │  search, seats, fare, PNR, booking,          │
       │         │  cancellation/refund, admin stats            │
       │         └───────────────┬──────────────────────────────┘
       │                         │ reads / writes
       │         ┌───────────────▼──────────────────────────────┐
       │         │ data.py  — DATA                              │
       │         │  lists & dicts + load_data() / save_data()   │
       │         └───────────────┬──────────────────────────────┘
       │                         ▼
       └──── HTML page ◀──   data.json  (saved after every change)
```

**The golden rule used throughout:** a route in `app.py` never decides
anything. It asks `logic.py`, and `logic.py` is the only place where rules like
"maximum 6 seats" or "90% refund" are written.

| File | Lines | Language | Role |
|---|---|---|---|
| `data.py` | ~300 | Python | Seed data, trip generator, JSON load/save |
| `logic.py` | ~940 | Python | Every business rule + a terminal demo |
| `app.py` | ~430 | Python (Flask) | 18 routes, login decorators, session |
| `templates/*.html` | — | Jinja2 (Python templating) | Pages filled in with Python values |
| `static/css/style.css` | — | CSS | Look and animations only |
| `static/js/app.js` | — | JavaScript | Clicks, animations, live updates — no rules |

---

## 2. How it was built — the 10 phases

The project was built in phases. After each phase the app was run, errors were
fixed, and the result was checked in a browser before moving on.

### Phase 1 — Plan
Listed every file, every Python function and every route **before writing code**.
Decisions made here:
- Search works without login; booking needs login, and after signing in you're
  sent back to where you were.
- Seater buses use a 2+2 layout (40 seats); sleepers have two decks of 1+2
  berths (L1–L18 lower, U1–U18 upper).
- `calculate_fare` uses the bus type to add a per-seat service fee.

### Phase 2 — The Python core (`data.py`, `logic.py`, `app.py` skeleton)
This came first on purpose: the logic had to work **before** any design existed.
- `data.py` was written with users, cities, 10 invented operators and 15 routes,
  plus `_generate_day()`, which creates about 84 trips a day.
- `logic.py` got all seven required functions (`search_buses`, `get_seat_map`,
  `calculate_fare`, `generate_pnr`, `book_seats`, `cancel_booking`, `get_stats`)
  and their validators.
- `app.py` started as a skeleton returning **JSON**, so the logic could be
  checked in a browser with no HTML at all.
- `python logic.py` was added as a **terminal demo**. It prints a search, a
  booking, a rejected double booking, a rejected ladies-seat booking and the
  three refund tiers. That proved the Python worked on its own.

### Phase 3 — Design system and shell
- `style.css` started with **design tokens** in `:root` (colours, blur, radius,
  timings) so every page shares one look.
- `base.html` holds what every page has: the drifting gradient blobs, the navbar,
  toast notifications and the footer.
- Mock login: three profile cards. Clicking one sends a POST to `/login/<id>`,
  which stores the user id in the **Flask session**.
- Flask's `flash()` messages are shown as glass toasts.

### Phase 4 — Search and results
- New Python functions: `validate_search`, `fare_calendar` (7-day price strip),
  `add_highlights` (Cheapest / Fastest / Top rated / Filling fast),
  `destinations_from` (suggestions when a route isn't served), `quick_dates`,
  `home_stats`.
- Filters (AC, sleeper, time of day, price) run in the browser on data that
  **Python already put on each card** as `data-*` attributes.

### Phase 5 — Seats and passengers
- `get_seat_map` returns each seat's status, and `seat_label` describes it in
  words ("Lower berth · Window").
- The live fare on the seat page comes from **Python**: JavaScript calls
  `/api/fare`, which runs `calculate_fare()` and returns JSON.
- The selection is stored in `session["draft"]` so it survives page changes,
  including the login detour.
- `validate_passengers` enforces the ladies-seat rule. The page also locks
  those seats to "Female", but Python is what really guarantees it.

### Phase 6 — Payment and ticket
- Payment is fake, so any input is accepted. Pressing Pay calls `book_seats()`,
  which **re-checks the seats** before saving. If someone took a seat meanwhile,
  you're sent back to the seat map.
- `qr_matrix()` turns the PNR into a QR-like pattern using a SHA-256 hash.
- The success page shows the celebration only once: `session.pop("just_booked")`.

### Phase 7 — My Bookings, cancellation, PNR status
- `get_user_bookings` splits bookings into Upcoming / Past / Cancelled.
- The cancel modal calls `/api/refund/<pnr>` → `refund_quote()`, so the refund
  shown is **calculated by Python**.
- `cancel_booking()` frees the seats and records the refund.
- `can_manage()` in `app.py` makes sure only the owner (or the admin) can cancel.

### Phase 8 — Admin dashboard
- `get_stats()` supplies the stat tiles, the bookings-per-route chart and the
  recent bookings.
- `add_trip()` validates the admin form and inserts a new trip, which is
  searchable immediately.
- `get_manifest()` lists a trip's passengers in seat order.

### Phase 9 — Polish
Every page was checked at desktop (1440 px), tablet (768 px) and phone (375 px)
widths, with animations on and with "reduce motion" on. Layout breaks were
fixed, and the Python was kept compatible with **Python 3.10+**.

### Phase 10 — Documentation
`README.md` (setup, features, viva notes) and this guide.

---

## 3. Python libraries used, and where

Only **one** outside package is used: Flask. Everything else is in Python's
standard library.

| Library | Imported in | What it's used for |
|---|---|---|
| **`flask`** | `app.py` | The web framework. `Flask` (the app), `render_template` (HTML pages), `request` (form/URL data), `session` (who is logged in + the booking draft), `redirect` / `url_for` (moving between pages), `flash` (toast messages), `jsonify` (the `/api/...` answers), `abort` (404 pages) |
| `functools.wraps` | `app.py` | Keeps the original function's name when building the `login_required` / `admin_required` decorators |
| `json` | `data.py` | `json.load()` reads `data.json`; `json.dump()` writes it |
| `os` | `data.py` | `os.path` finds `data.json` next to the code; `os.replace()` swaps in the new file safely |
| `random` | `data.py`, `logic.py` | `random.Random(trip_id)` gives repeatable pre-booked seats; `random.choices` builds PNRs; `random.sample` picks seats |
| `datetime` (`date`, `datetime`, `timedelta`) | all three | Departure/arrival times, "hours until departure", the 14-day window, date formatting |
| `hashlib` | `logic.py` | `hashlib.sha256()` in `qr_matrix()` turns a PNR into the ticket pattern |
| `re` (regular expressions) | `logic.py` | `validate_contact()` checks the email and the 10-digit mobile number |
| `string` | `logic.py` | `string.ascii_uppercase + string.digits` is the PNR alphabet |
| `collections.Counter` | `logic.py` | Counts seat statuses and bookings per route (`.most_common(8)` for the chart) |

**Jinja2** comes with Flask. It's the templating language in `templates/`,
covered in [section 8](#8-what-is-not-python-and-why-it-is-still-controlled-by-python).

---

## 4. Python concepts used, with examples from the code

Useful for a viva: point at a real line for each concept.

| Concept | Where to find it | What it does there |
|---|---|---|
| **Lists** | `data.USERS`, `data.BUSES`, `trip["booked_seats"]` | Ordered collections of users, buses, seat numbers |
| **Dictionaries** | `db["trips"]` (id → trip), `db["bookings"]` (PNR → booking) | Instant lookup by key: `db["bookings"].get(pnr)` |
| **Tuples** | each entry in `data.ROUTES` | Fixed records: `("Bengaluru", "Goa", 660, 1290, [...])` |
| **Sets** | `get_seat_map`: `booked, ladies = set(...), set(...)` | Fast "is this seat in the set?" checks |
| **Functions returning two values** | `validate_*`, `book_seats` → `(ok, result)` | The caller checks `ok` first, then uses the message or the booking |
| **Default arguments** | `search_buses(..., now=None)` | `now` can be faked in tests; normally it's the current time |
| **List comprehensions** | `all_seat_ids`: `[cell for deck in ... for row in ... for cell in row if cell]` | Builds lists in one readable line |
| **Generator expressions + `next()`** | `book_seats`: `next((b for b in boarding_points if ...), boarding_points[0])` | Finds the first match, with a fallback |
| **Sorting with a key** | `seat_sort_key()`; `results.sort(key=lambda t: t["depart"])` | Natural seat order ("2" before "10"); buses by time |
| **`min` / `max` with key** | `add_highlights`: `min(results, key=lambda t: t["base_fare"])` | Finds the cheapest / fastest / best-rated bus |
| **Lambda** | sort keys, the `nice_date` filter in `app.py` | Small one-line functions |
| **f-strings** | `generate_pnr`, messages, trip ids `f"{code}-{code}-{day:%Y%m%d}-..."` | Building text, including formatted dates |
| **`while` loop** | `generate_pnr()` | Keep generating until the PNR is unique |
| **Nested function** | `finder()` inside `qr_matrix()` | Draws one corner square; only needed inside that function |
| **`divmod`** | `time_until()` | Splits seconds into days, hours, minutes |
| **Exceptions (`try` / `except`)** | `load_data()` (`OSError`, `ValueError`); `add_trip()` (`ValueError`) | A damaged file or a non-number in a form doesn't crash the app |
| **Decorators** | `@login_required`, `@admin_required`, `@app.route(...)` | Wrap a page with a check, e.g. "must be logged in" |
| **Closures** | `wrapper()` inside `login_required` | The inner function remembers which `view` it protects |
| **Module-level state + `global`** | `logic.db` set by `init()` | One shared copy of the data for the whole app |
| **`with open(...)`** | `load_data()`, `save_data()` | Files are always closed, even after an error |
| **`if __name__ == "__main__":`** | bottom of `logic.py` and `app.py` | `python logic.py` runs the demo; importing `logic` doesn't |
| **Regular expressions** | `validate_contact()`: `r"[6-9]\d{9}"` | Pattern-checks the phone number and email |
| **Hashing** | `qr_matrix()`: `hashlib.sha256(text.encode()).digest()` | Same input → same pattern, every time |
| **Seeded randomness** | `random.Random(trip_id)` in `_generate_day()` | "Random" but repeatable seat data |
| **Date arithmetic** | `departure_time(trip) - now` → `timedelta` | Hours left for the refund rule |

---

## 5. The data model

All data lives in one Python dictionary called `db`, created by
`data.load_data()` and shared through `logic.db`:

```python
db = {
    "trips":    { "BLR-GOI-20261025-2030": {...}, ... },   # ~1,400 trips
    "bookings": { "BGCW6G84WM": {...}, ... },              # every ticket
    "meta":     { "created": "...", "demo_seeded": True },
}
```

**Fixed reference data** is written directly in `data.py` and is *not* saved
to JSON: `USERS` (3 profiles), `CITIES` (9 cities with pickup/drop points),
`BUSES` (10 operators), `ROUTES` (15 routes, run both ways),
`TYPE_PRICE_FACTOR` (price multiplier per bus type).

**A trip** (made by `data.make_trip()`):

```json
{
  "id": "BLR-GOI-20261025-2030",
  "bus_id": "B03",
  "source": "Bengaluru",   "destination": "Goa",
  "date": "2026-10-25",    "depart": "20:30",
  "arrive": "07:30",       "arrive_date": "2026-10-26",
  "duration_min": 660,
  "base_fare": 1749,
  "booked_seats": ["L1", "L2", "L3", "L4", "L7", "..."],
  "ladies_seats": ["L12", "L17", "U6"]
}
```

The id is readable: city codes + date + time. That base fare is a Sunday price;
the same bus on Tuesday costs ₹1,599, because of the 10% weekend markup in
`data._price()`.

**A booking** (made by `logic.book_seats()`):

```json
{
  "pnr": "BGCW6G84WM",
  "trip_id": "BLR-GOI-20261027-2030",
  "user_id": "u1",
  "seats": ["U10", "L10"],
  "passengers": [
    {"seat": "U10", "name": "Aarav Sharma",  "age": 27, "gender": "Male"},
    {"seat": "L10", "name": "Ananya Sharma", "age": 24, "gender": "Female"}
  ],
  "contact": {"email": "aarav.sharma@example.com", "phone": "98450 12345"},
  "boarding": {"name": "Majestic Bus Stand", "time": "20:30"},
  "dropping": {"name": "Margao", "time": "07:30"},
  "fare": {"seat_count": 2, "base_fare": 1599, "base_total": 3198,
           "service_fee_per_seat": 100, "service_fee": 200,
           "gst_rate": 5, "gst": 170, "total": 3568},
  "payment_method": "Wallet",
  "status": "Cancelled",
  "booked_at": "2026-10-21T13:18:25",
  "cancelled_at": "2026-10-23T00:51:28",
  "refund": {"percent": 90, "amount": 3211}
}
```

Check the fare by hand: 1,599 × 2 = 3,198; + ₹100 × 2 service fee = 3,398;
5% GST = 170 → total **3,568**. The refund was 90% of 3,568 = **3,211**.

---

## 6. One booking, start to finish

What happens in Python at each step of a real booking:

| Step | URL | Route in `app.py` | Python functions that run | Template |
|---|---|---|---|---|
| 1. Sign in | `POST /login/u1` | `login_as()` | `get_user()`; stores `session["user_id"]`; `flash()` | redirect |
| 2. Home page | `GET /` | `index()` | `search_form_context()` → `destinations_from()`, `booking_window()`, `quick_dates()`; `popular_routes()`, `home_stats()` | `index.html` |
| 3. Search | `GET /search?source=…&destination=…&date=…` | `search()` | `validate_search()` → `search_buses()` (→ `trip_view()`, `add_highlights()`), `fare_calendar()` | `results.html` |
| 4. Seat map | `GET /trip/<id>/seats` | `seats()` | `get_trip()`, `trip_view()`, `get_seat_map()` (→ `seat_label()`), `get_boarding_points()`, `calculate_fare()` | `seats.html` |
| 4a. Live fare (each click) | `GET /api/fare?trip_id=…&seats=…` | `api_fare()` | `calculate_fare()` → JSON | — |
| 5. Confirm seats | `POST /trip/<id>/seats` | `seats()` | `validate_seat_selection()`, `validate_points()`; saves `session["draft"]` | redirect |
| 6. Passengers | `GET`/`POST /passengers` | `passengers()` | `validate_seat_selection()` again, `validate_passengers()`, `validate_contact()`, `calculate_fare()` | `passengers.html` |
| 7. Pay | `POST /payment` | `payment()` | **`book_seats()`** → `generate_pnr()`, `calculate_fare()`, `data.save_data()` | redirect |
| 8. Ticket | `GET /booking/<pnr>` | `booking()` | `get_booking()`, `booking_view()` (→ `time_until()`); `qr_matrix()` inside the template | `success.html` |
| 9. Cancel quote | `GET /api/refund/<pnr>` | `api_refund()` | `can_manage()`, `refund_quote()` (→ `refund_policy()`) → JSON | — |
| 10. Cancel | `POST /booking/<pnr>/cancel` | `cancel()` | `cancel_booking()` → `data.save_data()` | redirect |

**Why the seats are checked three times** (steps 5, 6 and 7): another
passenger could book the same seat while you're typing. Only the final check
inside `book_seats()` counts, and it runs right before the booking is saved.

---

## 7. Key code, explained line by line

### 7.1 The fare — `logic.calculate_fare()`

```python
count = len(seats) if isinstance(seats, (list, tuple, set)) else int(seats)  # a list of seats OR just a number
fee_per_seat = SERVICE_FEE.get(bus_type, 0)          # ₹0 / ₹30 / ₹50 / ₹100 depending on bus type
base_total = base_fare * count
service_fee = fee_per_seat * count
gst = round((base_total + service_fee) * GST_RATE / 100)   # 5% GST, rounded to whole rupees
return {..., "gst": gst, "total": base_total + service_fee + gst}
```
It returns a **dictionary** rather than one number, so every page (seat page,
passenger page, ticket, admin) can show the same breakup.

### 7.2 The PNR — `logic.generate_pnr()`

```python
alphabet = string.ascii_uppercase + string.digits      # A–Z and 0–9 = 36 characters
while True:
    pnr = "BG" + "".join(random.choices(alphabet, k=8))  # e.g. BG7K29XQ1M
    if pnr not in db["bookings"]:                         # unique? then use it
        return pnr
```
With 36⁸ ≈ 2.8 trillion possible codes a repeat is very unlikely, but the loop
makes it impossible.

### 7.3 The refund rule — `logic.refund_policy()`

```python
if hours_left > 24:
    return 90        # more than a day before: 90% back
if hours_left >= 6:
    return 50        # 6 to 24 hours before: 50% back
return None          # under 6 hours: cancellation not allowed
```
`refund_quote()` works out `hours_left` from `departure_time(trip) - now` and
uses this function. `cancel_booking()` uses `refund_quote()`, so the rule is
written **once** and used everywhere.

### 7.4 Booking — `logic.book_seats()`, in four steps

```python
ok, error = validate_seat_selection(trip_id, seats, now)   # 1. seats still free? 1–6 seats?
if not ok:
    return False, error
ok, error = validate_passengers(seats, passengers, trip)   # 2. names, ages, ladies-seat rule
...
pnr = generate_pnr()                                       # 3. new code + fare breakup
booking = {"pnr": pnr, ..., "fare": calculate_fare(...), "status": "Confirmed", ...}
trip["booked_seats"] = sorted(trip["booked_seats"] + list(seats), key=data.seat_sort_key)
db["bookings"][pnr] = booking                              # 4. store it...
_save()                                                    #    ...and write data.json
return True, booking
```

### 7.5 Login protection — the decorator in `app.py`

```python
def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user():                    # nobody in the session?
            flash("Please pick a profile to continue.", "info")
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)              # otherwise show the page as normal
    return wrapper
```
Putting `@login_required` above a route (e.g. `my_bookings`) wraps it with this
check. The `next=` part brings the user back to the same page after signing in.

### 7.6 Saving safely — `data.save_data()`

```python
tmp = DATA_FILE + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(db, f, indent=1, ensure_ascii=False)   # write everything to a temporary file
os.replace(tmp, DATA_FILE)                           # then swap it in
```
If the program crashed halfway through writing, the old `data.json` would still
be intact.

### 7.7 How JavaScript asks Python for the live fare

Python side (`app.py`):
```python
@app.route("/api/fare")
def api_fare():
    trip = logic.get_trip(request.args.get("trip_id", ""))
    seats = [s for s in request.args.get("seats", "").split(",") if s]
    bus_type = logic.trip_view(trip)["bus"]["type"]
    return jsonify(logic.calculate_fare(trip["base_fare"], seats, bus_type))
```
Browser side (`app.js`, `refreshFare()` — simplified here) only **displays** the answer:
```js
fetch(fareUrl + "?trip_id=" + tripId + "&seats=" + selected.join(","))
  .then(r => r.json())
  .then(fare => animateNumber(totalElement, fare.total));
```

### 7.8 Repeatable "random" seats — `data._generate_day()`

```python
rng = random.Random(trip_id)        # the trip id is the seed
booked = rng.sample(seats, int(len(seats) * fill))
```
The same trip id always produces the same booked seats, so the demo looks the
same on every computer and every run.

---

## 8. What is *not* Python, and why it is still controlled by Python

| Part | Technology | What it does | How Python controls it |
|---|---|---|---|
| `templates/*.html` | **Jinja2**, the templating language bundled with Flask | Page structure | Python passes values in through `render_template(...)`; templates only display them |
| `static/css/style.css` | CSS | Glass look, layout, animations, phone layout, print layout | — (looks only) |
| `static/js/app.js` | Vanilla JavaScript | Ripple, tilt, toasts, seat clicks, filters, tabs, modal, confetti | Any number that matters (fare, refund) is fetched from a Python `/api/...` route |

Jinja2 features used, with examples:
- **Inheritance:** every page starts with `{% extends "base.html" %}` and fills `{% block content %}`.
- **Macros** (reusable pieces): `icon()`, `logo()`, `avatar()`, `steps()`, `trip_strip()` in `_macros.html`; `ticket()` and `qr()` in `_ticket.html`.
- **Includes:** `_search_form.html` is used on both the home and results pages.
- **Custom filters registered in Python** (in `app.py`):
  - `inr`, which calls `logic.format_inr`: `{{ 170843|inr }}` → `1,70,843`
  - `nice_date`: `2026-10-22T…` → `22 Oct 2026`
- **A Python function used inside templates:** `qr_matrix` is registered as a
  Jinja global, so `_ticket.html` can draw the pattern.
- **Passing Python data to JavaScript:** `{{ preselected|tojson }}` in `seats.html`.

**Browser checks vs Python checks:** the passenger form highlights mistakes in
the browser for speed, but `validate_passengers()` and `validate_contact()`
check everything again on the server. Browser checks can be bypassed; Python's
can't.

---

## 9. How it was tested

| What | How |
|---|---|
| Business rules on their own | `python logic.py` — terminal demo on an in-memory copy (`data.AUTOSAVE = False`), so `data.json` is never touched |
| Server-side rules | Flask's built-in **test client** posted bad data straight to the routes: an already-booked seat, 7 seats, a fake boarding point, a male passenger on a ladies seat, a bad phone number, someone else's booking, paying twice, a seat stolen during checkout. Each was rejected with the right message. |
| Edge timings | The `now=` parameter faked "5 hours before departure" and "after departure" to test the refund rule without waiting |
| Every page in a real browser | Automated Chromium (Playwright) clicked through the full journey at 1440 / 768 / 375 px, looking for JavaScript errors and anything wider than the screen; screenshots were reviewed by eye |
| Accessibility settings | The same sweep repeated with "reduce motion" on, to confirm nothing stays hidden when animations are off |
| Python version | Code compiled under Python 3.11 to make sure nothing needs 3.12+ (the brief asks for 3.10+) |

---

## 10. How to change or extend it

These show you understand the structure, and they're good viva demos:

| To… | Change this |
|---|---|
| Change GST from 5% to 12% | `GST_RATE = 5` at the top of `logic.py` |
| Change the refund percentages or hours | `refund_policy()` in `logic.py` (one place — every page updates) |
| Allow 8 seats per booking | `MAX_SEATS_PER_BOOKING = 6` in `logic.py` |
| Add a new city | Add it to `CITIES` in `data.py` (code + pickup points) and add a route to `ROUTES`, then delete `data.json` and restart |
| Add a bus operator | Add a dictionary to `BUSES` in `data.py` |
| Change the weekend markup | `_price()` in `data.py` (`price *= 1.10`) |
| Add a new page | Write a route function in `app.py`, put any rules in `logic.py`, create a template that starts with `{% extends "base.html" %}` |
| Change colours | The variables in `:root` at the top of `style.css` |
