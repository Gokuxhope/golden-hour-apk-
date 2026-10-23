"""
app.py - BusGo's web routes.

Each route only reads the request, calls a function in logic.py and shows
the result in a template. No business rules live here.

Pages still marked "placeholder" are built in later phases; the JSON
routes (/search, /trip/<id>/seats, /booking/<pnr>) let you check the
Python logic in the browser until then.
"""

from datetime import date, datetime, timedelta
from functools import wraps

from flask import Flask, abort, flash, jsonify, redirect, render_template, request, session, url_for

import data
import logic

app = Flask(__name__)
app.secret_key = "busgo-demo-secret"  # mock project: sessions only remember who is logged in

logic.init()
app.jinja_env.filters["inr"] = logic.format_inr
app.jinja_env.globals["qr_matrix"] = logic.qr_matrix
app.jinja_env.filters["nice_date"] = lambda iso: datetime.fromisoformat(iso).strftime("%d %b %Y")


# ---------------------------------------------------------------------------
# Login helpers
# ---------------------------------------------------------------------------

def current_user():
    return logic.get_user(session.get("user_id"))


@app.context_processor
def inject_user():
    """Make `current_user` available in every template (for the navbar)."""
    return {"current_user": current_user()}


def safe_next(url):
    """Only follow redirects to pages on this site (never to another domain)."""
    if url and url.startswith("/") and not url.startswith("//"):
        return url
    return None


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user():
            flash("Please pick a profile to continue.", "info")
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user["role"] != "admin":
            flash("The dashboard is for the admin profile only.", "error")
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Mock login
# ---------------------------------------------------------------------------

@app.route("/login")
def login():
    return render_template("login.html", profiles=data.USERS, next_url=safe_next(request.args.get("next")))


@app.route("/login/<user_id>", methods=["POST"])
def login_as(user_id):
    user = logic.get_user(user_id)
    if not user:
        flash("That profile does not exist.", "error")
        return redirect(url_for("login"))
    session["user_id"] = user_id
    flash(f"Welcome, {user['name'].split()[0]}! You're signed in as {user['role']}.", "success")
    default = url_for("admin") if user["role"] == "admin" else url_for("index")
    return redirect(safe_next(request.form.get("next")) or default)


@app.route("/logout")
def logout():
    session.clear()
    flash("You've been signed out. See you on the road!", "info")
    return redirect(url_for("index"))


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def search_form_context(source=None, destination=None, travel_date=None):
    """Values that pre-fill the search form (shared by the landing and results pages)."""
    user = current_user()
    source = source if source in data.CITIES else (user["city"] if user else "Bengaluru")
    if destination not in data.CITIES or destination == source:
        options = logic.destinations_from(source)
        destination = "Goa" if "Goa" in options else options[0]
    first, last = logic.booking_window()
    if not travel_date or not first.isoformat() <= travel_date <= last.isoformat():
        travel_date = (first + timedelta(days=1)).isoformat()
    return {
        "cities": logic.list_cities(),
        "form": {"source": source, "destination": destination, "date": travel_date},
        "window": {"min": first.isoformat(), "max": last.isoformat()},
        "quick_dates": logic.quick_dates(),
    }


@app.route("/")
def index():
    args = request.args
    context = search_form_context(args.get("source"), args.get("destination"), args.get("date"))
    return render_template("index.html", popular=logic.popular_routes(), stats=logic.home_stats(),
                           tomorrow=(date.today() + timedelta(days=1)).isoformat(), **context)


@app.route("/search")
def search():
    source = request.args.get("source", "")
    destination = request.args.get("destination", "")
    travel_date = request.args.get("date", "")
    ok, error = logic.validate_search(source, destination, travel_date)
    if not ok:
        flash(error, "error")
        return redirect(url_for("index", source=source, destination=destination, date=travel_date))

    results = logic.search_buses(source, destination, travel_date)
    fares = [t["base_fare"] for t in results]
    return render_template(
        "results.html",
        results=results,
        calendar=logic.fare_calendar(source, destination, travel_date),
        date_label=datetime.strptime(travel_date, "%Y-%m-%d").strftime("%A, %d %B"),
        slots={t["slot"] for t in results},
        fare_min=min(fares, default=0),
        fare_max=max(fares, default=0),
        served=destination in logic.destinations_from(source),
        alternatives=logic.destinations_from(source),
        **search_form_context(source, destination, travel_date),
    )


def get_draft():
    """The booking in progress (seats → passengers → payment), kept in the session."""
    return session.get("draft")


