#!/usr/bin/env python3
from __future__ import annotations
import ast, hashlib, json, sys
from pathlib import Path


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def call_name(n: ast.AST) -> str:
    if isinstance(n, ast.Name):
        return n.id
    if isinstance(n, ast.Attribute):
        base = call_name(n.value)
        return f"{base}.{n.attr}" if base else n.attr
    return ""


def enclosing_functions(tree: ast.AST):
    funcs = {}
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            funcs[n.name] = n
    return funcs


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: autopsy_executor_v035.py EXECUTOR OUT")
    srcp, outp = map(Path, sys.argv[1:])
    src = srcp.read_text()
    tree = ast.parse(src)
    funcs = enclosing_functions(tree)
    report = {
        "status": "PASS",
        "scope": "PROVIDER_FREE_STATIC_AUTOPSY_ONLY",
        "executor_sha256": sha256(srcp),
        "provider_calls": 0,
        "provider_mutations": 0,
        "primary_evidence_consumed": False,
        "provider_http_error_sites": [],
        "provider_endpoint_literals": [],
        "special_payment_method_literals": [],
        "large_numeric_constants": [],
        "sleep_calls": [],
        "function_summaries": {},
    }

    parents = {}
    for n in ast.walk(tree):
        for c in ast.iter_child_nodes(n):
            parents[c] = n

    def enclosing_fn(n):
        cur = n
        while cur in parents:
            cur = parents[cur]
            if isinstance(cur, (ast.FunctionDef, ast.AsyncFunctionDef)):
                return cur.name
        return None

    endpoints = set(); pms = set(); large = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Raise):
            target = n.exc
            name = ""
            if isinstance(target, ast.Call): name = call_name(target.func)
            elif target is not None: name = call_name(target)
            if name.endswith("ProviderHTTPError"):
                report["provider_http_error_sites"].append({"line": n.lineno, "function": enclosing_fn(n), "expr": ast.get_source_segment(src, n)})
        if isinstance(n, ast.Constant):
            if isinstance(n.value, str):
                if n.value.startswith("/v1/"): endpoints.add(n.value)
                if n.value.startswith("pm_"): pms.add(n.value)
            elif isinstance(n.value, (int, float)) and not isinstance(n.value, bool) and n.value >= 60:
                large.append({"value": n.value, "line": getattr(n, "lineno", None), "function": enclosing_fn(n)})
        if isinstance(n, ast.Call):
            nm = call_name(n.func)
            if nm.endswith("sleep"):
                report["sleep_calls"].append({"line": n.lineno, "function": enclosing_fn(n), "expr": ast.get_source_segment(src, n)})

    report["provider_endpoint_literals"] = sorted(endpoints)
    report["special_payment_method_literals"] = sorted(pms)
    report["large_numeric_constants"] = sorted(large, key=lambda x: (x["line"] or 0, x["value"]))

    focus_terms=("live","full","refund","wait","poll","async","guillotine","request","http","event","collect","calibr","capture","observation","schema")
    focus = [name for name in funcs if any(k in name.lower() for k in focus_terms)]
    for name in sorted(focus):
        f = funcs[name]
        calls=[]; strings=[]
        for n in ast.walk(f):
            if isinstance(n, ast.Call):
                nm=call_name(n.func)
                if nm: calls.append(nm)
            if isinstance(n, ast.Constant) and isinstance(n.value,str):
                if n.value.startswith("/v1/") or n.value.startswith("pm_") or "refund" in n.value.lower() or "event" in n.value.lower() or "capture" in n.value.lower():
                    strings.append(n.value)
        lines = src.splitlines()
        start=max(1,f.lineno); end=min(len(lines), getattr(f,"end_lineno",f.lineno))
        report["function_summaries"][name]={
            "line_start": start, "line_end": end,
            "calls": sorted(set(calls)),
            "salient_strings": sorted(set(strings)),
            "source": "\n".join(lines[start-1:end]),
        }

    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(report, sort_keys=True, separators=(",", ":")))
    print(json.dumps({"status":"PASS","executor_sha256":report["executor_sha256"],"provider_http_error_sites":len(report["provider_http_error_sites"]),"focus_functions":len(report["function_summaries"]),"provider_calls":0},sort_keys=True))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
