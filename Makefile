.PHONY: api web test types

api:
	cd backend && PYTHONPATH=src uv run uvicorn signapp.main:app --reload --host 127.0.0.1 --port 8010

web:
	cd apps/web && pnpm dev

test:
	cd backend && uv run pytest -q
	cd apps/web && pnpm test

types:
	cd backend && uv run python -c 'import json; from signapp.main import app; json.dump(app.openapi(), open("../apps/web/openapi.json","w"))'
	python3 scripts/generate_api_types.py apps/web/openapi.json
	rm -f apps/web/openapi.json
