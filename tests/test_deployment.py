import hashlib
import io
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError
from PIL import Image
import app
import auth
import aws_services
from model import get_recommendations


def png():
    output = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(output, format="PNG")
    return output.getvalue()


def test_registration_login_and_case_insensitive_identity(client, registered):
    data, headers = registered
    assert "passwordHash" not in data["user"]
    record = client.manager.get_user_by_email_or_username("MOVIEFAN")
    assert record["passwordHash"].startswith("scrypt:")
    assert auth.verify_password(record["passwordHash"], " strong password ")
    for identity in ("MOVIEFAN", "FAN@EXAMPLE.COM"):
        response = client.post("/api/auth/login", json={"identifier": identity, "password": " strong password "})
        assert response.status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "moviefan", "password": "wrong"}).status_code == 401
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    duplicate = client.post("/api/auth/register", json={"username": "MOVIEFAN", "email": "other@example.com", "password": "password123"})
    assert duplicate.status_code == 409


def test_profile_and_avatar_preserve_credentials(client, registered):
    data, headers = registered
    user_id = data["user"]["userId"]
    initial = client.manager._raw_user(user_id)
    assert client.put("/api/user/profile", headers=headers, json={"bio": "New bio", "favoriteGenres": ["Comedy"]}).status_code == 200
    response = client.post("/api/user/avatar/upload", headers=headers,
                           data={"avatar": (io.BytesIO(png()), "picture.png")})
    assert response.status_code == 200, response.get_json()
    after = client.manager._raw_user(user_id)
    for key in ("email", "username", "passwordHash", "createdAt"):
        assert after[key] == initial[key]
    assert after["bio"] == "New bio"
    if client.manager.mode == "aws":
        assert after["avatarKey"].startswith("avatars/")
        assert "X-Amz-Signature=" in response.get_json()["avatarUrl"]
        assert "X-Amz-" not in str(after.get("avatarUrl", ""))
        s3 = client.manager.s3_client
        assert s3.get_object(Bucket=client.manager.bucket, Key=after["avatarKey"])["Body"].read() == png()
        grants = s3.get_object_acl(Bucket=client.manager.bucket, Key=after["avatarKey"])["Grants"]
        assert all("URI" not in grant["Grantee"] for grant in grants)
        # Fresh profiles must regenerate URLs, never reuse an expired stored URL.
        original = s3.generate_presigned_url
        s3.generate_presigned_url = Mock(return_value="https://signed.example/fresh")
        assert client.get("/api/auth/me", headers=headers).get_json()["user"]["avatarUrl"] == "https://signed.example/fresh"
        s3.generate_presigned_url = original
        assert client.get("/uploads/example.png").status_code == 404
    else:
        assert client.get(response.get_json()["avatarUrl"]).status_code == 200
    assert client.post("/api/auth/login", json={"identifier": "fan@example.com", "password": " strong password "}).status_code == 200


def test_watchlist_favorite_and_rating(client, registered):
    _, headers = registered
    movie = {"imdbID": "tt1375666", "title": "Inception", "genre": "Sci-Fi"}
    assert client.post("/api/user/watchlist", headers=headers, json=movie).status_code == 201
    assert client.post("/api/user/favorite/toggle", headers=headers, json=movie).get_json()["isFavorite"] is True
    assert client.get("/api/user/watchlist", headers=headers).get_json()["watchlist"][0]["isFavorite"] is True
    assert client.post("/api/user/ratings", headers=headers, json=dict(movie, rating=9.5, review="Great")).status_code == 200
    assert client.get("/api/user/ratings", headers=headers).get_json()["ratings"][0]["rating"] == 9.5
    assert client.delete("/api/user/watchlist/tt1375666", headers=headers).status_code == 200
    assert client.get("/api/user/watchlist", headers=headers).get_json()["count"] == 0


def test_legacy_password_upgrade(client):
    old = hashlib.sha256(("old-password" + "movierecom_salt").encode()).hexdigest()
    client.manager.save_user_profile({"userId": "legacy-user", "username": "Legacy", "email": "legacy@example.com", "passwordHash": old})
    assert client.post("/api/auth/login", json={"identifier": "LEGACY", "password": "old-password"}).status_code == 200
    assert client.manager._raw_user("legacy-user")["passwordHash"].startswith("scrypt:")


def test_auth_validation_and_no_cache(client, registered):
    _, headers = registered
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.post("/api/auth/register", json=[]).status_code == 400
    assert client.put("/api/user/profile", headers=headers, json={"favoriteGenres": "Drama"}).status_code == 400
    assert client.post("/api/user/ratings", headers=headers, json={"imdbID": "x", "rating": "NaN"}).status_code == 400
    assert client.post("/api/user/avatar/upload", headers=headers, data={"avatar": (io.BytesIO(b"fake image"), "a.png")}).status_code == 400
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["Cache-Control"] == "no-store"


