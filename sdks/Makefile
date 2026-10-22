PYTHON ?= python3

.PHONY: help generate check check-spec

help:
	@echo "generate          regenerate the language clients from sdks/spec/streampay.spec.json"
	@echo "check             schema guard + spec coverage tests + generated-output drift"
	@echo "check-spec        schema guard + spec coverage tests only"

generate:
	$(PYTHON) generator/generate.py

check-spec:
	$(PYTHON) generator/check_contract_surface.py
	$(PYTHON) -m unittest discover -s generator -p "test_*.py" -v

check: check-spec
	$(PYTHON) generator/generate.py --check
