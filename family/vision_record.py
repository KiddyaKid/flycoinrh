"""Bounded visual evidence at exactly the coordinates used by FlyEye."""
import base64, hashlib, io
import numpy as np
from PIL import Image

def record_vision(img, eye, drive, cx, cy, context):
    h,w=img.shape
    left=max(0,min(w-300,int(round(cx-150))))
    top=max(0,min(h-210,int(round(cy-105))))
    crop=img[top:top+210,left:left+300]
    def jpeg(array,size):
        im=Image.fromarray(np.uint8(np.clip(array,0,1)*255));im.thumbnail(size)
        buf=io.BytesIO();im.save(buf,format='JPEG',quality=65)
        return 'data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode('ascii')
    def points(uv,indices):
        order=np.linspace(0,len(indices)-1,min(640,len(indices)),dtype=int)
        values=np.asarray(drive[tuple(indices)])
        return [[round(float(uv[0][i]),4),round(float(uv[1][i]),4),round(float(values[i]),2)] for i in order]
    return dict(capturedAt=context.get('capturedAt'),url=context.get('url'),task=context.get('task'),
        target=context.get('target','Page center'),imageSha256=hashlib.sha256(img.tobytes()).hexdigest(),
        width=w,height=h,x=cx,y=cy,fovWidth=300,fovHeight=210,
        crop=jpeg(crop,(300,210)),scene=jpeg(img,(384,216)),luminance=round(float(crop.mean()),4),
        contrast=round(float(crop.std()),4),on=points(eye.on_uv,eye.on_idx),off=points(eye.off_uv,eye.off_idx),
        onCells=len(eye.on_idx),offCells=len(eye.off_idx),maxOnHz=180,maxOffHz=108)
