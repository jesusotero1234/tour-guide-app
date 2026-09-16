#!/usr/bin/env python3
"""Vista privada real: python3 scripts/preview-local.py start|stop|status|check."""
import argparse
import base64
import hashlib
import io
import json
import os
import re
from pathlib import Path
import platform
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STATE = Path.home() / ".cache/tour-guide-preview"
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
PORTS = (3100, 3101, 3102)
COMMANDS = {
    "backend": (["node", "-r", "ts-node/register/transpile-only", "src/server.ts"], ROOT / "backend"),
    "frontend": (["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"], ROOT / "frontend"),
}


def read(name, default):
    file = STATE / name
    return json.loads(file.read_text()) if file.exists() else default


def save(name, data):
    file = STATE / name
    file.write_text(json.dumps(data, indent=2))
    file.chmod(0o600)


def identity(pid):
    # /proc stat comm may contain spaces; starttime is field 22.
    return (Path("/proc") / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()[19]


def owned(name, pid):
    try:
        proc = Path("/proc") / str(int(pid))
        cwd = proc.joinpath("cwd").resolve()
        args = proc.joinpath("cmdline").read_bytes().split(b"\0")
        marker = {"backend": b"src/server.ts", "frontend": b"node_modules/next/dist/bin/next", "proxy": str(STATE / "Caddyfile").encode()}[name]
        expected_cwd = ROOT if name == "proxy" else COMMANDS[name][1]
        stamp = read("identities.json", {}).get(name)
        matches = marker in args or (name == "frontend" and args[0].startswith(b"next-server ("))
        return cwd == expected_cwd and matches and (stamp is None or stamp == identity(pid))
    except (OSError, ValueError, KeyError):
        return False


def stop():
    pids = read("pids.json", {})
    for name in ("proxy", "frontend", "backend"):
        pid = pids.get(name)
        if pid and owned(name, pid):
            os.kill(pid, signal.SIGTERM)
            for _ in range(30):
                if not owned(name, pid):
                    break
                time.sleep(0.1)
            if owned(name, pid):
                raise RuntimeError(f"{name} no se detuvo; no se ha forzado su cierre.")
    print("Procesos de esta vista detenidos. Las reglas de red se conservan.")


def addresses():
    print("Windows: http://localhost:3100/tours")
    result = subprocess.run(["ip", "-j", "-4", "address"], capture_output=True, text=True)
    if result.returncode == 0:
        for interface in json.loads(result.stdout):
            for address in interface.get("addr_info", []):
                ip = address.get("local", "")
                if address.get("scope") == "global" and not ip.startswith(("127.", "169.254.", "10.255.255.")):
                    print(f"Red local: http://{ip}:3100/tours")


def status():
    pids = read("pids.json", {})
    for name in ("backend", "frontend", "proxy"):
        print(f"{name}: {'activo' if pids.get(name) and owned(name, pids[name]) else 'detenido'}")
    if pids.get("proxy") and owned("proxy", pids["proxy"]):
        addresses()
        print("Acceso directo desde la red local, sin usuario ni contraseña.")


def prepare_node():
    def version(binary):
        try:
            result = subprocess.run([str(binary), "--version"], capture_output=True, text=True, timeout=5, check=True)
            match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", result.stdout.strip())
            return tuple(map(int, match.groups())) if match else (0, 0, 0)
        except (OSError, subprocess.SubprocessError):
            return (0, 0, 0)

    current = shutil.which("node")
    if current and version(current) >= (22, 0, 0):
        return
    # Windows and non-interactive WSL sessions do not load nvm's shell setup.
    nvm = Path(os.environ.get("NVM_DIR", str(Path.home() / ".nvm"))).expanduser()
    candidates = sorted((version(binary), binary) for binary in nvm.glob("versions/node/v*/bin/node"))
    for installed, binary in reversed(candidates):
        if installed >= (22, 0, 0) and os.access(binary.with_name("npm"), os.X_OK):
            os.environ["PATH"] = str(binary.parent) + os.pathsep + os.environ.get("PATH", "")
            print(f"Usando Node.js {'.'.join(map(str, installed))} instalado con nvm.", flush=True)
            return
    raise RuntimeError("Se necesita Node.js 22 o superior. Activa una versión compatible con nvm o añádela al PATH.")


def prerequisites():
    prepare_node()
    for name in ("node", "npm", "ip"):
        if not shutil.which(name):
            raise RuntimeError(f"Falta {name}. Ejecuta este archivo desde WSL.")
    for file in ("backend/node_modules/ts-node/register/transpile-only.js", "frontend/node_modules/next/dist/bin/next"):
        if not (ROOT / file).exists():
            raise RuntimeError("Instala las dependencias de frontend y backend antes de continuar.")
    code = """require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient();
db.generationJob.count({where:{status:{in:['queued','running']}}})
.then(n=>{console.log(n);if(n)process.exitCode=2})
.catch(()=>{console.error('No se pudo consultar la base de datos');process.exitCode=1})
.finally(()=>db.$disconnect());"""
    result = subprocess.run(["node", "-e", code], cwd=ROOT / "backend", capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError("Hay generaciones pendientes." if result.returncode == 2 else "La base de datos no está disponible.")
    print("Dependencias y base de datos listas; no hay generaciones pendientes.")


def caddy_binary():
    configured = os.environ.get("CADDY_BIN")
    if configured:
        binary = Path(configured).resolve()
        if not os.access(binary, os.X_OK):
            raise RuntimeError("CADDY_BIN no apunta a un ejecutable.")
        return binary
    binary = STATE / "caddy"
    if binary.exists():
        return binary
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise RuntimeError("Configura CADDY_BIN para esta plataforma.")
    base = "https://github.com/caddyserver/caddy/releases/download/v2.10.2/"
    name = "caddy_2.10.2_linux_amd64.tar.gz"
    with urllib.request.urlopen(base + name, timeout=45) as response:
        data = response.read()
    with urllib.request.urlopen(base + "caddy_2.10.2_checksums.txt", timeout=20) as response:
        checks = response.read().decode()
    expected = next(line.split()[0] for line in checks.splitlines() if line.split()[-1] == name)
    if hashlib.sha512(data).hexdigest() != expected:
        raise RuntimeError("El archivo de Caddy no coincide con su checksum oficial.")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        binary.write_bytes(archive.extractfile("caddy").read())
    binary.chmod(0o700)
    return binary


def request(url, access=None):
    headers = {}
    if access:
        pair = (access["user"] + ":" + access["password"]).encode()
        headers["Authorization"] = "Basic " + base64.b64encode(pair).decode()
    try:
        with OPENER.open(urllib.request.Request(url, headers=headers), timeout=2) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def start(skip_build, review_tour):
    for port in PORTS:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("0.0.0.0", port))
            except OSError:
                raise RuntimeError(f"Puerto {port} ocupado. Usa status o stop; no se cerrará un servicio ajeno.")
    prerequisites()
    if not skip_build:
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "frontend", check=True)
    if not (ROOT / "frontend/.next/BUILD_ID").exists():
        raise RuntimeError("Falta compilar el frontend.")
    STATE.mkdir(parents=True, exist_ok=True)
    STATE.chmod(0o700)
    binary = caddy_binary()
    access = read("access.json", None)
    if access is None:
        access = dict(proxy_token=secrets.token_hex(32), api_key=secrets.token_hex(32), user="preview", password=secrets.token_urlsafe(12))
    if not all(isinstance(access.get(k), str) and access[k] for k in ("proxy_token", "api_key", "user", "password")) or min(len(access["proxy_token"]), len(access["api_key"])) < 32:
        raise RuntimeError("Credenciales locales incompletas; revisa access.json.")
    save("access.json", access)
    # An explicit IPv4 socket avoids dual-stack listener issues in WSL mirrored networking.
    config = (ROOT / "deployment/pilot/Caddyfile").read_text().replace("127.0.0.1:3000", "127.0.0.1:3102").replace("{$PILOT_HOST} {", "{$PILOT_HOST} {\n    bind tcp4/0.0.0.0")
    # Only the local launcher omits the browser login from the pilot template.
    login = "    basic_auth {\n        {$PILOT_USER} {$PILOT_PASSWORD_HASH}\n    }\n"
    if config.count(login) != 1:
        raise RuntimeError("La plantilla de acceso cambió; revisa la configuración local de Caddy.")
    config = config.replace(login, "").replace(
        "# Required environment: PILOT_HOST, PILOT_USER, PILOT_PASSWORD_HASH, PILOT_PROXY_TOKEN.",
        "# Local preview environment: PILOT_HOST, PILOT_PROXY_TOKEN.")
    (STATE / "Caddyfile").write_text("{\n admin off\n persist_config off\n}\n" + config)
    base = {**os.environ, "PILOT_MODE": "true", "PILOT_API_KEY": access["api_key"], "PILOT_PROXY_TOKEN": access["proxy_token"]}
    envs = {
        "backend": {**base, "NODE_ENV": "development", "PORT": "3101", "BIND_HOST": "127.0.0.1", "LOCAL_REVIEW_TOUR_ID": review_tour},
        "frontend": {**base, "NODE_ENV": "production", "API_URL": "http://127.0.0.1:3101/api", "UMAMI_SCRIPT_URL": "", "UMAMI_WEBSITE_ID": ""},
        "proxy": {**base, "PILOT_HOST": "http://:3100"},
    }
    commands = {**COMMANDS, "proxy": ([str(binary), "run", "--config", str(STATE / "Caddyfile"), "--adapter", "caddyfile"], ROOT)}
    children = {}
    try:
        for name, (command, cwd) in commands.items():
            logfile = STATE / (name + ".log")
            with logfile.open("wb") as log:
                logfile.chmod(0o600)
                children[name] = subprocess.Popen(command, cwd=cwd, env=envs[name], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        save("pids.json", {name: child.pid for name, child in children.items()})
        save("identities.json", {name: identity(child.pid) for name, child in children.items()})
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if any(child.poll() is not None for child in children.values()):
                raise RuntimeError(f"Un proceso terminó. Revisa los logs en {STATE}.")
            try:
                if request("http://127.0.0.1:3101/health")[0] == 200 and request("http://127.0.0.1:3100/tours")[0] == 200:
                    break
            except (OSError, TimeoutError):
                pass
            time.sleep(0.3)
        else:
            raise RuntimeError("La vista no respondió dentro de 30 segundos.")
    except BaseException:
        for child in children.values():
            if child.poll() is None:
                child.terminate()
        for child in children.values():
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
        raise
    save("settings.json", {"review_tour": review_tour})
    status()
    if review_tour:
        print(f"Revisión privada del tour: {review_tour}")
    try:
        code, data = request("http://127.0.0.1:3100/api/backend/tours?readyOnly=true")
        if code == 200:
            print("Catálogo conectado. Tours disponibles:", len(json.loads(data).get("data", {}).get("tours", [])))
        elif b"PILOT_NOT_OPEN" in data:
            print("Interfaz disponible; catálogo bloqueado: falta PILOT_NOTICE_FILE válido y aprobado.")
        else:
            print(f"Interfaz disponible; el catálogo devolvió HTTP {code}.")
    except (OSError, ValueError):
        print("Interfaz disponible; no se pudo comprobar el catálogo.")


def valid_review_selection(value):
    return isinstance(value, str) and (not value or (
        len(value.split(",")) <= 60 and all(re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", item)
            for item in value.split(","))))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("start", "stop", "status", "check"), nargs="?", default="start")
    parser.add_argument("--skip-build", action="store_true", help="Usar la compilación existente, sin recompilar.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--review-tour", metavar="UUID[,UUID]", help="Tours para revisión privada local, separados por comas (máximo 60).")
    group.add_argument("--pilot", action="store_true", help="Usar el piloto estándar sin tour de revisión.")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.action == "start":
            if args.review_tour is not None:
                if not args.review_tour or not valid_review_selection(args.review_tour):
                    raise ValueError("--review-tour debe contener UUID en minúsculas separados por comas, máximo 60.")
                review_tour = args.review_tour
            elif args.pilot:
                review_tour = ""
            else:
                review_tour = read("settings.json", {}).get("review_tour", "")
            if not valid_review_selection(review_tour):
                raise ValueError("La selección guardada debe contener UUID en minúsculas separados por comas, máximo 60.")
            start(args.skip_build, review_tour)
        elif args.action == "stop":
            stop()
        elif args.action == "status":
            status()
            review_tour = read("settings.json", {}).get("review_tour", "")
            if review_tour:
                print(f"Revisión privada del tour: {review_tour}")
        else:
            prerequisites()
            print("Comprobación terminada; no se han iniciado ni detenido procesos.")
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, StopIteration) as error:
        print("Error:", error, file=sys.stderr)
        sys.exit(1)
