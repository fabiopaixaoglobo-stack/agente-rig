/***********************************************************************
 * AGENTE RIG – SCRIPT PRINCIPAL
 * Versão: FULL / SIMULADA / OPERACIONAL
 * Compatível com Render (Static Site)
 * NÃO requer backend
 ***********************************************************************/

/* =======================
   VARIÁVEIS GLOBAIS
======================= */

let MAPA = null;
let CAMADA_VEICULOS = null;
let CAMADA_OCORRENCIAS = null;
let CAMADA_CLIMA = null;
let BASE_ATENDIMENTOS = [];
let BASE_VEICULOS_SIMULADOS = [];
let BASE_OCORRENCIAS_SIMULADAS = [];

/* =======================
   INICIALIZAÇÃO
======================= */

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapa();
  inicializarUpload();
  carregarBasesSimuladas();
  renderizarCamadasSimuladas();
  
  // Funções restauradas:
  inicializarAbas();
  inicializarPlanejador();
  inicializarChatbot();
});

/* =======================
   MAPA
======================= */

function inicializarMapa() {
  MAPA = L.map("map", {
    center: [-22.9068, -43.1729],
    zoom: 11,
    zoomControl: true
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(MAPA);

  CAMADA_VEICULOS = L.layerGroup().addTo(MAPA);
  CAMADA_OCORRENCIAS = L.layerGroup().addTo(MAPA);
  CAMADA_CLIMA = L.layerGroup().addTo(MAPA);
}

/* =======================
   BASES SIMULADAS
======================= */

function carregarBasesSimuladas() {
  BASE_VEICULOS_SIMULADOS = [
    criarVeiculoSimulado("RJ-404-01", -22.92, -43.18, "VAN", "EM ROTA"),
    criarVeiculoSimulado("RJ-404-02", -22.95, -43.22, "CAMINHÃO", "PARADO"),
    criarVeiculoSimulado("RJ-404-03", -22.89, -43.25, "CARRO", "EM ROTA"),
    criarVeiculoSimulado("RJ-404-04", -22.91, -43.15, "SUV", "EM ROTA")
  ];

  BASE_OCORRENCIAS_SIMULADAS = [
    criarOcorrenciaSimulada("ACIDENTE", "ALTA", -22.93, -43.20),
    criarOcorrenciaSimulada("CHUVA FORTE", "MEDIA", -22.88, -43.19),
    criarOcorrenciaSimulada("ÁREA SENSÍVEL", "MEDIA", -22.97, -43.23)
  ];
}

function criarVeiculoSimulado(id, lat, lng, tipo, status) {
  return {
    id,
    lat,
    lng,
    tipo,
    status,
    velocidade: Math.floor(Math.random() * 60) + 10,
    atualizadoEm: new Date().toLocaleTimeString("pt-BR")
  };
}

function criarOcorrenciaSimulada(tipo, gravidade, lat, lng) {
  return {
    tipo,
    gravidade,
    lat,
    lng,
    hora: new Date().toLocaleTimeString("pt-BR")
  };
}

/* =======================
   RENDERIZAÇÃO SIMULADA
======================= */

function renderizarCamadasSimuladas() {
  CAMADA_VEICULOS.clearLayers();
  CAMADA_OCORRENCIAS.clearLayers();
  CAMADA_CLIMA.clearLayers();

  BASE_VEICULOS_SIMULADOS.forEach(v => {
    const marker = L.circleMarker([v.lat, v.lng], {
      radius: 7,
      color: "#00ff88",
      fillOpacity: 0.9
    }).bindPopup(`
      <b>Veículo:</b> ${v.id}<br>
      <b>Tipo:</b> ${v.tipo}<br>
      <b>Status:</b> ${v.status}<br>
      <b>Velocidade:</b> ${v.velocidade} km/h
    `);

    CAMADA_VEICULOS.addLayer(marker);
  });

  BASE_OCORRENCIAS_SIMULADAS.forEach(o => {
    const cor = o.gravidade === "ALTA" ? "red" : "orange";

    const marker = L.circleMarker([o.lat, o.lng], {
      radius: 9,
      color: cor,
      fillOpacity: 0.7
    }).bindPopup(`
      <b>Ocorrência:</b> ${o.tipo}<br>
      <b>Gravidade:</b> ${o.gravidade}<br>
      <b>Hora:</b> ${o.hora}
    `);

    CAMADA_OCORRENCIAS.addLayer(marker);
  });

  const clima = L.circleMarker([-22.91, -43.17], {
    radius: 14,
    color: "#4da3ff",
    fillOpacity: 0.4
  }).bindPopup(`
    <b>Clima (simulado)</b><br>
    Temperatura: 26°C<br>
    Chuva: moderada<br>
    Vento: 18 km/h
  `);

  CAMADA_CLIMA.addLayer(clima);
}

/* =======================
   UPLOAD DA PLANILHA
======================= */

function inicializarUpload() {
  const btn = document.getElementById("btn-upload");
  const input = document.getElementById("upload-mapa");

  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", processarPlanilha);
}

function processarPlanilha(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = evt => {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    BASE_ATENDIMENTOS = normalizarPlanilha(linhas);

    atualizarResumo(BASE_ATENDIMENTOS);
    renderizarLista(BASE_ATENDIMENTOS);
    plotarAtendimentosNoMapa(BASE_ATENDIMENTOS);
  };

  reader.readAsArrayBuffer(file);
}

/* =======================
   NORMALIZAÇÃO DA PLANILHA
======================= */

function normalizarPlanilha(linhas) {
  return linhas.map(l => {
    const tipoVeiculo = texto(l["Tipo de Veículo"]).toUpperCase();
    const placa = texto(l["Placa Veículo"]);

    if (!placa || tipoVeiculo === "AJUDANTE") return null;

    return {
      motorista: texto(l["Motorista"]),
      prestador: texto(l["Prestador do veículo"]),
      tipoVeiculo: texto(l["Tipo de Veículo"]),
      passageiro: texto(l["Passageiro"]),
      hora: extrairHora(l["Data Hora"]),
      bairro: extrairBairro(l["Localidade + Endereço"]),
      programa: extrairPrograma(l["Programa"]),
      placa,
      lat: gerarLatitudeSimulada(),
      lng: gerarLongitudeSimulada()
    };
  }).filter(Boolean);
}

function texto(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function extrairHora(v) {
  const m = String(v).match(/(\d{1,2}:\d{2})/);
  return m ? m[1] : "";
}

function extrairBairro(v) {
  const partes = String(v).split(",").map(p => p.trim()).filter(Boolean);
  return partes[partes.length - 1] || "";
}

function extrairPrograma(v) {
  if (!v) return "";
  const partes = String(v).split(" - ");
  const alvo = partes.reverse().find(p => p.includes("/")) || partes[0];
  let nome = alvo.split("/")[0];
  nome = nome.replace(/\d{4}(\/\d{4})?/g, "").trim();
  return nome;
}

/* =======================
   COORDENADAS SIMULADAS
======================= */

function gerarLatitudeSimulada() {
  return -22.85 - Math.random() * 0.15;
}

function gerarLongitudeSimulada() {
  return -43.10 - Math.random() * 0.20;
}

/* =======================
   MAPA – ATENDIMENTOS
======================= */

function plotarAtendimentosNoMapa(lista) {
  lista.forEach(a => {
    const marker = L.marker([a.lat, a.lng]).bindPopup(`
      <b>${a.programa}</b><br>
      <b>Motorista:</b> ${a.motorista}<br>
      <b>Veículo:</b> ${a.tipoVeiculo}<br>
      <b>Hora:</b> ${a.hora}<br>
      <b>Bairro:</b> ${a.bairro}
    `);

    CAMADA_VEICULOS.addLayer(marker);
  });
}

/* =======================
   RESUMO
======================= */

function atualizarResumo(lista) {
  const el = document.getElementById("dadosResumo");

  const total = lista.length;
  const porPrograma = contar(lista, "programa");
  const porBairro = contar(lista, "bairro");

  el.innerHTML = `
    <b>Total de veículos:</b> ${total}<br><br>
    <b>Por Programa:</b><br>
    ${formatarResumo(porPrograma)}<br>
    <b>Por Bairro:</b><br>
    ${formatarResumo(porBairro)}
  `;
}

function contar(lista, campo) {
  return lista.reduce((acc, i) => {
    acc[i[campo]] = (acc[i[campo]] || 0) + 1;
    return acc;
  }, {});
}

function formatarResumo(obj) {
  return Object.entries(obj)
    .sort((a,b) => b[1] - a[1])
    .slice(0,6)
    .map(([k,v]) => `${k}: ${v}`)
    .join("<br>");
}

/* =======================
   LISTA
======================= */

function renderizarLista(lista) {
  const el = document.getElementById("listaAtendimentos");
  el.innerHTML = lista.map(i => `
    <div class="card">
      <div class="linha1">
        <span>${i.programa}</span>
        <span>${i.hora}</span>
      </div>
      <div><b>Motorista:</b> ${i.motorista}</div>
      <div><b>Prestador:</b> ${i.prestador}</div>
      <div><b>Veículo:</b> ${i.tipoVeiculo} • ${i.placa}</div>
      <div><b>Passageiro:</b> ${i.passageiro}</div>
      <div><b>Bairro:</b> ${i.bairro}</div>
    </div>
  `).join("");
}

/* =======================
   NAVEGAÇÃO DE ABAS
======================= */
function inicializarAbas() {
  const botoes = document.querySelectorAll('.tabBtn');
  const conteudos = document.querySelectorAll('.tabPane');

  botoes.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove ativo de todos
      botoes.forEach(b => b.classList.remove('active'));
      conteudos.forEach(c => c.classList.remove('active'));

      // Adiciona ativo no clicado
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const painel = document.getElementById(tabId);
      if(painel) painel.classList.add('active');

      // Corrige o tamanho do mapa caso ele esteja escondido
      setTimeout(() => {
        if(MAPA) MAPA.invalidateSize();
        if(MAPA_PLANNER) MAPA_PLANNER.invalidateSize();
      }, 300);
    });
  });
}

