#!/usr/bin/env python3
"""
AgentTaskBridge: Unified Open-Source Project Management Adapter
==============================================================
Provides a standardized Python interface for autonomous AI coding agents
to manage tasks, issues, and Kanban status across:
- Plane (REST v1)
- OpenProject (REST v3)
- Vikunja (REST v1)
- Mock / Offline Mode (local simulation)

Reference: https://labs.zeroshot.studio/ai-workflows/best-open-source-project-management-ui-agents
"""

import os
import sys
import json
import argparse
from typing import Dict, List, Optional, Any
from abc import ABC, abstractmethod


class TaskAdapter(ABC):
    """Abstract base class for PM tool adapters."""

    @abstractmethod
    def create_task(self, title: str, description: str = "", status: str = "backlog") -> Dict[str, Any]:
        """Create a new task/issue."""
        pass

    @abstractmethod
    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """List existing tasks, optionally filtered by status."""
        pass

    @abstractmethod
    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        """Update the workflow status of an existing task."""
        pass


class MockAdapter(TaskAdapter):
    """In-memory simulation adapter for offline agent verification."""

    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {
            "TSK-101": {
                "id": "TSK-101",
                "title": "Establish database migration script",
                "description": "Autonomously generated during architectural setup",
                "status": "in_progress",
                "provider": "mock"
            },
            "TSK-102": {
                "id": "TSK-102",
                "title": "Verify CSP header compliance",
                "description": "Ensure report-uri is mapped correctly",
                "status": "backlog",
                "provider": "mock"
            }
        }
        self._counter = 103

    def create_task(self, title: str, description: str = "", status: str = "backlog") -> Dict[str, Any]:
        task_id = f"TSK-{self._counter}"
        self._counter += 1
        record = {
            "id": task_id,
            "title": title,
            "description": description,
            "status": status,
            "provider": "mock"
        }
        self._tasks[task_id] = record
        return record

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        tasks = list(self._tasks.values())
        if status:
            tasks = [t for t in tasks if t["status"].lower() == status.lower()]
        return tasks

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        if task_id not in self._tasks:
            raise KeyError(f"Task '{task_id}' not found in mock store.")
        self._tasks[task_id]["status"] = status
        return self._tasks[task_id]


class PlaneAdapter(TaskAdapter):
    """Adapter for Plane (makeplane/plane)."""

    def __init__(self, base_url: str, api_token: str, workspace_slug: str, project_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.workspace_slug = workspace_slug
        self.project_id = project_id

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def create_task(self, title: str, description: str = "", status: str = "backlog") -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v1/workspaces/{self.workspace_slug}/projects/{self.project_id}/issues/"
        payload = json.dumps({
            "name": title,
            "description_html": f"<p>{description}</p>",
            "status": status
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="POST")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id")),
                "title": data.get("name", title),
                "status": data.get("status", status),
                "provider": "plane",
                "raw": data
            }

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        import urllib.request
        url = f"{self.base_url}/api/v1/workspaces/{self.workspace_slug}/projects/{self.project_id}/issues/"
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results", data) if isinstance(data, dict) else data
            tasks = []
            for item in results:
                tasks.append({
                    "id": str(item.get("id")),
                    "title": item.get("name"),
                    "status": item.get("status"),
                    "provider": "plane"
                })
            return tasks

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v1/workspaces/{self.workspace_slug}/projects/{self.project_id}/issues/{task_id}/"
        payload = json.dumps({"status": status}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="PATCH")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id", task_id)),
                "status": data.get("status", status),
                "provider": "plane"
            }


class OpenProjectAdapter(TaskAdapter):
    """Adapter for OpenProject REST v3 API."""

    def __init__(self, base_url: str, api_key: str, project_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.project_id = project_id

    def _headers(self) -> Dict[str, str]:
        import base64
        auth_bytes = f"apikey:{self.api_key}".encode("ascii")
        encoded_auth = base64.b64encode(auth_bytes).decode("ascii")
        return {
            "Authorization": f"Basic {encoded_auth}",
            "Content-Type": "application/json"
        }

    def create_task(self, title: str, description: str = "", status: str = "backlog") -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v3/projects/{self.project_id}/work_packages"
        payload = json.dumps({
            "subject": title,
            "description": {"format": "markdown", "raw": description}
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="POST")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id")),
                "title": data.get("subject", title),
                "status": status,
                "provider": "openproject",
                "raw": data
            }

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        import urllib.request
        url = f"{self.base_url}/api/v3/projects/{self.project_id}/work_packages"
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elements = data.get("_embedded", {}).get("elements", [])
            return [{
                "id": str(el.get("id")),
                "title": el.get("subject"),
                "status": el.get("_links", {}).get("status", {}).get("title", "unknown"),
                "provider": "openproject"
            } for el in elements]

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v3/work_packages/{task_id}"
        payload = json.dumps({"_links": {"status": {"title": status}}}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="PATCH")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id", task_id)),
                "status": status,
                "provider": "openproject"
            }


