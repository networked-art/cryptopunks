from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import os
from typing import Iterator

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row


@dataclass(frozen=True)
class DatabaseConfig:
  database_url: str
  views_schema: str = "punks"

  @classmethod
  def from_env(cls) -> "DatabaseConfig":
    database_url = (
      os.getenv("DATABASE_PRIVATE_URL")
      or os.getenv("DATABASE_URL")
      or os.getenv("PREDICTOR_DATABASE_URL")
    )
    if not database_url:
      raise RuntimeError(
        "DATABASE_URL, DATABASE_PRIVATE_URL, or PREDICTOR_DATABASE_URL is required"
      )
    return cls(
      database_url=database_url,
      views_schema=os.getenv("PONDER_VIEWS_SCHEMA", "punks"),
    )


@contextmanager
def connect(config: DatabaseConfig) -> Iterator[Connection]:
  with psycopg.connect(config.database_url, row_factory=dict_row) as conn:
    yield conn
