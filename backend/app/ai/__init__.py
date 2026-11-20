"""InvestIQ AI engine: explainable RAG research, comparison, scoring, reports."""

from app.ai.memory import ConversationMemory, get_memory
from app.ai.provider import LLMProvider, LmStudioProvider, OfflineEngine, get_llm

__all__ = [
    "ConversationMemory",
    "LLMProvider",
    "LmStudioProvider",
    "OfflineEngine",
    "get_llm",
    "get_memory",
]

from app.ai.modules import MODULES, ModuleFn, resolve

__all__.extend([
    "MODULES",
    "ModuleFn",
    "resolve",
])