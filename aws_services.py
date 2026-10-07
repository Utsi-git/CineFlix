import os
import json
import time
import uuid
import sqlite3
from typing import Dict, Any, List, Optional
import boto3
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError

# Load environment configuration
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_SESSION_TOKEN = os.environ.get("AWS_SESSION_TOKEN")
DYNAMODB_ENDPOINT = os.environ.get("DYNAMODB_ENDPOINT_URL")  # Useful for LocalStack: http://localhost:4566
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL")

# AWS Resource Names
USERS_TABLE_NAME = os.environ.get("DYNAMODB_USERS_TABLE", "MovieRecom_Users")
WATCHLIST_TABLE_NAME = os.environ.get("DYNAMODB_WATCHLIST_TABLE", "MovieRecom_Watchlists")
RATINGS_TABLE_NAME = os.environ.get("DYNAMODB_RATINGS_TABLE", "MovieRecom_Ratings")
S3_AVATAR_BUCKET = os.environ.get("S3_AVATAR_BUCKET", "movierecom-user-avatars")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "")

# Local persistent database path for seamless fallback / offline testing
LOCAL_DB_PATH = os.path.join(os.path.dirname(__file__), "local_aws_store.db")
LOCAL_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "client", "public", "uploads")
os.makedirs(LOCAL_UPLOADS_DIR, exist_ok=True)


