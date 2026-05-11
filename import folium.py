import folium
import requests
import polyline
from datetime import datetime, timedelta
from geopy.geolocators import Nominatim
from groq import Groq
import os # Para gerenciar o arquivo HTML do mapa
import logging
import json
import sys

# --- CONFIGURAÇÃO DE LOGS (JSON) ---
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage()
        }
        if hasattr(record, "extra_info"):
            log_record.update(record.extra_info)
        return json.dumps(log_record)

logger = logging.getLogger("AgenteRIG")
logger.setLevel(logging.INFO)
log_handler = logging.StreamHandler(sys.stdout)
log_handler.setFormatter(JsonFormatter())
logger.addHandler(log_handler)

# --- CONFIGURAÇÃO MASTER ---
# Chave Groq: defina GROQ_API_KEY no ambiente (nunca commite chaves no repositório).
MINHA_API_KEY_GROQ = os.getenv("GROQ_API_KEY", "").strip()

# Inicializa o cliente Groq e o geolocator Nominatim
try:
    client_rig = Groq(api_key=MINHA_API_KEY_GROQ) if MINHA_API_KEY_GROQ else None
    if client_rig:
        logger.info("Conectado à API da Groq.", extra={"extra_info": {"servico": "LLM", "status": "success"}})
        print("\n✅ Conectado à API da Groq.")
    else:
        logger.warning("GROQ_API_KEY não definida; briefing por IA ficará desativado.", extra={"extra_info": {"servico": "LLM", "status": "skipped"}})
        print("\n⚠️ GROQ_API_KEY não definida no ambiente. Exporte a variável para usar a Groq.")
except Exception as e:
    logger.error("Falha ao conectar à API da Groq.", extra={"extra_info": {"erro": str(e)}})
    print(f"\n❌ ERRO: Falha ao conectar à API da Groq. Verifique sua chave. Erro: {e}")
    client_rig = None # Garante que client_rig seja None se a conexão falhar
geolocator = Nominatim(user_agent="Agente_RIG_Global_VSC")

# --- MOTOR DE INCIDENTES (REAL-TIME AGGREGATOR) ---
def get_current_risks():
    """Simula a obtenção de dados de risco em tempo real."""
    h_site = (datetime.now() - timedelta(minutes=5)).strftime("%H:%M")
    return [
        {"fonte": "OTT-RJ", "tipo": "Tiroteio", "coord": [-22.848, -43.242], "local": "Maré", "color": "darkred", "icon": "shield-alt"},
        {"fonte": "COR-RIO", "tipo": "Interdição", "coord": [-22.924, -43.342], "local": "Linha Amarela", "color": "orange", "icon": "exclamation-triangle"},
        {"fonte": "PMERJ", "tipo": "Operação", "coord": [-22.935, -43.355], "local": "Jacarepaguá", "color": "blue", "icon": "police-box"}
    ]

# --- FUNÇÕES DE GEOLOCALIZAÇÃO ---
def get_precise_addr(lat, lon):
    """Converte coordenadas em um endereço legível."""
    try:
        loc = geolocator.reverse(f"{lat}, {lon}", timeout=10)
        a = loc.raw['address']
        return f"{a.get('road', 'Via Desconhecida')}, {a.get('house_number', 'S/N')} - {a.get('suburb', a.get('neighbourhood', 'RJ'))}"
    except: 
        return f"Coord: {lat}, {lon}"

def resolve_location(query):
    """Resolve uma string de endereço ou coordenada para [latitude, longitude]."""
    try:
        if ',' in query and any(c.isdigit() for c in query): # Parece ser coordenada
            return [float(x.strip()) for x in query.split(',')]
        # Tenta geocodificar o endereço
        l = geolocator.geocode(query + ", Rio de Janeiro, Brasil", timeout=10)
        if l:
            return [l.latitude, l.longitude]
        logger.warning(f"Não foi possível resolver a localização.", extra={"extra_info": {"query": query}})
        print(f"❌ Erro: Não foi possível resolver a localização para '{query}'. Tentando como coordenada pura...")
        return None
    except Exception as e:
        logger.error(f"Erro ao resolver localização", extra={"extra_info": {"query": query, "erro": str(e)}})
        print(f"❌ Erro ao resolver localização '{query}': {e}")
        return None