class VikunjaAdapter(TaskAdapter):
    """Adapter for Vikunja REST API."""

    def __init__(self, base_url: str, api_token: str, project_id: str):
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.project_id = project_id

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

    def create_task(self, title: str, description: str = "", status: str = "backlog") -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v1/projects/{self.project_id}/tasks"
        payload = json.dumps({
            "title": title,
            "description": description,
            "done": status.lower() in ["done", "completed", "closed"]
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="PUT")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id")),
                "title": data.get("title", title),
                "status": "done" if data.get("done") else "open",
                "provider": "vikunja",
                "raw": data
            }

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        import urllib.request
        url = f"{self.base_url}/api/v1/projects/{self.project_id}/tasks"
        req = urllib.request.Request(url, headers=self._headers(), method="GET")
        with urllib.request.urlopen(req) as resp:
            tasks = json.loads(resp.read().decode("utf-8"))
            return [{
                "id": str(t.get("id")),
                "title": t.get("title"),
                "status": "done" if t.get("done") else "open",
                "provider": "vikunja"
            } for t in tasks]

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        import urllib.request
        url = f"{self.base_url}/api/v1/tasks/{task_id}"
        is_done = status.lower() in ["done", "completed", "closed"]
        payload = json.dumps({"done": is_done}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers=self._headers(), method="POST")
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "id": str(data.get("id", task_id)),
                "status": "done" if is_done else "open",
                "provider": "vikunja"
            }


def get_adapter(provider: str) -> TaskAdapter:
    """Factory helper resolving adapter from name or environment."""
    provider = provider.lower()
    if provider == "plane":
        return PlaneAdapter(
            base_url=os.environ.get("PLANE_BASE_URL", "http://localhost:8080"),
            api_token=os.environ.get("PLANE_API_TOKEN", "dummy-token"),
            workspace_slug=os.environ.get("PLANE_WORKSPACE_SLUG", "default"),
            project_id=os.environ.get("PLANE_PROJECT_ID", "default-proj")
        )
    elif provider == "openproject":
        return OpenProjectAdapter(
            base_url=os.environ.get("OPENPROJECT_BASE_URL", "http://localhost:8080"),
            api_key=os.environ.get("OPENPROJECT_API_KEY", "dummy-key"),
            project_id=os.environ.get("OPENPROJECT_PROJECT_ID", "1")
        )
    elif provider == "vikunja":
        return VikunjaAdapter(
            base_url=os.environ.get("VIKUNJA_BASE_URL", "http://localhost:3456"),
            api_token=os.environ.get("VIKUNJA_API_TOKEN", "dummy-token"),
            project_id=os.environ.get("VIKUNJA_PROJECT_ID", "1")
        )
    return MockAdapter()


def main():
    parser = argparse.ArgumentParser(description="ZeroLabs AgentTaskBridge PM Dispatcher")
    parser.add_argument("--provider", default=os.environ.get("PM_PROVIDER", "mock"), help="Target PM provider (plane, openproject, vikunja, mock)")
    parser.add_argument("--action", choices=["list", "create", "update"], default="list", help="Task action")
    parser.add_argument("--title", help="Task title")
    parser.add_argument("--description", default="", help="Task description")
    parser.add_argument("--status", default="backlog", help="Task status (e.g. backlog, in_progress, done)")
    parser.add_argument("--task-id", help="Task ID for update action")
    parser.add_argument("--mock", action="store_true", help="Force mock simulation mode")
    args = parser.parse_args()

    provider = "mock" if args.mock else args.provider
    adapter = get_adapter(provider)
    print(f"[AgentTaskBridge] Using provider: {provider.upper()}")

    if args.action == "create":
        if not args.title:
            print("Error: --title required for create action", file=sys.stderr)
            sys.exit(1)
        res = adapter.create_task(args.title, args.description, args.status)
        print(f"✅ Created Task {res['id']}: '{res['title']}' [{res['status']}]")
    elif args.action == "update":
        if not args.task_id:
            print("Error: --task-id required for update action", file=sys.stderr)
            sys.exit(1)
        res = adapter.update_task_status(args.task_id, args.status)
        print(f"✅ Updated Task {res['id']} to status: [{res['status']}]")
    else:
        tasks = adapter.list_tasks()
        print(f"📋 Found {len(tasks)} tasks:")
        for t in tasks:
            print(f"  - [{t['id']}] {t['title']} ({t['status']})")


if __name__ == "__main__":
    main()