@app.route("/trip/<trip_id>/seats", methods=["GET", "POST"])
def seats(trip_id):
    trip = logic.get_trip(trip_id)
    if not trip:
        abort(404)
    view = logic.trip_view(trip)
    if view["departed"]:
        flash("That bus has already left — here are the next ones.", "info")
        return redirect(url_for("search", source=trip["source"], destination=trip["destination"],
                                date=date.today().isoformat()))

    if request.method == "POST":
        chosen = [s for s in request.form.get("seats", "").split(",") if s]
        boarding, dropping = request.form.get("boarding", ""), request.form.get("dropping", "")
        ok, error = logic.validate_seat_selection(trip_id, chosen)
        if ok:
            ok, error = logic.validate_points(trip_id, boarding, dropping)
        if not ok:
            flash(error, "error")
            return redirect(url_for("seats", trip_id=trip_id))
        session["draft"] = {"trip_id": trip_id, "seats": chosen, "boarding": boarding, "dropping": dropping}
        if not current_user():
            flash("Seats saved! Pick a profile to fill in passenger details.", "info")
            return redirect(url_for("login", next=url_for("passengers")))
        return redirect(url_for("passengers"))

    # Re-select the seats from an unfinished booking on this trip (if they are still free).
    draft = get_draft() or {}
    preselected = []
    if draft.get("trip_id") == trip_id:
        preselected = [s for s in draft.get("seats", []) if s not in trip["booked_seats"]]
    boarding, dropping = logic.get_boarding_points(trip_id)
    return render_template(
        "seats.html",
        seat_map=logic.get_seat_map(trip_id),
        trip=view,
        boarding=boarding,
        dropping=dropping,
        preselected=preselected,
        chosen_boarding=draft.get("boarding") if draft.get("trip_id") == trip_id else None,
        chosen_dropping=draft.get("dropping") if draft.get("trip_id") == trip_id else None,
        max_seats=logic.MAX_SEATS_PER_BOOKING,
        fare_preview=logic.calculate_fare(trip["base_fare"], preselected, view["bus"]["type"]),
    )


@app.route("/passengers", methods=["GET", "POST"])
@login_required
def passengers():
    draft = get_draft()
    trip = logic.get_trip(draft["trip_id"]) if draft else None
    if not trip:
        flash("Your session expired — please choose your seats again.", "info")
        return redirect(url_for("index"))
    view = logic.trip_view(trip)
    bus = view["bus"]
    user = current_user()

    if request.method == "POST":
        people = [{"seat": seat,
                   "name": request.form.get(f"name_{seat}", "").strip(),
                   "age": request.form.get(f"age_{seat}", "").strip(),
                   "gender": request.form.get(f"gender_{seat}", "")} for seat in draft["seats"]]
        contact = {"email": request.form.get("email", "").strip(), "phone": request.form.get("phone", "").strip()}
        ok, error = logic.validate_seat_selection(trip["id"], draft["seats"])
        if not ok:
            flash(error + " Please pick again.", "error")
            return redirect(url_for("seats", trip_id=trip["id"]))
        ok, error = logic.validate_passengers(draft["seats"], people, trip)
        if ok:
            ok, error = logic.validate_contact(contact)
        if ok:
            draft.update(passengers=people, contact=contact)
            session["draft"] = draft
            return redirect(url_for("payment"))
        flash(error, "error")
    else:
        people = draft.get("passengers") or [{"seat": s, "name": "", "age": "", "gender": ""} for s in draft["seats"]]
        contact = draft.get("contact") or {"email": user["email"], "phone": user["phone"]}

    for person in people:
        person["label"] = logic.seat_label(bus, person["seat"])
        person["ladies"] = person["seat"] in trip["ladies_seats"]
    boarding, dropping = logic.get_boarding_points(trip["id"])
    return render_template(
        "passengers.html",
        trip=view,
        draft=draft,
        people=people,
        contact=contact,
        boarding=next(b for b in boarding if b["name"] == draft["boarding"]),
        dropping=next(d for d in dropping if d["name"] == draft["dropping"]),
        fare=logic.calculate_fare(trip["base_fare"], draft["seats"], bus["type"]),
    )


@app.route("/payment", methods=["GET", "POST"])
@login_required
def payment():
    draft = get_draft()
    trip = logic.get_trip(draft["trip_id"]) if draft else None
    if not trip:
        flash("Nothing to pay for yet — start by choosing seats.", "info")
        return redirect(url_for("index"))
    if not draft.get("passengers"):
        return redirect(url_for("passengers"))
    view = logic.trip_view(trip)

    if request.method == "POST":
        # Mock payment: whatever was typed is accepted. Python does the real work:
        # book_seats() re-checks the seats and saves the booking.
        method = request.form.get("method", "UPI")
        ok, result = logic.book_seats(
            trip["id"], draft["seats"], draft["passengers"], current_user(),
            contact=draft["contact"], boarding=draft["boarding"], dropping=draft["dropping"],
            payment_method=method if method in ("UPI", "Card", "Wallet") else "UPI",
        )
        if not ok:
            flash(result, "error")
            return redirect(url_for("seats", trip_id=trip["id"]))
        session.pop("draft", None)
        session["just_booked"] = result["pnr"]
        return redirect(url_for("booking", pnr=result["pnr"]))

    return render_template(
        "payment.html",
        trip=view,
        draft=draft,
        fare=logic.calculate_fare(trip["base_fare"], draft["seats"], view["bus"]["type"]),
    )


