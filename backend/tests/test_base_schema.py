"""Tests for BaseSchema's generic None -> empty-collection coercion
(schemas/common.py) - the fix that generalizes what previously had to be
discovered and patched one field at a time (see test_offer_schema.py's
docstring for the incident that prompted this)."""

from pydantic import BaseModel

from backend.schemas.common import BaseSchema


class _Nested(BaseModel):
    id: str


class _Sample(BaseSchema):
    items: list[str] = []
    nested: list[_Nested] = []
    metadata: dict = {}
    name: str | None = None


def test_coerces_explicit_null_list_to_empty_list():
    sample = _Sample.model_validate({"items": None})
    assert sample.items == []


def test_coerces_explicit_null_nested_model_list_to_empty_list():
    sample = _Sample.model_validate({"nested": None})
    assert sample.nested == []


def test_coerces_explicit_null_dict_to_empty_dict():
    sample = _Sample.model_validate({"metadata": None})
    assert sample.metadata == {}


def test_missing_keys_still_use_their_own_defaults():
    sample = _Sample.model_validate({})
    assert sample.items == []
    assert sample.nested == []
    assert sample.metadata == {}


def test_does_not_touch_non_collection_fields():
    """A None for a plain Optional[str] field must stay None, not get
    coerced into anything - only list/dict-typed fields are in scope."""
    sample = _Sample.model_validate({"name": None})
    assert sample.name is None


def test_populated_values_pass_through_unchanged():
    sample = _Sample.model_validate(
        {"items": ["a", "b"], "nested": [{"id": "x"}], "metadata": {"k": "v"}}
    )
    assert sample.items == ["a", "b"]
    assert sample.nested == [_Nested(id="x")]
    assert sample.metadata == {"k": "v"}
