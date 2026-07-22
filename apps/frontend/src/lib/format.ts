export function formatCpu(cores: number): string {
  return `${Math.round(cores * 1000)}m`;
}

export function formatMemory(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}
