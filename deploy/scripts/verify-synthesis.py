import httpx, time, sys
B = "http://127.0.0.1:5005"
c = httpx.Client(follow_redirects=True, timeout=300)
r = c.post(B + "/api/v1/auth/login", json={"email": "admin@ziru.local", "password": "Admin!Ziru2026"})
if r.status_code != 200:
    print("LOGIN FAIL", r.status_code); sys.exit(2)
t = c.post(B + "/api/v2/chat/threads", json={"title": "synthesis gate"})
tid = (t.json().get("id") or t.json().get("thread_id"))
print("thread:", t.status_code, tid)
q = "probably we need wifi in that situation and subjected to observation by public"
r = c.post(B + f"/api/v2/chat/threads/{tid}/messages", json={"content": q})
print("send:", r.status_code)
if r.status_code != 200:
    print("SEND FAIL", r.text[:200]); sys.exit(2)
for i in range(60):
    time.sleep(10)
    ms = c.get(B + f"/api/v2/chat/threads/{tid}/messages")
    for m in ms.json().get("messages", []):
        if m.get("role") == "assistant":
            content = m.get("content") or ""
            cites = m.get("citations") or []
            if content and not content.startswith("No matching"):
                fallback = content.lstrip().startswith("[Document]")
                print("ASSISTANT len:", len(content), "cites:", len(cites), "FALLBACK:", fallback)
                print("HEAD:", content[:200].replace(chr(10), " "))
                if fallback:
                    print("RESULT: FAIL (raw evidence fallback)"); sys.exit(1)
                print("RESULT: PASS"); sys.exit(0)
print("RESULT: TIMEOUT - no assistant message in 10 min"); sys.exit(2)