@app.route("/api/trip/<trip_id>/seats")
def api_seats(trip_id):
    seat_map = logic.get_seat_map(trip_id)
    if not seat_map:
        return jsonify(error="Trip not found"), 404
    boarding, dropping = logic.get_boarding_points(trip_id)
    return jsonify(seat_map=seat_map, boarding=boarding, dropping=dropping)


@app.route("/api/fare")
def api_fare():
    trip = logic.get_trip(request.args.get("trip_id", ""))
    if not trip:
        return jsonify(error="Trip not found"), 404
    seats = [s for s in request.args.get("seats", "").split(",") if s]
    bus_type = logic.trip_view(trip)["bus"]["type"]
    return jsonify(logic.calculate_fare(trip["base_fare"], seats, bus_type))


@app.route("/booking/<pnr>")
def booking(pnr):
    found = logic.get_booking(pnr)
    if not found:
        return render_template("404.html", message=f"No booking found with PNR {pnr.upper()}."), 404
    # Celebrate (checkmark + confetti) only right after paying, not on later visits.
    celebrate = session.pop("just_booked", None) == found["pnr"]
    return render_template("success.html", b=logic.booking_view(found), celebrate=celebrate)


def can_manage(booking):
    """Only the passenger who booked (or the admin) may cancel a booking."""
    user = current_user()
    return bool(user) and (booking["user_id"] == user["id"] or user["role"] == "admin")


@app.route("/my-bookings")
@login_required
def my_bookings():
    tabs = logic.get_user_bookings(current_user()["id"])
    active = request.args.get("tab", "upcoming")
    if active not in tabs:
        active = "upcoming"
    return render_template("my_bookings.html", tabs=tabs, active=active,
                           quotes={b["pnr"]: logic.refund_quote(b["pnr"]) for b in tabs["upcoming"]})


@app.route("/api/refund/<pnr>")
def api_refund(pnr):
    """Refund quote for the cancel modal: the amount is worked out by Python, not JavaScript."""
    booking = logic.get_booking(pnr)
    if not booking or not can_manage(booking):
        return jsonify(ok=False, message="Booking not found."), 404
    quote = logic.refund_quote(pnr)
    trip = logic.trip_view(logic.get_trip(booking["trip_id"]))
    quote.update(route=f"{trip['source']} → {trip['destination']}", date=trip["date_label"],
                 depart=trip["depart"], seats=booking["seats"], departs_in=logic.time_until(trip))
    return jsonify(quote)


@app.route("/booking/<pnr>/cancel", methods=["POST"])
@login_required
def cancel(pnr):
    booking = logic.get_booking(pnr)
    if not booking or not can_manage(booking):
        flash("Booking not found.", "error")
        return redirect(url_for("my_bookings"))
    ok, message, _quote = logic.cancel_booking(pnr)
    flash(message, "success" if ok else "error")
    return redirect(url_for("my_bookings", tab="cancelled" if ok else "upcoming"))


@app.route("/pnr")
def pnr_status():
    """Look up any ticket by PNR — no login needed."""
    query = request.args.get("pnr", "").strip().upper()
    found = logic.get_booking(query) if query else None
    if query and not found:
        flash(f"No booking found with PNR {query}. Check the code and try again.", "error")
    user = current_user()
    recent = []
    if user:
        mine = [b for b in logic.db["bookings"].values() if b["user_id"] == user["id"]]
        recent = [b["pnr"] for b in sorted(mine, key=lambda b: b["booked_at"], reverse=True)[:4]]
    return render_template("pnr.html", query=query, b=logic.booking_view(found) if found else None,
                           not_found=bool(query and not found), recent=recent)


@app.route("/admin")
@admin_required
def admin():
    last_added = logic.get_trip(session.get("last_added_trip", ""))
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    form = session.pop("add_trip_form", None) or {
        "bus_id": "B01", "source": "Bengaluru", "destination": "Goa", "date": tomorrow,
        "depart": "23:30", "duration_hours": "11", "base_fare": "1499",
    }
    first, last = logic.booking_window()
    return render_template(
        "admin.html",
        stats=logic.get_stats(),
        buses=data.BUSES,
        cities=logic.list_cities(),
        form=form,
        window={"min": first.isoformat(), "max": last.isoformat()},
        last_added=logic.trip_view(last_added) if last_added else None,
        today_label=date.today().strftime("%A, %d %B %Y"),
    )


@app.route("/admin/trips", methods=["POST"])
@admin_required
def add_trip():
    ok, message, trip = logic.add_trip(request.form)
    flash(message, "success" if ok else "error")
    if ok:
        session["last_added_trip"] = trip["id"]
    else:
        session["add_trip_form"] = request.form.to_dict()  # keep what the admin typed
    return redirect(url_for("admin") + "#add-trip")


@app.route("/admin/trip/<trip_id>/manifest")
@admin_required
def manifest(trip_id):
    result = logic.get_manifest(trip_id)
    if not result:
        abort(404)
    return render_template("manifest.html", m=result, t=result["trip"])


@app.errorhandler(404)
def not_found(_error):
    return render_template("404.html"), 404


if __name__ == "__main__":
    app.run(debug=True)
