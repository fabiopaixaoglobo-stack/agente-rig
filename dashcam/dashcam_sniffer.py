"""
================================================================================
  DASHCAM NETWORK SNIFFER — Análise de Tráfego para Descoberta de Endpoints
================================================================================
  USO: Quando o dashcam_explorer.py não encontrar os endpoints corretos,
       este script monitora o tráfego entre o app oficial (ex: no celular)
       e a câmera para descobrir os endereços exatos usados pelo fabricante.

  DEPENDÊNCIAS:
      pip install requests scapy

  EXECUÇÃO (requer privilégios de administrador):
      python dashcam_sniffer.py

  ALTERNATIVA SEM SCAPY:
      Use o Wireshark (GUI) — captura na interface Wi-Fi da câmera
      e filtre por: ip.addr == [IP_DA_CAMERA]
================================================================================
"""

import sys
import time
import platform
import subprocess
from typing import Optional

try:
    import requests
except ImportError:
    print("Instale: pip install requests")
    sys.exit(1)


def check_camera_services(ip: str):
    """
    Verifica quais serviços (portas) estão ativos na câmera usando socket scan.
    Mais seguro e leve que usar nmap — não requer instalação extra.

    Portas verificadas e seus significados:
        21   FTP   → Câmeras com acesso FTP ao SD card
        22   SSH   → Raro, mas algumas câmeras têm SSH habilitado
        23   Telnet→ Câmeras mais antigas / firmwares de debug
        80   HTTP  → Interface web de controle (maioria)
        443  HTTPS → Interface web segura
        554  RTSP  → Stream de vídeo (protocolo padrão)
        1935 RTMP  → Stream alternativo (Flash/HLS)
        3000 HTTP  → Alguns firmwares usam porta 3000
        8080 HTTP  → Porta alternativa HTTP muito comum
        8554 RTSP  → Porta RTSP alternativa
        8888 HTTP  → Outra alternativa HTTP
        9000 HTTP  → Padrão em câmeras Synology/algumas IP cams
        34567 Privado → Protocolo proprietário (câmeras chinesas Dahua clone)
        37777 Privado → Protocolo Dahua proprietário
    """
    import socket

    ALL_PORTS = {
        21:    "FTP (acesso ao SD)",
        22:    "SSH (administração)",
        23:    "Telnet (console legado)",
        80:    "HTTP (interface web)",
        443:   "HTTPS (interface segura)",
        554:   "RTSP (stream padrão)",
        1935:  "RTMP (stream alternativo)",
        3000:  "HTTP alternativo",
        8080:  "HTTP alternativo 2",
        8554:  "RTSP alternativo",
        8888:  "HTTP alternativo 3",
        9000:  "HTTP alternativo 4",
        34567: "Protocolo proprietário (Dahua clone)",
        37777: "Protocolo Dahua proprietário",
    }

    print(f"\n{'═'*55}")
    print(f"  PORT SCANNER → {ip}")
    print(f"{'═'*55}")
    print(f"  {'PORTA':<8} {'SERVIÇO':<30} {'STATUS'}")
    print(f"  {'-'*50}")

    open_ports = []

    for port, service in ALL_PORTS.items():
        try:
            with socket.create_connection((ip, port), timeout=2) as s:
                print(f"  {port:<8} {service:<30} ✅ ABERTA")
                open_ports.append((port, service))
        except (socket.timeout, ConnectionRefusedError, OSError):
            print(f"  {port:<8} {service:<30} ❌ Fechada")

    print(f"\n  → {len(open_ports)} portas abertas encontradas.")

    if open_ports:
        print(f"\n  PORTAS ATIVAS:")
        for port, service in open_ports:
            print(f"  → {port}/TCP ({service})")

    return open_ports


def try_ftp_access(ip: str, port: int = 21):
    """
    Tenta acessar o cartão SD via FTP — protocolo suportado por algumas dashcams.

    LÓGICA: Câmeras com servidor FTP permitem acesso direto aos arquivos
    de vídeo/foto sem precisar de API proprietária.

    Credenciais testadas (padrão de fábrica comuns):
        anonymous / (sem senha)
        admin     / (sem senha)
        admin     / admin
        admin     / 12345
        user      / user
    """
    import ftplib

    credentials = [
        ("anonymous", ""),
        ("admin", ""),
        ("admin", "admin"),
        ("admin", "12345"),
        ("user", "user"),
    ]

    print(f"\n[FTP] Tentando acesso FTP em {ip}:{port}...")

    for user, passwd in credentials:
        try:
            ftp = ftplib.FTP()
            ftp.connect(ip, port, timeout=5)
            ftp.login(user, passwd)

            print(f"  ✅ FTP conectado! Usuário: {user} / Senha: '{passwd}'")
            print(f"  Diretório raiz:")

            files = []
            ftp.retrlines('LIST', lambda x: files.append(x))
            for f in files:
                print(f"    {f}")

            ftp.quit()
            return True

        except ftplib.error_perm as e:
            print(f"  ❌ Auth falhou ({user}/{passwd}): {e}")
        except Exception as e:
            print(f"  ❌ Erro FTP: {type(e).__name__}: {e}")
            break

    return False


