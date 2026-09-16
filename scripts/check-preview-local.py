#!/usr/bin/env python3
"""Check an already running preview: python3 scripts/check-preview-local.py."""
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from urllib.parse import urlencode

launcher = Path(__file__).with_name("preview-local.py")
preview = runpy.run_path(str(launcher))
access = preview["read"]("access.json", {})
assert access, "Arranca primero preview-local.py start."
assert not preview["owned"]("backend", os.getpid()), "No debe reconocer procesos ajenos."

request = preview["request"]
base = "http://127.0.0.1:3100"
assert request(base + "/tours")[0] == 200, "La vista local debe abrir sin credenciales."
assert request("http://127.0.0.1:3102/tours")[0] == 401, "El frontend interno sigue requiriendo el proxy."
assert request("http://127.0.0.1:3101/api/v1/pilot/tours")[0] == 401, "La API interna sigue requiriendo su clave."
for lang, label in (("es", "Volver a los tours"), ("fr", "Retour aux visites")):
    code, body = request(base + "/data-sources?lang=" + lang)
    html = body.decode()
    assert code == 200 and label in html and "Browse" not in html, lang
    assert 'href="/tours"' in html, "El enlace debe volver al catálogo."

result = subprocess.run([sys.executable, str(launcher), "start", "--skip-build"],
                        capture_output=True, text=True)
assert result.returncode == 1 and "Puerto 3100 ocupado" in result.stderr
assert request(base + "/tours")[0] == 200, "El arranque duplicado no debe detener la vista."
selection = preview["read"]("settings.json", {}).get("review_tour")
if selection:
    selected_ids = selection.split(",")
    code, raw = request(base + "/api/backend/tours/" + selected_ids[0])
    assert code == 200
    tour = json.loads(raw)
    assert tour.get("localReview") is True and not tour.get("pilot")
    for city in (tour["city"], tour["city"].lower(), tour["city"].upper()):
        query = urlencode({"city": city, "language": tour["language"], "readyOnly": "true"})
        code, raw = request(base + "/api/backend/tours?" + query)
        assert code == 200
        found_ids = {t["id"] for t in json.loads(raw)["data"]["tours"]}
        assert selected_ids[0] in found_ids and found_ids <= set(selected_ids), city

# Exercise the running service too: a unit test cannot detect an outdated process.
query = urlencode({"city": "Sevilla", "language": "fr", "readyOnly": "true"})
code, raw = request(base + "/api/backend/tours?" + query)
assert code == 200
sevilla_ids = {tour["id"] for tour in json.loads(raw)["data"]["tours"]}
if sevilla_ids:
    for city in ("Séville", "Seville", "SÉVILLE", "sév"):
        query = urlencode({"city": city, "language": "fr", "readyOnly": "true"})
        code, raw = request(base + "/api/backend/tours?" + query)
        assert code == 200
        tours = json.loads(raw)["data"]["tours"]
        assert {tour["id"] for tour in tours} == sevilla_ids, city
        assert all(tour["language"] == "fr" and tour.get("cityNames", {}).get("fr") == "Séville" for tour in tours), city
print("Acceso local sin contraseña, servicios internos, navegación, búsqueda multilingüe y arranques duplicados: OK.")
