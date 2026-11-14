import { z } from "zod";
import type { MeshReport } from "@/feature/mesh-tools";

const count = z.number().int().nonnegative().max(100_000_000);
const topology = z.object({ vertices: count, edges: count, faces: count, triangles: count, degenerateFaces: count, boundaryEdges: count, nonManifoldEdges: count, components: count });
const report = z.object({ version: z.literal(1), task: z.string().min(1).max(64), source: topology, result: topology.optional(), warnings: z.array(z.string().max(500)).max(32), details: z.record(z.string().max(80), z.unknown()) });

export function parseMeshReport(bytes: Uint8Array, task: string): MeshReport {
  if (bytes.byteLength > 64 * 1024) throw new Error("mesh-report-invalid");
  const parsed = report.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (parsed.task !== task || (task !== "mesh-inspect" && !parsed.result)) throw new Error("mesh-report-invalid");
  return parsed;
}
