from datetime import datetime, timezone
from typing import Any
import uuid


def put_session(table: Any, user_id: str, metadata: dict | None = None) -> dict:
    if metadata is None:
        metadata = {}
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "pk": f"USER#{user_id}",
        "sk": f"SESSION#{session_id}",
        "session_id": session_id,
        "user_id": user_id,
        "created_at": now,
        "metadata": metadata,
    }
    table.put_item(Item=item)
    return item


def list_sessions(table: Any, user_id: str) -> list[dict]:
    response = table.query(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :sk_prefix)",
        ExpressionAttributeValues={
            ":pk": f"USER#{user_id}",
            ":sk_prefix": "SESSION#",
        },
    )
    return response.get("Items", [])


def get_session(table: Any, user_id: str, session_id: str) -> dict | None:
    response = table.get_item(
        Key={
            "pk": f"USER#{user_id}",
            "sk": f"SESSION#{session_id}",
        }
    )
    return response.get("Item")


def delete_session(table: Any, user_id: str, session_id: str) -> None:
    table.delete_item(
        Key={
            "pk": f"USER#{user_id}",
            "sk": f"SESSION#{session_id}",
        }
    )
