"""Explicit local or AWS persistence. Cloud errors never write to local storage."""
import hashlib
import io
import json
import logging
import os
import sqlite3
import time
import uuid
from decimal import Decimal
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeSerializer
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError

from config import BASE_DIR, STORAGE_MODE

logger = logging.getLogger(__name__)


class CloudServiceError(RuntimeError):
    """A required cloud operation failed; exposed as HTTP 503 by the API."""


class DuplicateUserError(ValueError):
    pass


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class AWSManager:
    def __init__(self):
        self.region = os.getenv("AWS_REGION", "ap-southeast-2")
        self.mode = STORAGE_MODE
        self.users_table = os.getenv("DYNAMODB_USERS_TABLE", "MovieRecom_Users")
        self.watchlist_table = os.getenv("DYNAMODB_WATCHLIST_TABLE", "MovieRecom_Watchlists")
        self.ratings_table = os.getenv("DYNAMODB_RATINGS_TABLE", "MovieRecom_Ratings")
        self.bucket = os.getenv("S3_AVATAR_BUCKET", "")
        self.local_db_path = os.getenv("LOCAL_DB_PATH", str(BASE_DIR / "local_aws_store.db"))
        self.local_uploads_dir = Path(os.getenv("LOCAL_UPLOADS_DIR", str(BASE_DIR / "client/public/uploads")))
        self.dynamodb_client = self.dynamodb_resource = self.s3_client = None
        self.is_aws_connected = False
        if self.mode == "local":
            Path(self.local_db_path).parent.mkdir(parents=True, exist_ok=True)
            self.local_uploads_dir.mkdir(parents=True, exist_ok=True)
            self._init_local_fallback()
        else:
            if not self.bucket:
                raise RuntimeError("S3_AVATAR_BUCKET is required in AWS mode")
            # Boto3's standard credential chain supports EC2 roles and local profiles.
            common = {"region_name": self.region, "config": Config(
                signature_version="s3v4", connect_timeout=5, read_timeout=10,
                retries={"max_attempts": 2})}
            ddb = dict(common)
            ddb["config"] = Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 2})
            if os.getenv("DYNAMODB_ENDPOINT_URL"):
                ddb["endpoint_url"] = os.environ["DYNAMODB_ENDPOINT_URL"]
            if os.getenv("S3_ENDPOINT_URL"):
                common["endpoint_url"] = os.environ["S3_ENDPOINT_URL"]
            try:
                self.dynamodb_resource = boto3.resource("dynamodb", **ddb)
                self.dynamodb_client = boto3.client("dynamodb", **ddb)
                self.s3_client = boto3.client("s3", **common)
                self._check_cloud()
            except (BotoCoreError, ClientError) as exc:
                raise CloudServiceError("Cannot connect to required AWS resources") from exc

    def _call(self, operation, *args, **kwargs):
        try:
            return operation(*args, **kwargs)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Cloud operation failed: %s", type(exc).__name__)
            raise CloudServiceError("Cloud storage is unavailable; please retry") from exc

    def _check_cloud(self):
        for name in (self.users_table, self.watchlist_table, self.ratings_table):
            result = self._call(self.dynamodb_client.describe_table, TableName=name)
            if result["Table"]["TableStatus"] != "ACTIVE":
                raise CloudServiceError("A required DynamoDB table is not active")
        self._call(self.s3_client.head_bucket, Bucket=self.bucket)
        self.is_aws_connected = True

    def get_service_status(self):
        error = None
        if self.mode == "aws":
            try:
                self._check_cloud()
            except CloudServiceError:
                self.is_aws_connected = False
                error = "Required AWS resources are unavailable"
        live = self.mode == "aws" and self.is_aws_connected
        return {"mode": "AWS Live Cloud" if live else ("AWS Unavailable" if self.mode == "aws" else "Local Development"),
                "isLiveAWS": live, "region": self.region, "error": error,
                "services": {
                    "dynamodb": {"status": "Active (AWS Cloud)" if live else ("Unavailable" if self.mode == "aws" else "Local SQLite"),
                                 "tables": [self.users_table, self.watchlist_table, self.ratings_table]},
                    "s3": {"status": "Reachable (AWS S3)" if live else ("Unavailable" if self.mode == "aws" else "Local files"), "bucket": self.bucket},
                    "cognito": {"status": "Not used - Flask JWT authentication"}}, "timestamp": now()}

    def _local(self):
        connection = sqlite3.connect(self.local_db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _raw_user(self, user_id):
        if self.mode == "aws":
            return self._call(self.dynamodb_resource.Table(self.users_table).get_item,
                              Key={"userId": user_id}, ConsistentRead=True).get("Item")
        with self._local() as connection:
            row = connection.execute("SELECT * FROM users WHERE userId=?", (user_id,)).fetchone()
            return dict(row) if row else None

    def _public_user(self, item):
        if not item:
            return None
        item = dict(item)
        item.pop("passwordHash", None)
        item.pop("recordType", None)
        genres = item.get("favoriteGenres") or []
        if isinstance(genres, str):
            genres = [g.strip() for g in genres.split(",") if g.strip()]
        item["favoriteGenres"] = genres
        if item.get("avatarKey") and self.mode == "aws":
            item["avatarUrl"] = self._call(self.s3_client.generate_presigned_url, "get_object",
                Params={"Bucket": self.bucket, "Key": item["avatarKey"]}, ExpiresIn=900)
        return item

    def get_user_profile(self, user_id):
        return self._public_user(self._raw_user(user_id))

    @staticmethod
    def _identity_key(identifier):
        return "identity#" + hashlib.sha256(identifier.strip().lower().encode()).hexdigest()

    def get_user_by_email_or_username(self, identifier):
        identifier = identifier.strip().lower()
        if self.mode == "aws":
            lookup = self._raw_user(self._identity_key(identifier))
            if lookup:
                return self._raw_user(lookup["ownerId"])
            # Compatibility for existing cloud records created before identity reservations.
            table = self.dynamodb_resource.Table(self.users_table)
            args = {"ConsistentRead": True}
            while True:
                page = self._call(table.scan, **args)
                for item in page.get("Items", []):
                    if identifier in {str(item.get("email", "")).lower(), str(item.get("username", "")).lower()}:
                        return item
                if not page.get("LastEvaluatedKey"):
                    return None
                args["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        with self._local() as connection:
            row = connection.execute("SELECT * FROM users WHERE lower(email)=? OR lower(username)=?", (identifier, identifier)).fetchone()
            return dict(row) if row else None

    def create_user_profile(self, data):
        data = dict(data, createdAt=now(), updatedAt=now())
        if self.mode == "aws":
            serializer = TypeSerializer()
            records = [data] + [{"userId": self._identity_key(data[field]), "ownerId": data["userId"], "recordType": "identity"}
                                for field in ("email", "username")]
            items = [{"Put": {"TableName": self.users_table, "Item": {k: serializer.serialize(v) for k, v in record.items()},
                              "ConditionExpression": "attribute_not_exists(userId)"}} for record in records]
            try:
                self.dynamodb_client.transact_write_items(TransactItems=items)
            except ClientError as exc:
                if any(reason.get("Code") == "ConditionalCheckFailed" for reason in exc.response.get("CancellationReasons", [])):
                    raise DuplicateUserError("Username or email is already registered") from exc
                raise CloudServiceError("Cannot create the cloud user") from exc
            except BotoCoreError as exc:
                raise CloudServiceError("Cannot create the cloud user") from exc
            return self.get_user_profile(data["userId"])
        with self._local() as connection:
            connection.execute("BEGIN IMMEDIATE")
            for identifier in (data["email"], data["username"]):
                if connection.execute("SELECT 1 FROM users WHERE lower(email)=? OR lower(username)=?", (identifier.lower(), identifier.lower())).fetchone():
                    raise DuplicateUserError("Username or email is already registered")
            columns = list(data)
            values = [",".join(data[k]) if k == "favoriteGenres" and isinstance(data[k], list) else data[k] for k in columns]
            connection.execute(f"INSERT INTO users ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", values)
        return self.get_user_profile(data["userId"])

    def save_user_profile(self, user_data):
        user_id = user_data.get("userId") or str(uuid.uuid4())
        allowed = {"username", "email", "fullName", "passwordHash", "avatarUrl", "avatarKey", "bio", "favoriteGenres"}
        values = {k: v for k, v in user_data.items() if k in allowed}
        values["updatedAt"] = now()
        if self.mode == "aws":
            # Update only supplied attributes. Never replace credentials on profile edits.
            names = {f"#k{i}": k for i, k in enumerate(values)}
            attrs = {f":v{i}": v for i, v in enumerate(values.values())}
            names["#created"] = "createdAt"
            attrs[":created"] = now()
            expression = "SET " + ", ".join(f"#k{i}=:v{i}" for i in range(len(values)))
            expression += ", #created=if_not_exists(#created, :created)"
            self._call(self.dynamodb_resource.Table(self.users_table).update_item,
                       Key={"userId": user_id}, UpdateExpression=expression,
                       ExpressionAttributeNames=names, ExpressionAttributeValues=attrs)
        else:
            with self._local() as connection:
                connection.execute("INSERT OR IGNORE INTO users (userId,createdAt) VALUES (?,?)", (user_id, now()))
                values = {k: ",".join(v) if k == "favoriteGenres" and isinstance(v, list) else v for k, v in values.items()}
                connection.execute("UPDATE users SET " + ",".join(f"{k}=?" for k in values) + " WHERE userId=?", [*values.values(), user_id])
        return self.get_user_profile(user_id)

    def _query(self, table_name, local_table, user_id):
        if self.mode == "aws":
            args = {"KeyConditionExpression": Key("userId").eq(user_id), "ConsistentRead": True}
            items = []
            while True:
                page = self._call(self.dynamodb_resource.Table(table_name).query, **args)
                items.extend(page.get("Items", []))
                if not page.get("LastEvaluatedKey"):
                    break
                args["ExclusiveStartKey"] = page["LastEvaluatedKey"]
            return items
        with self._local() as connection:
            return [dict(r) for r in connection.execute(f"SELECT * FROM {local_table} WHERE userId=?", (user_id,))]

    def _put(self, table_name, local_table, item):
        if self.mode == "aws":
            self._call(self.dynamodb_resource.Table(table_name).put_item, Item=item)
        else:
            keys = list(item)
            with self._local() as connection:
                connection.execute(f"INSERT OR REPLACE INTO {local_table} ({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",
                                   [float(v) if isinstance(v, Decimal) else v for v in item.values()])

    def add_to_watchlist(self, user_id, movie):
        imdb_id = str(movie.get("imdbID") or movie.get("id") or "").strip()
        if not imdb_id:
            raise ValueError("imdbID is required")
        item = {"userId": user_id, "imdbID": imdb_id,
                "title": movie.get("title") or movie.get("Title", "Untitled Movie"),
                "year": str(movie.get("year") or movie.get("Year", "N/A")),
                "poster": movie.get("poster") or movie.get("Poster", ""),
                "genre": movie.get("genre") or movie.get("Genre", "Movie"),
                "isFavorite": int(bool(movie.get("isFavorite"))),
                "status": movie.get("status", "plan_to_watch"), "addedAt": movie.get("addedAt") or now()}
        self._put(self.watchlist_table, "watchlist", item)
        return item

    def get_user_watchlist(self, user_id):
        items = self._query(self.watchlist_table, "watchlist", user_id)
        for item in items:
            item["isFavorite"] = bool(item.get("isFavorite"))
        return items

    def remove_from_watchlist(self, user_id, imdb_id):
        if self.mode == "aws":
            self._call(self.dynamodb_resource.Table(self.watchlist_table).delete_item, Key={"userId": user_id, "imdbID": imdb_id})
        else:
            with self._local() as connection:
                connection.execute("DELETE FROM watchlist WHERE userId=? AND imdbID=?", (user_id, imdb_id))
        return True

    def toggle_favorite(self, user_id, imdb_id, movie_info=None):
        existing = next((m for m in self.get_user_watchlist(user_id) if m["imdbID"] == imdb_id), None)
        item = existing or dict(movie_info or {}, imdbID=imdb_id)
        item["isFavorite"] = not bool(existing.get("isFavorite")) if existing else True
        self.add_to_watchlist(user_id, item)
        return item["isFavorite"]

    def save_movie_rating(self, user_id, data):
        imdb_id = str(data.get("imdbID") or "").strip()
        try:
            rating = Decimal(str(data["rating"]))
            if not rating.is_finite() or not Decimal(1) <= rating <= Decimal(10):
                raise ValueError()
        except (KeyError, ValueError, ArithmeticError):
            raise ValueError("rating must be a number between 1 and 10") from None
        if not imdb_id:
            raise ValueError("imdbID is required")
        item = {"userId": user_id, "imdbID": imdb_id, "rating": rating,
                "review": str(data.get("review", "")), "title": data.get("title") or data.get("Title", "Movie"),
                "year": str(data.get("year") or data.get("Year", "")),
                "poster": data.get("poster") or data.get("Poster", ""),
                "genre": data.get("genre") or data.get("Genre", ""), "updatedAt": now()}
        self._put(self.ratings_table, "ratings", item)
        return dict(item, rating=float(rating))

    def get_user_ratings(self, user_id):
        return [dict(item, rating=float(item["rating"])) for item in self._query(self.ratings_table, "ratings", user_id)]

    def upload_avatar(self, user_id, file_bytes, filename, content_type="image/jpeg"):
        if len(file_bytes) > 5 * 1024 * 1024:
            raise ValueError("Avatar must be at most 5 MiB")
        try:
            with Image.open(io.BytesIO(file_bytes)) as image:
                image_format = image.format
                if image.width * image.height > 20_000_000:
                    raise ValueError("Avatar dimensions are too large")
                image.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise ValueError("Avatar must be a valid JPEG, PNG or WebP image") from None
        formats = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"), "WEBP": ("webp", "image/webp")}
        if image_format not in formats:
            raise ValueError("Avatar must be a JPEG, PNG or WebP image")
        extension, mime = formats[image_format]
        key = f"avatars/{user_id}/{uuid.uuid4().hex}.{extension}"
        if self.mode == "aws":
            self._call(self.s3_client.put_object, Bucket=self.bucket, Key=key, Body=file_bytes, ContentType=mime)
            profile = self.save_user_profile({"userId": user_id, "avatarKey": key})
        else:
            local_name = uuid.uuid4().hex + "." + extension
            (self.local_uploads_dir / local_name).write_bytes(file_bytes)
            profile = self.save_user_profile({"userId": user_id, "avatarUrl": f"/uploads/{local_name}"})
        return profile["avatarUrl"]

    def _init_local_fallback(self):
        """Initializes SQLite local storage with DynamoDB-compatible schema."""
        conn = sqlite3.connect(self.local_db_path)
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

        if "avatarKey" not in {r[1] for r in cursor.execute("PRAGMA table_info(users)")}:
            cursor.execute("ALTER TABLE users ADD COLUMN avatarKey TEXT")
        conn.commit()
        conn.close()



aws_manager = AWSManager()
