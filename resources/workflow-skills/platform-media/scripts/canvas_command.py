#!/usr/bin/env python3
import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path


STDOUT_RESULT_BYTE_LIMIT = 128 * 1024
STDOUT_TEXT_LIMIT = 2_000
STDOUT_URL_LIMIT = 4_000
STDOUT_MEDIA_LIMIT = 8
STDOUT_BATCH_LIMIT = 200


def env(name):
    value = os.environ.get(name, "")
    return value.strip() if isinstance(value, str) else ""


def request_json(url, method="GET", payload=None, timeout=60):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    token = env("CODEX_PLATFORM_TOKEN")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("X-Ideart-Codex-Token", token)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", "replace")
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace")
        try:
            data = json.loads(text)
            message = data.get("error") or data.get("message") or text
        except Exception:
            message = text
        raise SystemExit(f"Canvas command error {exc.code}: {message}")


def parse_payload(raw):
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise SystemExit(f"Invalid --payload JSON: {exc}")
    if not isinstance(value, dict):
        raise SystemExit("--payload must be a JSON object")
    return value


def parse_payload_file(file_path):
    if not file_path:
        return {}
    path = Path(file_path).expanduser().resolve()
    if not path.is_file():
        raise SystemExit(f"Payload file not found: {path}")
    return parse_payload(path.read_text(encoding="utf-8"))


def compact_text(value, limit=STDOUT_TEXT_LIMIT):
    normalized = str(value or "").strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit] + "...[truncated]"


def as_record(value):
    return value if isinstance(value, dict) else {}


def media_url(value):
    if isinstance(value, str):
        return compact_text(value, STDOUT_URL_LIMIT)
    item = as_record(value)
    return compact_text(
        item.get("url")
        or item.get("src")
        or item.get("mediaUrl")
        or item.get("outputUrl")
        or item.get("imageUrl")
        or item.get("videoUrl")
        or item.get("audioUrl"),
        STDOUT_URL_LIMIT,
    )


def unique_media_urls(values):
    result = []
    seen = set()
    for value in values:
        url = media_url(value)
        if not url or url in seen:
            continue
        seen.add(url)
        result.append(url)
        if len(result) >= STDOUT_MEDIA_LIMIT:
            break
    return result


def compact_run_receipt(value):
    result = as_record(value)
    node = as_record(result.get("node"))
    data = as_record(node.get("data"))
    task = as_record(result.get("task"))
    output_node = as_record(result.get("outputNode"))
    output_data = as_record(output_node.get("data"))
    urls = unique_media_urls([
        result.get("mediaUrl"),
        *(result.get("mediaUrls") if isinstance(result.get("mediaUrls"), list) else []),
        data.get("playlistExportUrl"),
        output_data.get("mediaUrl"),
        data.get("mediaUrl"),
        task.get("mediaUrl"),
        *(data.get("workflowImageResults") if isinstance(data.get("workflowImageResults"), list) else []),
        *(data.get("workflowVideoResults") if isinstance(data.get("workflowVideoResults"), list) else []),
        *(data.get("workflowAudioResults") if isinstance(data.get("workflowAudioResults"), list) else []),
    ])
    error = compact_text(
        result.get("error")
        or task.get("error")
        or data.get("workflowGenerationError"),
        STDOUT_TEXT_LIMIT,
    )
    status = compact_text(result.get("status") or task.get("status"), 40)
    if not status:
        status = "failed" if error else "completed" if urls else "idle"
    receipt = {
        "nodeId": compact_text(result.get("nodeId") or node.get("id"), 200),
        "nodeExists": result.get("nodeExists", bool(node or result.get("nodeId"))),
        "kind": compact_text(result.get("kind") or node.get("kind"), 40),
        "status": status,
        "taskId": compact_text(result.get("taskId") or task.get("taskId"), 200),
        "jobId": compact_text(result.get("jobId") or task.get("jobId"), 200),
        "providerKey": compact_text(result.get("providerKey") or task.get("providerKey"), 120),
        "modelId": compact_text(result.get("modelId") or task.get("modelId") or data.get("modelId"), 200),
        "aspectRatio": compact_text(result.get("aspectRatio") or data.get("aspectRatio"), 40),
        "width": result.get("width") or node.get("width"),
        "height": result.get("height") or node.get("height"),
        "mediaUrl": urls[0] if urls else "",
        "mediaUrls": urls,
        "outputNodeId": compact_text(result.get("outputNodeId") or output_node.get("id"), 200),
        "error": error,
        "reused": result.get("reused") is True,
        "reason": compact_text(result.get("reason"), 160),
    }
    return {key: item for key, item in receipt.items() if item not in ("", None, False, []) or key in {"nodeId", "status", "mediaUrls"}}


