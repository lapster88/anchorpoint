.PHONY: up down logs be shell fe

ENV_FILE ?= .env

# Resolve docker compose command depending on installed version.
ifeq ($(shell docker compose version >/dev/null 2>&1 && echo ok),ok)
DOCKER_COMPOSE_CMD := docker compose
else ifeq ($(shell command -v docker-compose >/dev/null 2>&1 && echo ok),ok)
DOCKER_COMPOSE_CMD := docker-compose
else
$(error Docker Compose is not installed. Install the Docker Compose plugin (`docker compose`) or the standalone `docker-compose` binary.)
endif

COMPOSE := $(DOCKER_COMPOSE_CMD) --env-file $(ENV_FILE) -f infra/docker-compose.yml

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f

be:
	$(COMPOSE) exec backend bash || true

shell: be

fe:
	$(COMPOSE) exec frontend sh || true

devseed:
	$(COMPOSE) exec backend python manage.py devseed

test:
	$(COMPOSE) exec backend pytest
	$(COMPOSE) exec frontend pnpm test
	$(COMPOSE) exec frontend pnpm build

test-be:
	$(COMPOSE) exec backend pytest

test-fe:
	$(COMPOSE) exec frontend pnpm test
	$(COMPOSE) exec frontend pnpm build

e2e:
	$(COMPOSE) up -d backend frontend
	$(COMPOSE) run --rm playwright sh -lc "npm install -g pnpm && pnpm install && npx playwright install --with-deps && pnpm test:e2e"
