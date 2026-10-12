import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitor,command,tick} from './src/monitor.js';
import {sessionReport,connectionCopy} from './src/report.js';
test('report preserves evidence and labels all exported data as demo',()=>{
 const state=command(createMonitor(0),'warning',100);
 command(state,'acknowledge',200);command(state,'recover',300);tick(state,4,4300);
 const report=sessionReport(state,5000);
 assert.equal(report.source,'demo');assert.equal(report.sensorConnected,false);
 assert.deepEqual(report.summary,{eventCount:4,warningCount:1,recoveryCount:1,acknowledgementCount:1});
 assert.equal(report.events.at(-1).reduction,61);assert.equal(report.snapshot.score,21);
 assert.equal(JSON.parse(JSON.stringify(report)).events.length,4);
 report.events[0].title='changed';report.snapshot.relativeValues[0]=999;
 assert.notEqual(state.events[0].title,'changed');assert.notEqual(state.values[0],999);
});
test('connection copy never describes an offline default as a safe current state',()=>{
 const state=createMonitor(0);
 assert.match(connectionCopy(false,false,state),/현재 상태 확인 불가/);
 assert.match(connectionCopy(false,true,state),/마지막 수신/);
 assert.match(connectionCopy(true,true,state),/실제 센서 미연결/);
});