def compact_generic(value, depth=0, array_limit=30):
    if isinstance(value, str):
        limit = STDOUT_URL_LIMIT if value.startswith(("http://", "https://", "/api/", "/uploads/")) else STDOUT_TEXT_LIMIT
        return compact_text(value, limit)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if depth >= 5:
        return "[nested value omitted]"
    if isinstance(value, list):
        result = [compact_generic(item, depth + 1, array_limit) for item in value[:array_limit]]
        if len(value) > array_limit:
            result.append({"omittedCount": len(value) - array_limit})
        return result
    if isinstance(value, dict):
        items = list(value.items())
        result = {
            str(key): compact_generic(item, depth + 1, array_limit)
            for key, item in items[:80]
        }
        if len(items) > 80:
            result["omittedKeyCount"] = len(items) - 80
        return result
    return compact_text(value)


def compact_snapshot(value):
    result = as_record(value)
    nodes = result.get("nodes") if isinstance(result.get("nodes"), list) else []
    edges = result.get("edges") if isinstance(result.get("edges"), list) else []
    compact = {
        key: compact_generic(result.get(key), array_limit=40)
        for key in (
            "workflowProjectId",
            "canvasSessionId",
            "contractVersion",
            "revision",
            "nodeCount",
            "edgeCount",
            "unchanged",
            "layout",
            "selectedNodeIds",
        )
        if key in result
    }
    if not result.get("unchanged"):
        compact["nodes"] = [compact_generic(node, array_limit=12) for node in nodes[:240]]
        compact["edges"] = [compact_generic(edge, array_limit=8) for edge in edges[:400]]
        if len(nodes) > 240:
            compact["omittedNodeCount"] = len(nodes) - 240
        if len(edges) > 400:
            compact["omittedEdgeCount"] = len(edges) - 400
    return compact


def compact_result(operation, value):
    if operation in {"run", "wait"}:
        return compact_run_receipt(value)
    if operation == "run-batch":
        result = as_record(value)
        items = result.get("items") if isinstance(result.get("items"), list) else []
        compact_items = []
        for item in items[:STDOUT_BATCH_LIMIT]:
            entry = as_record(item)
            compact_items.append({
                "index": entry.get("index"),
                "nodeId": compact_text(entry.get("nodeId"), 200),
                "ok": entry.get("ok") is True,
                "skipped": entry.get("skipped") is True,
                "error": compact_text(entry.get("error"), STDOUT_TEXT_LIMIT),
                "billingDenial": compact_generic(entry.get("billingDenial"), array_limit=8) if entry.get("billingDenial") else None,
                "result": compact_run_receipt(entry.get("result")),
            })
        return {
            "concurrency": result.get("concurrency"),
            "itemCount": result.get("itemCount", len(items)),
            "succeededCount": result.get("succeededCount"),
            "failedCount": result.get("failedCount"),
            "stoppedByBilling": result.get("stoppedByBilling") is True,
            "items": compact_items,
            **({"omittedItemCount": len(items) - STDOUT_BATCH_LIMIT} if len(items) > STDOUT_BATCH_LIMIT else {}),
        }
    if operation == "snapshot":
        return compact_snapshot(value)
    return compact_generic(value, array_limit=30)


