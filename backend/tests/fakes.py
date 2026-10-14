"""A tiny in-memory stand-in for the Motor collections the routers use."""
import copy
import types

from bson import ObjectId


class _Result:
    def __init__(self, matched: int = 0, deleted: int = 0):
        self.matched_count = matched
        self.deleted_count = deleted


def _match_value(have, want) -> bool:
    if isinstance(want, dict) and any(k.startswith("$") for k in want):
        ops = {"$gte": lambda a, b: a >= b, "$lte": lambda a, b: a <= b, "$gt": lambda a, b: a > b, "$lt": lambda a, b: a < b}
        return have is not None and all(ops[op](have, v) for op, v in want.items())
    return have == want


def _matches(doc: dict, flt: dict) -> bool:
    return all(_match_value(doc.get(k), v) for k, v in flt.items())


class _Cursor:
    def __init__(self, docs: list[dict]):
        self.docs = docs

    def sort(self, spec):
        for key, direction in reversed(spec):
            self.docs.sort(key=lambda d: (d.get(key) is None, d.get(key) or ""), reverse=direction < 0)
        return self

    async def to_list(self, n=None):
        return self.docs[:n]


def _project(doc: dict, projection: dict | None) -> dict:
    doc = copy.deepcopy(doc)
    if not projection:
        return doc
    if any(v for v in projection.values()):
        return {k: v for k, v in doc.items() if projection.get(k) or k == "_id"}
    return {k: v for k, v in doc.items() if k not in projection}


class FakeCollection:
    def __init__(self, docs: list[dict] | None = None):
        self.docs: list[dict] = [copy.deepcopy(d) for d in docs or []]

    def find(self, flt: dict | None = None, projection: dict | None = None):
        return _Cursor([_project(d, projection) for d in self.docs if _matches(d, flt or {})])

    async def count_documents(self, flt: dict) -> int:
        return sum(1 for d in self.docs if _matches(d, flt))

    async def insert_one(self, doc: dict):
        doc = copy.deepcopy(doc)
        doc.setdefault("_id", ObjectId())
        self.docs.append(doc)
        return types.SimpleNamespace(inserted_id=doc["_id"])

    async def find_one(self, flt: dict, projection: dict | None = None):
        for d in self.docs:
            if _matches(d, flt):
                return _project(d, projection)
        return None

    async def replace_one(self, flt: dict, doc: dict, upsert: bool = False):
        for i, d in enumerate(self.docs):
            if _matches(d, flt):
                self.docs[i] = copy.deepcopy(doc)
                return _Result(matched=1)
        if upsert:
            self.docs.append(copy.deepcopy(doc))
        return _Result()

    async def update_one(self, flt: dict, update: dict, upsert: bool = False):
        for d in self.docs:
            if _matches(d, flt):
                d.update(copy.deepcopy(update.get("$set", {})))
                return _Result(matched=1)
        if upsert:
            self.docs.append({**flt, **copy.deepcopy(update.get("$set", {}))})
        return _Result()

    async def delete_one(self, flt: dict):
        for i, d in enumerate(self.docs):
            if _matches(d, flt):
                del self.docs[i]
                return _Result(deleted=1)
        return _Result()

    async def delete_many(self, flt: dict):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, flt)]
        return _Result(deleted=before - len(self.docs))
