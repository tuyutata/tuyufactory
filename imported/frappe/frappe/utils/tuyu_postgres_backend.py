"""PostgreSQL runtime primitives used by the TuyuBooking deployment profile.

The implementation is opt-in. Normal Frappe sites continue to use Redis/RQ;
TuyuBooking uses its merchant-owned PostgreSQL instance for cache, queues,
notifications and advisory locks, so no Redis service is installed or started.
"""

from __future__ import annotations

import fnmatch
import hashlib
import importlib
import json
import pickle
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import psycopg2
from psycopg2 import sql

import frappe


_fallback: dict[str, tuple[bytes, float | None]] = {}
_fallback_lock = threading.RLock()


def tuyu_enabled() -> bool:
	return bool(getattr(frappe.local, "conf", {}).get("tuyu_postgres_backend"))


def _schema() -> str:
	name = frappe.conf.get("db_schema") or "module_kamra"
	if not name.startswith("module_") or not name.replace("_", "").isalnum():
		raise ValueError("TuyuBooking schemas must use module_<name>")
	return name


def _connect():
	params = {
		"dbname": frappe.conf.get("db_name", "tuyubooking"),
		"user": frappe.conf.get("db_user") or frappe.conf.get("db_name", "tuyubooking"),
		"password": frappe.conf.get("db_password"),
		# TuyuBooking disables PostgreSQL TCP listeners. psycopg2 accepts the
		# socket directory as its host, so always prefer the packaged runtime's
		# private Unix socket over Frappe's conventional loopback default.
		"host": frappe.conf.get("db_socket") or frappe.conf.get("db_host"),
		"port": frappe.conf.get("db_port"),
	}
	connection = psycopg2.connect(**{key: value for key, value in params.items() if value not in (None, "")})
	connection.autocommit = True
	with connection.cursor() as cursor:
		cursor.execute(sql.SQL("SET search_path TO {}, pg_catalog").format(sql.Identifier(_schema())))
	return connection


def _ensure_tables(connection):
	schema = sql.Identifier(_schema())
	with connection.cursor() as cursor:
		cursor.execute(
			sql.SQL(
				"CREATE UNLOGGED TABLE IF NOT EXISTS {}.__tuyu_cache ("
				"cache_key text PRIMARY KEY, cache_value bytea NOT NULL, expires_at timestamptz)"
			).format(schema)
		)
		cursor.execute(
			sql.SQL(
				"CREATE TABLE IF NOT EXISTS {}.__tuyu_jobs ("
				"job_id uuid PRIMARY KEY, queue_name text NOT NULL, method text NOT NULL, payload bytea NOT NULL, "
				"status text NOT NULL DEFAULT 'queued', created_at timestamptz NOT NULL DEFAULT now(), "
				"started_at timestamptz, finished_at timestamptz, error text)"
			).format(schema)
		)
		cursor.execute(
			sql.SQL(
				"CREATE INDEX IF NOT EXISTS __tuyu_jobs_next ON {}.__tuyu_jobs "
				"(queue_name, created_at) WHERE status='queued'"
			).format(schema)
		)


def _dump(value: Any) -> bytes:
	return pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)


def _load(value):
	return None if value is None else pickle.loads(bytes(value))


class _Pipeline:
	def __init__(self, cache):
		self.cache = cache
		self.operations = []

	def __getattr__(self, name):
		def queue(*args, **kwargs):
			self.operations.append((name, args, kwargs))
			return self

		return queue

	def execute(self):
		return [getattr(self.cache, name)(*args, **kwargs) for name, args, kwargs in self.operations]

	def __enter__(self):
		return self

	def __exit__(self, *_exc):
		return False


class _Lock:
	def __init__(self, name, blocking_timeout=None, **_kwargs):
		self.key = hash(name)
		self.blocking_timeout = blocking_timeout
		self.connection = None

	def acquire(self, blocking=True, blocking_timeout=None, **_kwargs):
		deadline = time.monotonic() + (blocking_timeout or self.blocking_timeout or 0)
		while True:
			try:
				self.connection = _connect()
				with self.connection.cursor() as cursor:
					cursor.execute("SELECT pg_try_advisory_lock(%s)", (self.key,))
					if cursor.fetchone()[0]:
						return True
				self.connection.close()
				self.connection = None
			except psycopg2.Error:
				return False
			if not blocking or time.monotonic() >= deadline:
				return False
			time.sleep(0.05)

	def release(self):
		if self.connection:
			with self.connection.cursor() as cursor:
				cursor.execute("SELECT pg_advisory_unlock(%s)", (self.key,))
			self.connection.close()
			self.connection = None
		return True

	def __enter__(self):
		if not self.acquire():
			raise TimeoutError("Unable to acquire PostgreSQL advisory lock")
		return self

	def __exit__(self, *_exc):
		self.release()
		return False


