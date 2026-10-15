import os
import sys
import tempfile
from pathlib import Path

# No test touches the developer's real database, uploads, credentials or AWS.
TEMP = tempfile.TemporaryDirectory()
os.environ.update(APP_ENV="development", STORAGE_MODE="local", JWT_SECRET="test-secret-" + "x" * 40,
                  LOCAL_DB_PATH=str(Path(TEMP.name) / "initial.db"),
                  LOCAL_UPLOADS_DIR=str(Path(TEMP.name) / "uploads"), AWS_EC2_METADATA_DISABLED="true",
                  AWS_ACCESS_KEY_ID="testing", AWS_SECRET_ACCESS_KEY="testing")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import boto3
import pytest
from moto import mock_aws
import app as application
import auth
import aws_services
import personalization


@pytest.fixture(params=["local", "aws"])
def client(request, monkeypatch, tmp_path):
    monkeypatch.setattr(aws_services, "STORAGE_MODE", request.param)
    monkeypatch.setenv("LOCAL_DB_PATH", str(tmp_path / "users.db"))
    monkeypatch.setenv("LOCAL_UPLOADS_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("AWS_REGION", "ap-southeast-2")
    monkeypatch.setenv("S3_AVATAR_BUCKET", "cineflix-test-avatars")
    for key in ("DYNAMODB_ENDPOINT_URL", "S3_ENDPOINT_URL"):
        monkeypatch.delenv(key, raising=False)
    names = {"users": "MovieRecom_Users", "watchlist": "MovieRecom_Watchlists", "ratings": "MovieRecom_Ratings"}
    monkeypatch.setenv("DYNAMODB_USERS_TABLE", names["users"])
    monkeypatch.setenv("DYNAMODB_WATCHLIST_TABLE", names["watchlist"])
    monkeypatch.setenv("DYNAMODB_RATINGS_TABLE", names["ratings"])
    with mock_aws():
        if request.param == "aws":
            ddb = boto3.client("dynamodb", region_name="ap-southeast-2")
            for kind, name in names.items():
                keys = [{"AttributeName": "userId", "KeyType": "HASH"}]
                if kind != "users":
                    keys.append({"AttributeName": "imdbID", "KeyType": "RANGE"})
                ddb.create_table(TableName=name, BillingMode="PAY_PER_REQUEST", KeySchema=keys,
                                 AttributeDefinitions=[{"AttributeName": k["AttributeName"], "AttributeType": "S"} for k in keys])
            s3 = boto3.client("s3", region_name="ap-southeast-2")
            s3.create_bucket(Bucket="cineflix-test-avatars", CreateBucketConfiguration={"LocationConstraint": "ap-southeast-2"})
            s3.put_bucket_ownership_controls(Bucket="cineflix-test-avatars", OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]})
        manager = aws_services.AWSManager()
        for module in (application, auth, personalization):
            monkeypatch.setattr(module, "aws_manager", manager)
        application.app.config.update(TESTING=True)
        monkeypatch.setattr(application, "UPLOADS_DIR", str(manager.local_uploads_dir))
        with application.app.test_client() as test_client:
            test_client.manager = manager
            yield test_client


@pytest.fixture
def registered(client):
    response = client.post("/api/auth/register", json={"username": "MovieFan", "email": "fan@example.com", "password": " strong password ", "favoriteGenres": ["Drama"]})
    assert response.status_code == 201, response.get_json()
    data = response.get_json()
    return data, {"Authorization": "Bearer " + data["token"]}
