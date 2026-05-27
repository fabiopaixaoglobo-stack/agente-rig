# -*- coding: utf-8 -*-
"""
================================================================================
  DASHCAM EXPLORER - Script de Descoberta e Acesso a Câmeras Veiculares
================================================================================
  Autor     : Engenheiro de Software IoT / Redes
  Propósito : Descobrir automaticamente a câmera conectada via hotspot Wi-Fi,
              mapear seus endpoints HTTP e exibir o stream de vídeo RTSP.

  DEPENDÊNCIAS:
      pip install requests opencv-python

  CENÁRIO DE USO:
      1. Conecte seu PC/dispositivo ao Wi-Fi da câmera (ex: SSID H30D-DC1E4BF5)
      2. Execute: python dashcam_explorer.py
      3. O script detecta o gateway, escaneia endpoints e abre o vídeo.

  PROTOCOLOS ENVOLVIDOS:
      - DHCP  : A câmera atua como servidor DHCP, distribuindo IPs ao seu PC.
                O Gateway nesse cenário é sempre o próprio IP da câmera.
      - HTTP  : Câmeras genéricas expõem APIs REST ou CGI para controle/listagem.
      - RTSP  : Real-Time Streaming Protocol, padrão para stream de vídeo ao vivo.
================================================================================
"""

import os
import sys
import time
import socket
import subprocess
import platform
import threading
from typing import Optional

# Força UTF-8 no stdout para evitar UnicodeEncodeError no PowerShell/Windows (CP1252)
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────────────────────────────────────
# IMPORTAÇÕES COM VERIFICAÇÃO DE DEPENDÊNCIAS
# ─────────────────────────────────────────────────────────────────────────────
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("[ERRO] Biblioteca 'requests' não encontrada.")
    print("       Instale com: pip install requests")
    sys.exit(1)

try:
    import cv2
except ImportError:
    print("[ERRO] Biblioteca 'opencv-python' não encontrada.")
    print("       Instale com: pip install opencv-python")
    sys.exit(1)


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 1 — CONSTANTES E CONFIGURAÇÕES GLOBAIS
# ══════════════════════════════════════════════════════════════════════════════

# Timeout padrão para requisições HTTP (segundos)
HTTP_TIMEOUT = 5

# Timeout para tentativas de abertura do stream RTSP (segundos)
RTSP_TIMEOUT = 10

# Portas RTSP mais comuns em câmeras genéricas / embarcadas
# 554  → padrão IANA para RTSP
# 8554 → porta alternativa comum em câmeras OEM
# 1935 → alguns firmwares expõem RTSP na porta de RTMP
RTSP_PORTS = [554, 8554, 1935]

# Caminhos de stream RTSP frequentes em câmeras dashcam genéricas
# Cada fabricante usa um caminho diferente — testamos os mais comuns.
RTSP_PATHS = [
    "/",                        # Raiz direta
    "/live",                    # Genérico "live"
    "/live/ch0",                # Canal 0
    "/live/main",               # Stream principal
    "/stream",                  # Outro padrão comum
    "/ch0_0.264",               # Formato H.264 direto
    "/h264Preview_01_main",     # Padrão Reolink/genérico
    "/cam/realmonitor",         # Padrão Dahua
    "/Streaming/Channels/1",    # Padrão Hikvision
    "/video1",                  # Câmeras OEM simples
    "/video",
]

