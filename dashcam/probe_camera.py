"""
Probe da câmera em 192.168.0.1
Investigação detalhada do servidor HTTP para descobrir endpoints reais.
"""
import requests
import socket

ip = "192.168.0.1"
session = requests.Session()
session.headers["User-Agent"] = "Mozilla/5.0"

print("=" * 60)
print(f"PROBE DETALHADO -> {ip}")
print("=" * 60)

# 1. Raiz HTTP — ver headers e conteudo completo
test_urls = [
    f"http://{ip}/",
    f"http://{ip}/index.html",
    f"http://{ip}/index.htm",
    f"http://{ip}/home",
    f"http://{ip}/app",
]

for url in test_urls:
    try:
        r = session.get(url, timeout=5, allow_redirects=True)
        print(f"\n[URL] {url}")
        print(f"  Status       : {r.status_code}")
        print(f"  Content-Type : {r.headers.get('Content-Type', 'N/A')}")
        print(f"  Server       : {r.headers.get('Server', 'N/A')}")
        print(f"  Tamanho      : {len(r.content)} bytes")
        print(f"  Redirect     : {r.url if r.url != url else 'nenhum'}")
        print(f"  Headers completos:")
        for k, v in r.headers.items():
            print(f"    {k}: {v}")
        body = r.text[:800].replace("\r", "").replace("\n", " | ")
        print(f"  Body         : {body}")
    except requests.exceptions.ConnectionError:
        print(f"\n[URL] {url} -> RECUSADO")
    except Exception as e:
        print(f"\n[URL] {url} -> ERRO: {e}")

# 2. Scan de portas mais completo
print("\n" + "=" * 60)
print("SCAN DE PORTAS ESTENDIDO")
print("=" * 60)
extra_ports = [80, 443, 554, 1935, 3000, 4000, 5000, 7000, 7001, 8000, 8080, 8081, 8082, 8554, 8888, 9000, 9090, 10000]
open_ports = []
for port in extra_ports:
    try:
        with socket.create_connection((ip, port), timeout=1):
            print(f"  Porta {port:5d} -> ABERTA")
            open_ports.append(port)
    except Exception:
        print(f"  Porta {port:5d} -> fechada")

print(f"\nPortas abertas: {open_ports}")

# 3. Testa o conteudo 404 retornado — pode revelar o servidor/firmware
print("\n" + "=" * 60)
print("FINGERPRINT DO SERVIDOR (via pagina 404)")
print("=" * 60)
try:
    r = session.get(f"http://{ip}/nao_existe_xyzxyz", timeout=5)
    print(f"Status 404 page -> {r.status_code}")
    print(f"Server header   -> {r.headers.get('Server', 'nao informado')}")
    print(f"Content-Type    -> {r.headers.get('Content-Type', 'nao informado')}")
    body = r.text[:600].replace("\r","").replace("\n"," | ")
    print(f"Body 404        -> {body}")
except Exception as e:
    print(f"Erro: {e}")