class TuyuPostgresCache:
	"""Redis-compatible subset backed by PostgreSQL with install-time fallback."""

	def __init__(self, *_args, **_kwargs):
		self.connection_pool = None

	def __call__(self):
		# Preserve the legacy frappe.cache() accessor supported by RedisWrapper.
		return self

	@staticmethod
	def make_key(key, user=None, shared=False):
		if shared:
			return str(key)
		return f"{user or getattr(frappe.session, 'user', None) or 'Guest'}|{key}"

	def _database(self):
		# Schema DDL owns installation transactions; cache writes must not join or block them.
		if any(
			getattr(frappe.flags, flag, False)
			for flag in ("in_install_db", "in_install", "in_migrate")
		):
			return None
		try:
			connection = _connect()
			_ensure_tables(connection)
			return connection
		except psycopg2.Error:
			return None

	def set(self, key, value, ex=None, nx=False, xx=False, **_kwargs):
		expires = None if ex is None else float(ex.total_seconds() if isinstance(ex, timedelta) else ex)
		connection = self._database()
		if connection is None:
			with _fallback_lock:
				if nx and str(key) in _fallback:
					return False
				if xx and str(key) not in _fallback:
					return False
				_fallback[str(key)] = (_dump(value), None if expires is None else time.time() + expires)
			return True
		try:
			with connection.cursor() as cursor:
				conflict = sql.SQL("DO NOTHING") if nx else sql.SQL(
					"DO UPDATE SET cache_value=EXCLUDED.cache_value, expires_at=EXCLUDED.expires_at"
				)
				cursor.execute(
					sql.SQL(
						"INSERT INTO {}.__tuyu_cache(cache_key,cache_value,expires_at) "
						"VALUES (%s,%s,CASE WHEN %s IS NULL THEN NULL ELSE now()+(%s*interval '1 second') END) "
						"ON CONFLICT (cache_key) {}"
					).format(sql.Identifier(_schema()), conflict),
					(str(key), psycopg2.Binary(_dump(value)), expires, expires),
				)
				return cursor.rowcount > 0
		finally:
			connection.close()

	def setex(self, key, seconds, value):
		return self.set(key, value, ex=seconds)

	def setnx(self, key, value):
		return self.set(key, value, nx=True)

	def get(self, key):
		connection = self._database()
		if connection is None:
			with _fallback_lock:
				item = _fallback.get(str(key))
				if not item or (item[1] is not None and item[1] <= time.time()):
					_fallback.pop(str(key), None)
					return None
				return _load(item[0])
		try:
			with connection.cursor() as cursor:
				cursor.execute(sql.SQL("DELETE FROM {}.__tuyu_cache WHERE expires_at<=now()").format(sql.Identifier(_schema())))
				cursor.execute(
					sql.SQL("SELECT cache_value FROM {}.__tuyu_cache WHERE cache_key=%s").format(sql.Identifier(_schema())),
					(str(key),),
				)
				row = cursor.fetchone()
				return _load(row[0]) if row else None
		finally:
			connection.close()

	def get_value(self, key, generator=None, user=None, expires_in_sec=None, shared=False):
		key = self.make_key(key, user=user, shared=shared)
		value = self.get(key)
		if value is None and generator:
			value = generator()
			self.set(key, value, ex=expires_in_sec)
		return value

	def set_value(self, key, value, user=None, expires_in_sec=None, shared=False):
		return self.set(self.make_key(key, user=user, shared=shared), value, ex=expires_in_sec)

	def delete(self, *keys):
		keys = [str(key) for key in keys]
		if not keys:
			return 0
		connection = self._database()
		if connection is None:
			with _fallback_lock:
				return sum(_fallback.pop(key, None) is not None for key in keys)
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					sql.SQL("DELETE FROM {}.__tuyu_cache WHERE cache_key=ANY(%s)").format(sql.Identifier(_schema())),
					(keys,),
				)
				return cursor.rowcount
		finally:
			connection.close()

	def delete_value(self, keys, user=None, make_keys=True, shared=False):
		"""Delete one or many keys with the same call contract as RedisWrapper."""
		if not keys:
			return 0
		if not isinstance(keys, (list, tuple)):
			keys = (keys,)
		if make_keys:
			keys = [self.make_key(key, user=user, shared=shared) for key in keys]
		local_cache = getattr(frappe.local, "cache", None)
		if hasattr(local_cache, "pop"):
			for key in keys:
				local_cache.pop(key, None)
		return self.delete(*keys)

	delete_key = delete_value

	def exists(self, *keys, user=None, shared=None):
		return sum(self.get(key) is not None for key in keys)

	def expire(self, key, seconds):
		value = self.get(key)
		return False if value is None else self.set(key, value, ex=seconds)

	def expire_key(self, key, seconds, *, user=None, shared=False):
		return self.expire(self.make_key(key, user=user, shared=shared), seconds)

	def ttl(self, key):
		connection = self._database()
		if connection is None:
			item = _fallback.get(str(key))
			return -2 if not item else (-1 if item[1] is None else max(0, int(item[1] - time.time())))
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					sql.SQL("SELECT EXTRACT(EPOCH FROM expires_at-now()) FROM {}.__tuyu_cache WHERE cache_key=%s").format(sql.Identifier(_schema())),
					(str(key),),
				)
				row = cursor.fetchone()
				return -2 if not row else (-1 if row[0] is None else max(0, int(row[0])))
		finally:
			connection.close()

	def incrby(self, key, amount=1):
		value = int(self.get(key) or 0) + int(amount)
		self.set(key, value)
		return value

	def _hash(self, key):
		return dict(self.get(key) or {})

	def hset(self, key, name=None, value=None, mapping=None, shared=False, *args, **kwargs):
		data = self._hash(key)
		before = len(data)
		if mapping:
			data.update(mapping)
		if name is not None:
			data[name] = value
		self.set(key, data)
		return len(data) - before

	def hget(self, key, name, generator=None, shared=False):
		value = self._hash(key).get(name)
		if value is None and generator:
			value = generator()
			self.hset(key, name, value, shared=shared)
		return value

	def hgetall(self, key):
		return self._hash(key)

	def hdel(self, key, *names, shared=False, pipeline=None):
		if len(names) == 1 and isinstance(names[0], (list, tuple)):
			names = tuple(names[0])
		data = self._hash(key)
		removed = sum(data.pop(name, None) is not None for name in names)
		self.set(key, data)
		return removed

	def hexists(self, key, name, shared=False):
		return name in self._hash(key)

	def hkeys(self, key):
		return list(self._hash(key).keys())

	def hdel_names(self, names, key):
		return sum(self.hdel(name, key) or 0 for name in names)

	def lpush(self, key, *values, user=None, shared=False):
		items = list(reversed(values)) + list(self.get(key) or [])
		self.set(key, items)
		return len(items)

	def rpush(self, key, *values):
		items = list(self.get(key) or []) + list(values)
		self.set(key, items)
		return len(items)

	def lpop(self, key, user=None, shared=False):
		items = list(self.get(key) or [])
		value = items.pop(0) if items else None
		self.set(key, items)
		return value

	def rpop(self, key):
		items = list(self.get(key) or [])
		value = items.pop() if items else None
		self.set(key, items)
		return value

	def llen(self, key):
		return len(self.get(key) or [])

	def lindex(self, key, index):
		items = list(self.get(key) or [])
		try:
			return items[int(index)]
		except IndexError:
			return None

	def lrange(self, key, start, stop):
		items = list(self.get(key) or [])
		start, stop = int(start), int(stop)
		if stop == -1:
			return items[start:]
		return items[start : stop + 1]

	def ltrim(self, key, start, stop):
		items = self.lrange(key, start, stop)
		self.set(key, items)
		return True

	def blpop(self, key, timeout=0, user=None, shared=False):
		deadline = None if not timeout else time.monotonic() + float(timeout)
		while True:
			value = self.lpop(key, user=user, shared=shared)
			if value is not None:
				return key, value
			if deadline is not None and time.monotonic() >= deadline:
				return None
			time.sleep(0.05)

	def sadd(self, key, *values):
		items = set(self.get(key) or set())
		before = len(items)
		items.update(values)
		self.set(key, items)
		return len(items) - before

	def srem(self, key, *values):
		items = set(self.get(key) or set())
		before = len(items)
		items.difference_update(values)
		self.set(key, items)
		return before - len(items)

	def smembers(self, key):
		return set(self.get(key) or set())

	def sismember(self, key, value):
		return value in self.smembers(key)

	def get_keys(self, pattern, user=None, shared=False):
		connection = self._database()
		if connection is None:
			return [key for key in _fallback if fnmatch.fnmatch(key, pattern)]
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					sql.SQL("SELECT cache_key FROM {}.__tuyu_cache WHERE cache_key LIKE %s").format(sql.Identifier(_schema())),
					(pattern.replace("*", "%"),),
				)
				return [row[0] for row in cursor.fetchall()]
		finally:
			connection.close()

	def delete_keys(self, pattern, user=None, shared=False):
		return self.delete(*self.get_keys(pattern))

	def flushdb(self):
		return self.delete_keys("*")

	flushall = flushdb

	def lock(self, name, timeout=None, blocking_timeout=None, **kwargs):
		return _Lock(name, timeout=timeout, blocking_timeout=blocking_timeout, **kwargs)

	def pipeline(self, *_args, **_kwargs):
		return _Pipeline(self)

	def publish(self, channel, message):
		publish_tuyu_realtime(channel, message)
		return 1

	def ping(self):
		connection = self._database()
		if not connection:
			return False
		connection.close()
		return True

	def execute_command(self, command, *args, **kwargs):
		return getattr(self, command.lower())(*args, **kwargs)

	@classmethod
	def from_url(cls, *_args, **_kwargs):
		return cls()