# Endpoints HTTP comuns em dashcams genéricas
# Muitas usam CGI (Common Gateway Interface) para controle via GET/POST.
# O padrão varia por firmware (Novatek, Ambarella, Rockchip, etc.)
HTTP_ENDPOINTS = {
    # ── Listagem de arquivos de vídeo no cartão SD ──────────────────────────
    "Lista de Vídeos (raiz SD)":          "/?custom=1&cmd=3015",
    "Lista de Vídeos (formato Ambarella)":"/?action=getfilelist&type=video",
    "Lista de Vídeos (formato CGI)":      "/cgi-bin/api.cgi?cmd=GetRecordingList&channel=0",
    "Lista de Fotos (SD)":                "/?action=getfilelist&type=photo",
    "Lista de Vídeos (Novatek)":          "/?custom=1&cmd=3014",

    # ── Informações do sistema ───────────────────────────────────────────────
    "Informações do Dispositivo":         "/?custom=1&cmd=3012",
    "Versão de Firmware":                 "/?action=getdevinfo",
    "Status do Sistema":                  "/cgi-bin/api.cgi?cmd=GetDevInfo&channel=0",
    "Informações Gerais":                 "/cgi-bin/devinfo.cgi",

    # ── Controle da câmera ───────────────────────────────────────────────────
    "Status da Gravação":                 "/?custom=1&cmd=2016",
    "Iniciar Gravação":                   "/?custom=1&cmd=2001",
    "Parar Gravação":                     "/?custom=1&cmd=2056",
    "Tirar Foto":                         "/?custom=1&cmd=769",

    # ── Configurações ────────────────────────────────────────────────────────
    "Configurações Gerais":               "/?action=getparam",
    "Configurações (Ambarella)":          "/cgi-bin/param.cgi?action=list",
    "Configurações de Rede":              "/cgi-bin/network.cgi",

    # ── Endpoints de administração ───────────────────────────────────────────
    "Raiz HTTP":                          "/",
    "Admin Panel":                        "/admin",
    "Login":                              "/login.cgi",
    "API Raiz":                           "/api",
    "API v1":                             "/api/v1",
    "API v2":                             "/api/v2",
}


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 2 — DESCOBERTA DE REDE (DETECÇÃO DO IP DA CÂMERA)
# ══════════════════════════════════════════════════════════════════════════════

def get_default_gateway() -> Optional[str]:
    """
    Detecta automaticamente o IP do Gateway padrão da interface de rede ativa.

    LÓGICA DE REDE:
        Quando você conecta ao Wi-Fi da câmera, ela atua como um Access Point
        e servidor DHCP. O seu PC recebe um IP do pool dela (ex: 192.168.1.x)
        e o Gateway padrão configurado pelo DHCP é o próprio IP da câmera.
        Logo, detectar o Gateway = detectar o IP da câmera.

    Estratégias utilizadas (em ordem de preferência):
        1. Comando nativo do SO (ipconfig/route) — mais confiável
        2. Conexão UDP fictícia ao Google DNS — método alternativo sem libs extras

    Returns:
        str  : IP do gateway detectado, ex: "192.168.1.1"
        None : Se não for possível detectar
    """
    print("\n[REDE] Detectando IP do Gateway (câmera)...")

    # ── Estratégia 1: Comando nativo do sistema operacional ──────────────────
    try:
        if platform.system() == "Windows":
            # 'ipconfig' lista todas as interfaces; filtramos pelo "Gateway Padrão"
            result = subprocess.check_output(
                ["ipconfig"],
                encoding="utf-8",
                errors="ignore",
                timeout=5
            )
            for line in result.splitlines():
                # Suporte a sistemas em PT-BR e EN
                if "Gateway Padrão" in line or "Default Gateway" in line:
                    parts = line.split(":")
                    if len(parts) >= 2:
                        ip = parts[-1].strip()
                        # Valida que é um IP e não está vazio
                        if ip and _is_valid_ip(ip) and not ip.startswith("fe80"):
                            print(f"[REDE] Gateway detectado via ipconfig: {ip}")
                            return ip

        else:
            # Linux/macOS: usa 'ip route' ou 'route -n'
            try:
                result = subprocess.check_output(
                    ["ip", "route", "show", "default"],
                    encoding="utf-8",
                    timeout=5
                )
                # Formato: "default via 192.168.1.1 dev wlan0 ..."
                for line in result.splitlines():
                    if "default via" in line:
                        ip = line.split("via")[1].strip().split()[0]
                        if _is_valid_ip(ip):
                            print(f"[REDE] Gateway detectado via 'ip route': {ip}")
                            return ip
            except FileNotFoundError:
                # Fallback para macOS
                result = subprocess.check_output(
                    ["route", "-n", "get", "default"],
                    encoding="utf-8",
                    timeout=5
                )
                for line in result.splitlines():
                    if "gateway:" in line:
                        ip = line.split(":")[1].strip()
                        if _is_valid_ip(ip):
                            print(f"[REDE] Gateway detectado via 'route': {ip}")
                            return ip

    except (subprocess.TimeoutExpired, subprocess.CalledProcessError, Exception) as e:
        print(f"[REDE] Falha na Estratégia 1 (comando SO): {e}")

    # ── Estratégia 2: Conexão UDP fictícia (sem pacotes enviados de fato) ────
    # Técnica: ao criar um socket UDP e chamar connect(), o SO preenche
    # automaticamente o IP local de saída. A partir disso, inferimos o gateway
    # assumindo que o gateway é o .1 da sub-rede (ex: 192.168.1.X → 192.168.1.1).
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            # Conectar ao DNS do Google (sem enviar dados — UDP não é orientado)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]

        # Monta o IP do gateway: mantém os 3 primeiros octetos e adiciona ".1"
        parts = local_ip.rsplit(".", 1)
        gateway = f"{parts[0]}.1"
        print(f"[REDE] IP local detectado: {local_ip} → Gateway estimado: {gateway}")
        return gateway

    except Exception as e:
        print(f"[REDE] Falha na Estratégia 2 (UDP fictício): {e}")

    return None