/* =======================
   PLANEJADOR DE ROTAS
======================= */
let MAPA_PLANNER = null;

function inicializarPlanejador() {
  const mapEl = document.getElementById("mapPlanner");
  if(!mapEl) return;

  MAPA_PLANNER = L.map("mapPlanner", {
    center: [-22.9068, -43.1729],
    zoom: 11
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(MAPA_PLANNER);

  const btnRota = document.getElementById('btn-rota');
  if(btnRota) {
    btnRota.addEventListener('click', () => {
      const origem = document.getElementById('origem').value;
      const destino = document.getElementById('destino').value;
      const feedback = document.getElementById('plannerFeedback');

      if(!origem || !destino) {
        feedback.innerHTML = '<span style="color:#d32f2f">Por favor, informe a origem e o destino.</span>';
        return;
      }

      feedback.innerHTML = 'Calculando rota e simulando custos...';
      
      setTimeout(() => {
        // Limpa rota anterior
        MAPA_PLANNER.eachLayer((layer) => {
          if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            MAPA_PLANNER.removeLayer(layer);
          }
        });

        // Coordenadas simuladas para a rota
        const lat1 = -22.90 + (Math.random() * 0.1);
        const lon1 = -43.20 + (Math.random() * 0.1);
        const lat2 = -22.95 + (Math.random() * 0.1);
        const lon2 = -43.25 + (Math.random() * 0.1);

        L.marker([lat1, lon1]).addTo(MAPA_PLANNER).bindPopup('Origem: ' + origem).openPopup();
        L.marker([lat2, lon2]).addTo(MAPA_PLANNER).bindPopup('Destino: ' + destino);
        L.polyline([[lat1, lon1], [lat2, lon2]], {color: 'blue', weight: 5}).addTo(MAPA_PLANNER);
        MAPA_PLANNER.fitBounds([[lat1, lon1], [lat2, lon2]]);

        const distancia = (Math.random() * 15 + 5).toFixed(1);
        const custoSimulado = (Math.random() * 50 + 20).toFixed(2);
        
        feedback.innerHTML = `
          <strong style="color:green">✔ Rota traçada!</strong><br>
          <b>Distância:</b> ${distancia} km<br>
          <b>Custo Estimado (Uber):</b> R$ ${custoSimulado}
        `;
      }, 1000);
    });
  }
}

/* =======================
   CONSULTOR DE NORMAS (CHATBOT)
======================= */
function inicializarChatbot() {
  const btnEnviar = document.getElementById('btn-enviar');
  const inputPergunta = document.getElementById('pergunta');
  const chatBox = document.getElementById('chat');

  function enviarMensagem() {
    const texto = inputPergunta.value.trim();
    if(!texto) return;

    chatBox.innerHTML += `<div class="msg user" style="text-align: right; margin-top: 15px; color: #0056b3;"><b>Você:</b> ${texto}</div>`;
    inputPergunta.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    setTimeout(() => {
      let resposta = "Desculpe, não encontrei uma norma específica. Em caso de dúvidas complexas, acione o Centro de Comando.";
      const txt = texto.toLowerCase();

      if(txt.includes("mopp")) {
        resposta = "O curso MOPP (Movimentação e Operação de Produtos Perigosos) é obrigatório para transporte de cargas de risco e tem validade de 5 anos.";
      } else if(txt.includes("documento") || txt.includes("cnh")) {
        resposta = "O motorista deve portar CNH válida na categoria do veículo, CRLV atualizado e, dependendo da carga, nota fiscal e manifesto.";
      } else if(txt.includes("equipamento") || txt.includes("epi")) {
        resposta = "Os EPIs obrigatórios incluem bota de segurança, colete refletivo e capacete (em áreas de carga).";
      }

      chatBox.innerHTML += `<div class="msg bot" style="background: #eef2f5; padding: 10px; margin-top: 15px; border-radius: 8px;"><b>Agente RIG:</b> ${resposta}</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    }, 800);
  }

  if(btnEnviar && inputPergunta) {
    btnEnviar.addEventListener('click', enviarMensagem);
    inputPergunta.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') enviarMensagem();
    });
  }
}
