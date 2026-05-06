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
  inicializarFiltros();
});

document.addEventListener("DOMContentLoaded", () => {
  const catBtns = document.querySelectorAll('.cat-btn');
  const normasLista = document.getElementById('normas-lista');
  
  if (catBtns && normasLista) {
    const dadosNormas = {
      "pessoas": `
        <ul style="margin:0; padding-left:20px; color:#ddd;">
          <li>Aplicação e alcance</li>
          <li>Regras Gerais</li>
          <li>Solicitação e disposições gerais</li>
          <li>Transporte de pessoas</li>
          <li>Definições</li>
        </ul>
      `,
      "cargas": `
        <ul style="margin:0; padding-left:20px; color:#ddd;">
          <li>Objeto do contrato</li>
          <li>Níveis de serviço</li>
          <li>Avarias</li>
          <li>Penalidades</li>
        </ul>
      `,
      "norma": `
        <ul style="margin:0; padding-left:20px; color:#ddd;">
          <li>Procedimentos operacionais</li>
          <li>Segurança</li>
          <li>Documentação obrigatória</li>
        </ul>
      `
    };

    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        catBtns.forEach(b => b.style.background = '');
        btn.style.background = 'rgba(245,166,35,0.4)';
        const cat = btn.getAttribute('data-cat');
        normasLista.innerHTML = dadosNormas[cat];
        normasLista.style.display = 'block';
      });
    });
  }
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

    preencherDropdownsFiltro(BASE_ATENDIMENTOS);
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
      lat: gerarLatitudeSimulada(extrairBairro(l["Localidade + Endereço"])),
      lng: gerarLongitudeSimulada(extrairBairro(l["Localidade + Endereço"]))
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
   COORDENADAS SIMULADAS POR BAIRRO
======================= */
const BAIRROS_COORDS = {
  // ZONA OESTE
  "guaratiba": { lat: -22.986, lng: -43.593 },
  "pedra de guaratiba": { lat: -22.986, lng: -43.593 },
  "ilha de guaratiba": { lat: -22.986, lng: -43.593 },
  "curicica": { lat: -22.955, lng: -43.398 },
  "jacarepagua": { lat: -22.956, lng: -43.364 },
  "jacarepaguá": { lat: -22.956, lng: -43.364 },
  "barra da tijuca": { lat: -23.000, lng: -43.366 },
  "recreio": { lat: -23.018, lng: -43.468 },
  "recreio dos bandeirantes": { lat: -23.018, lng: -43.468 },
  "camorim": { lat: -22.969, lng: -43.407 },
  "vargem grande": { lat: -22.984, lng: -43.484 },
  "vargem pequena": { lat: -22.981, lng: -43.443 },
  "bangu": { lat: -22.879, lng: -43.465 },
  "campo grande": { lat: -22.900, lng: -43.559 },
  "santa cruz": { lat: -22.923, lng: -43.684 },
  "realengo": { lat: -22.875, lng: -43.428 },
  "padre miguel": { lat: -22.876, lng: -43.447 },
  "taquara": { lat: -22.923, lng: -43.366 },
  "freguesia": { lat: -22.940, lng: -43.341 },
  "pechincha": { lat: -22.933, lng: -43.355 },
  "tanque": { lat: -22.915, lng: -43.360 },

  // ZONA SUL
  "jardim botanico": { lat: -22.967, lng: -43.228 },
  "jardim botânico": { lat: -22.967, lng: -43.228 },
  "leblon": { lat: -22.984, lng: -43.223 },
  "ipanema": { lat: -22.984, lng: -43.204 },
  "copacabana": { lat: -22.971, lng: -43.182 },
  "botafogo": { lat: -22.951, lng: -43.180 },
  "flamengo": { lat: -22.935, lng: -43.177 },
  "laranjeiras": { lat: -22.933, lng: -43.186 },
  "catete": { lat: -22.926, lng: -43.176 },
  "gloria": { lat: -22.919, lng: -43.173 },
  "glória": { lat: -22.919, lng: -43.173 },
  "leme": { lat: -22.962, lng: -43.166 },
  "urca": { lat: -22.953, lng: -43.162 },
  "sao conrado": { lat: -22.993, lng: -43.253 },
  "são conrado": { lat: -22.993, lng: -43.253 },
  "rocinha": { lat: -22.988, lng: -43.249 },

  // ZONA NORTE & CENTRO
  "centro": { lat: -22.906, lng: -43.172 },
  "lapa": { lat: -22.913, lng: -43.180 },
  "mangueira": { lat: -22.903, lng: -43.235 },
  "sao cristovao": { lat: -22.899, lng: -43.222 },
  "são cristóvão": { lat: -22.899, lng: -43.222 },
  "benfica": { lat: -22.892, lng: -43.243 },
  "tijuca": { lat: -22.933, lng: -43.238 },
  "vila isabel": { lat: -22.914, lng: -43.245 },
  "maracana": { lat: -22.912, lng: -43.230 },
  "maracanã": { lat: -22.912, lng: -43.230 },
  "meier": { lat: -22.901, lng: -43.280 },
  "méier": { lat: -22.901, lng: -43.280 },
  "engenho de dentro": { lat: -22.894, lng: -43.294 },
  "madureira": { lat: -22.871, lng: -43.336 },
  "cascadura": { lat: -22.878, lng: -43.324 },
  "piedade": { lat: -22.890, lng: -43.308 },
  "ilha do governador": { lat: -22.809, lng: -43.208 },

"galeao": { lat: -22.812, lng: -43.243 },
  "galeão": { lat: -22.812, lng: -43.243 },
  "penha": { lat: -22.834, lng: -43.276 },
  "olaria": { lat: -22.844, lng: -43.262 },
  "bonsucesso": { lat: -22.862, lng: -43.250 },

  // OUTROS MUNICÍPIOS
  "niteroi": { lat: -22.883, lng: -43.103 },
  "niterói": { lat: -22.883, lng: -43.103 },
  "são gonçalo": { lat: -22.826, lng: -43.053 },
  "duque de caxias": { lat: -22.785, lng: -43.311 },
  "nova iguaçu": { lat: -22.757, lng: -43.460 }
};

