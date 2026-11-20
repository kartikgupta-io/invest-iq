import math

from app.search.embeddings import cosine, hash_embed


def test_cosine_orthogonal_is_zero() -> None:
    assert cosine([1.0, 0.0], [0.0, 1.0]) == 0.0


def test_cosine_parallel_is_one() -> None:
    assert math.isclose(cosine([1.0, 2.0], [2.0, 4.0]), 1.0)


def test_cosine_length_mismatch_is_zero() -> None:
    assert cosine([1.0, 0.0], [1.0]) == 0.0


def test_cosine_empty_is_zero() -> None:
    assert cosine([], []) == 0.0


def test_hash_embed_stable_across_calls() -> None:
    assert hash_embed("reliance revenue growth") == hash_embed("reliance revenue growth")


def test_hash_embed_differs_for_distinct_text() -> None:
    assert hash_embed("reliance") != hash_embed("tcs")


def test_hash_embed_fixed_dimension() -> None:
    assert len(hash_embed("any text")) == 384
    assert all(isinstance(x, float) for x in hash_embed("any text"))


def test_hash_embed_unit_norm() -> None:
    vector = hash_embed("hello world")
    norm = math.sqrt(sum(x * x for x in vector))
    assert math.isclose(norm, 1.0, rel_tol=1e-6)