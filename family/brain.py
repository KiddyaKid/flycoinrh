"""One upstream FlyBrain graph, two independent seeded trials per observed frame.

Visual input uses upstream FlyEye's measured hex-column mapping. Market inputs
are engineered mappings to vpoEN / vpoIN; surge stimulates both. There is no
claim that these trials establish mating, learning, or natural naming ability.
"""
import sys, os, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flysim import FlyBrain
from flyeye import FlyEye

graph=Path(os.environ['FAMILY_GRAPH'])
graph_hash=hashlib.file_digest(graph.open('rb'),'sha256').hexdigest()
if graph_hash!=os.environ['FAMILY_GRAPH_SHA256']: raise ValueError('GRAPH_HASH_MISMATCH')
fb=FlyBrain(graph)
eye=FlyEye(fb,os.environ['FAMILY_ANNOTATIONS'])
groups={k:fb.where(type_re=rx) for k,rx in {'courtship':'^pC1_6a$','forward':'^DNa01$','steering':'^DNa02$','stop':'^DNp09$','reward':'^PAM','output':'^MBON'}.items()}
inputs={kind:fb.where(type_re=rx) for kind,rx in {'buy':'^vpoEN$','sell':'^vpoIN$','surge':'^vpo(EN|IN)$'}.items()}
if fb.n!=165122 or any(not len(v) for v in [*groups.values(),*inputs.values()]):raise ValueError('ANATOMY_MAPPING_MISSING')
gains=np.full(fb.n_types,.3,dtype=np.float32)
for line in sys.stdin:
 try:
  command=json.loads(line);img=np.asarray(Image.open(command['frame']).convert('L'),dtype=np.float32)/255
  drive=eye.look(img,640,360);kind=command.get('kind');parents=[]
  if kind in inputs:drive[tuple(inputs[kind])]=100.
  for ident,seed in [('adam',17),('atom',29)]:
   r=fb.run(drive,steps=200,gains=gains,record=groups,seed=seed)
   parents.append(dict(id=ident,seed=seed,active=int(len(r['_fired'])),meanMv=float(r['_mean_mv']),rates={k:float(r[k].mean()) for k in groups}))
  print(json.dumps(dict(id=command['id'],neurons=fb.n,graphSha256=graph_hash,windowMs=40,gain=.3,kind=kind or 'vision',parents=parents,modelScope='independent seeded trials; no learned memory',modelSource='fruitflydev/flycoinrh/flysim.py')),flush=True)
 except Exception as exc:print(json.dumps(dict(error=type(exc).__name__)),flush=True)