class TuyuPostgresClientCache:
	def __init__(self, cache=None):
		# Match Frappe's ClientCache(cache) construction while remaining usable directly.
		self.cache = cache or TuyuPostgresCache()
		self.invalidator_thread = None

	def get_value(self, key, *_args, generator=None, **_kwargs):
		return self.cache.get_value(f"client|{key}", generator=generator, shared=True)

	def set_value(self, key, value, expires_in_sec=None, *_args, **_kwargs):
		return self.cache.set_value(f"client|{key}", value, expires_in_sec=expires_in_sec, shared=True)

	def delete_value(self, key, *_args, **_kwargs):
		return self.cache.delete_value(f"client|{key}", shared=True)

	def delete_keys(self, pattern):
		return self.cache.delete_keys(f"client|{pattern}")

	def get_doc(self, doctype, name=None):
		name = name or doctype
		return self.get_value(
			f"doc|{doctype}|{name}", generator=lambda: frappe.get_doc(doctype, name)
		)

	def statistics(self):
		return {"backend": "postgresql", "healthy": self.healthy()}

	def healthy(self):
		return self.cache.ping()

	def clear_cache(self):
		return self.delete_keys("*")

	def erase_persistent_caches(self, *, doctype=None):
		return self.delete_keys("*")

	def reset_statistics(self):
		return None


