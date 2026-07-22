import {
  AppsV1Api,
  AutoscalingV2Api,
  CoreV1Api,
  KubeConfig,
  NetworkingV1Api,
  PolicyV1Api,
} from '@kubernetes/client-node';

// Loads from ~/.kube/config (or $KUBECONFIG) — exactly what `minikube start`
// writes, and what a real cluster's kubeconfig would look like too. No
// separate "are we talking to Minikube or a real cluster" branch anywhere
// else in this module on purpose: the Kubernetes Service only ever speaks
// the Kubernetes API, never anything Minikube-specific.
const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();

export const coreApi = kubeConfig.makeApiClient(CoreV1Api);
export const appsApi = kubeConfig.makeApiClient(AppsV1Api);
export const networkingApi = kubeConfig.makeApiClient(NetworkingV1Api);
export const autoscalingApi = kubeConfig.makeApiClient(AutoscalingV2Api);
export const policyApi = kubeConfig.makeApiClient(PolicyV1Api);
