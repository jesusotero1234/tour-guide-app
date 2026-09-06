#!/usr/bin/env python3
"""Run one local TTS batch with exclusive GPU access, then restore Qwen."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.request


def get_json(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=1800)
    parser.add_argument("--parent-pid", type=int, help="Abort and restore Qwen if the owning backend exits")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("provide a command after --")
    state = Path.home() / ".local/state/qwen"
    state.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    events = []
    started = time.monotonic()

    def event(stage, **data):
        entry = {"stage": stage, "elapsedSeconds": round(time.monotonic() - started, 3), **data}
        events.append(entry)
        args.report.write_text(json.dumps(events, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(entry, ensure_ascii=False), flush=True)

    def interrupted(signum, frame):
        raise KeyboardInterrupt(f"received signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    child = None
    restore_qwen = False
    exit_code = 1
    with (state / "gpu-tts.lock").open("a") as guard:
        fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            # qwenctl must honor this same lock before starting or ensuring Qwen.
            blocked = subprocess.run([str(Path.home() / "bin/qwen-ensure")], capture_output=True, text=True, timeout=5)
            if blocked.returncode != 75:
                raise RuntimeError("qwen-ensure did not respect the TTS GPU lock; aborting before stopping Qwen")
            event("gpu_reserved")
            pid_file = state / "qwen.pid"
            if pid_file.exists():
                try:
                    os.kill(int(pid_file.read_text().strip()), 0)
                    restore_qwen = True
                except ProcessLookupError:
                    pass
            if restore_qwen:
                # Let a request already in progress complete before the handoff.
                deadline = time.monotonic() + 120
                while True:
                    slots = get_json("http://127.0.0.1:8080/slots")
                    if not any(slot.get("is_processing", False) for slot in slots):
                        break
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Qwen is still processing a request; refusing to interrupt it")
                    time.sleep(1)
                before_stop = time.monotonic()
                subprocess.run([str(Path.home() / "bin/qwen-stop")], check=True, timeout=30)
                event("qwen_stopped", stopSeconds=round(time.monotonic() - before_stop, 3))
            memory = subprocess.check_output([
                "nvidia-smi", "--query-gpu=memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits", "--id=0",
            ], text=True).strip()
            free_mib = int(memory.split(",")[-1].strip())
            event("gpu_memory_after_stop", memoryMiB=memory)
            if free_mib < 10000:
                raise RuntimeError(f"Only {free_mib} MiB free; refusing to start the TTS batch")
            event("tts_started", command=command)
            # The child also retains the lock if this supervisor is killed abruptly.
            child = subprocess.Popen(command, start_new_session=True, pass_fds=(guard.fileno(),))
            deadline = time.monotonic() + args.timeout
            while child.poll() is None:
                if args.parent_pid:
                    try:
                        os.kill(args.parent_pid, 0)
                    except ProcessLookupError:
                        raise RuntimeError("Owning backend exited; stopping its audio batch")
                if time.monotonic() >= deadline:
                    raise subprocess.TimeoutExpired(command, args.timeout)
                try:
                    child.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    pass
            exit_code = child.returncode
            event("tts_finished", exitCode=exit_code)
        finally:
            if child is not None and child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                event("tts_terminated")
            fcntl.flock(guard, fcntl.LOCK_UN)
            if restore_qwen:
                restart = time.monotonic()
                result = subprocess.run([str(Path.home() / "bin/qwen-start")], timeout=240, start_new_session=True)
                event("qwen_restored" if result.returncode == 0 else "qwen_restore_failed", exitCode=result.returncode, restartSeconds=round(time.monotonic() - restart, 3))
                if result.returncode:
                    exit_code = result.returncode
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
