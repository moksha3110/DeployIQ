# infra

- `docker/` — Dockerfiles for frontend/backend/worker, `docker-compose.yml` for local dev (Postgres, Redis, backend, frontend, Prometheus, Grafana, Loki).
- `k8s/` — platform-level manifests (stretch goal: run the platform itself on Kubernetes via Helm).
- `prometheus/`, `grafana/`, `loki/` — observability stack config (scrape configs, dashboards, provisioning).

Populated starting Milestone 0 (`docker-compose.yml`) and Milestone 5 (observability stack).
