import { spawn } from 'node:child_process';

export interface Vulnerability {
  id: string;
  severity: 'CRITICAL' | 'HIGH';
  pkgName: string;
  installedVersion: string;
  fixedVersion?: string;
  title?: string;
}

export interface ScanResult {
  vulnerabilities: Vulnerability[];
  scanFailed: boolean;
}

interface TrivyVulnerability {
  VulnerabilityID: string;
  Severity: 'CRITICAL' | 'HIGH' | string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Title?: string;
}

interface TrivyResult {
  Results?: Array<{ Vulnerabilities?: TrivyVulnerability[] }>;
}

// Runs Trivy via its official image rather than requiring a local install —
// one less thing to ask a developer to set up. Scoped to HIGH/CRITICAL only:
// a full report on a base OS image is routinely hundreds of low-severity
// findings that would drown out anything actionable.
//
// Never blocks a deployment on its own — "basic" scanning per the project's
// scope, surfaced as a warning in the build log, not a hard gate. A real
// platform would let you configure a policy (block on CRITICAL, etc.);
// that's a deliberate, named gap here, not an oversight.
export async function scanImage(tag: string): Promise<ScanResult> {
  return new Promise((resolve) => {
    const child = spawn('docker', [
      'run',
      '--rm',
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
      'aquasec/trivy',
      'image',
      '--severity',
      'HIGH,CRITICAL',
      '--format',
      'json',
      '--quiet',
      tag,
    ]);

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.on('error', () => resolve({ vulnerabilities: [], scanFailed: true }));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ vulnerabilities: [], scanFailed: true });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as TrivyResult[] | TrivyResult;
        const results = Array.isArray(parsed) ? parsed : [parsed];
        const vulnerabilities = results
          .flatMap((r) => r.Results ?? [])
          .flatMap((r) => r.Vulnerabilities ?? [])
          .filter(
            (v): v is TrivyVulnerability => v.Severity === 'CRITICAL' || v.Severity === 'HIGH',
          )
          .map((v): Vulnerability => ({
            id: v.VulnerabilityID,
            severity: v.Severity as 'CRITICAL' | 'HIGH',
            pkgName: v.PkgName,
            installedVersion: v.InstalledVersion,
            ...(v.FixedVersion ? { fixedVersion: v.FixedVersion } : {}),
            ...(v.Title ? { title: v.Title } : {}),
          }));
        resolve({ vulnerabilities, scanFailed: false });
      } catch {
        resolve({ vulnerabilities: [], scanFailed: true });
      }
    });
  });
}
