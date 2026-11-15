declare module "gltf-validator" {
  type Message = { code: string; message: string; severity: number; pointer?: string };
  type Report = {
    issues: { numErrors: number; numWarnings: number; numInfos: number; numHints: number; messages: Message[] };
    info?: Record<string, unknown>;
  };
  export function version(): string;
  export function validateBytes(data: Uint8Array, options?: { uri?: string; maxIssues?: number }): Promise<Report>;
}
