"""A tiny in-memory stand-in for the Motor collections the routers use."""
import copy


class _Result:
    def __init__(self, matched: int = 0, deleted: int = 0):
        self.matched_count = matched
        self.deleted_count = deleted


def _matches(doc: dict, flt: dict) -> bool:
    return all(doc.get(k) == v for k, v in flt.items())


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
