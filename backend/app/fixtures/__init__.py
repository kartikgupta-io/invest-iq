"""Fixtures generator package.

``FIXTURES_DIR`` points at this directory; ``python -m app.fixtures.build``
regenerates all fixture files beneath it.
"""

from pathlib import Path

FIXTURES_DIR = Path(__file__).parent

__all__ = ["FIXTURES_DIR"]