import unittest
import numpy as np
from types import SimpleNamespace
from vision_record import record_vision

class VisualEvidenceTest(unittest.TestCase):
    def test_distinct_fields_and_exact_inputs(self):
        image=np.zeros((720,1280),dtype=np.float32);image[:,640:]=1
        eye=SimpleNamespace(on_idx=np.array([1,2]),off_idx=np.array([3,4]),on_uv=(np.array([0.,1.]),np.array([0.,1.])),off_uv=(np.array([0.,1.]),np.array([0.,1.])))
        drive={(1,2):np.array([0.,180.]),(3,4):np.array([108.,0.])}
        dark=record_vision(image,eye,drive,200,350,{'capturedAt':'test','target':'dark'})
        light=record_vision(image,eye,drive,1000,350,{'capturedAt':'test','target':'light'})
        self.assertEqual(dark['luminance'],0);self.assertEqual(light['luminance'],1)
        self.assertEqual(dark['on'],[[0.,0.,0.],[1.,1.,180.]])
        self.assertEqual(dark['off'],[[0.,0.,108.],[1.,1.,0.]])
        self.assertNotEqual(dark['crop'],light['crop'])
        self.assertEqual(dark['imageSha256'],light['imageSha256'])
        self.assertEqual(dark['target'],'dark')

if __name__=='__main__':unittest.main()
