# AWS Cloud Services Architecture & Setup Guide

This Movie Recommender System integrates three core **Amazon Web Services (AWS)** primitives to deliver scalable user management, high-performance data storage, and media hosting:

```
                          ┌───────────────────────────────────────┐
                          │         React Frontend (Client)       │
                          │   (Real-time OMDb, Profile, Watchlist)│
                          └───────────────────┬───────────────────┘
                                              │ Axios / JWT
                                              ▼
                          ┌───────────────────────────────────────┐
                          │          Flask Python Backend         │
                          │        (Boto3 AWS SDK Integration)    │
                          └───────┬───────────┼───────────┬───────┘
                                  │           │           │
            ┌─────────────────────┘           │           └─────────────────────┐
            ▼                                 ▼                                 ▼
┌─────────────────────────┐       ┌─────────────────────────┐       ┌─────────────────────────┐
│     Amazon DynamoDB     │       │        Amazon S3        │       │      Amazon Cognito     │
│   (Serverless NoSQL)    │       │     (Object Storage)    │       │     (User Identity)     │
├─────────────────────────┤       ├─────────────────────────┤       ├─────────────────────────┤
│ • MovieRecom_Users      │       │ • Profile Avatars       │       │ • Secure Authentication │
│ • MovieRecom_Watchlists │       │ • Presigned PUT URLs    │       │ • JWT Verification      │
│ • MovieRecom_Ratings    │       │ • Public Read CDN Host  │       │ • Password Policies     │
└─────────────────────────┘       └─────────────────────────┘       └─────────────────────────┘
```

---

## 1. AWS Services Utilized

### A. Amazon DynamoDB
- **`MovieRecom_Users` Table**:
  - **Partition Key**: `userId` (String)
  - Stores user profile information, bio, full name, email, avatar URL, and favorite genres.
- **`MovieRecom_Watchlists` Table**:
  - **Partition Key**: `userId` (String)
  - **Sort Key**: `imdbID` (String)
  - Stores bookmarked movies with posters, year, genres, watch status (`plan_to_watch`, `completed`), and `isFavorite` flag.
- **`MovieRecom_Ratings` Table**:
  - **Partition Key**: `userId` (String)
  - **Sort Key**: `imdbID` (String)
  - Stores movie ratings (1.0 to 10.0) and user written reviews.
  - Feeds directly into the **Personalized Machine Learning Recommendation Engine** to calculate personalized movie vectors!

### B. Amazon S3 (Simple Storage Service)
- **Bucket**: `movierecom-user-avatars`
- Handles user avatar and custom profile image uploads.
- Configured with CORS for direct client uploads or secure backend uploads via `boto3.client('s3').put_object`.

### C. Amazon Cognito
- Provides cloud-native user registration, verification, sign-in, and JWT issuance.
- Configurable via `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`.

---

## 2. Zero-Friction Dual-Mode Architecture

The application comes with an **automatic dual-mode fallback**:
1. **Live AWS Mode**: When `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are provided in `.env`, the backend connects to your live AWS account, automatically creates the DynamoDB tables and S3 buckets if they don't exist yet, and streams live data to AWS.
2. **Local Emulation Mode (Offline / Dev)**: If AWS credentials are not yet set, the app transparently uses a local SQLite & local storage emulator with the **exact same DynamoDB schema and API contracts**. The UI displays an active **AWS Status Badge** indicating the current mode and connectivity health.

---

## 3. How to Deploy to AWS Cloud

### Option 1: 1-Click AWS CloudFormation / SAM Deployment
The repository includes `aws-template.yaml`. You can deploy all DynamoDB tables, S3 bucket, and Cognito User Pool with one AWS CLI command:

```bash
# Validate template
aws cloudformation validate-template --template-body file://aws-template.yaml

# Deploy the stack
aws cloudformation deploy \
  --template-file aws-template.yaml \
  --stack-name movie-recommender-stack \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides EnvironmentName=dev
```

### Option 2: Configure Existing AWS Credentials in `.env`
Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and paste your AWS credentials:
```ini
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
DYNAMODB_USERS_TABLE=MovieRecom_Users
DYNAMODB_WATCHLIST_TABLE=MovieRecom_Watchlists
DYNAMODB_RATINGS_TABLE=MovieRecom_Ratings
S3_AVATAR_BUCKET=movierecom-user-avatars
```

Restart the Flask backend:
```bash
python app.py
```
The console will print:
`[AWSManager] Successfully connected to AWS in region us-east-1`
and the web application will immediately switch to live AWS Cloud mode!

---

## 4. Testing with LocalStack (Local AWS Cloud)
If you wish to test live AWS SDK calls locally using Docker without using real AWS credits:

```bash
docker run --rm -it -p 4566:4566 -p 4510-4559:4510-4559 localstack/localstack
```

Set the endpoint in your `.env`:
```ini
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
DYNAMODB_ENDPOINT_URL=http://localhost:4566
S3_ENDPOINT_URL=http://localhost:4566
```
