#!/usr/bin/env python3
"""Resumable MinerU batch driver using the async /tasks API.

Run repeatedly; each run submits missing PDFs and collects finished results.
State lives in parsed/_tasks.json, so it is safe to re-run any time.
"""
import json, os, glob, subprocess, sys, time

BASE = "/Users/gordon/Documents/repos/ziru.1/docs/samples/SecDocs"
PARSED = os.path.join(BASE, "parsed")
STATE = os.path.join(PARSED, "_tasks.json")
API = "http://127.0.0.1:8000"
os.makedirs(PARSED, exist_ok=True)

state = {}
if os.path.exists(STATE):
    try:
        state = json.load(open(STATE))
    except Exception:
        state = {}


def curl(args, timeout=1800):
    return subprocess.run(
        ["curl", "-sS", "--max-time", str(timeout)] + args,
        capture_output=True, text=True,
    )


def submit(pdf_path):
    name = os.path.basename(pdf_path)
    r = curl([
        "-X", "POST", API + "/tasks",
        "-F", "files=@" + pdf_path,
        "-F", "backend=pipeline",
        "-F", "parse_method=auto",
        "-F", "formula_enable=false",
        "-F", "table_enable=true",
        "-F", "return_md=true",
        "-F", "return_content_list=true",
        "-F", "return_middle_json=false",
        "-F", "return_model_output=false",
        "-F", "return_images=false",
        "-F", "response_format_zip=false",
    ], timeout=120)
    try:
        j = json.loads(r.stdout)
    except Exception:
        print("SUBMIT_FAIL", name, r.stdout[:200])
        return None
    tid = j.get("task_id")
    if not tid:
        print("SUBMIT_NO_TASK_ID", name, r.stdout[:200])
        return None
    state[name] = {"task_id": tid, "status": j.get("status", "submitted"),
                   "submitted": time.time()}
    print("SUBMITTED", name, "->", tid, "queued_ahead=", j.get("queued_ahead"))
    return tid


def collect(name, st):
    tid = st["task_id"]
    r = curl([API + "/tasks/" + tid], timeout=30)
    try:
        sj = json.loads(r.stdout)
    except Exception:
        return
    status = sj.get("status")
    if status == "completed":
        rr = curl([API + "/tasks/" + tid + "/result"], timeout=1800)
        out_json = os.path.join(PARSED, name[:-4] + ".json")
        with open(out_json, "w") as f:
            f.write(rr.stdout)
        try:
            d = json.loads(rr.stdout)
            for fn, robj in d.get("results", {}).items():
                md = robj.get("md_content", "")
                if md:
                    with open(os.path.join(PARSED, fn + ".md"), "w") as f:
                        f.write(md)
        except Exception as e:
            print("MD_EXTRACT_FAIL", name, e)
        st["status"] = "done"
        st["completed"] = time.time()
        print("DONE", name, "bytes=", len(rr.stdout))
    elif status in ("failed", "error"):
        st["status"] = "failed"
        st["error"] = sj.get("error")
        print("FAILED", name, sj.get("error"))
    else:
        st["status"] = status


def main():
    pdfs = sorted(glob.glob(os.path.join(BASE, "*.pdf")))
    for p in pdfs:
        name = os.path.basename(p)
        out_json = os.path.join(PARSED, name[:-4] + ".json")
        if os.path.exists(out_json) and os.path.getsize(out_json) > 0:
            continue
        st = state.get(name)
        if st and st.get("task_id"):
            continue
        submit(p)

    # collect results for all known tasks
    for name in list(state):
        st = state[name]
        if st.get("status") in ("done", "failed"):
            continue
        collect(name, st)

    json.dump(state, open(STATE, "w"), indent=1)
    done = sum(1 for v in state.values() if v.get("status") == "done")
    pending = sum(1 for v in state.values() if v.get("status") not in ("done", "failed"))
    failed = sum(1 for v in state.values() if v.get("status") == "failed")
    print(f"SUMMARY done={done} pending={pending} failed={failed} of {len(pdfs)} pdfs")


if __name__ == "__main__":
    main()
