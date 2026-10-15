"""Load the project .env before importing application modules."""
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=False)
PRODUCTION = os.getenv("APP_ENV", "development").lower() in {"production", "prod"}
STORAGE_MODE = os.getenv("STORAGE_MODE", "aws" if PRODUCTION else "local").lower()
if STORAGE_MODE not in {"local", "aws"}:
    raise RuntimeError("STORAGE_MODE must be local or aws")
if PRODUCTION and STORAGE_MODE != "aws":
    raise RuntimeError("Production requires STORAGE_MODE=aws; local fallback is disabled")
