"""paginate_offsets is pure — no DB access — so it's unit-tested directly,
matching this project's established convention (see test_report_service.py)."""

from app.models.pagination import paginate_offsets


def test_first_page_has_zero_skip():
    skip, page_size, page = paginate_offsets(1, 10)
    assert (skip, page_size, page) == (0, 10, 1)


def test_third_page_skips_two_pages_worth():
    skip, page_size, page = paginate_offsets(3, 10)
    assert (skip, page_size, page) == (20, 10, 3)


def test_page_below_one_clamps_to_one():
    skip, page_size, page = paginate_offsets(0, 10)
    assert (skip, page) == (0, 1)
    skip, page_size, page = paginate_offsets(-5, 10)
    assert (skip, page) == (0, 1)


def test_page_size_below_one_clamps_to_one():
    _, page_size, _ = paginate_offsets(1, 0)
    assert page_size == 1
    _, page_size, _ = paginate_offsets(1, -3)
    assert page_size == 1


def test_page_size_above_max_clamps_to_max():
    _, page_size, _ = paginate_offsets(1, 500, max_page_size=100)
    assert page_size == 100


def test_custom_page_size_used_in_skip_calculation():
    skip, page_size, page = paginate_offsets(4, 5)
    assert (skip, page_size, page) == (15, 5, 4)
