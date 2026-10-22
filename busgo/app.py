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


@app.route("/trip/<trip_id>/seats")
def seats(trip_id):
    if not logic.get_trip(trip_id):
        abort(404)
    return render_template("placeholder.html", title="Seat selection", phase="Phase 5", page_icon="seat")


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
        return jsonify(error="PNR not found"), 404
    return jsonify(logic.booking_view(found))


@app.route("/my-bookings")
@login_required
def my_bookings():
    return render_template("placeholder.html", title="My Bookings", phase="Phase 7", page_icon="list")


@app.route("/pnr")
def pnr_status():
    return render_template("placeholder.html", title="PNR Status", phase="Phase 7", page_icon="ticket")


@app.route("/api/refund/<pnr>")
def api_refund(pnr):
    return jsonify(logic.refund_quote(pnr))


@app.route("/admin")
@admin_required
def admin():
    return render_template("placeholder.html", title="Admin dashboard", phase="Phase 8", page_icon="dashboard")


@app.route("/admin/trip/<trip_id>/manifest")
@admin_required
def manifest(trip_id):
    result = logic.get_manifest(trip_id)
    if not result:
        return jsonify(error="Trip not found"), 404
    return jsonify(result)


@app.errorhandler(404)
def not_found(_error):
    return render_template("404.html"), 404


if __name__ == "__main__":
    app.run(debug=True)