def render_json(value, pretty=False):
    return json.dumps(
        value,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )


def print_result(value, operation, pretty=False, result_file=""):
    full_rendered = render_json(value, pretty)
    result_path = ""
    if result_file:
        target = Path(result_file).expanduser().resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(full_rendered + "\n", encoding="utf-8")
        result_path = str(target)
    compact = compact_result(operation, value)
    if isinstance(compact, dict) and result_path:
        compact = {**compact, "resultFile": result_path, "fullResultSaved": True}
    rendered = render_json(compact, pretty)
    if len(rendered.encode("utf-8")) > STDOUT_RESULT_BYTE_LIMIT:
        rendered = render_json({
            "status": "completed",
            "operation": operation,
            "truncated": True,
            "resultFile": result_path,
            "message": "Canvas result exceeded the stdout budget. Read the saved result file or request a smaller page.",
        }, pretty)
    print(rendered)


def main():
    parser = argparse.ArgumentParser(description="Operate the active 造梦 workflow canvas through its native UI execution bridge.")
    parser.add_argument("operation", choices=("snapshot", "models", "create", "update", "connect", "disconnect", "delete", "run", "run-batch", "wait", "inspect-result", "script-create-input", "script-import-assets", "storyboard-create-images", "storyboard-regenerate-images", "storyboard-create-videos"))
    parser.add_argument("--workflow-project-id", required=True)
    parser.add_argument("--canvas-session-id", required=True)
    parser.add_argument("--codex-task-id", default="")
    payload_group = parser.add_mutually_exclusive_group()
    payload_group.add_argument("--payload", default="{}")
    payload_group.add_argument("--payload-file", default="")
    parser.add_argument("--result-file", default="")
    parser.add_argument("--timeout", type=int, default=7200)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    base = env("CODEX_CANVAS_COMMAND_URL")
    token = env("CODEX_PLATFORM_TOKEN")
    if not base or not token:
        raise SystemExit("Workflow canvas bridge is unavailable in this Codex session.")
    command = request_json(base, "POST", {
        "workflow_project_id": args.workflow_project_id,
        "canvas_session_id": args.canvas_session_id,
        "codex_task_id": args.codex_task_id or "",
        "operation": args.operation,
        "payload": parse_payload_file(args.payload_file) if args.payload_file else parse_payload(args.payload),
    })
    command_id = command.get("id") if isinstance(command, dict) else ""
    if not command_id:
        raise SystemExit("Canvas command was not accepted.")
    deadline = time.time() + max(5, args.timeout)
    running_deadline = None
    last_status = "pending"
    while time.time() < (running_deadline or deadline):
        current = request_json(base + "/" + command_id, timeout=30)
        status = current.get("status") if isinstance(current, dict) else ""
        last_status = status or last_status
        if status == "completed":
            print_result(current.get("result"), args.operation, args.pretty, args.result_file)
            return
        if status in {"failed", "cancelled"}:
            raise SystemExit(compact_text(current.get("error") or "Canvas command failed.", STDOUT_TEXT_LIMIT))
        if status == "running" and running_deadline is None:
            running_deadline = time.time() + max(300, args.timeout, 7200)
        time.sleep(1.0)
    if last_status == "pending":
        try:
            request_json(base + "/" + command_id + "/cancel", "POST", {
                "workflow_project_id": args.workflow_project_id,
                "canvas_session_id": args.canvas_session_id,
            }, timeout=30)
        except (Exception, SystemExit):
            pass
        raise SystemExit("Canvas bridge session disconnected before claiming the command. Do not sleep or resubmit it; keep the workflow canvas open so the refreshed session can reconnect.")
    raise SystemExit("Canvas command is still running. Do not submit a duplicate command; cancel the current Codex turn if it must stop.")


if __name__ == "__main__":
    main()