@dataclass
class TuyuJob:
	id: str
	status: str = "queued"
	exc_info: str | None = None

	def get_status(self, refresh=False):
		if refresh and (job := get_tuyu_job(self.id)):
			self.status, self.exc_info = job.status, job.exc_info
		return self.status

	def cancel(self):
		_update_job(self.id, "cancelled")


TUYU_JOB_NAMESPACE = uuid.UUID("ecb0f70c-bf87-5e4c-a544-2d46794e2696")


def normalize_tuyu_job_id(job_id):
	"""Map Frappe's arbitrary job identifiers onto the PostgreSQL UUID key."""
	value = str(job_id)
	try:
		return str(uuid.UUID(value))
	except ValueError:
		site = getattr(frappe.local, "site", None) or "global"
		return str(uuid.uuid5(TUYU_JOB_NAMESPACE, f"{site}:{value}"))


def enqueue_tuyu_job(method=None, queue="default", job_id=None, **kwargs):
	method = method or kwargs.pop("method")
	method_name = method if isinstance(method, str) else f"{method.__module__}.{method.__qualname__}"
	now = bool(kwargs.pop("now", False))
	is_async = bool(kwargs.pop("async", kwargs.pop("is_async", True)))
	enqueue_after_commit = bool(kwargs.pop("enqueue_after_commit", False))
	deduplicate = bool(kwargs.pop("deduplicate", False))
	# These values control queue scheduling and must never become business
	# function keyword arguments.
	for control in (
		"timeout",
		"event",
		"job_name",
		"on_success",
		"on_failure",
		"at_front",
		"at_front_when_starved",
	):
		kwargs.pop(control, None)
	nested_payload = kwargs.pop("kwargs", None)
	payload = dict(nested_payload) if nested_payload is not None else kwargs
	if now or not is_async:
		return frappe.call(method, **payload)
	job_id = str(job_id or uuid.uuid4())
	database_job_id = normalize_tuyu_job_id(job_id)
	if deduplicate and is_tuyu_job_enqueued(job_id):
		return None

	def insert_job():
		connection = _connect()
		try:
			_ensure_tables(connection)
			with connection.cursor() as cursor:
				cursor.execute(
					sql.SQL("INSERT INTO {}.__tuyu_jobs(job_id,queue_name,method,payload) VALUES (%s,%s,%s,%s)").format(sql.Identifier(_schema())),
					(database_job_id, queue, method_name, psycopg2.Binary(_dump(payload))),
				)
		finally:
			connection.close()
		return TuyuJob(job_id)

	if enqueue_after_commit:
		frappe.db.after_commit.add(insert_job)
		return None
	return insert_job()


