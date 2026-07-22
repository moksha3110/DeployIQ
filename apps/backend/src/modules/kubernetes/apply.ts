import { HttpError } from '@kubernetes/client-node';
import type {
  V1Deployment,
  V1Ingress,
  V1Namespace,
  V1Service,
  V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';
import { appsApi, autoscalingApi, coreApi, networkingApi } from './client.js';

function isConflict(err: unknown): boolean {
  return err instanceof HttpError && err.statusCode === 409;
}

// Every resource here is create-or-replace: deploys are re-run often
// (redeploys, retries), and "already exists" must never be treated as a
// failure — it means a previous run got here first.
export async function applyNamespace(manifest: V1Namespace): Promise<void> {
  try {
    await coreApi.createNamespace(manifest);
  } catch (err) {
    if (!isConflict(err)) throw err;
  }
}

export async function applyDeployment(
  namespace: string,
  name: string,
  manifest: V1Deployment,
): Promise<void> {
  try {
    await appsApi.createNamespacedDeployment(namespace, manifest);
  } catch (err) {
    if (!isConflict(err)) throw err;
    await appsApi.replaceNamespacedDeployment(name, namespace, manifest);
  }
}

export async function applyService(
  namespace: string,
  name: string,
  manifest: V1Service,
): Promise<void> {
  try {
    await coreApi.createNamespacedService(namespace, manifest);
  } catch (err) {
    if (!isConflict(err)) throw err;
    await coreApi.replaceNamespacedService(name, namespace, manifest);
  }
}

export async function applyIngress(
  namespace: string,
  name: string,
  manifest: V1Ingress,
): Promise<void> {
  try {
    await networkingApi.createNamespacedIngress(namespace, manifest);
  } catch (err) {
    if (!isConflict(err)) throw err;
    await networkingApi.replaceNamespacedIngress(name, namespace, manifest);
  }
}

export async function applyHpa(
  namespace: string,
  name: string,
  manifest: V2HorizontalPodAutoscaler,
): Promise<void> {
  try {
    await autoscalingApi.createNamespacedHorizontalPodAutoscaler(namespace, manifest);
  } catch (err) {
    if (!isConflict(err)) throw err;
    await autoscalingApi.replaceNamespacedHorizontalPodAutoscaler(name, namespace, manifest);
  }
}
