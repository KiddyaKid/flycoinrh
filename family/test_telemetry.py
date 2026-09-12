import os,sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from telemetry import activity_frames

class TelemetryTests(unittest.TestCase):
    def test_spikes_keep_sample_identity_and_bin_counts(self):
        log=[np.array([10,30]),np.array([10]),np.array([],dtype=int),np.array([99])]
        frames,counts=activity_frames(log,np.array([30,10]),2)
        self.assertEqual(frames,[[1,0],[]])
        self.assertEqual(counts,[3,1])

    @unittest.skipUnless(os.environ.get('FAMILY_GRAPH'),'Set FAMILY_GRAPH for measured-graph parity')
    def test_observation_does_not_change_simulation(self):
        from flysim import FlyBrain
        brain=FlyBrain(os.environ['FAMILY_GRAPH'])
        indices=brain.where(type_re='^L1$')[:20]
        gains=np.full(brain.n_types,.3,dtype=np.float32)
        arguments=dict(drive={tuple(indices):100},steps=200,gains=gains,record={'input':indices},seed=17)
        original=brain.run(**arguments)
        observed=brain.run(**arguments,spike_log=True,probes=indices[:4])
        np.testing.assert_array_equal(original['_fired'],observed['_fired'])
        np.testing.assert_array_equal(original['input'],observed['input'])
        self.assertEqual(original['_mean_mv'],observed['_mean_mv'])
        frames,counts=activity_frames(observed['_spikes'],indices)
        self.assertEqual(len(frames),20)
        self.assertEqual(len(observed['_probe_mv']),20)
        self.assertEqual(sum(counts),round(observed['_spikes_per_sec']*.04))

if __name__=='__main__': unittest.main()
