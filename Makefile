.PHONY: up down logs be shell fe

up:
	docker compose -f infra/docker-compose.yml up -d --build

down:
	docker compose -f infra/docker-compose.yml down -v

logs:
	docker compose -f infra/docker-compose.yml logs -f

be:
	docker compose -f infra/docker-compose.yml exec backend bash || true

fe:
	docker compose -f infra/docker-compose.yml exec frontend sh || true
