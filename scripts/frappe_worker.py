#!/usr/bin/env python3
"""从 PostgreSQL 队列执行途遇厂家端 Frappe 后台任务。"""

from __future__ import annotations

import argparse
import time

import frappe
from frappe.utils.tuyu_postgres_backend import run_tuyu_job_once


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bench", required=True)
    parser.add_argument("--site", required=True)
    arguments = parser.parse_args()
    frappe.init(site=arguments.site, sites_path=f"{arguments.bench}/sites")
    frappe.connect()
    try:
        while True:
            worked = False
            for queue in ("short", "default", "long"):
                try:
                    worked = run_tuyu_job_once(queue) or worked
                    frappe.db.commit()
                except Exception:
                    frappe.db.rollback()
                    frappe.log_error(title=f"TuyuFactory PostgreSQL worker: {queue}")
            if not worked:
                time.sleep(0.25)
    finally:
        frappe.destroy()


if __name__ == "__main__":
    raise SystemExit(main())
