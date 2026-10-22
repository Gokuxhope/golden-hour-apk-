"""
app.py - BusGo's web routes.

Each route only reads the request, calls a function in logic.py and shows
the result in a template. No business rules live here.

Pages still marked "placeholder" are built in later phases; the JSON
routes (/search, /trip/<id>/seats, /booking/<pnr>) let you check the
Python logic in the browser until then.
"""

from datetime import date, timedelta
from functools import wraps

from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for

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

@app.route("/")
def index():
    return render_template("index.html", cities=logic.list_cities(), popular=logic.popular_routes(),
                           trip_count=len(logic.db["trips"]))


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
