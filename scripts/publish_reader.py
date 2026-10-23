"""Rebuild and publish the static reader to the separate public repository."""
from pathlib import Path
import argparse, subprocess
from build_public_book import build as build_book
from build_reader import build as build_program
ROOT=Path(__file__).resolve().parents[1]

def publish(output):
    output=output.resolve()
    remote=subprocess.check_output(['git','remote','get-url','origin'],cwd=output,text=True).strip()
    if remote not in ['git@github.com:MrH2T/undertale-reader.git','https://github.com/MrH2T/undertale-reader.git']:raise SystemExit('Output must be the undertale-reader checkout.')
    build_book(output,['main','reader-v1']);build_program(output)
    subprocess.run(['git','add','--all'],cwd=output,check=True)
    changed=subprocess.run(['git','diff','--cached','--quiet'],cwd=output).returncode
    if changed:subprocess.run(['git','commit','-m','更新静态阅读内容与程序'],cwd=output,check=True)
    subprocess.run(['git','-c','core.sshCommand=ssh -o BatchMode=yes -o StrictHostKeyChecking=yes','push','origin','main'],cwd=output,check=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);publish(parser.parse_args().output)
