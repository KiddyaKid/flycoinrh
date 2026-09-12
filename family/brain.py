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
import pandas as pd
from telemetry import soma_sample, activity_frames

graph=Path(os.environ['FAMILY_GRAPH'])
graph_hash=hashlib.file_digest(graph.open('rb'),'sha256').hexdigest()
if graph_hash!=os.environ['FAMILY_GRAPH_SHA256']: raise ValueError('GRAPH_HASH_MISMATCH')
fb=FlyBrain(graph)
eye=FlyEye(fb,os.environ['FAMILY_ANNOTATIONS'])
groups={k:fb.where(type_re=rx) for k,rx in {'courtship':'^pC1_6a$','forward':'^DNa01$','steering':'^DNa02$','stop':'^DNp09$','reward':'^PAM','output':'^MBON'}.items()}
inputs={kind:fb.where(type_re=rx) for kind,rx in {'buy':'^vpoEN$','sell':'^vpoIN$','surge':'^vpo(EN|IN)$'}.items()}
if fb.n!=165122 or any(not len(v) for v in [*groups.values(),*inputs.values()]):raise ValueError('ANATOMY_MAPPING_MISSING')
gains=np.full(fb.n_types,.3,dtype=np.float32)
annotations=pd.read_feather(os.environ['FAMILY_ANNOTATIONS']).drop_duplicates('bodyId').set_index('bodyId')
sample_indices,_,mapped=soma_sample(fb,annotations)
side=annotations['somaSide'].reindex(fb.bodies).fillna('').to_numpy()
extra={'retinaOn':eye.on_idx,'retinaOff':eye.off_idx,'kenyon':fb.where(type_re='^KC'),'reverse':fb.where(type_re='^MDN$')}
extra['left']=groups['steering'][side[groups['steering']]=='L']
extra['right']=groups['steering'][side[groups['steering']]=='R']
probe_groups={'L1':eye.on_idx,'KC':extra['kenyon'],'MBON':groups['output'],'DNp09':groups['stop']}
probe_names=[name for name,indices in probe_groups.items() if len(indices)]
probes=np.array([probe_groups[name][0] for name in probe_names])
for line in sys.stdin:
 try:
  command=json.loads(line);img=np.asarray(Image.open(command['frame']).convert('L'),dtype=np.float32)/255
  drive=eye.look(img,640,360);kind=command.get('kind');parents=[]
  if kind in inputs:drive[tuple(inputs[kind])]=100.
  for ident,seed in [('adam',17),('atom',29)]:
   r=fb.run(drive,steps=200,gains=gains,record={**groups,**extra},seed=seed,spike_log=True,probes=probes)
   frames,spikes=activity_frames(r['_spikes'],sample_indices)
   telemetry=dict(sampleCount=len(sample_indices),mappedCells=mapped,binMs=2,frames=frames,spikes=spikes,totalSpikes=sum(spikes),probeLabels=[dict(name=name,bodyId=int(fb.bodies[idx])) for name,idx in zip(probe_names,probes)],probeMv=np.round(r['_probe_mv'],3).tolist(),thresholdMv=fb.p.v_thresh,rates={k:float(r[k].mean()) if len(r[k]) else None for k in extra},learning=dict(enabled=False,updates=0,state='Independent trials reset; no learning job'),retina=dict(inputOnHz=float(np.mean(drive[tuple(eye.on_idx)])),inputOffHz=float(np.mean(drive[tuple(eye.off_idx)])),cellsOn=len(eye.on_idx),cellsOff=len(eye.off_idx)))
   parents.append(dict(id=ident,seed=seed,active=int(len(r['_fired'])),meanMv=float(r['_mean_mv']),rates={k:float(r[k].mean()) for k in groups},telemetry=telemetry))
  print(json.dumps(dict(id=command['id'],neurons=fb.n,graphSha256=graph_hash,windowMs=40,gain=.3,kind=kind or 'vision',parents=parents,modelScope='independent seeded trials; no learned memory',modelSource='fruitflydev/flycoinrh/flysim.py')),flush=True)
 except Exception as exc:print(json.dumps(dict(error=type(exc).__name__)),flush=True)
