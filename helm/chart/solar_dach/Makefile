.PHONY: install upgrade uninstall test template dry-run status clean restart restart-pull

CHART_NAME := solar-dach
NAMESPACE := default
RELEASE_NAME := $(CHART_NAME)

# Installation und Upgrade mit lokalem Chart
install:
	helm install $(RELEASE_NAME) . -f values.yaml --namespace $(NAMESPACE) --create-namespace

upgrade:
	helm upgrade $(RELEASE_NAME) . -f values.yaml --namespace $(NAMESPACE) --set image.pullPolicy=Always --set-string restartAt=$$(date -Iseconds)

uninstall:
	helm uninstall $(RELEASE_NAME) --namespace $(NAMESPACE)

# Testing und Validation
test:
	helm test $(RELEASE_NAME) --namespace $(NAMESPACE)

template:
	helm template $(RELEASE_NAME) . -f values.yaml --namespace $(NAMESPACE)

dry-run:
	helm install $(RELEASE_NAME) . -f values.yaml --namespace $(NAMESPACE) --dry-run --debug

# Status und Management
status:
	helm status $(RELEASE_NAME) --namespace $(NAMESPACE)

history:
	helm history $(RELEASE_NAME) --namespace $(NAMESPACE)

rollback:
	helm rollback $(RELEASE_NAME) --namespace $(NAMESPACE)

# Pod Neustart erzwingen
restart:
	kubectl rollout restart deployment/$(RELEASE_NAME) --namespace $(NAMESPACE)

# Pod Neustart mit forciertem Image-Pull
restart-pull:
	kubectl patch deployment $(RELEASE_NAME) --namespace $(NAMESPACE) -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"kubectl.kubernetes.io/restartedAt\":\"$$(date -Iseconds)\"}}}}}"

# Port-Forward für lokalen Zugriff
port-forward:
	kubectl port-forward --namespace $(NAMESPACE) svc/$(RELEASE_NAME) 3021:3000

# Logs anzeigen
logs:
	kubectl logs -l app.kubernetes.io/instance=$(RELEASE_NAME) --namespace $(NAMESPACE)
	kubectl logs --namespace $(NAMESPACE) -l app.kubernetes.io/name=solar_dach -f

# Cleanup
clean:
	rm -f *.tgz