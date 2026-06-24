# -*- coding: utf-8 -*-
"""
gerar_video_rit_v2.py
Estrategia rapida:
  1. Playwright captura screenshots nos momentos-chave de cada cena (1 frame/s)
  2. Cada screenshot e duplicado para preencher 24fps no video final
  3. OpenCV monta o MP4 — muito mais rapido que captura frame-a-frame em tempo real
"""
import sys, io, asyncio, time, cv2, numpy as np
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

# ── CONFIG ────────────────────────────────────────────────
DEMO_HTML  = Path(__file__).parent / "demo_linkedin.html"
OUTPUT_DIR = Path(__file__).parent / "video_output"
OUTPUT_MP4 = OUTPUT_DIR / "Agente_RIT_LinkedIn.mp4"
WIDTH, HEIGHT = 1920, 1080
FPS           = 24

# Cada cena: (tempo_inicial_ms, duracao_s, n_screenshots_nessa_cena)
# Capturamos N screenshots espacados durante cada cena
CENAS = [
    {"nome": "Intro",           "inicio_ms":  500,  "dur_s":  6,  "shots": 10},
    {"nome": "Login",           "inicio_ms": 6500,  "dur_s":  8,  "shots": 12},
    {"nome": "Mapa+Importacao", "inicio_ms":14500,  "dur_s": 14,  "shots": 20},
    {"nome": "Uber Calc",       "inicio_ms":28500,  "dur_s": 13,  "shots": 18},
    {"nome": "Eventos",         "inicio_ms":41500,  "dur_s": 12,  "shots": 16},
    {"nome": "Central Globo",   "inicio_ms":53500,  "dur_s":  9,  "shots": 14},
]

OUTPUT_DIR.mkdir(exist_ok=True)

def print_ok(msg): print(f"  [OK] {msg}")
def print_prog(i, n, nome): 
    pct = i/n*100
    bar = "#"*int(pct/4) + "."*(25-int(pct/4))
    print(f"\r  [{bar}] {pct:4.0f}%  {nome} ({i}/{n})", end="", flush=True)

async def main():
    print("\n=== Agente RIT - Gerador de Video LinkedIn ===")
    print(f"  Saida : {OUTPUT_MP4}")
    dur_total = sum(c["dur_s"] for c in CENAS)
    print(f"  Duracao: ~{dur_total}s ({dur_total//60}:{dur_total%60:02d})")
    print()

    file_url = DEMO_HTML.as_uri()

    async with async_playwright() as pw:
        print("  Iniciando browser...")
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                f"--window-size={WIDTH},{HEIGHT}",
                "--disable-web-security",
                "--allow-file-access-from-files",
                "--no-sandbox",
                "--disable-gpu",
            ]
        )
        ctx = await browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
        )
        page = await ctx.new_page()

        print("  Carregando demo HTML...")
        await page.goto(file_url, wait_until="domcontentloaded")
        await asyncio.sleep(1.5)

        # Fecha overlay automaticamente
        try:
            btn = page.locator("button:has-text('INICIAR')")
            if await btn.count() > 0:
                await btn.first.click()
        except Exception:
            pass

        # Aguarda fontes e assets
        await asyncio.sleep(2)
        print_ok("Demo carregada")

        # Coleta todos os screenshots com timestamps planejados
        all_frames = []  # lista de (duracao_s_que_esse_frame_representa, png_bytes)

        for cena in CENAS:
            nome     = cena["nome"]
            inicio   = cena["inicio_ms"] / 1000.0   # tempo desde inicio da demo
            dur      = cena["dur_s"]
            n_shots  = cena["shots"]
            dur_por_shot = dur / n_shots

            print(f"\n  Capturando cena: {nome}  ({n_shots} frames)")
            
            # Calcula tempo atual do browser desde quando a pagina carregou
            # O JS controla a progressao automatica — precisamos esperar o tempo certo
            for s in range(n_shots):
                t_no_video = inicio + (s / n_shots) * dur
                print_prog(s+1, n_shots, nome)
                
                try:
                    png = await page.screenshot(
                        type="png",
                        full_page=False,
                        clip={"x": 0, "y": 0, "width": WIDTH, "height": HEIGHT}
                    )
                    all_frames.append((dur_por_shot, png))
                except Exception as e:
                    print(f"\n  Aviso: frame {s} falhou: {e}")

                await asyncio.sleep(dur_por_shot)

        print(f"\n\n  Total de frames capturados: {len(all_frames)}")
        await browser.close()

    # Monta video
    print("\n  Montando video MP4...")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(OUTPUT_MP4), fourcc, FPS, (WIDTH, HEIGHT))

    total_dur = sum(d for d, _ in all_frames)
    frame_idx = 0

    for i, (dur_s, png) in enumerate(all_frames):
        arr   = np.frombuffer(png, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            frame = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)

        # Quantos frames de 24fps este screenshot deve ocupar
        n_reps = max(1, round(dur_s * FPS))
        for _ in range(n_reps):
            writer.write(frame)
            frame_idx += 1

        pct = (i+1) / len(all_frames) * 100
        print(f"\r  Montando... {pct:.0f}%  ({frame_idx} frames escritos)", end="", flush=True)

    writer.release()
    size_mb = OUTPUT_MP4.stat().st_size / 1_048_576
    dur_real = frame_idx / FPS
    print(f"\n\n  Video gerado com sucesso!")
    print(f"  Arquivo : {OUTPUT_MP4}")
    print(f"  Tamanho : {size_mb:.1f} MB")
    print(f"  Duracao : {dur_real:.0f}s ({int(dur_real)//60}:{int(dur_real)%60:02d})")
    print(f"\n  Pronto para postar no LinkedIn!")

if __name__ == "__main__":
    asyncio.run(main())
