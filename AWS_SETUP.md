# CineFlix cloud setup (corrected)

The app uses React, Flask JWT authentication, DynamoDB and private S3 storage.
Cognito is not integrated. This template creates storage and an EC2 IAM instance
profile, not the EC2 web server or CloudFront distribution.

## Prerequisites

- Python 3.11 or 3.12; Node.js with npm; your own OMDb key.
- A group Git repository preserving member contributions.
- AWS deployment permissions (or an institution-provided role).

## Local development

From the project root in PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Set that generated value as JWT_SECRET in .env. Set OMDB_API_KEY to your key.
Keep APP_ENV=development and STORAGE_MODE=local. Existing local SQLite records
are retained; legacy password hashes are upgraded after successful login.
Tokens signed with an old JWT_SECRET require logging in again.

```powershell
Copy-Item client/.env.example client/.env
```

Set REACT_APP_OMDB_API_KEY in client/.env. This key is browser-visible; never put
AWS credentials or JWT_SECRET in any REACT_APP variable.

```powershell
cd client
npm ci
npm run build
cd ..
.\.venv\Scripts\python.exe app.py
```

Open http://localhost:5000. Alternatively run npm start in client for the React
development server on port 3000; its proxy targets Flask on port 5000.
The model is rebuilt from Datasets/tmdb.csv at startup. Pickle files and the
notebooks are not needed for application execution.

## Provision AWS storage (new stack)

Use an AWS CLI profile or authenticated terminal. Never embed keys in source.
The region in these examples is ap-southeast-2.

```bash
aws cloudformation validate-template --template-body file://aws-template.yaml --region ap-southeast-2
aws cloudformation deploy --template-file aws-template.yaml --stack-name cineflix-storage-dev --capabilities CAPABILITY_IAM --parameter-overrides EnvironmentName=dev --region ap-southeast-2
aws cloudformation describe-stacks --stack-name cineflix-storage-dev --query "Stacks[0].Outputs" --region ap-southeast-2
```

Copy the exact output names into your deployment environment:

```dotenv
APP_ENV=production
STORAGE_MODE=aws
ENABLE_DEMO_LOGIN=false
AWS_REGION=ap-southeast-2
DYNAMODB_USERS_TABLE=MovieRecom_Users_dev
DYNAMODB_WATCHLIST_TABLE=MovieRecom_Watchlists_dev
DYNAMODB_RATINGS_TABLE=MovieRecom_Ratings_dev
S3_AVATAR_BUCKET=<S3AvatarBucketName output>
OMDB_API_KEY=<your own key>
JWT_SECRET=<unique random secret of at least 32 characters>
```

For manually provisioned resources, use their actual names instead of the _dev
names. Infrastructure is created by CloudFormation, not application startup.
All three tables must be ACTIVE and the bucket reachable or startup fails.
Use the BackendInstanceProfile output as the EC2 instance profile. It trusts
EC2 and grants only the table/object actions the application needs.
Boto3 uses the instance role; do not set static AWS access keys on EC2.
Local AWS development may use AWS_PROFILE, or temporary credentials externally.

Deploy the React build and Flask/Gunicorn service using the EC2/Nginx/CloudFront
steps supplied in chat. On Linux the backend command can be:

```bash
gunicorn --workers 1 --threads 4 --timeout 120 --bind 127.0.0.1:8000 app:app
```

Supply environment variables via your service manager or an appropriately
protected .env file. Production rejects local storage and weak/default signing
keys. Do not run Flask's development server for production hosting.

CloudFront must forward Authorization, query strings and all needed HTTP
methods; disable caching for /api/*. API responses also send Cache-Control:
no-store. Configure HTTPS for viewers and, for end-to-end encryption, the origin.
Restrict CORS_ORIGINS to explicitly permitted frontend origins if using a separate
frontend host; same-origin deployment does not require cross-origin requests.

## Storage and identity behaviour

- AWS mode never falls back to SQLite or filesystem uploads. Failed operations
  produce HTTP 503 and do not falsely report success.
- /api/aws/status verifies table and bucket reachability. It does not prove that
  every read/write permission works; test the actual features as well.
- Profiles update individual fields. Password hashes, email, username and creation
  time survive bio, genre and avatar edits.
- Login supports email or username, case-insensitively. New AWS registrations
  reserve identity keys transactionally in the users table to prevent duplicates.
  Extra records whose userId begins identity# are expected, not separate users.
  Existing records are found with a paginated compatibility scan; at larger scale
  migrate all identities rather than relying on scans.
- Passwords use individually salted scrypt hashes. Legacy SHA-256 hashes are only
  accepted for migration and replaced immediately after a successful login.
- S3 blocks public access and disables ACLs. Uploads store avatarKey; profile reads
  produce fresh 15-minute signed URLs. Refresh the profile to renew an expired URL.
- Avatar uploads accept validated JPEG, PNG and WebP images up to 5 MiB.
- Demo login is disabled by default in production. If enabled, it is a deliberately
  shared account; use individual registrations to demonstrate account isolation.
- Resources have Retain policies. Deleting the stack will not delete the tables
  or avatar bucket and retained resources may continue to incur charges.
- Do not blindly update an already-deployed older stack with this revised template:
  compare the change set and preserve any existing data and authentication resources.

## Checks before submission

Register a fresh account, log out/in, edit its profile, upload an avatar, add/remove
watchlist items, toggle favorites and save ratings. Inspect real DynamoDB items
and S3 objects. Restart the backend and repeat login. Test public endpoints in
Postman, not only through the client. Leave hosting available until marking ends.

## Automated verification

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
cd client
npm test -- --watchAll=false --runInBand
npm run build
```

Backend AWS tests use Moto (mock DynamoDB/S3), not a real AWS account. CloudFormation
validation/deployment and end-to-end live AWS testing must be done in your account.
