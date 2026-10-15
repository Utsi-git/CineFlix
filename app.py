from config import BASE_DIR, PRODUCTION
import os
import re
import json
import uuid
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from model import get_recommendations, fetch_omdb_movie_meta
from serialize import serialize
from aws_services import aws_manager, CloudServiceError, DuplicateUserError
from werkzeug.exceptions import HTTPException
from auth import (
    hash_password,
    verify_password,
    create_jwt_token,
    token_required,
    create_demo_user,
)
from personalization import get_user_personalized_recommendations

app = Flask(__name__, static_folder=str(BASE_DIR / "client/build"), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024
# The production website and API share an origin. Allow local React development.
CORS(app, resources={r"/api/*": {"origins": [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]}})


@app.errorhandler(CloudServiceError)
def cloud_unavailable(error):
    return jsonify(error="Cloud storage is unavailable; please retry"), 503


@app.errorhandler(DuplicateUserError)
def duplicate_user(error):
    return jsonify(error=str(error)), 409


@app.errorhandler(ValueError)
def invalid_input(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(HTTPException)
def http_error(error):
    response = error.get_response()
    response.data = json.dumps({"error": error.description})
    response.content_type = "application/json"
    return response


@app.after_request
def private_api_responses(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


def json_body():
    body = request.get_json()
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object")
    return body

# Ensure upload directory exists
UPLOADS_DIR = str(aws_manager.local_uploads_dir)


# ==========================================
# AWS CLOUD STATUS & DIAGNOSTICS
# ==========================================

@app.route("/api/aws/status", methods=["GET"])
def aws_status():
    """Returns the live connection status of AWS DynamoDB, S3, and Cognito."""
    status = aws_manager.get_service_status()
    return jsonify(status), (503 if status["error"] else 200)


# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Registers a new user and stores their profile in Amazon DynamoDB."""
    data = json_body()
    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    full_name = str(data.get("fullName", "")).strip() or username
    genres = data.get("favoriteGenres", ["Action", "Sci-Fi"])

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,50}", username):
        return jsonify(error="Username must be 3-50 letters, numbers, dots, underscores or hyphens"), 400
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify(error="A valid email is required"), 400
    if len(password) < 8 or len(password) > 256:
        return jsonify(error="Password must be 8-256 characters"), 400
    if not isinstance(genres, list) or not all(isinstance(g, str) for g in genres):
        return jsonify(error="favoriteGenres must be a list of strings"), 400

    existing_user = aws_manager.get_user_by_email_or_username(email) or aws_manager.get_user_by_email_or_username(username)
    if existing_user:
        return jsonify({"error": "User with this username or email already exists"}), 409

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    pwd_hash = hash_password(password)
    avatar_url = f"https://ui-avatars.com/api/?name={username}&background=6366f1&color=fff&size=200&bold=true"

    user_data = {
        "userId": user_id,
        "username": username,
        "email": email,
        "fullName": full_name,
        "passwordHash": pwd_hash,
        "avatarUrl": avatar_url,
        "bio": "Movie enthusiast.",
        "favoriteGenres": genres,
    }

    saved_profile = aws_manager.create_user_profile(user_data)
    token = create_jwt_token(user_id, email, username)

    return jsonify({
        "message": "User registered successfully",
        "user": saved_profile,
        "token": token
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Logs in an existing user and returns a signed JWT token."""
    data = json_body()
    identifier = str(data.get("identifier", "") or data.get("email", "") or data.get("username", "")).strip().lower()
    password = str(data.get("password", ""))

    if not identifier or not password:
        return jsonify({"error": "Email/Username and password are required"}), 400

    user_record = aws_manager.get_user_by_email_or_username(identifier)
    if not user_record:
        return jsonify({"error": "Invalid credentials"}), 401

    if not verify_password(user_record.get("passwordHash") or "", password):
        return jsonify({"error": "Invalid credentials"}), 401

    user_id = user_record["userId"]
    if not user_record.get("passwordHash", "").startswith("scrypt:"):
        aws_manager.save_user_profile({"userId": user_id, "passwordHash": hash_password(password)})
    profile = aws_manager.get_user_profile(user_id)
    token = create_jwt_token(user_id, user_record["email"], user_record["username"])

    return jsonify({
        "message": "Login successful",
        "user": profile,
        "token": token
    })


@app.route("/api/auth/demo-login", methods=["POST"])
def demo_login():
    """Creates/loads a pre-populated demo user to experience full profile features immediately."""
    if os.getenv("ENABLE_DEMO_LOGIN", "false" if PRODUCTION else "true").lower() != "true":
        return jsonify(error="Demo login is disabled"), 404
    demo_data = create_demo_user()
    return jsonify({
        "message": "Logged in as demo user",
        "user": demo_data["user"],
        "token": demo_data["token"]
    })


@app.route("/api/auth/me", methods=["GET"])
@token_required
def get_current_user():
    """Returns the authenticated user's profile from DynamoDB."""
    user_id = request.user.get("userId")
    profile = aws_manager.get_user_profile(user_id)
    if not profile:
        return jsonify({"error": "User profile not found"}), 404
    return jsonify({"user": profile})


# ==========================================
# USER PROFILE & AWS S3 AVATAR UPLOAD
# ==========================================

@app.route("/api/user/profile", methods=["PUT"])
@token_required
def update_profile():
    """Updates user profile information in Amazon DynamoDB."""
    user_id = request.user.get("userId")
    data = json_body()

    update_payload = {"userId": user_id}
    if "fullName" in data:
        update_payload["fullName"] = str(data["fullName"]).strip()
    if "bio" in data:
        update_payload["bio"] = str(data["bio"]).strip()
    if "favoriteGenres" in data:
        if not isinstance(data["favoriteGenres"], list) or not all(isinstance(g, str) for g in data["favoriteGenres"]):
            return jsonify(error="favoriteGenres must be a list of strings"), 400
        update_payload["favoriteGenres"] = data["favoriteGenres"]

    updated_profile = aws_manager.save_user_profile(update_payload)
    return jsonify({"message": "Profile updated successfully", "user": updated_profile})


@app.route("/api/user/avatar/upload", methods=["POST"])
@token_required
def upload_avatar():
    """Uploads user profile picture to Amazon S3 (or S3-compatible local store)."""
    user_id = request.user.get("userId")
    if "avatar" not in request.files:
        return jsonify({"error": "No avatar file provided in multipart form-data"}), 400

    file = request.files["avatar"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    file_bytes = file.read()
    content_type = file.content_type or "image/jpeg"
    avatar_url = aws_manager.upload_avatar(user_id, file_bytes, file.filename, content_type)

    return jsonify({
        "message": "Avatar uploaded",
        "avatarUrl": avatar_url,
        "user": aws_manager.get_user_profile(user_id)
    })


# ==========================================
# DYNAMODB WATCHLIST & FAVORITES ENDPOINTS
# ==========================================

@app.route("/api/user/watchlist", methods=["GET"])
@token_required
def get_watchlist():
    """Retrieves the user's watchlist from Amazon DynamoDB."""
    user_id = request.user.get("userId")
    watchlist = aws_manager.get_user_watchlist(user_id)
    return jsonify({"watchlist": watchlist, "count": len(watchlist)})


@app.route("/api/user/watchlist", methods=["POST"])
@token_required
def add_watchlist_item():
    """Adds a movie to the user's watchlist in Amazon DynamoDB."""
    user_id = request.user.get("userId")
    data = json_body()
    item = aws_manager.add_to_watchlist(user_id, data)
    return jsonify({"message": "Movie added to watchlist in DynamoDB", "item": item}), 201


@app.route("/api/user/watchlist/<path:imdb_id>", methods=["DELETE"])
@token_required
def remove_watchlist_item(imdb_id):
    """Removes a movie from the user's watchlist in Amazon DynamoDB."""
    user_id = request.user.get("userId")
    aws_manager.remove_from_watchlist(user_id, imdb_id)
    return jsonify({"message": "Movie removed from watchlist"})


@app.route("/api/user/favorite/toggle", methods=["POST"])
@token_required
def toggle_favorite():
    """Toggles favorite status for a movie in Amazon DynamoDB."""
    user_id = request.user.get("userId")
    data = json_body()
    imdb_id = str(data.get("imdbID") or data.get("title", "")).strip()
    if not imdb_id:
        return jsonify({"error": "imdbID is required"}), 400

    new_fav_state = aws_manager.toggle_favorite(user_id, imdb_id, data)
    return jsonify({"message": "Favorite updated", "isFavorite": new_fav_state})


# ==========================================
# DYNAMODB MOVIE RATINGS & REVIEWS
# ==========================================

@app.route("/api/user/ratings", methods=["GET"])
@token_required
def get_ratings():
    """Retrieves all movie ratings submitted by the user from Amazon DynamoDB."""
    user_id = request.user.get("userId")
    ratings = aws_manager.get_user_ratings(user_id)
    return jsonify({"ratings": ratings, "count": len(ratings)})


@app.route("/api/user/ratings", methods=["POST"])
@token_required
def save_rating():
    """Saves or updates a movie rating (1-10) and review in Amazon DynamoDB."""
    user_id = request.user.get("userId")
    data = json_body()
    if "rating" not in data:
        return jsonify({"error": "Rating is required"}), 400

    rating_item = aws_manager.save_movie_rating(user_id, data)
    return jsonify({"message": "Rating saved to DynamoDB", "rating": rating_item})


# ==========================================
# PERSONALIZED & ML RECOMMENDATIONS
# ==========================================

@app.route("/api/user/recommendations", methods=["GET"])
@token_required
def personalized_recommendations():
    """
    Computes personalized recommendations tailored to the user's
    DynamoDB profile genres and high-rated movies.
    """
    user_id = request.user.get("userId")
    recs = get_user_personalized_recommendations(user_id)
    return jsonify({"recommendations": recs, "count": len(recs)})


@app.route("/api/recommend/", methods=["POST"])
def recommend():
    """
    Content-based & dynamic OMDb ML recommendation engine:
    Receives movie title, searches locally or in real-time OMDb,
    and returns top 10 recommended movie titles and release dates.
    """
    obj = json_body()
    title = str(obj.get("title", "")).strip()
    if not title:
        return jsonify({})

    ans = get_recommendations(title)
    ans2 = serialize(ans)
    return jsonify(ans2)


@app.route("/api/get-recommendations/", methods=["GET"])
def movie_recommendations():
    obj = {
        "title": "hero",
        "titil2": "heropanti"
    }
    return jsonify(obj)


# ==========================================
# STATIC ASSET & CLIENT SERVING
# ==========================================

@app.route("/uploads/<path:filename>")
def serve_uploads(filename):
    """Serves local uploaded assets when in local S3 emulation mode."""
    if aws_manager.mode != "local":
        return jsonify(error="Local uploads are disabled in AWS mode"), 404
    return send_from_directory(UPLOADS_DIR, filename)


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    if path == "api" or path.startswith("api/"):
        return jsonify(error="API endpoint not found"), 404
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting Movie Recommender Backend on port {port}...")
    app.run(host="0.0.0.0", port=port, debug=not PRODUCTION)