def test_cloud_failures_never_fall_back(client, registered, monkeypatch):
    if client.manager.mode != "aws":
        pytest.skip("AWS failure handling")
    _, headers = registered
    assert not Path(client.manager.local_db_path).exists()
    failure = ClientError({"Error": {"Code": "AccessDeniedException", "Message": "test"}}, "PutItem")
    monkeypatch.setattr(client.manager.dynamodb_resource.meta.client, "put_item", Mock(side_effect=failure))
    response = client.post("/api/user/watchlist", headers=headers, json={"imdbID": "tt123", "title": "Failure"})
    assert response.status_code == 503
    assert not Path(client.manager.local_db_path).exists()
    monkeypatch.setattr(client.manager.s3_client, "put_object", Mock(side_effect=failure))
    assert client.post("/api/user/avatar/upload", headers=headers, data={"avatar": (io.BytesIO(png()), "a.png")}).status_code == 503
    assert not client.manager.local_uploads_dir.exists()


def test_status_reports_actual_failure(client, monkeypatch):
    if client.manager.mode == "aws":
        failure = ClientError({"Error": {"Code": "AccessDenied", "Message": "test"}}, "HeadBucket")
        monkeypatch.setattr(client.manager.s3_client, "head_bucket", Mock(side_effect=failure))
        response = client.get("/api/aws/status")
        assert response.status_code == 503
        assert response.get_json()["isLiveAWS"] is False
    else:
        assert client.get("/api/aws/status").get_json()["mode"] == "Local Development"


def test_atomic_identity_reservation(client, registered):
    if client.manager.mode != "aws":
        pytest.skip("DynamoDB transaction")
    with pytest.raises(aws_services.DuplicateUserError):
        client.manager.create_user_profile({"userId": "different-user", "username": "MOVIEFAN",
                                           "email": "different@example.com", "passwordHash": "test"})
    assert client.manager._raw_user("different-user") is None


def test_query_and_legacy_lookup_pagination(client, registered, monkeypatch):
    if client.manager.mode != "aws":
        pytest.skip("DynamoDB pagination")
    data, _ = registered
    manager = client.manager
    for number in range(3):
        manager.add_to_watchlist(data["user"]["userId"], {"imdbID": f"tt{number}", "title": "Test"})
    resource_client = manager.dynamodb_resource.meta.client
    query = resource_client.query
    monkeypatch.setattr(resource_client, "query", lambda **args: query(**dict(args, Limit=1)))
    assert len(manager.get_user_watchlist(data["user"]["userId"])) == 3
    manager.save_user_profile({"userId": "legacy-scan", "username": "OldName", "email": "old@example.com"})
    scan = resource_client.scan
    monkeypatch.setattr(resource_client, "scan", lambda **args: scan(**dict(args, Limit=1)))
    assert manager.get_user_by_email_or_username("OLDNAME")["userId"] == "legacy-scan"


def test_cloud_startup_refuses_missing_resources(client, monkeypatch):
    if client.manager.mode != "aws":
        pytest.skip("AWS startup validation")
    monkeypatch.setenv("DYNAMODB_USERS_TABLE", "does-not-exist")
    with pytest.raises(aws_services.CloudServiceError):
        aws_services.AWSManager()
    assert not Path(client.manager.local_db_path).exists()


def test_no_pickle_needed_and_model_is_cwd_independent(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    results = get_recommendations("The Dark Knight")
    assert len(results) == 10
    assert set(results.columns) == {"Title", "Year"}


@pytest.mark.parametrize("changes,expected", [
    ({"APP_ENV": "production", "STORAGE_MODE": "local"}, "Production requires"),
    ({"APP_ENV": "production", "STORAGE_MODE": "aws", "JWT_SECRET": "short"}, "JWT_SECRET"),
])
def test_production_configuration_rejects_unsafe_settings(changes, expected):
    environment = dict(os.environ, **changes)
    module = "config" if changes["STORAGE_MODE"] == "local" else "auth"
    # Stub persistence when testing only auth's signing-key validation.
    code = "import config" if module == "config" else "import sys,types; s=types.ModuleType('aws_services'); s.aws_manager=None; sys.modules['aws_services']=s; import auth"
    result = subprocess.run([sys.executable, "-c", code], cwd=Path(app.__file__).parent, env=environment, capture_output=True, text=True)
    assert result.returncode != 0
    assert expected in result.stderr