def _update_job(job_id, status, error=None):
	connection = _connect()
	try:
		with connection.cursor() as cursor:
			cursor.execute(
				sql.SQL(
					"UPDATE {}.__tuyu_jobs SET status=%s,error=%s,finished_at="
					"CASE WHEN %s IN ('finished','failed','cancelled') THEN now() ELSE finished_at END WHERE job_id=%s"
				).format(sql.Identifier(_schema())),
				(status, error, status, normalize_tuyu_job_id(job_id)),
			)
	finally:
		connection.close()


def get_tuyu_job(job_id):
	connection = _connect()
	try:
		_ensure_tables(connection)
		with connection.cursor() as cursor:
			cursor.execute(
				sql.SQL("SELECT status,error FROM {}.__tuyu_jobs WHERE job_id=%s").format(sql.Identifier(_schema())),
				(normalize_tuyu_job_id(job_id),),
			)
			row = cursor.fetchone()
			return TuyuJob(str(job_id), row[0], row[1]) if row else None
	finally:
		connection.close()


def is_tuyu_job_enqueued(job_id):
	job = get_tuyu_job(job_id)
	return bool(job and job.status in {"queued", "started"})


def run_tuyu_job_once(queue="default"):
	"""Claim and execute one job; invoked by the TuyuBooking native supervisor."""
	connection = _connect()
	connection.autocommit = False
	try:
		_ensure_tables(connection)
		with connection.cursor() as cursor:
			cursor.execute(
				sql.SQL(
					"SELECT job_id,method,payload FROM {}.__tuyu_jobs WHERE queue_name=%s AND status='queued' "
					"ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1"
				).format(sql.Identifier(_schema())),
				(queue,),
			)
			job = cursor.fetchone()
			if not job:
				connection.rollback()
				return None
			cursor.execute(
				sql.SQL("UPDATE {}.__tuyu_jobs SET status='started',started_at=now() WHERE job_id=%s").format(sql.Identifier(_schema())),
				(job[0],),
			)
		connection.commit()
	finally:
		connection.close()
	try:
		module_name, function_name = job[1].rsplit(".", 1)
		result = getattr(importlib.import_module(module_name), function_name)(**_load(job[2]))
		_update_job(str(job[0]), "finished")
		return result
	except Exception as exc:
		_update_job(str(job[0]), "failed", repr(exc))
		raise


def tuyu_notification_channel(channel: Any) -> str:
	"""Return a deterministic PostgreSQL-safe NOTIFY channel name."""
	raw = str(channel)
	encoded = raw.encode("utf-8")
	if len(encoded) <= 63:
		return raw
	return f"tuyu_{hashlib.sha256(encoded).hexdigest()[:56]}"


def publish_tuyu_realtime(channel, message, **_kwargs):
	connection = _connect()
	try:
		with connection.cursor() as cursor:
			cursor.execute(
				"SELECT pg_notify(%s,%s)",
				(tuyu_notification_channel(channel), json.dumps(message, default=str)),
			)
	finally:
		connection.close()
