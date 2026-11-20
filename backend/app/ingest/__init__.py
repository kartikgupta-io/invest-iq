"""Company ingest adapters: network (SEC/NSE/BSE) and offline fixtures."""

from app.ingest.base import CompanyAdapter
from app.ingest.bse import BseAdapter
from app.ingest.nse import NseAdapter
from app.ingest.offline import OfflineAdapter
from app.ingest.sec import SecAdapter

__all__ = ["BseAdapter", "CompanyAdapter", "NseAdapter", "OfflineAdapter", "SecAdapter", "get_adapter"]


def get_adapter(name: str) -> CompanyAdapter:
    """Return a named adapter, defaulting to the offline fixtures adapter."""
    registry = {
        "offline": OfflineAdapter,
        "sec": SecAdapter,
        "nse": NseAdapter,
        "bse": BseAdapter,
    }
    adapter_type = registry.get(name.lower(), OfflineAdapter)
    return adapter_type()