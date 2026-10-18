"""Shared page-based pagination shape for the 4 personal-history lists
(Risk, Wellbeing, Coping, Social) — replaces the previous "Load More"
pattern (a single growing `limit`, always re-fetching from the top) with
real page numbers, so a user can jump to page 3 without re-downloading
pages 1-2, and the frontend can render "Page 2 of 5" instead of just a
"Load More" button with no sense of how much history exists.

A genuinely reusable, non-domain-specific shape — same reasoning
overview.py's RiskSlice/RoleCount are already shared across Overview and
Report, just generic over the item type instead of duplicated per module.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int  # total matching records across ALL pages, not just this one
    page: int  # 1-based
    page_size: int


def paginate_offsets(page: int, page_size: int, max_page_size: int = 100) -> tuple[int, int, int]:
    """Pure — clamp page/page_size to sane bounds and turn them into a Mongo
    (skip, limit) pair, plus the clamped page_size to echo back on the
    response. No DB access, so it's unit-testable directly (see
    tests/test_pagination.py)."""
    page = max(1, page)
    page_size = max(1, min(page_size, max_page_size))
    skip = (page - 1) * page_size
    return skip, page_size, page

