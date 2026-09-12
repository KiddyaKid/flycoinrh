"""Upstream FlyPilot cursor decoder, with explicit graph provenance and gain.

The host selects a form field; only decoded movement and stop output can click.
This is an engineered browser interface, not language understanding.
"""
import sys, os, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flysim import FlyBrain
from flyeye import FlyEye, FlyPilot
graph=Path(os.environ['FAMILY_GRAPH'])
with graph.open('rb') as f: graph_hash=hashlib.file_digest(f,'sha256').hexdigest()
if graph_hash!=os.environ['FAMILY_GRAPH_SHA256']: raise ValueError('GRAPH_HASH_MISMATCH')
fb=FlyBrain(graph)
annotations=os.environ['FAMILY_ANNOTATIONS']
pilot=FlyPilot(fb,eye=FlyEye(fb,annotations),sim_steps=60,click_hz=330.,annotations_path=annotations)
for line in sys.stdin:
 try:
  c=json.loads(line)
  img=np.asarray(Image.open(c['frame']).convert('L'),dtype=np.float32)/255.
  gain=float(c.get('gain',1.0))
  if gain not in (.3,1.): raise ValueError('UNSUPPORTED_REFERENCE_GAIN')
  gains=np.full(fb.n_types,gain,dtype=np.float32)
  dx,dy,click,hz=pilot.step(img,c['x'],c['y'],gains=gains,seed=c['seed'])
  print(json.dumps(dict(id=c['id'],dx=float(dx),dy=float(dy),click=bool(click),hz=hz,seed=c['seed'],graphSha256=graph_hash,neurons=fb.n,windowMs=12,gain=gain)),flush=True)
 except Exception as e: print(json.dumps(dict(error=type(e).__name__)),flush=True)
