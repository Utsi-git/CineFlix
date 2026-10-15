import os
import time
import uuid
import hashlib
import hmac
import secrets
from werkzeug.security import generate_password_hash, check_password_hash
from config import PRODUCTION
import functools
import jwt
from flask import request, jsonify
from aws_services import aws_manager

JWT_SECRET = os.environ.get("JWT_SECRET", "")
if PRODUCTION and (len(JWT_SECRET) < 32 or any(word in JWT_SECRET.lower() for word in ("super-secret", "change", "your_", "replace"))):
    raise RuntimeError("Set JWT_SECRET to a unique random value of at least 32 characters")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)  # Development only; set .env for stable sessions.
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    if stored_hash.startswith(("scrypt:", "pbkdf2:")):
        return check_password_hash(stored_hash, password)
    # Existing local/cloud users can log in once and be upgraded to scrypt.
    if len(stored_hash) == 64:
        legacy = hashlib.sha256((password + "movierecom_salt").encode()).hexdigest()
        return hmac.compare_digest(stored_hash, legacy)
    return False


def create_jwt_token(user_id: str, email: str, username: str) -> str:
    """Generates a signed JWT access token."""
    payload = {
        "userId": user_id,
        "email": email,
        "username": username,
        "exp": int(time.time()) + (JWT_EXPIRATION_HOURS * 3600),
        "iat": int(time.time()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> dict:
    """Decodes and validates a JWT token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid authentication token.")

def token_required(f):
    """Decorator to require authentication on API endpoints."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        token = None

        if auth_header:
            parts = auth_header.split(" ")
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]
            else:
                token = parts[0]

        if not token:
            return jsonify({"error": "Authorization token is missing", "authenticated": False}), 401

        try:
            payload = decode_jwt_token(token)
            request.user = payload
        except ValueError as e:
            return jsonify({"error": str(e), "authenticated": False}), 401

        return f(*args, **kwargs)
    return decorated

def create_demo_user():
    """Creates a pre-configured demo user with sample watchlist, ratings, and profile data."""
    demo_user_id = "demo-cinephile-001"
    existing = aws_manager.get_user_profile(demo_user_id)
    if existing:
        return {"user": existing, "token": create_jwt_token(demo_user_id, existing["email"], existing["username"])}
    user_data = {
        "userId": demo_user_id,
        "username": "AlexRivera",
        "email": "alex.rivera@example.com",
        "fullName": "Alex Rivera",
        "bio": "Film critic & sci-fi enthusiast. Exploring modern classics and dynamic recommendations.",
        "avatarUrl": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
        "favoriteGenres": ["Sci-Fi", "Action", "Thriller", "Drama"],
    }
    aws_manager.save_user_profile(user_data)

    # Prepopulate sample watchlist & favorites
    sample_watchlist = [
        {
            "imdbID": "tt1375666",
            "title": "Inception",
            "year": "2010",
            "poster": "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
            "genre": "Action, Adventure, Sci-Fi",
            "isFavorite": True,
            "status": "completed"
        },
        {
            "imdbID": "tt0816692",
            "title": "Interstellar",
            "year": "2014",
            "poster": "https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg",
            "genre": "Adventure, Drama, Sci-Fi",
            "isFavorite": True,
            "status": "completed"
        },
        {
            "imdbID": "tt1160419",
            "title": "Dune",
            "year": "2021",
            "poster": "https://m.media-amazon.com/images/M/MV5BN2FjNmEyNWMtYzM0ZS00NjIyLTg5YzYtYThlMGVjNzE1OGViXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg",
            "genre": "Action, Adventure, Drama",
            "isFavorite": False,
            "status": "plan_to_watch"
        }
    ]

    for item in sample_watchlist:
        aws_manager.add_to_watchlist(demo_user_id, item)

    # Prepopulate sample ratings
    sample_ratings = [
        {
            "imdbID": "tt1375666",
            "title": "Inception",
            "year": "2010",
            "poster": "https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_SX300.jpg",
            "genre": "Action, Adventure, Sci-Fi",
            "rating": 9.5,
            "review": "A masterpiece of visual storytelling, sound design, and mind-bending narrative structure."
        },
        {
            "imdbID": "tt0816692",
            "title": "Interstellar",
            "year": "2014",
            "poster": "https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg",
            "genre": "Adventure, Drama, Sci-Fi",
            "rating": 10.0,
            "review": "Emotional, profound, and visually breathtaking. Zimmer's score elevates this to another plane."
        }
    ]

    for r in sample_ratings:
        aws_manager.save_movie_rating(demo_user_id, r)

    token = create_jwt_token(demo_user_id, user_data["email"], user_data["username"])
    return {
        "user": aws_manager.get_user_profile(demo_user_id),
        "token": token
    }
