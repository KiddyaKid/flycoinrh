"""Rebuild the public soma subset; uses the same index ordering as brain.py."""
import argparse,json,hashlib,sys
from pathlib import Path
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flysim import FlyBrain
from telemetry import soma_sample

parser=argparse.ArgumentParser()
parser.add_argument('--graph',required=True)
parser.add_argument('--annotations',required=True)
parser.add_argument('--out',required=True)
args=parser.parse_args()
fb=FlyBrain(args.graph)
a=pd.read_feather(args.annotations).drop_duplicates('bodyId').set_index('bodyId')
indices,xyz,mapped=soma_sample(fb,a)
with open(args.graph,'rb') as source:graph_hash=hashlib.file_digest(source,'sha256').hexdigest()
asset=dict(source='MaleCNS somaLocation; deterministic evenly spaced subset of mapped graph indices',graphSha256=graph_hash,mappedCells=mapped,points=[[int(fb.bodies[i]),*p.tolist()] for i,p in zip(indices,xyz)])
Path(args.out).write_text(json.dumps(asset,separators=(',',':')),encoding='utf-8')
print(json.dumps(dict(sample=len(indices),mapped=mapped,graphSha256=graph_hash)))
