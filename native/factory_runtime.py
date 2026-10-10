#!/usr/bin/env python3
"""初始化并监督一个独立的途遇厂家端 ERPNext 站点。"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import sys
from pathlib import Path
from typing import Any

from runtime_common import ensure_certificate, executable, read_config, supervise, write_private_json


def environment(config: dict[str, Any], runtime_root: Path, bench: Path) -> dict[str, str]:
    value = os.environ.copy()
    apps = [str(path.resolve()) for path in (bench / "apps").iterdir() if path.is_dir()]
    value["PYTHONPATH"] = os.pathsep.join([str(runtime_root), *apps])
    if os.name == "nt":
        node_bin = runtime_root / "node"
        python_bin = runtime_root / "python"
        node_modules = runtime_root / "node" / "node_modules"
    else:
        node_bin = runtime_root / "node" / "bin"
        python_bin = runtime_root / "python" / "bin"
        node_modules = runtime_root / "node" / "lib" / "node_modules"
    value["PATH"] = os.pathsep.join([str(node_bin), str(python_bin), value.get("PATH", "")])
    value["PGHOST"] = str(config["database_host"])
    value["PGPORT"] = str(config["database_port"])
    value["PGOPTIONS"] = f"-c search_path={config['database_schema']},public"
    value["TUYU_POSTGRES_ONLY"] = "1"
    value["PYTHONHOME"] = str(runtime_root / "python")
    value["PYTHONNOUSERSITE"] = "1"
    value["PYTHONDONTWRITEBYTECODE"] = "1"
    value["NODE_PATH"] = str(node_modules)
    if sys.platform == "darwin":
        value["DYLD_LIBRARY_PATH"] = os.pathsep.join(
            [str(runtime_root / "lib"), str(runtime_root / "python" / "lib")]
        )
    elif sys.platform.startswith("linux"):
        value["LD_LIBRARY_PATH"] = os.pathsep.join(
            [str(runtime_root / "lib"), str(runtime_root / "python" / "lib")]
        )
    value["TUYU_FRAPPE_SITE"] = str(config["site_name"])
    value["TUYU_FRAPPE_ASSETS"] = str(
        (runtime_root / "bench" / "sites" / "assets").resolve()
    )
    return value


def replace_link(path: Path, target: Path) -> None:
    if not target.is_dir():
        raise FileNotFoundError(f"厂家端运行包缺少目录：{target}")
    if path.is_symlink():
        if path.resolve() == target.resolve():
            return
        path.unlink()
    elif path.exists():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    path.symlink_to(target, target_is_directory=True)


def place_runtime_directory(path: Path, target: Path, identity: str) -> None:
    """Unix 使用只读链接；Windows 按运行包身份保存一份本机只读副本。"""
    if os.name != "nt":
        replace_link(path, target)
        return
    marker = path.parent / f".{path.name}.runtime"
    if path.is_dir() and marker.is_file() and marker.read_text(encoding="utf-8") == identity:
        return
    if path.exists():
        shutil.rmtree(path) if path.is_dir() else path.unlink()
    shutil.copytree(target, path)
    marker.write_text(identity, encoding="utf-8")


def prepare_bench(config: dict[str, Any], runtime_root: Path, data_dir: Path) -> Path:
    source = runtime_root / "bench"
    if not (source / "sites" / "assets" / "assets.json").is_file():
        raise FileNotFoundError("厂家端运行包缺少 Frappe 浏览器资源")
    bench = data_dir / "bench"
    bench.mkdir(parents=True, exist_ok=True)
    lock = json.loads((runtime_root / "runtime.lock.json").read_text(encoding="utf-8"))
    app_identity = f"{lock['frappe_commit']}:{lock['erpnext_commit']}"
    place_runtime_directory(bench / "apps", source / "apps", app_identity)
    sites = bench / "sites"
    sites.mkdir(parents=True, exist_ok=True)
    assets_manifest = source / "sites" / "assets" / "assets.json"
    assets_identity = hashlib.sha256(assets_manifest.read_bytes()).hexdigest()
    place_runtime_directory(sites / "assets", source / "sites" / "assets", assets_identity)
    (bench / "logs").mkdir(parents=True, exist_ok=True)
    (sites / "apps.txt").write_text("frappe\nerpnext\n", encoding="utf-8")
    database_host = str(config["database_host"])
    common: dict[str, object] = {
        "db_type": "postgres",
        "db_port": int(config["database_port"]),
        "db_name": config["database_name"],
        "db_user": config["database_role"],
        "db_schema": config["database_schema"],
        "default_site": config["site_name"],
        "serve_default_site": True,
        "tuyu_single_database": True,
        "tuyu_postgres_backend": True,
        "socketio_port": 0,
    }
    if os.path.isabs(database_host):
        common["db_socket"] = database_host
    else:
        common["db_host"] = database_host
    (sites / "common_site_config.json").write_text(
        json.dumps(common, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return bench


def database_password(data_dir: Path, site: Path) -> str:
    site_config = site / "site_config.json"
    if site_config.is_file():
        value = json.loads(site_config.read_text(encoding="utf-8")).get("db_password")
        if value:
            return str(value)
    secret = data_dir / "secrets.json"
    if secret.is_file():
        value = json.loads(secret.read_text(encoding="utf-8")).get("database_password")
        if value:
            return str(value)
    value = secrets.token_urlsafe(36)
    write_private_json(secret, {"database_password": value})
    return value


def prepare_database(config: dict[str, Any], password: str) -> None:
    import psycopg2
    from psycopg2 import sql

    role = str(config["database_role"])
    schema = str(config["database_schema"])
    database = str(config["database_name"])
    for identifier in (role, schema, database):
        if not identifier.replace("_", "").isalnum():
            raise ValueError("厂家端数据库标识无效")
    connection = psycopg2.connect(
        host=str(config["database_host"]),
        port=int(config["database_port"]),
        user=str(config["database_superuser"]),
        password=str(config["database_superuser_password"]),
        dbname=database,
    )
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,))
            if cursor.fetchone() is None:
                cursor.execute(sql.SQL("CREATE ROLE {} LOGIN").format(sql.Identifier(role)))
            cursor.execute(
                sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD %s").format(sql.Identifier(role)),
                (password,),
            )
            cursor.execute(
                sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(
                    sql.Identifier(schema), sql.Identifier(role)
                )
            )
            cursor.execute(
                sql.SQL("ALTER SCHEMA {} OWNER TO {}").format(
                    sql.Identifier(schema), sql.Identifier(role)
                )
            )
            cursor.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                    sql.Identifier(database), sql.Identifier(role)
                )
            )
            cursor.execute(
                sql.SQL("GRANT USAGE, CREATE ON SCHEMA {} TO {}").format(
                    sql.Identifier(schema), sql.Identifier(role)
                )
            )
            cursor.execute(
                sql.SQL("ALTER ROLE {} IN DATABASE {} SET search_path TO {}, pg_catalog").format(
                    sql.Identifier(role), sql.Identifier(database), sql.Identifier(schema)
                )
            )
    finally:
        connection.close()


def prepare_site(config: dict[str, Any], runtime_root: Path, bench: Path) -> None:
    sites = bench / "sites"
    site = sites / str(config["site_name"])
    ready = site / ".tuyufactory-ready"
    password = database_password(Path(config["data_dir"]), site)
    prepare_database(config, password)
    value = environment(config, runtime_root, bench)
    # 当前监督器本身已由解释器启动，随后修改 PYTHONPATH 不会回写 sys.path；
    # 首次建站必须显式加载厂家端自己打包的两个应用源码。
    for app_path in reversed(value["PYTHONPATH"].split(os.pathsep)):
        if app_path and app_path not in sys.path:
            sys.path.insert(0, app_path)
    if not ready.is_file():
        database_host = str(config["database_host"])
        previous_environment = os.environ.copy()
        previous_directory = Path.cwd()
        os.environ.clear()
        os.environ.update(value)
        os.chdir(sites)
        try:
            import frappe
            from frappe.installer import _new_site

            frappe.init(str(config["site_name"]), new_site=True)
            _new_site(
                str(config["database_name"]),
                str(config["site_name"]),
                db_root_username=str(config["database_superuser"]),
                db_root_password=str(config["database_superuser_password"]),
                admin_password=str(config["administrator_password"]),
                install_apps=["erpnext"],
                force=site.exists(),
                db_password=password,
                db_type="postgres",
                db_socket=database_host if os.path.isabs(database_host) else None,
                db_host=None if os.path.isabs(database_host) else database_host,
                db_port=int(config["database_port"]),
                db_user=str(config["database_role"]),
                setup_db=False,
            )
        finally:
            try:
                frappe.destroy()
            except (NameError, Exception):
                pass
            os.chdir(previous_directory)
            os.environ.clear()
            os.environ.update(previous_environment)
        ready.touch()


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "--config":
        raise SystemExit("usage: factory_runtime.py --config <supervisor.json>")
    config = read_config(Path(sys.argv[2]))
    runtime_root = Path(config["runtime_dir"])
    data_dir = Path(config["data_dir"])
    data_dir.mkdir(parents=True, exist_ok=True)
    bench = prepare_bench(config, runtime_root, data_dir)
    prepare_site(config, runtime_root, bench)
    certificate, private_key = ensure_certificate(data_dir, str(config["public_hostname"]))
    value = environment(config, runtime_root, bench)
    python = str(executable(runtime_root / "python" / "bin" / "python3"))
    sites = bench / "sites"
    return supervise(
        [
            (
                [python, str(runtime_root / "https_server.py"), "--port", str(config["https_port"]),
                 "--certificate", str(certificate), "--private-key", str(private_key)],
                value,
                sites,
            ),
            (
                [python, str(runtime_root / "frappe_worker.py"), "--bench", str(bench),
                 "--site", str(config["site_name"])],
                value,
                sites,
            ),
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
