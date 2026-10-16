"""A loopback-only scripted model for exercising the real application tool pipeline."""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4


class LocalModelServer:
    def __init__(self):
        self.plans = {}
        self.requests = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                payload = json.loads(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                messages = payload["messages"]
                functions = [
                    tool["function"]["name"] for tool in payload.get("tools", [])
                ]
                calls = []
                if "kunyu_capability_probe" in functions:
                    calls = [
                        {
                            "name": "kunyu_capability_probe",
                            "arguments": {"token": "kunyu-tool-check"},
                        }
                    ]
                else:
                    for index in range(len(messages) - 1, -1, -1):
                        message = messages[index]
                        if message["role"] != "user":
                            continue
                        content = "".join(
                            part["text"]
                            for part in message["content"]
                            if part["type"] == "text"
                        )
                        if content.startswith("TEST_PLAN:"):
                            plan = owner.plans[content.split(":", 1)[1]]
                            completed = sum(
                                len(item.get("tool_calls", []))
                                for item in messages[index + 1 :]
                            )
                            calls = plan[completed : completed + 1]
                            break
                owner.requests.append({"path": self.path, "calls": calls})
                delta = {"role": "assistant"}
                if calls:
                    delta["tool_calls"] = [
                        {
                            "index": index,
                            "id": f"call_{uuid4().hex}",
                            "type": "function",
                            "function": {
                                "name": call["name"],
                                "arguments": json.dumps(
                                    call["arguments"], ensure_ascii=False
                                ),
                            },
                        }
                        for index, call in enumerate(calls)
                    ]
                else:
                    delta["content"] = "Validation complete."
                base = {
                    "id": f"chatcmpl-{uuid4().hex}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "windows-test",
                }
                chunks = [
                    {
                        **base,
                        "choices": [
                            {"index": 0, "delta": delta, "finish_reason": None}
                        ],
                    },
                    {
                        **base,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {},
                                "finish_reason": "tool_calls" if calls else "stop",
                            }
                        ],
                    },
                ]
                body = "".join(
                    f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    for chunk in chunks
                )
                data = (body + "data: [DONE]\n\n").encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def start(self):
        self.thread.start()
        return self

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_port}/v1"

    def plan(self, calls):
        plan_id = uuid4().hex
        self.plans[plan_id] = calls
        return f"TEST_PLAN:{plan_id}"

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