function gerarLatitudeSimulada(bairro) {
  const b = String(bairro).toLowerCase().replace(/['"´`]/g, "").trim();
  // jitter de 0.005 = ~500 metros (não cai na água)
  if(BAIRROS_COORDS[b]) return BAIRROS_COORDS[b].lat + (Math.random() - 0.5) * 0.005;
  return -22.906 + (Math.random() - 0.5) * 0.01; // default para o Centro
}

function gerarLongitudeSimulada(bairro) {
  const b = String(bairro).toLowerCase().replace(/['"´`]/g, "").trim();
  if(BAIRROS_COORDS[b]) return BAIRROS_COORDS[b].lng + (Math.random() - 0.5) * 0.005;
  return -43.172 + (Math.random() - 0.5) * 0.01; // default para o Centro
}

/* =======================
   MAPA – ATENDIMENTOS E FILTROS
======================= */

function plotarAtendimentosNoMapa(lista) {
  CAMADA_VEICULOS.clearLayers();
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

function inicializarFiltros() {
  const selectProg = document.getElementById("filtro-programa");
  const selectBairro = document.getElementById("filtro-bairro");
  const selectTipo = document.getElementById("filtro-tipo");
  const btnLimpar = document.getElementById("btn-limpar");

  if(!selectProg) return;

  function aplicarFiltros() {
    const p = selectProg.value;
    const b = selectBairro.value;
    const t = selectTipo.value;

    const filtrados = BASE_ATENDIMENTOS.filter(a => {
      const matchP = p === "" || a.programa === p;
      const matchB = b === "" || a.bairro === b;
      const matchT = t === "" || a.tipoVeiculo === t;
      return matchP && matchB && matchT;
    });

    plotarAtendimentosNoMapa(filtrados);
    renderizarLista(filtrados);
  }

  selectProg.addEventListener("change", aplicarFiltros);
  selectBairro.addEventListener("change", aplicarFiltros);
  selectTipo.addEventListener("change", aplicarFiltros);

  btnLimpar.addEventListener("click", () => {
    selectProg.value = "";
    selectBairro.value = "";
    selectTipo.value = "";
    aplicarFiltros();
  });
}

function preencherDropdownsFiltro(lista) {
  const selectProg = document.getElementById("filtro-programa");
  const selectBairro = document.getElementById("filtro-bairro");
  const selectTipo = document.getElementById("filtro-tipo");
  if(!selectProg) return;

  const programas = [...new Set(lista.map(a => a.programa))].sort();
  const bairros = [...new Set(lista.map(a => a.bairro))].sort();
  const tipos = [...new Set(lista.map(a => a.tipoVeiculo))].sort();

  selectProg.innerHTML = '<option value="">Todos</option>' + programas.map(x => `<option value="${x}">${x}</option>`).join('');
  selectBairro.innerHTML = '<option value="">Todos</option>' + bairros.map(x => `<option value="${x}">${x}</option>`).join('');
  selectTipo.innerHTML = '<option value="">Todos</option>' + tipos.map(x => `<option value="${x}">${x}</option>`).join('');
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
   FUNÇÕES DE PLANEJAMENTO
======================= */
function calcularCustoModal(distanciaKm, tipo) {
  let custo = 0;
  let consumo = "";
  let tipoText = "";
  let baseText = "";
  
  if (tipo === 1.5) { // Passeio
    custo = distanciaKm * 0.45;
    consumo = "10 km/l";
    baseText = "consumo e tipo de combustível (GNV/Etanol)";
    tipoText = "Passeio";
  } else if (tipo === 3.0) { // Van
    custo = distanciaKm * 0.85;
    consumo = "6 km/l";
    baseText = "consumo e tipo de combustível (Diesel)";
    tipoText = "Van Passageiro";
  } else if (tipo === 4.5) { // Cargas
    custo = distanciaKm * 1.50;
    consumo = "4 km/l";
    baseText = "consumo e tipo de combustível (Diesel)";
    tipoText = "Cargas (Caminhão Trucado)";
  } else if (tipo === 6.0) { // Ônibus
    custo = distanciaKm * 2.20;
    consumo = "3 km/l";
    baseText = "consumo e tipo de combustível (Diesel)";
    tipoText = "Ônibus (45 passageiros)";
  }
  return { custo: custo.toFixed(2), tipoText, baseText, consumo };
}

function calcularRiscoRota(score) {
  if (score <= 3) return "ROTA SEGURA";
  if (score <= 7) return "RISCO MODERADO";
  return "ROTA CRÍTICA";
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

  // Forçar redimensionamento quando a aba abrir (bug de tiles cinzas do leaflet em div oculta)
  document.querySelector('[data-tab="tab-planejador"]').addEventListener('click', () => {
    setTimeout(() => { MAPA_PLANNER.invalidateSize(); }, 300);
  });

  const btnGerarOcorrencias = document.getElementById('btn-gerar-ocorrencias');
  if(btnGerarOcorrencias) {
    btnGerarOcorrencias.addEventListener('click', () => {
      // Plota ocorrencias aleatorias no mapa do planejador
      L.circleMarker([-22.92, -43.20], { color: "red", radius: 8, fillOpacity: 0.8 })
        .addTo(MAPA_PLANNER).bindPopup("<b>OTT-RJ:</b> Tiroteio relatado há 15min").openPopup();
      L.circleMarker([-22.94, -43.23], { color: "orange", radius: 8, fillOpacity: 0.8 })
        .addTo(MAPA_PLANNER).bindPopup("<b>COR-RIO:</b> Via Interditada - Acidente");
      L.circleMarker([-22.88, -43.28], { color: "blue", radius: 8, fillOpacity: 0.8 })
        .addTo(MAPA_PLANNER).bindPopup("<b>PMERJ:</b> Operação Policial Ativa");

      MAPA_PLANNER.setView([-22.92, -43.20], 11);
    });
  }

  const btnLimparRota = document.getElementById('btn-limpar-rota');
  if(btnLimparRota) {
    btnLimparRota.addEventListener('click', () => {
      document.getElementById('origem').value = '';
      document.getElementById('destino').value = '';
      document.getElementById('plannerFeedback').innerHTML = 'Informe origem e destino.';
      MAPA_PLANNER.eachLayer((layer) => {
        if (layer instanceof L.Polyline || (layer instanceof L.Marker && layer._popup && !layer._popup.getContent().includes("PMERJ") && !layer._popup.getContent().includes("COR-RIO") && !layer._popup.getContent().includes("OTT-RJ")) || layer instanceof L.CircleMarker) {
          MAPA_PLANNER.removeLayer(layer);
        }
      });
      // reset map view
      MAPA_PLANNER.setView([-22.9068, -43.1729], 11);
    });
  }

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

      feedback.innerHTML = 'Buscando coordenadas (Nominatim API)...';

      // Busca Origem
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(origem + ', Rio de Janeiro, Brasil')}`)
        .then(res => res.json())
        .then(dataOrig => {
          if(!dataOrig.length) throw new Error("Endereço de Origem não encontrado.");
          const lat1 = parseFloat(dataOrig[0].lat);
          const lon1 = parseFloat(dataOrig[0].lon);

          feedback.innerHTML = 'Buscando destino (Nominatim API)...';
          return fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destino + ', Rio de Janeiro, Brasil')}`)
            .then(res => res.json())
            .then(dataDest => {
              if(!dataDest.length) throw new Error("Endereço de Destino não encontrado.");
              const lat2 = parseFloat(dataDest[0].lat);
              const lon2 = parseFloat(dataDest[0].lon);

              feedback.innerHTML = 'Calculando rota real (OSRM)...';

return fetch(`https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`)
                .then(res => res.json())
                .then(routeData => {
                  if(!routeData.routes || !routeData.routes.length) throw new Error("Rota não suportada.");

                  const coords = routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]); // OSRM retorna lon,lat
                  const distanciaKm = (routeData.routes[0].distance / 1000).toFixed(1);
                  const duracaoMin = Math.round(routeData.routes[0].duration / 60);

                  // Calcular custo com base no modal e definir ícone
                  const modalSelect = document.getElementById("modal-rota");
                  const fator = modalSelect ? parseFloat(modalSelect.value) : 1.5;
                  
                  const { custo, tipoText, baseText, consumo } = calcularCustoModal(distanciaKm, fator);

                  let emoji = '🚗';
                  if(fator === 3.0) emoji = '🚐';
                  if(fator === 4.5) emoji = '🚚';
                  if(fator === 6.0) emoji = '🚌';

                  const vehicleIcon = L.divIcon({
                    html: `<div style="font-size: 26px; filter: drop-shadow(0px 3px 2px rgba(0,0,0,0.4));">${emoji}</div>`,
                    className: '',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                  });

                  // Limpa rota anterior (mantém as ocorrencias manuais)
                  MAPA_PLANNER.eachLayer((layer) => {
                    if (layer instanceof L.Polyline || (layer instanceof L.Marker && layer._popup && !layer._popup.getContent().includes("PMERJ") && !layer._popup.getContent().includes("COR-RIO") && !layer._popup.getContent().includes("OTT-RJ")) || (layer instanceof L.CircleMarker)) {
                      MAPA_PLANNER.removeLayer(layer);
                    }
                  });

                  // Desenha rota real no mapa com icone animado no destino
                  L.marker([lat1, lon1]).addTo(MAPA_PLANNER).bindPopup('Origem: ' + origem).openPopup();
                  L.marker([lat2, lon2], {icon: vehicleIcon}).addTo(MAPA_PLANNER).bindPopup('Destino: ' + destino);
                  
                  // Gerar ocorrencias dinamicas baseadas na rota
                  let scoreTotal = 0;
                  const tiposCrimes = [
                    { tipo: 'Roubo', peso: 3, cor: 'red' },
                    { tipo: 'Acidente', peso: 2, cor: 'orange' },
                    { tipo: 'Furto', peso: 1, cor: 'yellow' }
                  ];
                  
                  // Escolher de 1 a 4 pontos da rota aleatoriamente para simular ocorrencias
                  const numOcorrencias = Math.floor(Math.random() * 4) + 1;
                  for(let i=0; i<numOcorrencias; i++) {
                     const randomIdx = Math.floor(Math.random() * coords.length);
                     const pt = coords[randomIdx];
                     const crime = tiposCrimes[Math.floor(Math.random() * tiposCrimes.length)];
                     scoreTotal += crime.peso;
                     
                     // Adicionar pequeno offset para nao ficar exatamente em cima da linha
                     const latOffset = (Math.random() - 0.5) * 0.005;
                     const lngOffset = (Math.random() - 0.5) * 0.005;
                     
                     // Adicionar animacao para ocorrencia critica (Roubo)
                     const className = crime.tipo === 'Roubo' ? 'marker-critical-anim' : '';
                     
                     L.circleMarker([pt[0] + latOffset, pt[1] + lngOffset], { 
                       color: crime.cor, 
                       radius: 8, 
                       fillOpacity: 0.8,
                       className: className 
                     })
                     .addTo(MAPA_PLANNER)
                     .bindPopup(`<b>${crime.tipo}</b><br>Peso: ${crime.peso}`);
                  }
                  
                  const classRisco = calcularRiscoRota(scoreTotal);
                  let corRisco = '#22c55e'; // verde
                  if (classRisco === 'RISCO MODERADO') corRisco = '#f5a623';
                  if (classRisco === 'ROTA CRÍTICA') corRisco = '#ef4444';

                  L.polyline(coords, {color: corRisco, weight: 6}).addTo(MAPA_PLANNER);
                  MAPA_PLANNER.fitBounds([[Math.min(lat1, lat2), Math.min(lon1, lon2)], [Math.max(lat1, lat2), Math.max(lon1, lon2)]], {padding: [30,30]});

                  feedback.innerHTML = `
                    <div style="font-size: 1.1em; font-weight: bold; color: ${corRisco}; margin-bottom: 5px;">${classRisco} (Score de Risco: ${scoreTotal})</div>
                    <b>Distância:</b> ${distanciaKm} km<br>
                    <b>Custo estimado:</b> R$ ${custo}<br>
                    <b>Modal:</b> ${tipoText}<br>
                    <b>Base de cálculo:</b> ${baseText}<br>
                  `;
                });
            });
        })
        .catch(err => {
          feedback.innerHTML = `<span style="color:#ef4444"><b>Erro:</b> ${err.message}</span><br><span style="font-size:11px">Lembre-se de ser específico (Ex: "Estúdios Globo, Jacarepaguá")</span>`;
        });
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
      let resposta = "Desculpe, não encontrei uma referência direta para isso nos Manuais e Contratos (BR3 / Rick Rio). Pode ser mais específico?";
      const txt = texto.toLowerCase();

      if(txt.includes("mopp")) {
        resposta = "<b>[Norma de Transporte / TNO]:</b> O curso MOPP (Movimentação e Operação de Produtos Perigosos) é obrigatório para transporte de cargas de risco e tem validade de 5 anos.";
      } else if(txt.includes("documento") || txt.includes("cnh")) {
        resposta = "<b>[Norma de Transporte]:</b> O motorista deve portar CNH válida na categoria do veículo, CRLV atualizado e, dependendo da carga, nota fiscal e manifesto.";
      } else if(txt.includes("equipamento") || txt.includes("epi") || txt.includes("segurança")) {

resposta = "<b>[Norma de Transporte / TNO]:</b> Os EPIs obrigatórios incluem bota de segurança, colete refletivo e capacete (em áreas de carga).";
      } else if(txt.includes("acidente")) {
        resposta = "<b>[Procedimento Geral]:</b> Em caso de acidente: 1) Sinalize a via. 2) Comunique o Centro de Comando imediatamente via Rádio/App. 3) Acione o socorro (192/193) se houver vítimas.";
      } else if(txt.includes("br3") || (txt.includes("contrato") && txt.includes("veículo"))) {
        resposta = "<b>[Contrato de veículos]:</b> No contrato de Pessoas e Pequenas Cargas, o prestador é responsável pela manutenção preventiva do veículo e deve garantir a integridade da pequena carga até o destino final.";
      } else if(txt.includes("rick") || txt.includes("carga") || txt.includes("avaria")) {
        resposta = "<b>[Contrato de Transporte de Cargas]:</b> Nas regras de Transporte de Carga, as avarias durante o trajeto sem justificativa de ocorrência externa de força maior podem acarretar em penalidades financeiras à contratada.";
      } else if(txt.includes("multa") || txt.includes("penalidade")) {
        resposta = "<b>[Regras de Contrato]:</b> As penalidades são aplicadas em caso de atraso injustificado, avaria de carga, ou infrações de trânsito cometidas durante a operação do serviço.";
      }

      chatBox.innerHTML += `<div class="msg bot"><b>Agente RIT:</b> ${resposta}</div>`;
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