def _is_valid_ip(ip: str) -> bool:
    """Valida se a string é um endereço IPv4 válido."""
    try:
        socket.inet_aton(ip)
        return True
    except socket.error:
        return False


def ping_host(ip: str, timeout: int = 2) -> bool:
    """
    Verifica se o host responde a ping ICMP para confirmar conectividade.

    LÓGICA: Antes de tentar HTTP/RTSP, confirmamos que o IP está acessível
    via ICMP. Isso evita longos timeouts nas etapas seguintes.

    Args:
        ip      : Endereço IP a testar
        timeout : Segundos de espera

    Returns:
        bool: True se o host responde, False caso contrário
    """
    param = "-n" if platform.system() == "Windows" else "-c"
    cmd = ["ping", param, "1", "-w" if platform.system() == "Windows" else "-W",
           str(timeout * 1000 if platform.system() == "Windows" else timeout), ip]
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout + 2
        )
        return result.returncode == 0
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 3 — MAPEAMENTO DE ENDPOINTS HTTP
# ══════════════════════════════════════════════════════════════════════════════

def create_http_session(retries: int = 1) -> requests.Session:
    """
    Cria uma sessão HTTP com retry automático e headers customizados.

    LÓGICA: Dashcams podem ter firmware instável. Uma sessão reutilizável com
    retry evita falhas espúrias por timeout ou erro de rede momentâneo.
    Headers mimicam um browser para evitar bloqueio por User-Agent.

    Args:
        retries: Número de tentativas em caso de falha

    Returns:
        requests.Session configurada
    """
    session = requests.Session()

    # Configura política de retry: tenta novamente em erros de conexão
    retry_strategy = Retry(
        total=retries,
        backoff_factor=0.5,        # Espera: 0s, 0.5s, 1s entre tentativas
        status_forcelist=[500, 502, 503, 504],  # Retry em erros de servidor
        allowed_methods=["GET", "POST"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    # Headers que simulam um browser — muitas câmeras verificam User-Agent
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/json,application/xhtml+xml,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        "Connection": "keep-alive",
    })
    return session


