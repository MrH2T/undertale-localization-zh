"""Open the viewer, reusing an existing instance when present."""
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.request import urlopen
from urllib.error import URLError
import webbrowser

URL='http://127.0.0.1:8767'

def running():
    try:
        with urlopen(URL+'/api/health',timeout=1) as response:
            return json.load(response).get('app')=='undertale-study-viewer'
    except (URLError,TimeoutError,ValueError,OSError):
        return False

def open_when_ready():
    for _ in range(40):
        if running():
            webbrowser.open(URL)
            return
        time.sleep(.15)

if __name__=='__main__':
    if running():
        webbrowser.open(URL)
    else:
        threading.Thread(target=open_when_ready,daemon=True).start()
        print('Local viewer. Close this window to stop it.',flush=True)
        try:
            result=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__).with_name('server.py'))])
            sys.exit(result.returncode)
        except KeyboardInterrupt:
            pass
