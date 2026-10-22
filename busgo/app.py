"""
app.py - BusGo's web routes.

Each route only reads the request, calls a function in logic.py and returns
the result. No business rules live here.

Phase 2 skeleton: routes return JSON so the Python logic can be checked in
the browser. Later phases swap these for the real HTML pages.
"""

from datetime import date, timedelta
from functools import wraps

from flask import Flask, jsonify, redirect, request, session, url_for

import logic

app = Flask(__name__)
app.secret_key = "busgo-demo-secret"  # mock project: sessions only remember who is logged in

logic.init()


# ---------------------------------------------------------------------------
# Login helpers
# ---------------------------------------------------------------------------

def current_user():
    return logic.get_user(session.get("user_id"))


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user():
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)
    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user["role"] != "admin":
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return view(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return jsonify(cities=logic.list_cities(), popular=logic.popular_routes(), user=current_user())


@app.route("/login")
def login():
    from data import USERS
    return jsonify(profiles=USERS, next=request.args.get("next"))


@app.route("/login/<user_id>", methods=["GET", "POST"])
def login_as(user_id):
    if not logic.get_user(user_id):
        return redirect(url_for("login"))
    session["user_id"] = user_id
    return redirect(request.args.get("next") or url_for("index"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/search")
def search():
    source = request.args.get("source", "Bengaluru")
    destination = request.args.get("destination", "Mysuru")
    travel_date = request.args.get("date") or (date.today() + timedelta(days=1)).isoformat()
    return jsonify(logic.search_buses(source, destination, travel_date))


@app.route("/trip/<trip_id>/seats")
def seats(trip_id):
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
    return jsonify(logic.get_user_bookings(current_user()["id"]))


@app.route("/api/refund/<pnr>")
def api_refund(pnr):
    return jsonify(logic.refund_quote(pnr))


@app.route("/admin")
@admin_required
def admin():
    return jsonify(logic.get_stats())


@app.route("/admin/trip/<trip_id>/manifest")
@admin_required
def manifest(trip_id):
    result = logic.get_manifest(trip_id)
    if not result:
        return jsonify(error="Trip not found"), 404
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