def scan_http_endpoints(camera_ip: str, port: int = 80) -> dict:
    """
    Escaneia endpoints HTTP conhecidos e retorna os que responderam com sucesso.

    LÓGICA DE REDE:
        HTTP (porta 80 ou 8080) é a interface de controle mais comum em
        dashcams. O firmware Novatek (chip mais popular) usa GET com parâmetros
        'cmd' numéricos. O Ambarella usa paths '/action='. Testamos ambos.

        Códigos HTTP relevantes:
        - 200 OK        → Endpoint ativo e respondeu com dados
        - 401/403       → Endpoint existe mas requer autenticação
        - 404           → Endpoint não existe neste firmware
        - Timeout/Conn  → Câmera offline ou porta fechada

    Args:
        camera_ip : IP da câmera
        port      : Porta HTTP (padrão 80, pode ser 8080)

    Returns:
        dict: {nome_endpoint: {url, status_code, tamanho_resposta, preview}}
    """
    base_url = f"http://{camera_ip}:{port}"
    print(f"\n{'='*60}")
    print(f"  SCAN HTTP -> {base_url}")
    print(f"{'='*60}")

    session = create_http_session()
    results = {}
    successful = 0

    for name, path in HTTP_ENDPOINTS.items():
        url = base_url + path
        try:
            response = session.get(url, timeout=HTTP_TIMEOUT, allow_redirects=True)
            status = response.status_code
            size = len(response.content)

            # Preview dos primeiros 200 caracteres da resposta (texto)
            try:
                preview = response.text[:200].replace('\n', ' ').replace('\r', '')
            except Exception:
                preview = "[conteúdo binário]"

            # Considera sucesso: 200 OK ou 401/403 (existe mas precisa de auth)
            is_success = status in (200, 401, 403)
            indicator = "[OK]" if status == 200 else ("[AUTH]" if status in (401, 403) else "[X]")

            print(f"  {indicator} [{status}] {name}")
            print(f"       URL     : {url}")
            print(f"       Tamanho : {size} bytes")
            if preview and status == 200:
                print(f"       Preview : {preview[:120]}...")
            print()

            if is_success:
                successful += 1
                results[name] = {
                    "url": url,
                    "status_code": status,
                    "response_size": size,
                    "preview": preview,
                    "content_type": response.headers.get("Content-Type", "desconhecido"),
                }

        except requests.exceptions.ConnectTimeout:
            print(f"  [TIMEOUT] {name} -> {url}")
        except requests.exceptions.ConnectionError:
            # Host recusou a conexao -- porta fechada ou servico nao existe
            print(f"  [RECUSADO] {name}")
        except requests.exceptions.RequestException as e:
            print(f"  [ERRO] {name}: {type(e).__name__}: {e}")
        except Exception as e:
            print(f"  [INESPERADO] {name}: {e}")

    print(f"\n  → {successful} de {len(HTTP_ENDPOINTS)} endpoints responderam com sucesso.")
    return results


def try_http_ports(camera_ip: str) -> dict:
    """
    Tenta portas HTTP alternativas caso a porta 80 não responda.

    LÓGICA: Algumas câmeras usam portas não-padrão para seu servidor web:
        80   → Porta HTTP padrão (maioria das câmeras)
        8080 → Porta alternativa comum em dispositivos embarcados
        8000 → Outra alternativa (ex: câmeras com servidor Python interno)
        81   → Variante menos comum

    Args:
        camera_ip: IP da câmera

    Returns:
        dict: Resultados do scan na primeira porta que respondeu
    """
    http_ports = [80, 8080, 8000, 81]

    for port in http_ports:
        print(f"\n[HTTP] Testando porta {port}...")
        try:
            # Teste rápido de conectividade TCP antes do scan completo
            with socket.create_connection((camera_ip, port), timeout=3) as sock:
                print(f"[HTTP] Porta {port} ABERTA! Iniciando scan de endpoints...")
                return scan_http_endpoints(camera_ip, port)
        except (socket.timeout, ConnectionRefusedError, OSError):
            print(f"[HTTP] Porta {port} fechada ou sem resposta.")

    print("[HTTP] Nenhuma porta HTTP respondeu. A câmera pode não ter interface web ativa.")
    return {}


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 4 — STREAM DE VÍDEO RTSP VIA OPENCV
# ══════════════════════════════════════════════════════════════════════════════

