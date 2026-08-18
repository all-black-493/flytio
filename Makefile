# Local Kubernetes for the backend, on k3d.
#
# Each target does one thing and can be run on its own; `k3d-deploy` is
# just the sequence. The point of the split is the inner loop - changing
# code and re-running `make k3d-deploy` should not rebuild a cluster, and
# changing a secret should not rebuild an image.
#
#   make k3d-up       create the cluster (once)
#   make k3d-deploy   build -> import -> secret -> helm upgrade (the loop)
#   make k3d-status   what is running
#   make k3d-test     prove the Service serves
#   make k3d-down     delete the cluster
#
# Production is unaffected by all of this: it runs from compose.yaml on
# EC2. Nothing here touches it.

SHELL := /bin/bash
.DEFAULT_GOAL := help

CLUSTER      := flyt
RELEASE      := flyt
CHART        := ./helm/backend
VALUES_LOCAL := ./helm/backend/values-local.yaml
IMAGE        := flyt-backend:local

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- cluster ----------------------------------------------------------

.PHONY: k3d-up
k3d-up: ## Create the k3d cluster and its Postgres/Redis
	@k3d cluster list $(CLUSTER) >/dev/null 2>&1 \
		&& echo "Cluster '$(CLUSTER)' already exists" \
		|| k3d cluster create --config k3d/cluster.yaml
	@# Seed the cluster from the local Docker cache when possible. Otherwise
	@# k3d pulls postgres:17 (~640MB) inside the cluster on first run, which
	@# looks like a hang and outlasts any reasonable wait.
	@for img in postgres:17 redis:7-alpine; do \
		if docker image inspect $$img >/dev/null 2>&1; then \
			echo "Importing $$img from the local cache"; \
			k3d image import $$img --cluster $(CLUSTER) >/dev/null; \
		else \
			echo "$$img not cached locally - the cluster will pull it (slow first run)"; \
		fi; \
	done
	@kubectl apply -f k3d/dependencies.yaml
	@echo "Waiting for Postgres and Redis..."
	@kubectl wait --for=condition=available --timeout=600s \
		deployment/postgres deployment/redis

.PHONY: k3d-down
k3d-down: ## Delete the cluster (and everything in it)
	@k3d cluster delete $(CLUSTER)

# --- inner loop -------------------------------------------------------

.PHONY: k3d-image
k3d-image: ## Build the backend image and import it into the cluster
	@docker build -t $(IMAGE) ./backend
	@k3d image import $(IMAGE) --cluster $(CLUSTER)

.PHONY: k3d-secret
k3d-secret: ## Create/update the app Secret from backend/.env
	@./k3d/create-secret.sh

.PHONY: k3d-install
k3d-install: ## helm upgrade --install with the local values
	@helm upgrade --install $(RELEASE) $(CHART) \
		--values $(VALUES_LOCAL) \
		--wait --timeout 5m

.PHONY: k3d-deploy
k3d-deploy: k3d-image k3d-secret k3d-install k3d-status ## Build, import, secret, install
	@echo
	@echo "API: http://localhost:8081/health/ready"

# --- inspection -------------------------------------------------------

.PHONY: k3d-status
k3d-status: ## Pods, by component
	@kubectl get pods -l app.kubernetes.io/instance=$(RELEASE) \
		-L app.kubernetes.io/component
	@kubectl get svc,ingress -l app.kubernetes.io/instance=$(RELEASE) 2>/dev/null || true

.PHONY: k3d-logs
k3d-logs: ## Tail the API logs
	@kubectl logs -l app.kubernetes.io/component=api --tail=100 -f

.PHONY: k3d-test
k3d-test: ## helm test - proves the Service routes to a ready pod
	@helm test $(RELEASE) --logs

.PHONY: k3d-migrate-logs
k3d-migrate-logs: ## Logs from the last migration hook Job
	@kubectl logs job/$(RELEASE)-backend-migrate --tail=50 \
		|| echo "No migration Job present (it is deleted on success)"
