from __future__ import annotations

import html
import ipaddress
import json
import math
import re
import socket
import time
from datetime import date, datetime
from hashlib import sha256
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import Depends, File, HTTPException, UploadFile, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.ai_service import AIService, normalize_math_delimiters, repair_mojibake
from app.database import Base, SessionLocal, engine, get_db, settings
from app.models import AnswerRecord, ChatMessage, ChatSession, CourseModel, Document, DocumentChunk, KnowledgePoint, LearningCheckin, LearningSuggestion, MasteryRecord, MistakeRecord, Question, User
from app.rag_service import hash_embedding, rag_service

ROOT_DIR = Path(__file__).resolve().parents[1]
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
ai_service = AIService()