def build_rtsp_urls(camera_ip: str) -> list:
    """
    Constrói a lista completa de URLs RTSP para testar, combinando portas e caminhos.

    LÓGICA RTSP:
        O protocolo RTSP (RFC 2326) opera inicialmente na porta TCP 554 para
        sinalização (DESCRIBE, SETUP, PLAY). O áudio/vídeo é transportado via
        RTP/RTCP em portas UDP dinâmicas.

        URL Format: rtsp://[usuario:senha@]host:porta/caminho

        Também testamos versões com credenciais padrão (admin/admin),
        pois muitas câmeras exigem autenticação básica RTSP.

    Args:
        camera_ip: IP da câmera

    Returns:
        list: Lista de URLs RTSP a testar, em ordem de probabilidade
    """
    urls = []

    # Credenciais mais comuns em dashcams (sem senha e admin/admin)
    auth_variants = [
        "",           # Sem autenticação: rtsp://ip:porta/path
        "admin:@",    # Admin sem senha
        "admin:admin@",  # Admin / Admin
        "admin:12345@",  # Admin com senha numérica comum
    ]

    for port in RTSP_PORTS:
        for path in RTSP_PATHS:
            for auth in auth_variants:
                if auth:
                    url = f"rtsp://{auth}{camera_ip}:{port}{path}"
                else:
                    url = f"rtsp://{camera_ip}:{port}{path}"
                urls.append(url)

    return urls


