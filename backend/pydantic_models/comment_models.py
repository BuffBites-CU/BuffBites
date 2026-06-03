from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CommentCreate(BaseModel):
    text: str

class CommentResponse(BaseModel):
    id: str
    combo_id: str
    text: str
    author_username: str
    author_firebase_uid: str
    created_at: datetime
