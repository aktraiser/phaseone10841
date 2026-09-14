import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {networkPython} from '../public/lab-checks.js';
function probe(stub){return spawnSync('python3',['-c','import subprocess\n'+stub+'\n'+networkPython],{encoding:'utf8',timeout:5000});}
test('a stalled network probe is bounded and reported as inconclusive, not isolation success',()=>{
 const r=probe("def stalled(*args, **kwargs):\n    assert kwargs['timeout']==3\n    raise subprocess.TimeoutExpired('probe',3)\nsubprocess.run=stalled");
 assert.equal(r.status,0);assert.match(r.stdout,/indéterminé/);assert.doesNotMatch(r.stdout,/inaccessible/);
});
test('a reachable endpoint fails the isolation check; probe errors cannot count as success',()=>{
 for(const code of [0,1]){const r=probe(`subprocess.run=lambda *a, **k: subprocess.CompletedProcess([],${code})`);assert.notEqual(r.status,0);}
 const r=probe('subprocess.run=lambda *a, **k: subprocess.CompletedProcess([],2)');assert.equal(r.status,0);assert.match(r.stdout,/point testé inaccessible/);
});
test('a real stuck child is terminated by the probe deadline without any network request',()=>{
 const r=probe("original_run=subprocess.run\ndef blocked(args, **kwargs):\n    return original_run([args[0],'-c','import time; time.sleep(30)'], **kwargs)\nsubprocess.run=blocked");
 assert.equal(r.status,0);assert.match(r.stdout,/indéterminé/);
});
