import test from "node:test";
import assert from "node:assert/strict";
import { parseMeshReport } from "../src/feature/jobs/mesh-report.ts";

const topology = { vertices:8,edges:18,faces:12,triangles:12,degenerateFaces:0,boundaryEdges:0,nonManifoldEdges:0,components:1 };
const report = { version:1,task:"mesh-inspect",source:topology,warnings:[],details:{} };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

test("reads bounded topology reports from the requested task", () => {
  assert.deepEqual(parseMeshReport(encode(report),"mesh-inspect").source,topology);
});

test("rejects wrong tasks, impossible counts and oversized reports", () => {
  assert.throws(()=>parseMeshReport(encode(report),"normals"));
  assert.throws(()=>parseMeshReport(encode({...report,source:{...topology,components:-1}}),"mesh-inspect"));
  assert.throws(()=>parseMeshReport(new Uint8Array(65537),"mesh-inspect"));
  assert.throws(()=>parseMeshReport(encode({...report,task:"normals"}),"normals"));
});