class AWSManager:
    def __init__(self):
        self.region = AWS_REGION
        self.is_aws_connected = False
        self.connection_error = None
        self.dynamodb_client = None
        self.dynamodb_resource = None
        self.s3_client = None
        self.cognito_client = None

        self._init_aws_clients()
        self._init_local_fallback()

        if self.is_aws_connected:
            self._ensure_aws_tables()

    def _init_aws_clients(self):
        """Attempts to initialize Boto3 AWS clients."""
        try:
            boto_kwargs = {"region_name": self.region}
            if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
                boto_kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
                boto_kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
                if AWS_SESSION_TOKEN:
                    boto_kwargs["aws_session_token"] = AWS_SESSION_TOKEN

            ddb_kwargs = dict(boto_kwargs)
            if DYNAMODB_ENDPOINT:
                ddb_kwargs["endpoint_url"] = DYNAMODB_ENDPOINT

            s3_kwargs = dict(boto_kwargs)
            if S3_ENDPOINT:
                s3_kwargs["endpoint_url"] = S3_ENDPOINT

            self.dynamodb_client = boto3.client("dynamodb", **ddb_kwargs)
            self.dynamodb_resource = boto3.resource("dynamodb", **ddb_kwargs)
            self.s3_client = boto3.client("s3", **s3_kwargs)

            if COGNITO_USER_POOL_ID:
                self.cognito_client = boto3.client("cognito-idp", **boto_kwargs)

            # Test connectivity
            self.dynamodb_client.list_tables()
            self.is_aws_connected = True
            print(f"[AWSManager] Successfully connected to AWS in region {self.region}")
        except (NoCredentialsError, PartialCredentialsError) as e:
            self.is_aws_connected = False
            self.connection_error = "AWS credentials not found or incomplete. Operating in Local Emulation Mode (ready for AWS)."
            print(f"[AWSManager] Notice: {self.connection_error}")
        except Exception as e:
            self.is_aws_connected = False
            self.connection_error = f"AWS connection check failed ({type(e).__name__}): {str(e)[:120]}. Using Local Emulation Mode."
            print(f"[AWSManager] Notice: {self.connection_error}")

    def _init_local_fallback(self):
        """Initializes SQLite local storage with DynamoDB-compatible schema."""
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()

        # Users table (mirroring DynamoDB MovieRecom_Users)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                userId TEXT PRIMARY KEY,
                username TEXT UNIQUE,
                email TEXT UNIQUE,
                fullName TEXT,
                passwordHash TEXT,
                avatarUrl TEXT,
                bio TEXT,
                favoriteGenres TEXT,
                createdAt TEXT,
                updatedAt TEXT
            )
        """)

        # Watchlist table (mirroring DynamoDB MovieRecom_Watchlists)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                userId TEXT,
                imdbID TEXT,
                title TEXT,
                year TEXT,
                poster TEXT,
                genre TEXT,
                isFavorite INTEGER DEFAULT 0,
                status TEXT DEFAULT 'plan_to_watch',
                addedAt TEXT,
                PRIMARY KEY (userId, imdbID)
            )
        """)

        # Ratings table (mirroring DynamoDB MovieRecom_Ratings)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ratings (
                userId TEXT,
                imdbID TEXT,
                rating REAL,
                review TEXT,
                title TEXT,
                year TEXT,
                poster TEXT,
                genre TEXT,
                updatedAt TEXT,
                PRIMARY KEY (userId, imdbID)
            )
        """)

        conn.commit()
        conn.close()

    def _ensure_aws_tables(self):
        """Ensures that required DynamoDB tables and S3 buckets exist in AWS."""
        if not self.is_aws_connected or not self.dynamodb_client:
            return

        try:
            existing_tables = self.dynamodb_client.list_tables().get("TableNames", [])

            # 1. Users Table (Partition Key: userId)
            if USERS_TABLE_NAME not in existing_tables:
                print(f"[AWSManager] Creating DynamoDB Table: {USERS_TABLE_NAME}...")
                self.dynamodb_client.create_table(
                    TableName=USERS_TABLE_NAME,
                    KeySchema=[{"AttributeName": "userId", "KeyType": "HASH"}],
                    AttributeDefinitions=[{"AttributeName": "userId", "AttributeType": "S"}],
                    BillingMode="PAY_PER_REQUEST",
                )

            # 2. Watchlist Table (PK: userId, SK: imdbID)
            if WATCHLIST_TABLE_NAME not in existing_tables:
                print(f"[AWSManager] Creating DynamoDB Table: {WATCHLIST_TABLE_NAME}...")
                self.dynamodb_client.create_table(
                    TableName=WATCHLIST_TABLE_NAME,
                    KeySchema=[
                        {"AttributeName": "userId", "KeyType": "HASH"},
                        {"AttributeName": "imdbID", "KeyType": "RANGE"},
                    ],
                    AttributeDefinitions=[
                        {"AttributeName": "userId", "AttributeType": "S"},
                        {"AttributeName": "imdbID", "AttributeType": "S"},
                    ],
                    BillingMode="PAY_PER_REQUEST",
                )

            # 3. Ratings Table (PK: userId, SK: imdbID)
            if RATINGS_TABLE_NAME not in existing_tables:
                print(f"[AWSManager] Creating DynamoDB Table: {RATINGS_TABLE_NAME}...")
                self.dynamodb_client.create_table(
                    TableName=RATINGS_TABLE_NAME,
                    KeySchema=[
                        {"AttributeName": "userId", "KeyType": "HASH"},
                        {"AttributeName": "imdbID", "KeyType": "RANGE"},
                    ],
                    AttributeDefinitions=[
                        {"AttributeName": "userId", "AttributeType": "S"},
                        {"AttributeName": "imdbID", "AttributeType": "S"},
                    ],
                    BillingMode="PAY_PER_REQUEST",
                )

            # S3 Bucket Check
            if self.s3_client and S3_AVATAR_BUCKET:
                try:
                    self.s3_client.head_bucket(Bucket=S3_AVATAR_BUCKET)
                except ClientError:
                    # Attempt to create if not exists
                    try:
                        create_args = {"Bucket": S3_AVATAR_BUCKET}
                        if self.region != "us-east-1":
                            create_args["CreateBucketConfiguration"] = {"LocationConstraint": self.region}
                        self.s3_client.create_bucket(**create_args)
                        print(f"[AWSManager] Created S3 bucket {S3_AVATAR_BUCKET}")
                    except Exception as e:
                        print(f"[AWSManager] Could not auto-create S3 bucket: {e}")

        except Exception as e:
            print(f"[AWSManager] Error provisioning AWS resources: {e}")

    def get_service_status(self) -> Dict[str, Any]:
        """Returns the current status of AWS services and configuration."""
        return {
            "mode": "AWS Live Cloud" if self.is_aws_connected else "AWS Local Emulation (Ready for AWS)",
            "isLiveAWS": self.is_aws_connected,
            "region": self.region,
            "error": self.connection_error,
            "services": {
                "dynamodb": {
                    "status": "Active (AWS Cloud)" if self.is_aws_connected else "Active (Local SQLite Mock)",
                    "tables": [USERS_TABLE_NAME, WATCHLIST_TABLE_NAME, RATINGS_TABLE_NAME],
                },
                "s3": {
                    "status": "Configured (AWS S3)" if (self.is_aws_connected and S3_AVATAR_BUCKET) else "Active (Local Storage)",
                    "bucket": S3_AVATAR_BUCKET,
                },
                "cognito": {
                    "status": "Configured (AWS Cognito)" if bool(COGNITO_USER_POOL_ID) else "Active (Local JWT Auth)",
                    "userPoolId": COGNITO_USER_POOL_ID or "Not Configured (Optional)",
                    "clientId": COGNITO_CLIENT_ID or "Not Configured (Optional)",
                },
            },
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    # ==========================================
    # USER PROFILE OPERATIONS (DynamoDB / Local)
    # ==========================================

    def save_user_profile(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves or updates a user profile."""
        user_id = user_data.get("userId") or str(uuid.uuid4())
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        user_data["userId"] = user_id
        user_data.setdefault("createdAt", now)
        user_data["updatedAt"] = now
        if isinstance(user_data.get("favoriteGenres"), list):
            user_data["favoriteGenres"] = ",".join(user_data["favoriteGenres"])

        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(USERS_TABLE_NAME)
                table.put_item(Item=user_data)
                return self.get_user_profile(user_id)
            except Exception as e:
                print(f"[AWSManager] DynamoDB put_item failed: {e}. Falling back to local store.")

        # Local SQLite storage fallback
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (userId, username, email, fullName, passwordHash, avatarUrl, bio, favoriteGenres, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId) DO UPDATE SET
                username=excluded.username,
                email=excluded.email,
                fullName=excluded.fullName,
                avatarUrl=COALESCE(excluded.avatarUrl, users.avatarUrl),
                bio=COALESCE(excluded.bio, users.bio),
                favoriteGenres=COALESCE(excluded.favoriteGenres, users.favoriteGenres),
                updatedAt=excluded.updatedAt
        """, (
            user_id,
            user_data.get("username", ""),
            user_data.get("email", ""),
            user_data.get("fullName", ""),
            user_data.get("passwordHash", ""),
            user_data.get("avatarUrl", ""),
            user_data.get("bio", ""),
            user_data.get("favoriteGenres", "Action,Sci-Fi"),
            user_data.get("createdAt", now),
            now
        ))
        conn.commit()
        conn.close()
        return self.get_user_profile(user_id)

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a user profile by userId."""
        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(USERS_TABLE_NAME)
                res = table.get_item(Key={"userId": user_id})
                item = res.get("Item")
                if item:
                    if isinstance(item.get("favoriteGenres"), str):
                        item["favoriteGenres"] = [g.strip() for g in item["favoriteGenres"].split(",") if g.strip()]
                    item.pop("passwordHash", None)
                    return item
            except Exception as e:
                print(f"[AWSManager] DynamoDB get_item error: {e}")

        # Local SQLite fallback
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT userId, username, email, fullName, avatarUrl, bio, favoriteGenres, createdAt, updatedAt FROM users WHERE userId = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()

        if row:
            genres_raw = row[6] or ""
            genres = [g.strip() for g in genres_raw.split(",") if g.strip()] if genres_raw else []
            return {
                "userId": row[0],
                "username": row[1],
                "email": row[2],
                "fullName": row[3],
                "avatarUrl": row[4] or f"https://ui-avatars.com/api/?name={row[1]}&background=6366f1&color=fff&size=200",
                "bio": row[5] or "Movie enthusiast & cinephile.",
                "favoriteGenres": genres if genres else ["Action", "Sci-Fi", "Drama"],
                "createdAt": row[7],
                "updatedAt": row[8],
            }
        return None

    def get_user_by_email_or_username(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Retrieves a user including passwordHash for authentication."""
        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT userId, username, email, fullName, passwordHash, avatarUrl, bio, favoriteGenres, createdAt, updatedAt FROM users WHERE email = ? OR username = ?", (identifier, identifier))
        row = cursor.fetchone()
        conn.close()

        if row:
            genres_raw = row[7] or ""
            return {
                "userId": row[0],
                "username": row[1],
                "email": row[2],
                "fullName": row[3],
                "passwordHash": row[4],
                "avatarUrl": row[5],
                "bio": row[6],
                "favoriteGenres": [g.strip() for g in genres_raw.split(",") if g.strip()],
                "createdAt": row[8],
                "updatedAt": row[9],
            }
        return None

    # ==========================================
    # WATCHLIST & FAVORITES OPERATIONS (DynamoDB)
    # ==========================================

    def add_to_watchlist(self, user_id: str, movie: Dict[str, Any]) -> Dict[str, Any]:
        """Adds a movie to the user's watchlist in DynamoDB/Local."""
        imdb_id = str(movie.get("imdbID") or movie.get("id") or movie.get("title")).strip()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        item = {
            "userId": user_id,
            "imdbID": imdb_id,
            "title": movie.get("title") or movie.get("Title", "Untitled Movie"),
            "year": str(movie.get("year") or movie.get("Year", "N/A")),
            "poster": movie.get("poster") or movie.get("Poster", ""),
            "genre": movie.get("genre") or movie.get("Genre", "Movie"),
            "isFavorite": 1 if movie.get("isFavorite") else 0,
            "status": movie.get("status", "plan_to_watch"),
            "addedAt": now,
        }

        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(WATCHLIST_TABLE_NAME)
                table.put_item(Item=item)
                return item
            except Exception as e:
                print(f"[AWSManager] DynamoDB watchlist put failed: {e}")

        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO watchlist (userId, imdbID, title, year, poster, genre, isFavorite, status, addedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId, imdbID) DO UPDATE SET
                isFavorite=excluded.isFavorite,
                status=excluded.status,
                title=excluded.title,
                poster=excluded.poster
        """, (
            item["userId"], item["imdbID"], item["title"], item["year"],
            item["poster"], item["genre"], item["isFavorite"], item["status"], item["addedAt"]
        ))
        conn.commit()
        conn.close()
        return item

    def remove_from_watchlist(self, user_id: str, imdb_id: str) -> bool:
        """Removes a movie from the user's watchlist."""
        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(WATCHLIST_TABLE_NAME)
                table.delete_item(Key={"userId": user_id, "imdbID": imdb_id})
                return True
            except Exception as e:
                print(f"[AWSManager] DynamoDB watchlist delete failed: {e}")

        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM watchlist WHERE userId = ? AND imdbID = ?", (user_id, imdb_id))
        conn.commit()
        conn.close()
        return True

    def toggle_favorite(self, user_id: str, imdb_id: str, movie_info: Optional[Dict[str, Any]] = None) -> bool:
        """Toggles the favorite flag on a movie for the user."""
        current_watchlist = self.get_user_watchlist(user_id)
        existing = next((m for m in current_watchlist if m["imdbID"] == imdb_id), None)

        if existing:
            new_fav = 0 if existing.get("isFavorite") else 1
            existing["isFavorite"] = new_fav
            self.add_to_watchlist(user_id, existing)
            return bool(new_fav)
        elif movie_info:
            movie_info["isFavorite"] = 1
            self.add_to_watchlist(user_id, movie_info)
            return True
        return False

    def get_user_watchlist(self, user_id: str) -> List[Dict[str, Any]]:
        """Retrieves all watchlist items for a given user."""
        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(WATCHLIST_TABLE_NAME)
                from boto3.dynamodb.conditions import Key
                res = table.query(KeyConditionExpression=Key("userId").eq(user_id))
                return res.get("Items", [])
            except Exception as e:
                print(f"[AWSManager] DynamoDB watchlist query failed: {e}")

        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT userId, imdbID, title, year, poster, genre, isFavorite, status, addedAt FROM watchlist WHERE userId = ? ORDER BY addedAt DESC", (user_id,))
        rows = cursor.fetchall()
        conn.close()

        items = []
        for r in rows:
            items.append({
                "userId": r[0],
                "imdbID": r[1],
                "title": r[2],
                "year": r[3],
                "poster": r[4],
                "genre": r[5],
                "isFavorite": bool(r[6]),
                "status": r[7],
                "addedAt": r[8],
            })
        return items

    # ==========================================
    # MOVIE RATINGS OPERATIONS (DynamoDB)
    # ==========================================

    def save_movie_rating(self, user_id: str, rating_data: Dict[str, Any]) -> Dict[str, Any]:
        """Saves a user's movie rating (1-10) and optional review to DynamoDB/Local."""
        imdb_id = str(rating_data.get("imdbID") or rating_data.get("title")).strip()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        item = {
            "userId": user_id,
            "imdbID": imdb_id,
            "rating": float(rating_data.get("rating", 10)),
            "review": rating_data.get("review", ""),
            "title": rating_data.get("title") or rating_data.get("Title", "Movie"),
            "year": str(rating_data.get("year") or rating_data.get("Year", "")),
            "poster": rating_data.get("poster") or rating_data.get("Poster", ""),
            "genre": rating_data.get("genre") or rating_data.get("Genre", ""),
            "updatedAt": now,
        }

        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(RATINGS_TABLE_NAME)
                # Convert float to Decimal for DynamoDB
                from decimal import Decimal
                dynamo_item = dict(item)
                dynamo_item["rating"] = Decimal(str(item["rating"]))
                table.put_item(Item=dynamo_item)
                return item
            except Exception as e:
                print(f"[AWSManager] DynamoDB rating put failed: {e}")

        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO ratings (userId, imdbID, rating, review, title, year, poster, genre, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(userId, imdbID) DO UPDATE SET
                rating=excluded.rating,
                review=excluded.review,
                title=excluded.title,
                poster=excluded.poster,
                updatedAt=excluded.updatedAt
        """, (
            item["userId"], item["imdbID"], item["rating"], item["review"],
            item["title"], item["year"], item["poster"], item["genre"], item["updatedAt"]
        ))
        conn.commit()
        conn.close()
        return item

    def get_user_ratings(self, user_id: str) -> List[Dict[str, Any]]:
        """Retrieves all movie ratings submitted by a user."""
        if self.is_aws_connected:
            try:
                table = self.dynamodb_resource.Table(RATINGS_TABLE_NAME)
                from boto3.dynamodb.conditions import Key
                res = table.query(KeyConditionExpression=Key("userId").eq(user_id))
                items = res.get("Items", [])
                for it in items:
                    if "rating" in it:
                        it["rating"] = float(it["rating"])
                return items
            except Exception as e:
                print(f"[AWSManager] DynamoDB ratings query failed: {e}")

        conn = sqlite3.connect(LOCAL_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT userId, imdbID, rating, review, title, year, poster, genre, updatedAt FROM ratings WHERE userId = ? ORDER BY updatedAt DESC", (user_id,))
        rows = cursor.fetchall()
        conn.close()

        items = []
        for r in rows:
            items.append({
                "userId": r[0],
                "imdbID": r[1],
                "rating": r[2],
                "review": r[3],
                "title": r[4],
                "year": r[5],
                "poster": r[6],
                "genre": r[7],
                "updatedAt": r[8],
            })
        return items

    # ==========================================
    # S3 AVATAR UPLOAD OPERATIONS
    # ==========================================

    def upload_avatar(self, user_id: str, file_bytes: bytes, filename: str, content_type: str = "image/jpeg") -> str:
        """Uploads a profile avatar to AWS S3 or Local Uploads store."""
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        s3_key = f"avatars/{user_id}_{int(time.time())}{ext}"

        if self.is_aws_connected and self.s3_client and S3_AVATAR_BUCKET:
            try:
                self.s3_client.put_object(
                    Bucket=S3_AVATAR_BUCKET,
                    Key=s3_key,
                    Body=file_bytes,
                    ContentType=content_type,
                    ACL="public-read"
                )
                url = f"https://{S3_AVATAR_BUCKET}.s3.{self.region}.amazonaws.com/{s3_key}"
                # Update user profile
                self.save_user_profile({"userId": user_id, "avatarUrl": url})
                return url
            except Exception as e:
                print(f"[AWSManager] S3 upload error: {e}. Falling back to local storage.")

        # Local file storage fallback
        local_filename = f"{user_id}_{int(time.time())}{ext}"
        local_filepath = os.path.join(LOCAL_UPLOADS_DIR, local_filename)
        with open(local_filepath, "wb") as f:
            f.write(file_bytes)

        relative_url = f"/uploads/{local_filename}"
        self.save_user_profile({"userId": user_id, "avatarUrl": relative_url})
        return relative_url


# Global Singleton instance
aws_manager = AWSManager()