def check_rtsp_port(camera_ip: str, port: int, timeout: int = 3) -> bool:
    """
    Verifica se uma porta RTSP está aberta via TCP (handshake TCP apenas).

    LÓGICA: Antes de tentar abrir o stream (operação lenta), fazemos um teste
    de conectividade TCP rápido. Se a porta estiver fechada, pulamos.

    Args:
        camera_ip : IP da câmera
        port      : Porta RTSP a testar
        timeout   : Timeout em segundos

    Returns:
        bool: True se a porta está aberta
    """
    try:
        with socket.create_connection((camera_ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def try_rtsp_stream(camera_ip: str) -> bool:
    """
    Tenta abrir e exibir o stream de vídeo RTSP da câmera.

    LÓGICA DE PROTOCOLO:
        1. Verificação de porta: TCP connect rápido para filtrar portas fechadas
        2. cv2.VideoCapture: abre negociação RTSP (DESCRIBE → SETUP → PLAY)
        3. OpenCV configura internamente o FFmpeg ou GStreamer para decodificar
           o stream H.264/H.265 recebido via RTP
        4. Frames são lidos e exibidos em uma janela cv2.imshow()

    Controles durante exibição:
        - Pressione 'Q' para sair
        - Pressione 'S' para salvar um frame (screenshot)
        - Pressione 'R' para tentar reconectar ao stream

    Args:
        camera_ip: IP da câmera

    Returns:
        bool: True se conseguiu abrir e exibir stream, False caso contrário
    """
    print(f"\n{'='*60}")
    print(f"  SCAN RTSP -> {camera_ip}")
    print(f"{'='*60}")

    # Verifica portas abertas primeiro (mais rápido que tentar RTSP em porta fechada)
    open_ports = []
    for port in RTSP_PORTS:
        print(f"[RTSP] Verificando porta TCP {port}...", end=" ")
        if check_rtsp_port(camera_ip, port):
            print("[ABERTA]")
            open_ports.append(port)
        else:
            print("[fechada]")

    if not open_ports:
        print("\n[RTSP] Nenhuma porta RTSP aberta detectada.")
        print("       Isso pode indicar que:")
        print("       → A câmera não suporta RTSP (algumas dashcams usam MJPEG HTTP)")
        print("       → O firmware requer app proprietário para streaming")
        print("       → Tente verificar o manual da câmera para o endereço RTSP exato")
        return False

    # Filtra apenas URLs com portas abertas
    all_urls = build_rtsp_urls(camera_ip)
    candidate_urls = [u for u in all_urls if any(f":{p}/" in u or u.endswith(f":{p}") for p in open_ports)]

    print(f"\n[RTSP] Testando {len(candidate_urls)} URLs com portas abertas...\n")

    # Configurações do OpenCV para RTSP
    # FFMPEG backend: mais compatível com H.264, suporta reautenticação
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "rtsp_transport;tcp|"          # Usa TCP para RTSP (mais estável que UDP)
        "stimeout;5000000|"            # Timeout de socket: 5 segundos (em µs)
        "analyzeduration;1000000|"     # Análise de stream: 1 segundo
        "probesize;500000"             # Probe inicial: 500KB
    )

    for url in candidate_urls:
        print(f"[RTSP] Tentando: {url}")
        try:
            # cv2.VideoCapture tenta abrir o stream RTSP
            # CAP_FFMPEG: usa o backend FFmpeg (necessário para RTSP)
            cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)

            # Timeout manual: aguarda até RTSP_TIMEOUT segundos pela abertura
            start_time = time.time()
            opened = False
            while time.time() - start_time < RTSP_TIMEOUT:
                if cap.isOpened():
                    opened = True
                    break
                time.sleep(0.5)

            if not opened:
                cap.release()
                print(f"       [TIMEOUT] ao abrir stream")
                continue

            # Tenta ler o primeiro frame para confirmar que o stream está ativo
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.release()
                print(f"       [SEM FRAMES] Stream aberto mas sem dados")
                continue

            # ─────────────────────────────────────────────────────────────────
            # STREAM ATIVO! Exibe informações e inicia loop de visualização
            # ─────────────────────────────────────────────────────────────────
            width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps    = cap.get(cv2.CAP_PROP_FPS)

            print(f"\n{'*'*60}")
            print(f"  *** STREAM RTSP ATIVO! ***")
            print(f"  URL      : {url}")
            print(f"  Resolucao: {width}x{height} @ {fps:.1f} FPS")
            print(f"{'*'*60}\n")
            print("  Controles:")
            print("  [Q] Sair  |  [S] Screenshot  |  [R] Reconectar\n")

            screenshot_count = 0
            frame_count = 0
            consecutive_failures = 0

            while True:
                ret, frame = cap.read()

                if not ret:
                    consecutive_failures += 1
                    if consecutive_failures >= 10:
                        print("[RTSP] Stream perdido após 10 falhas consecutivas.")
                        break
                    time.sleep(0.1)
                    continue

                consecutive_failures = 0
                frame_count += 1

                # Adiciona overlay com informações no frame
                overlay_text = [
                    f"DASHCAM EXPLORER | {url}",
                    f"Frame: {frame_count} | Resolucao: {width}x{height}",
                    f"Pressione Q=Sair  S=Screenshot  R=Reconectar",
                ]
                y_pos = 25
                for text in overlay_text:
                    # Sombra preta para legibilidade
                    cv2.putText(frame, text, (11, y_pos + 1),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
                    # Texto branco
                    cv2.putText(frame, text, (10, y_pos),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                    y_pos += 22

                # Ponto vermelho indicando gravação ao vivo
                cv2.circle(frame, (width - 20, 15), 8, (0, 0, 255), -1)
                cv2.putText(frame, "AO VIVO", (width - 80, 20),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

                cv2.imshow("Dashcam Explorer — Stream ao Vivo", frame)

                key = cv2.waitKey(1) & 0xFF

                if key == ord('q') or key == ord('Q'):
                    print("[RTSP] Usuário solicitou encerramento.")
                    break
                elif key == ord('s') or key == ord('S'):
                    screenshot_count += 1
                    filename = f"screenshot_{screenshot_count:03d}.jpg"
                    cv2.imwrite(filename, frame)
                    print(f"[RTSP] Screenshot salvo: {filename}")
                elif key == ord('r') or key == ord('R'):
                    print("[RTSP] Reconectando ao stream...")
                    cap.release()
                    time.sleep(1)
                    cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)

            cap.release()
            cv2.destroyAllWindows()
            return True

        except Exception as e:
            print(f"       ⚠️  Erro inesperado com {url}: {type(e).__name__}: {e}")

    print("\n[RTSP] Nenhuma URL RTSP funcionou.")
    return False


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 5 — FALLBACK: STREAM MJPEG VIA HTTP
# ══════════════════════════════════════════════════════════════════════════════

def try_mjpeg_stream(camera_ip: str) -> bool:
    """
    Tenta capturar stream MJPEG via HTTP — alternativa ao RTSP.

    LÓGICA:
        Algumas dashcams (especialmente as mais simples/econômicas) não
        implementam RTSP, mas expõem um stream MJPEG via HTTP.
        MJPEG = sequência de frames JPEG enviados num stream multipart HTTP.
        O Content-Type é: 'multipart/x-mixed-replace; boundary=...'

        OpenCV suporta nativamente: cv2.VideoCapture("http://ip:porta/caminho")

    Args:
        camera_ip: IP da câmera

    Returns:
        bool: True se stream MJPEG foi encontrado e exibido
    """
    # Paths comuns de MJPEG em câmeras embarcadas
    mjpeg_paths = [
        "/mjpeg",
        "/video.mjpg",
        "/stream.mjpeg",
        "/cgi-bin/mjpg/video.cgi",
        "/cgi-bin/livestream.cgi",
        "/videostream.cgi",
        "/?action=stream",
        "/live/stream",
        ":8080/video",
        ":4747/video",  # DroidCam / apps Android
    ]

    print(f"\n{'='*60}")
    print(f"  FALLBACK MJPEG HTTP -> {camera_ip}")
    print(f"{'='*60}")

    for path in mjpeg_paths:
        # Monta URL completa
        if path.startswith(":"):
            url = f"http://{camera_ip}{path}"
        else:
            url = f"http://{camera_ip}{path}"

        print(f"[MJPEG] Tentando: {url}")
        try:
            cap = cv2.VideoCapture(url)
            if cap.isOpened():
                ret, frame = cap.read()
                if ret and frame is not None:
                    print(f"  [OK] Stream MJPEG ativo: {url}")
                    # Loop de exibição (mesma lógica do RTSP)
                    while True:
                        ret, frame = cap.read()
                        if not ret:
                            break
                        cv2.imshow("Dashcam — Stream MJPEG", frame)
                        if cv2.waitKey(1) & 0xFF == ord('q'):
                            break
                    cap.release()
                    cv2.destroyAllWindows()
                    return True
            cap.release()
        except Exception as e:
            print(f"  ⚠️  Erro: {e}")

    return False


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 6 — RELATÓRIO FINAL E DIAGNÓSTICO
# ══════════════════════════════════════════════════════════════════════════════

def print_diagnostic_report(camera_ip: str, http_results: dict, rtsp_success: bool):
    """
    Exibe um relatório final consolidado com dicas para próximos passos.

    Args:
        camera_ip    : IP da câmera detectada
        http_results : Endpoints HTTP que responderam
        rtsp_success : Se o stream RTSP foi estabelecido com sucesso
    """
    print(f"\n{'='*60}")
    print(f"  RELATORIO FINAL DE DIAGNOSTICO")
    print(f"{'='*60}")
    print(f"  IP da Câmera : {camera_ip}")
    print(f"  Endpoints HTTP ativos : {len(http_results)}")
    print(f"  Stream RTSP  : {'[OK] Estabelecido' if rtsp_success else '[X] Nao conectado'}")

    if http_results:
        print(f"\n  ENDPOINTS HTTP ATIVOS:")
        for name, data in http_results.items():
            print(f"  → {name}")
            print(f"    {data['url']} [{data['status_code']}] ({data['response_size']} bytes)")

    if not rtsp_success and not http_results:
        print(f"\n  {'! '*30}")
        print(f"\n  CAMERA NAO RESPONDEU A NENHUM PROTOCOLO")
        print(f"\n  PRÓXIMOS PASSOS SUGERIDOS:")
        print(f"  1. Confirme que está conectado ao Wi-Fi correto da câmera.")
        print(f"     Execute: ipconfig (Windows) ou ip addr (Linux)")
        print(f"  2. Verifique o IP correto do Gateway executando: ipconfig | findstr Gateway")
        print(f"  3. Tente acessar manualmente no browser: http://{camera_ip}")
        print(f"  4. Verifique o manual da sua câmera para o endereço RTSP exato.")
        print(f"  5. Instale o app oficial da câmera no celular e monitore o tráfego de rede")
        print(f"     para identificar o endereço real (use Wireshark ou o app 'Stream What')")
        print(f"\n  INFORMAÇÕES ÚTEIS PARA DIAGNÓSTICO AVANÇADO:")
        print(f"  → Modelo exato da câmera (marca, modelo, firmware)")
        print(f"  → App oficial (para Android/iOS) — pode revelar os endpoints")
        print(f"  → Captura de tráfego Wireshark na interface Wi-Fi da câmera")

    print(f"\n{'='*60}\n")


# ══════════════════════════════════════════════════════════════════════════════
#  SEÇÃO 7 — PONTO DE ENTRADA PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def main():
    """
    Função principal — orquestra todo o processo de descoberta e conexão.

    FLUXO COMPLETO:
        1. Detecta o IP do Gateway (= IP da câmera no modo AP)
        2. Verifica conectividade via ICMP (ping)
        3. Escaneia endpoints HTTP em busca de API de controle
        4. Tenta abrir stream RTSP com OpenCV
        5. Fallback para stream MJPEG via HTTP
        6. Exibe relatório final com diagnóstico
    """
    print("""
+--------------------------------------------------------------+
|         DASHCAM EXPLORER - Versao 1.0                       |
|    Descoberta automatica de cameras veiculares via Wi-Fi     |
+--------------------------------------------------------------+
    """)

    # ── ETAPA 1: Detecção do IP da câmera ───────────────────────────────────
    camera_ip = get_default_gateway()

    if not camera_ip:
        print("\n[ERRO] Não foi possível detectar o IP da câmera automaticamente.")
        print("       Verifique sua conexão Wi-Fi e tente informar o IP manualmente.")

        # Solicita IP manualmente como fallback
        manual_ip = input("\nDigite o IP da câmera manualmente (ex: 192.168.1.1): ").strip()
        if manual_ip and _is_valid_ip(manual_ip):
            camera_ip = manual_ip
        else:
            print("[ERRO] IP inválido. Encerrando.")
            sys.exit(1)

    print(f"\n[INFO] IP da câmera identificado: {camera_ip}")

    # ── ETAPA 2: Verificação de conectividade (ICMP) ─────────────────────────
    print(f"\n[PING] Verificando conectividade com {camera_ip}...")
    if ping_host(camera_ip):
        print(f"[PING] [OK] Host {camera_ip} esta respondendo!")
    else:
        print(f"[PING] [!] Host {camera_ip} nao responde ao ping.")
        print(f"       Isso nao e necessariamente um problema -- alguns dispositivos")
        print(f"       bloqueiam ICMP mas ainda respondem HTTP/RTSP.")
        print(f"       Continuando o scan...\n")

    # ── ETAPA 3: Scan de Endpoints HTTP ──────────────────────────────────────
    print("\n[FASE 3] Iniciando mapeamento de endpoints HTTP...")
    http_results = try_http_ports(camera_ip)

    # ── ETAPA 4: Stream RTSP via OpenCV ──────────────────────────────────────
    print("\n[FASE 4] Iniciando busca por stream RTSP...")
    rtsp_success = try_rtsp_stream(camera_ip)

    # ── ETAPA 5: Fallback MJPEG (se RTSP falhou) ─────────────────────────────
    if not rtsp_success:
        print("\n[FASE 5] RTSP não funcionou. Tentando fallback MJPEG via HTTP...")
        mjpeg_success = try_mjpeg_stream(camera_ip)
        rtsp_success = mjpeg_success  # Reutiliza flag de sucesso

    # ── ETAPA 6: Relatório Final ──────────────────────────────────────────────
    print_diagnostic_report(camera_ip, http_results, rtsp_success)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[INFO] Execução interrompida pelo usuário (Ctrl+C).")
        cv2.destroyAllWindows()
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERRO CRÍTICO] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