# --- FUNÇÃO PRINCIPAL DE EXECUÇÃO DO RIG ---
def run_rig_analysis():
    print("\n--- AGENTE RIG | ANÁLISE PREDITIVA ---")
    
    # 1. ENTRADAS DO USUÁRIO
    origem_query = input("📍 Digite a Origem (Endereço ou Lat,Lon): ")
    parada_query = input("📍 Digite a Parada (Opcional - Endereço ou Lat,Lon): ")
    destino_query = input("🏁 Digite o Destino (Endereço ou Lat,Lon): ")
    
    # Seleção de Modal (simplificada para script)
    modal_options = [('Passeio', 1.5), ('Van Executiva', 3.0), ('Transporte Carga', 4.5), ('Ônibus Plateia', 6.0)]
    print("\n🚍 Selecione o Modal:")
    for i, (name, factor) in enumerate(modal_options):
        print(f"{i+1}. {name}")
    modal_choice = int(input("Escolha o número do modal (1-4): ")) - 1
    selected_modal_name, selected_modal_factor = modal_options[modal_choice]

    print("\n📡 RIG: Sincronizando Malha de Risco e Roteirização...")

    try:
        raw_pts = [origem_query]
        if parada_query.strip(): # Adiciona parada apenas se for fornecida
            raw_pts.append(parada_query)
        raw_pts.append(destino_query)

        coords = [resolve_location(p) for p in raw_pts if p.strip()]
        coords = [c for c in coords if c is not None] # Remove None se alguma resolução falhou

        if len(coords) < 2:
            print("❌ ERRO: Defina ao menos Origem e Destino válidos.")
            return

        # 2. Rota OSRM Robusta
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{';'.join([f'{c[1]},{c[0]}' for c in coords])}?overview=full&steps=true"
        res = requests.get(osrm_url).json()

        if not res or 'routes' not in res or not res['routes']:
            print("❌ ERRO: Não foi possível calcular a rota com os pontos fornecidos.")
            return

        geom = polyline.decode(res['routes'][0]['geometry'])
        km = res['routes'][0]['distance']/1000
        minutos = res['routes'][0]['duration']/60

        logger.info("Rota calculada", extra={"extra_info": {"distancia_km": round(km, 2), "minutos": round(minutos, 2), "modal": selected_modal_name}})

        # 3. Análise de Risco Otimizada (Bounding Box Primário + Checagem Fina)
        riscos_atuais = get_current_risks()
        impactos = []
        if geom:
            # Bounding Box da rota (O(1) para checar)
            min_lat, max_lat = min(p[0] for p in geom) - 0.008, max(p[0] for p in geom) + 0.008
            min_lon, max_lon = min(p[1] for p in geom) - 0.008, max(p[1] for p in geom) + 0.008
            
            for i in riscos_atuais:
                inc_lat, inc_lon = i['coord']
                # Filtro rápido (Bounding Box)
                if min_lat <= inc_lat <= max_lat and min_lon <= inc_lon <= max_lon:
                    # Busca fina apenas se passar no filtro rápido
                    if any(abs(p[0]-inc_lat) < 0.008 and abs(p[1]-inc_lon) < 0.008 for p in geom):
                        impactos.append(i)

        logger.info("Análise de Risco concluída", extra={"extra_info": {"incidentes_detectados": len(impactos)}})

        # 4. Briefing IA (se a conexão Groq estiver OK)
        txt_ia = "Não foi possível gerar briefing (problema de conexão com a IA)."
        if client_rig:
            brief_prompt = f"Relatório Técnico Fábio Paixão. Rota de {km:.1f}km. Modal: {selected_modal_name}. Alertas: {impactos}. Sugira ação imediata (5 linhas)."
            try:
                completion = client_rig.chat.completions.create(model="llama-3.1-8b-instant", messages=[{"role":"user","content": brief_prompt}])
                txt_ia = completion.choices[0].message.content
            except Exception as e:
                txt_ia = f"Erro ao gerar briefing da IA: {e}"
                print(f"❌ Atenção: {txt_ia}")

        # 5. Saída no Terminal
        print("\n--- BRIEFING AGENTE RIG ---")
        print(f"Risco na Rota: {'⚠️ DETECTADO' if impactos else '✅ SEGURO'}")
        print(f"Distância Total: {km:.2f} KM")
        print(f"Tempo Estimado: {minutos:.0f} Minutos")
        print(f"Modal Selecionado: {selected_modal_name}")
        print("\n" + txt_ia)

        # 6. Renderização do Mapa para HTML
        map_location = coords[0] if coords else [-22.9068, -43.1729] # Ponto padrão se coords estiver vazio
        m = folium.Map(location=map_location, zoom_start=12, tiles='OpenStreetMap') # ALTERADO PARA OpenStreetMap
        
        if geom: # Só desenha a PolyLine se houver geometria da rota
            folium.PolyLine(geom, color='#FF0000' if impactos else '#00A3FF', weight=8, opacity=0.8).add_to(m)

        for i, c in enumerate(coords):
            tooltip_text = f"Ponto {i+1}: {get_precise_addr(c[0], c[1])}"
            folium.Marker(c, tooltip=tooltip_text, icon=folium.Icon(color='black', icon='map-pin', prefix='fa')).add_to(m)

        for i in riscos_atuais:
            # Usando .get() com um fallback para garantir que o ícone seja válido
            folium.Marker(i['coord'], popup=f"{i['tipo']}: {i['local']}", icon=folium.Icon(color=i.get('color', 'red'), icon=i.get('icon', 'exclamation-triangle'), prefix='fa')).add_to(m)
        
        map_filename = "mapa_agente_rig.html"
        m.save(map_filename)
        print(f"\n🗺️ Mapa gerado com sucesso: {os.path.abspath(map_filename)}")
        print("Abra este arquivo HTML no seu navegador para visualizar a rota e os alertas.\n")

    except Exception as e:
        logger.error("ERRO GERAL NO PROCESSAMENTO", extra={"extra_info": {"erro": str(e)}})
        print(f"❌ ERRO GERAL NO PROCESSAMENTO: {e}")

# Executa a função principal quando o script é chamado
if __name__ == "__main__":
    run_rig_analysis()
