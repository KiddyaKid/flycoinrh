"""Bounded, deterministic observability. Never feeds back into the simulator."""
import numpy as np

def soma_sample(fb, annotations, limit=3072):
    locations=annotations['somaLocation'].reindex(fb.bodies)
    valid=[];xyz=[]
    for i,value in enumerate(locations):
        if isinstance(value,(list,tuple,np.ndarray)) and len(value)==3 and np.isfinite(value).all():
            valid.append(i);xyz.append(value)
    coords=np.asarray(xyz,dtype=np.float64)
    chosen=np.linspace(0,len(valid)-1,min(limit,len(valid)),dtype=int)
    center=(coords.min(axis=0)+coords.max(axis=0))/2
    scale=max(float(np.ptp(coords,axis=0).max())/2,1)
    return np.asarray(valid)[chosen],np.round((coords[chosen]-center)/scale,5),len(valid)

def activity_frames(log,indices,bin_steps=10):
    lookup={int(v):i for i,v in enumerate(indices)}
    frames=[];spikes=[]
    for start in range(0,len(log),bin_steps):
        chunk=log[start:start+bin_steps]
        fired=np.unique(np.concatenate(chunk)) if chunk else []
        frames.append([lookup[int(i)] for i in fired if int(i) in lookup])
        spikes.append(sum(len(x) for x in chunk))
    return frames,spikes