def generate_discovery_report(ip: str, open_ports: list):
    """
    Gera um relatório com sugestões baseadas nas portas abertas.

    Args:
        ip         : IP da câmera
        open_ports : Lista de (porta, serviço) encontrados abertos
    """
    print(f"\n{'═'*55}")
    print(f"  GUIA DE PRÓXIMOS PASSOS")
    print(f"{'═'*55}")

    port_numbers = [p for p, _ in open_ports]

    if 80 in port_numbers or 8080 in port_numbers:
        port = 80 if 80 in port_numbers else 8080
        print(f"\n  1. ACESSO HTTP DETECTADO (porta {port})")
        print(f"     Abra no browser: http://{ip}:{port}")
        print(f"     Execute o dashcam_explorer.py para scan completo de APIs")

    if 554 in port_numbers or 8554 in port_numbers:
        port = 554 if 554 in port_numbers else 8554
        print(f"\n  2. RTSP DETECTADO (porta {port})")
        print(f"     Teste no VLC: Mídia → Abrir stream de rede")
        print(f"     URL: rtsp://{ip}:{port}/")
        print(f"     Ou use o dashcam_explorer.py para scan automático de paths")

    if 21 in port_numbers:
        print(f"\n  3. FTP DETECTADO")
        print(f"     Acesse os arquivos com: ftp://{ip}")
        print(f"     Ou use um cliente FTP (FileZilla) com as credenciais padrão")

    if 22 in port_numbers:
        print(f"\n  4. SSH DETECTADO (avançado)")
        print(f"     ssh admin@{ip}")
        print(f"     Pode permitir acesso total ao sistema da câmera")

    if 23 in port_numbers:
        print(f"\n  5. TELNET DETECTADO (avançado / inseguro)")
        print(f"     telnet {ip}")

    if not open_ports:
        print(f"\n  ⚠️  NENHUMA PORTA ABERTA DETECTADA")
        print(f"\n  SOLUÇÕES POSSÍVEIS:")
        print(f"  A. Verifique se está conectado ao Wi-Fi correto da câmera")
        print(f"  B. Confirme o IP correto: execute 'ipconfig' no CMD")
        print(f"  C. Desligue e religue a câmera")
        print(f"  D. Verifique o manual para localizar o IP padrão")
        print(f"  E. Considere usar Wireshark + App oficial para capturar o tráfego")
        print(f"\n  COMANDO WIRESHARK (filtro sugerido após abrir o app da câmera):")
        print(f"     ip.addr == {ip} && (http || rtsp || rtcp || rtp)")

    print(f"\n  INFORMAÇÕES QUE ACELERAM O DIAGNÓSTICO:")
    print(f"  ─────────────────────────────────────────")
    print(f"  □ Marca e modelo exato da câmera")
    print(f"  □ Versão do firmware (exibida no display ou app)")
    print(f"  □ Nome completo do SSID do Wi-Fi da câmera")
    print(f"  □ Resultado do 'ipconfig' quando conectado à câmera")
    print(f"  □ Screenshot da tela inicial do app oficial")
    print(f"  □ Número do chip: Novatek, Ambarella, Rockchip, AllWinner, etc.")
    print(f"\n{'═'*55}\n")


def main():
    print("""
╔══════════════════════════════════════════════════════════════╗
║     DASHCAM NETWORK SNIFFER — Análise de Serviços v1.0      ║
║         Escaneie portas e serviços da sua dashcam            ║
╚══════════════════════════════════════════════════════════════╝
    """)

    # IP pode ser passado como argumento ou detectado automaticamente
    if len(sys.argv) > 1:
        ip = sys.argv[1]
        print(f"[INFO] Usando IP fornecido: {ip}")
    else:
        # Tenta detectar automaticamente (igual ao dashcam_explorer.py)
        import socket
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                local_ip = s.getsockname()[0]
            parts = local_ip.rsplit(".", 1)
            ip = f"{parts[0]}.1"
            print(f"[INFO] IP detectado automaticamente: {ip}")
        except Exception:
            ip = input("Digite o IP da câmera: ").strip()

    # Scan de portas
    open_ports = check_camera_services(ip)

    # Tenta FTP se porta 21 está aberta
    if any(p == 21 for p, _ in open_ports):
        try_ftp_access(ip)

    # Relatório final
    generate_discovery_report(ip, open_ports)


if __name__ == "__main__":
    main()
