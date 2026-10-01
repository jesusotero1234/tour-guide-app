"""Keep a per-phase lease in both launcher and worker across supervisor crashes."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime,timezone


def run(directory,stage,command):
    directory=Path(directory)
    with (directory/(stage+'.lock')).open('a+') as lock:
        try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Phase already has a live owner; refusing duplicate worker.',file=sys.stderr)
            return 75
        target=directory/(stage+'-owner.json')
        owner={'pid':os.getpid(),'processGroup':os.getpgrp(),'stage':stage,'phase':'running',
               'startedAt':datetime.now(timezone.utc).isoformat()}
        def save():
            temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(owner,indent=2));temporary.replace(target)
        save()
        # The payload retains the lease even if this launcher is killed abruptly.
        process=subprocess.Popen(command,pass_fds=(lock.fileno(),))
        result=process.wait()
        owner.update(phase='finished',exitCode=result,finishedAt=datetime.now(timezone.utc).isoformat());save()
        return result

if __name__=='__main__':raise SystemExit(run(sys.argv[1],sys.argv[2],sys.argv[3:]))
