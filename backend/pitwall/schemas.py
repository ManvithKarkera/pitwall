from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    display_name: str = Field(min_length=1, max_length=80)
    notify_email: bool = True


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    display_name: str
    notify_email: bool


class TokenOut(BaseModel):
    token: str
    user: UserOut


class SessionBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    starts_at: datetime | None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    year: int
    round: int
    name: str
    country: str
    location: str
    event_date: date
    sessions: list[SessionBrief]


class ResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    driver_code: str
    driver_number: str
    full_name: str
    team: str
    team_color: str
    position: int | None
    status: str
    best_lap_ms: int | None
    best_lap_number: int | None


class SessionOut(BaseModel):
    id: int
    code: str
    name: str
    starts_at: datetime | None
    event: EventOut
    results: list[ResultOut]


class LapOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    lap_number: int
    lap_time_ms: int | None
    sector1_ms: int | None
    sector2_ms: int | None
    sector3_ms: int | None
    compound: str
    tyre_life: int | None


class ComparisonIn(BaseModel):
    session_id: int
    driver_a: str = Field(min_length=3, max_length=3)
    lap_a: int | None = None  # None = driver's fastest lap
    driver_b: str = Field(min_length=3, max_length=3)
    lap_b: int | None = None


class ComparisonOut(BaseModel):
    id: int
    status: str
    error: str
    session_id: int
    session_name: str
    event_name: str
    year: int
    driver_a: str
    lap_a: int
    driver_b: str
    lap_b: int
    created_at: datetime
    completed_at: datetime | None
    # Relative URLs, served by CloudFront from S3 (or by the dev proxy locally)
    data_url: str | None
    report_url: str | None
    chart_url: str | None
