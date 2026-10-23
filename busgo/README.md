# BusGo — Bus Reservation System

A BCA Python project: a bus ticket booking website built with **Python and Flask**.
It looks and feels like a real product (glassmorphism design, smooth animations,
every button works), but it is a **mock** — there is no real database, no real
payment and no password security.

For a walkthrough of how it was built and where each Python feature is used, see [`BUILD_GUIDE.md`](BUILD_GUIDE.md).

**Python is the core of the project.** All data, business rules and validation
live in Python (`data.py`, `logic.py`). The HTML/CSS/JavaScript only display what
Python decides.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Setup and how to run](#setup-and-how-to-run)
5. [Demo walkthrough](#demo-walkthrough)
6. [How it works](#how-it-works)
7. [Business rules](#business-rules)
8. [Viva notes — every Python function explained](#viva-notes)
9. [Common viva questions](#common-viva-questions)
10. [Limitations and future scope](#limitations-and-future-scope)

---

## Features

| Page | What you can do |
|---|---|
| **Mock login** | Pick one of three glass profile cards — two passengers and one admin. No passwords. |
| **Landing / search** | Choose From, To (swap button spins) and a date; quick-pick Today / Tomorrow / Friday; popular-route chips show tomorrow's lowest fare. |
| **Search results** | Skeleton shimmer for 600 ms, then bus cards fade in one by one. Live filters (AC, Sleeper, Seater, departure time, max price) and sorting. A 7-day strip shows the cheapest fare on nearby days. |
| **Seat selection** | Bus-shaped seat map with a steering wheel; sleepers have lower and upper decks. Booked seats are greyed out, ladies seats are pink. Live fare (from Python) with an animated counter, max 6 seats, boarding and dropping points. |
| **Passenger details** | One card per seat (name, age, gender). Ladies seats are locked to "Female". "It's me" fills your own details. |
| **Mock payment** | UPI / Card / Wallet tabs; the card preview flips to show the CVV. Any input is accepted; the Pay button spins for 2 seconds. |
| **Booking success** | Self-drawing checkmark, confetti, and a ticket with a perforated edge, PNR, a QR-like pattern and the fare breakup. Print or save as PDF. |
| **My Bookings** | Upcoming / Past / Cancelled tabs with a sliding underline. Cancel opens a modal that shows the refund worked out by Python. |
| **PNR status** | Anyone can look up a ticket by PNR — no login needed. |
| **Admin dashboard** | Count-up stats (bookings, revenue, occupancy, today's trips), a CSS bar chart of bookings per route, recent bookings, trip manifests, and an "Add trip" form whose trips appear in search immediately. |

Design extras: animated gradient-mesh background, glass cards with 3D tilt,
ripple buttons, toast notifications, page fade transitions, responsive down to a
375 px phone, and all animations switch off when the operating system's
**Reduce motion** setting is on.

---

## Tech stack

- **Python 3.10+** and **Flask** (the only dependency)
- Data kept in Python lists and dictionaries, saved to `data.json`
- Jinja2 templates, one CSS file, one vanilla JavaScript file
- Icons are inline SVG; font is *Plus Jakarta Sans* from Google Fonts
- No npm, no React, no build step, no database, no password hashing

---

## Project structure

```
busgo/
├── app.py              # Flask routes only — reads requests, calls logic.py, renders templates
├── data.py             # Seed data (users, cities, buses, routes) + trip generation + load/save JSON
├── logic.py            # All business rules: search, seats, fares, PNR, booking, refunds, stats
├── data.json           # Created automatically on first run (trips + bookings)
├── requirements.txt    # flask
├── templates/
│   ├── base.html           # Page shell: background blobs, navbar, toasts, footer
│   ├── _macros.html        # icon(), logo(), avatar(), steps(), trip_strip()
│   ├── _search_form.html   # Search form shared by home and results
│   ├── _ticket.html        # Ticket card + QR pattern (success page and PNR status)
│   ├── login.html          index.html          results.html
│   ├── seats.html          passengers.html     payment.html
│   ├── success.html        my_bookings.html    pnr.html
│   ├── admin.html          manifest.html       404.html
└── static/
    ├── css/style.css       # Design system (tokens in :root) + every page's styles
    └── js/app.js           # Animations, seat map, filters, tabs, modal, confetti
```

---

## Setup and how to run

```bash
cd busgo
pip install flask          # or: pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

- The first run creates `data.json` with about 1,400 trips (3 days back to 14 days
  ahead) and around 75 demo bookings, so every page has something to show.
- Each time the app starts, it adds trips for any new days, so the demo never runs out.
- **To reset all data**, stop the server, delete `data.json`, and start it again.
- **Terminal demo of the Python logic** (does not change `data.json`):

  ```bash
  python logic.py
  ```

  It prints a search, a seat map, a fare breakup, a booking, a rejected double
  booking, a rejected ladies-seat booking, the three refund tiers, a cancellation
  and the admin stats.

---

## Demo walkthrough

1. **Sign in** → pick **Aarav** (passenger).
2. Search **Bengaluru → Goa**, tomorrow. Try the filters and the date strip.
3. Open a sleeper → choose two seats (one pink ladies seat to see the rule) → **Continue**.
4. Fill in passengers ("It's me" for the first) → **Continue to payment**.
5. Pick any tab, press **Pay** → watch the checkmark and confetti → **Print ticket**.
6. Open **My Bookings** → **Cancel** a trip → the modal shows the 90% / 50% refund from Python.
7. Sign out, open **PNR Status**, and paste the PNR — no login needed.
8. Sign in as **Meera** (admin) → see the dashboard, open a manifest, and add a trip.
   Click **View in search** to see it listed.

---

## How it works

```
Browser ──HTTP──▶ app.py (route) ──calls──▶ logic.py (rules) ──reads/writes──▶ data.py (lists/dicts) ──▶ data.json
   ▲                     │
   └──── HTML page ◀─────┘  (Jinja2 template fills in the values Python returned)
```

- **Session draft:** while booking, Flask's `session["draft"]` remembers the trip,
  seats, boarding/dropping points and passengers between pages.
- **Live numbers without reloading:** the seat page calls `/api/fare` and the
  cancel modal calls `/api/refund/<pnr>`. Both run Python functions and return JSON,
  so the browser never calculates money itself.
- **Saving:** every change (booking, cancellation, new trip) calls `save_data()`,
  which writes `data.json` (to a temporary file first, then swaps it in, so a crash
  can't leave a half-written file).

---

## Business rules

| Rule | Where |
|---|---|
| Fare = base fare × seats + service fee (₹0 seater / ₹30 non-AC sleeper / ₹50 Volvo / ₹100 AC sleeper per seat) + **5% GST** | `calculate_fare` |
| At most **6 seats** per booking; no duplicates; seats must exist and be free | `validate_seat_selection` |
| A seat already booked is rejected — checked again at payment time | `book_seats` |
| **Ladies seats** can only be booked by a female passenger | `validate_passengers` |
| Name ≥ 2 letters, age 1–110, valid email and 10-digit Indian mobile number | `validate_passengers`, `validate_contact` |
| Refund: **> 24 h → 90%**, **6–24 h → 50%**, **< 6 h → cancellation not allowed** | `refund_policy` |
| Weekend trips (Fri–Sun) cost 10% more | `data._price` |
| Only the passenger who booked (or the admin) can cancel | `app.can_manage` |

---

## Viva notes

Every Python function in plain English.

### `data.py` — the "database"

| Function | What it does |
|---|---|
| `build_layout(layout)` | Returns the shape of a bus: decks → rows → seat numbers, with `None` for the aisle. A seater has 10 rows of 2 + aisle + 2 (seats 1–40). A sleeper has two decks of 6 rows of 1 + aisle + 2 (L1–L18, U1–U18). |
| `all_seat_ids(layout)` | Flattens the layout into a simple list of every seat number. |
| `get_bus(bus_id)` | Finds a bus in the `BUSES` list by its id. |
| `make_trip(...)` | Builds one trip dictionary, working out the arrival time and date from the departure time plus the journey length. |
| `seat_sort_key(seat)` | Sorts seat numbers naturally, so "2" comes before "10" and "L3" before "U1". |
| `_generate_day(day, today)` | Creates every trip for one day on every route in both directions. It pre-books some seats and marks 2–4 ladies seats. Using the trip id as the random seed means the same trip always gets the same seats. |
| `ensure_trip_window(db)` | Makes sure there are trips from 3 days ago to 14 days ahead. It adds missing days and deletes old trips that nobody booked. |
| `load_data()` | Reads `data.json` (or starts empty), then tops up the trip window. |
| `save_data(db)` | Writes trips and bookings to `data.json` safely (temp file + rename). |

### `logic.py` — business rules

**Search**

| Function | What it does |
|---|---|
| `search_buses(source, destination, date)` | Loops through all trips, keeps those whose route and date match, skips buses that have already left, sorts by departure time and adds badges. |
| `trip_view(trip)` | Returns a copy of a trip with extra ready-to-show details: the bus, seats left, a readable duration, the overnight flag, and AC/sleeper flags for the filters. |
| `add_highlights(results)` | Tags the cheapest, fastest and top-rated buses, plus "Filling fast" when 8 or fewer seats are left. |
| `validate_search(...)` | Checks that both cities exist, they're different, and the date falls inside the 14-day booking window. |
| `booking_window()` | Returns the first and last day you can book (today to today + 13). |
| `destinations_from(city)` | Lists cities with a direct bus, used for suggestions when a route isn't served. |
| `fare_calendar(...)` | Finds the cheapest fare on each of 7 nearby days for the date strip. |
| `quick_dates()`, `home_stats()`, `popular_routes()` | Supply the landing page: quick-date buttons, headline numbers, and route chips with tomorrow's lowest fare. |

**Seats**

| Function | What it does |
|---|---|
| `get_seat_map(trip_id)` | Builds the seat map. Each seat is marked **booked**, **ladies** (free but women only) or **available**, using the bus layout. |
| `seat_label(bus, seat)` | Describes a seat in words, e.g. "Lower berth · Window" (window = first or last seat in its row). |
| `get_boarding_points(trip_id)` | Pickup points 15 minutes apart from departure, and drop points 15 minutes apart ending at arrival. |
| `validate_points(...)` | Checks that the chosen pickup and drop points really belong to this trip. |
| `validate_seat_selection(trip_id, seats)` | The trip exists and hasn't left; 1–6 seats; no duplicates; every seat exists; none are already booked. |

**Fare and PNR**

| Function | What it does |
|---|---|
| `calculate_fare(base_fare, seats, bus_type)` | `base × seats` + `service fee × seats` + 5% GST, returned as a breakup dictionary (`base_total`, `service_fee`, `gst`, `total`). |
| `generate_pnr()` | Makes a ticket code like `BG7K29XQ1M`: "BG" + 8 random capital letters or digits. If the code already exists, it tries again. |
| `qr_matrix(text)` | Draws a QR-*looking* pattern for the ticket (not a real QR code). It hashes the PNR with SHA-256, uses the bits to fill a 21 × 21 grid, then adds the three corner squares. Same PNR, same pattern. |
| `format_inr(amount)` | Indian digit grouping: 170843 → "1,70,843". |
| `duration_label`, `departure_time`, `day_slot`, `time_until` | Small helpers: "10h 30m"; the departure as a `datetime`; morning/afternoon/evening/night; "2 days 4 hrs". |

**Booking**

| Function | What it does |
|---|---|
| `book_seats(trip_id, seats, passengers, user, ...)` | The main booking function. (1) Re-checks the seats, since someone may have taken them. (2) Checks passengers and contact details. (3) Works out the fare. (4) Marks the seats booked, stores the booking under a new PNR, and saves. Returns `(True, booking)` or `(False, error message)`. |
| `validate_passengers(...)` | One passenger per seat with a name, an age of 1–110 and a gender. A ladies seat needs a female passenger. |
| `validate_contact(contact)` | Checks the email format with a regular expression, and that the mobile is 10 digits starting with 6–9 (+91 or 0 allowed). |
| `get_booking(pnr)`, `booking_view(...)` | Find a booking; add its trip details, whether it's upcoming, and the time left. |
| `get_user_bookings(user_id)` | Splits a user's bookings into the Upcoming / Past / Cancelled tabs. |

**Cancellation and refund**

| Function | What it does |
|---|---|
| `refund_policy(hours_left)` | The rule: more than 24 h → 90%, 6–24 h → 50%, less than 6 h → `None` (not allowed). |
| `refund_quote(pnr)` | Works out the refund **without** cancelling: hours left, percent, refund and deduction. The cancel modal shows this. |
| `cancel_booking(pnr)` | Uses `refund_quote`, frees the seats so others can book them, marks the booking Cancelled with the refund, and saves. |

**Admin**

| Function | What it does |
|---|---|
| `get_stats()` | Dashboard numbers: confirmed bookings, tickets, revenue (confirmed fares + charges kept on cancellations), occupancy over the next 7 days, today's trips, bookings per route for the chart, recent bookings, and trips for manifests. |
| `get_manifest(trip_id)` | The passenger list for one trip in seat order, plus how many seats were sold elsewhere (counter/partner sales). |
| `add_trip(form)` | Validates the admin form (bus, two different cities, a future date and time, 0.5–24 h duration, ₹100–₹10,000 fare), builds the trip and saves it. It shows up in search immediately. |
| `seed_demo_bookings()` | On the very first run only, creates demo bookings **through `book_seats()`**, so even demo data obeys every rule. |
| `init()` | Loads the data once when the app starts. |

### `app.py` — routes

| Route | Purpose |
|---|---|
| `GET /` | Landing page with search |
| `GET /search` | Validates the search, then shows the results |
| `GET/POST /trip/<id>/seats` | Seat map; POST saves the selection to the session draft |
| `GET/POST /passengers` | Passenger forms (login required) |
| `GET/POST /payment` | Mock payment; POST calls `book_seats()` |
| `GET /booking/<pnr>` | Ticket / success page |
| `GET /my-bookings` | Tabs of the user's bookings |
| `POST /booking/<pnr>/cancel` | Cancels the booking (owner or admin only) |
| `GET /pnr` | PNR status (no login) |
| `GET /admin`, `POST /admin/trips`, `GET /admin/trip/<id>/manifest` | Admin dashboard, add trip, manifest |
| `GET /api/fare`, `GET /api/refund/<pnr>`, `GET /api/trip/<id>/seats` | JSON for live fare, refund quote and seat map |
| `GET /login`, `POST /login/<id>`, `GET /logout` | Mock login using the Flask session |

Helpers: `login_required` and `admin_required` are **decorators** that redirect
to the login page. `safe_next()` only follows redirects within this site (it
stops open-redirect tricks). `current_user()` reads the user id from the session.

---

## Common viva questions

**Why JSON instead of a database?** The brief asked for plain Python data
structures. Dictionaries keyed by trip id and PNR give instant lookups, and
`data.json` keeps everything across restarts.

**How do you stop two people booking the same seat?** `book_seats()` checks the
seats again at the moment of payment, not just when they were picked. If a seat
was taken in between, it returns an error and the user goes back to the seat map.

**Where is validation done?** In Python (`logic.py`). The browser also does
friendly checks for speed, but the server checks everything again, because
browser checks can be bypassed.

**How does the page show a live fare if all logic is in Python?** JavaScript calls
`/api/fare?trip_id=…&seats=…`. Flask runs `calculate_fare()` and returns JSON,
and the page animates to the new number.

**What is a PNR and can it clash?** A Passenger Name Record — the ticket's unique
code. There are 36⁸ ≈ 2.8 trillion possible codes, and `generate_pnr()` retries
if a code is ever already taken.

**Is the QR code real?** No. It is a deterministic pattern drawn from a SHA-256
hash of the PNR, styled to look like a QR code.

**Why are the "random" pre-booked seats the same every run?** Each trip uses its
own id as the random seed (`random.Random(trip_id)`), so results are repeatable.

**Why do the animations only move `transform` and `opacity`?** Browsers can
animate those on the GPU without re-laying out the page, which keeps it at 60 fps.
Animations switch off under `prefers-reduced-motion`.

**Is the login secure?** No — it's a mock. A real system would use hashed
passwords (e.g. bcrypt), HTTPS, CSRF tokens and a proper database.

---

## Limitations and future scope

- Mock login and payment; a single JSON file instead of a database (fine for one user at a time).
- No seat hold timer — seats are only reserved at payment.
- Ideas: real authentication, a SQLite/PostgreSQL database, a payment gateway,
  email/SMS tickets, a real QR code library, and route maps.
