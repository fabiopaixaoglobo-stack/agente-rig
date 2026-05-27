# DASHCAM EXPLORER — Guia de Uso

Conjunto de scripts Python para descoberta automática e acesso a câmeras veiculares (Dashcams) conectadas via Wi-Fi.

---

## 📂 Arquivos

| Arquivo | Função |
|---|---|
| `dashcam_explorer.py` | Script principal — detecta IP, escaneia endpoints HTTP e abre stream RTSP/MJPEG |
| `dashcam_sniffer.py`  | Script auxiliar — escaneia portas TCP para descobrir quais serviços estão ativos |
| `requirements.txt`    | Dependências Python |

---

## ⚙️ Instalação

```powershell
# 1. Acesse a pasta
cd "c:\Users\fapaixao\OneDrive\Agente RIG\dashcam"

# 2. (Opcional) Crie ambiente virtual
python -m venv .venv
.venv\Scripts\activate

# 3. Instale as dependências
pip install -r requirements.txt
```

---

## 🚀 Como Usar

### Passo 1 — Conecte ao Wi-Fi da câmera
- No Windows: Configurações → Wi-Fi → Selecione o SSID da câmera (ex: `H30D-DC1E4BF5`)

### Passo 2 — Execute o script principal
```powershell
python dashcam_explorer.py
```

### Passo 3 — Se nada funcionar, use o scanner de portas
```powershell
python dashcam_sniffer.py
# ou com IP explícito:
python dashcam_sniffer.py 192.168.1.1
```

---

## 🔍 Protocolos Suportados

| Protocolo | Porta(s) | Uso |
|---|---|---|
| **HTTP** | 80, 8080, 8000, 81 | API REST/CGI de controle |
| **RTSP** | 554, 8554, 1935 | Stream de vídeo ao vivo |
| **MJPEG** | 80, 8080 | Stream alternativo (câmeras simples) |
| **FTP** | 21 | Acesso aos arquivos do SD card |

---

## 🎮 Controles durante o stream de vídeo

| Tecla | Ação |
|---|---|
| `Q` | Sair |
| `S` | Salvar screenshot (JPEG) |
| `R` | Reconectar ao stream |

---

## ℹ️ Informações Úteis para Diagnóstico Avançado

Se o script não encontrar a câmera automaticamente, colete e envie estas informações:

1. **Modelo exato** da câmera (marca, modelo, versão de firmware)
2. **SSID completo** do Wi-Fi da câmera
3. **Resultado do `ipconfig`** quando conectado ao Wi-Fi da câmera (CMD → `ipconfig /all`)
4. **App oficial** (iOS/Android) — nome e versão
5. **Captura de tela** do app oficial funcionando

Com essas informações é possível identificar o firmware e os endpoints exatos.
