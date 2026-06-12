/***********************************************************************
 * AGENTE RIG – SCRIPT PRINCIPAL v3.4.0
 ***********************************************************************/

let MAPA = null;
let MAPA_PLANNER = null;
let CAMADA_VEICULOS = null;
let BASE_ATENDIMENTOS = [];
let NORMAS_LISTA = [];
let EVENTO_ATUAL_URL = "";
let CHAT_CONTEXTO = "geral"; // 'norma', 'contrato-cargas', 'contrato-pessoas', 'geral'

document.addEventListener("DOMContentLoaded", () => {
  inicializarMapa();
  inicializarUpload();
  inicializarUploadPlanejador();
  inicializarAbas();
  inicializarPlanejador();
  inicializarChatbot();
  inicializarFiltros();
  carregarNormasResumo();
});

/* =======================
   MAPA PRINCIPAL
======================= */
function inicializarMapa() {
  MAPA = L.map("map", { center: [-22.9068, -43.1729], zoom: 11 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '© OpenStreetMap contributors' }).addTo(MAPA);
  CAMADA_VEICULOS = L.layerGroup().addTo(MAPA);
  setTimeout(() => MAPA.invalidateSize(), 500);
}

/* =======================
   GEOCODIFICAÇÃO
======================= */
async function geocodificarAtendimentos() {
  const statusEl = document.getElementById("geo-status");
  if (BASE_ATENDIMENTOS.length === 0) return;
  statusEl.innerHTML = `<span style="color:var(--accent)">Sincronizando...</span>`;
  const bairrosUnicos = [...new Set(BASE_ATENDIMENTOS.map(a => a.bairro))];
  const cacheCoords = new Map();
  for (let i = 0; i < bairrosUnicos.length; i += 3) {
    const chunk = bairrosUnicos.slice(i, i + 3);
    await Promise.all(chunk.map(async (b) => {
      try {
        const r = await fetch(`/api/geocode?bairro=${encodeURIComponent(b)}`);
        const d = await r.json();
        if (d.ok) cacheCoords.set(b, { lat: d.lat, lng: d.lon });
      } catch (e) {}
    }));
  }
  BASE_ATENDIMENTOS.forEach(a => {
    const c = cacheCoords.get(a.bairro);
    if (c) { a.lat = c.lat; a.lng = c.lng; }
  });
  statusEl.innerHTML = `<span style="color:var(--good)">Pronto (OK)</span>`;
  plotarAtendimentosNoMapa(BASE_ATENDIMENTOS);
  renderizarLista(BASE_ATENDIMENTOS);
}

function plotarAtendimentosNoMapa(lista) {
  CAMADA_VEICULOS.clearLayers();
  lista.forEach(a => {
    if (a.lat && a.lng) {
      L.marker([a.lat, a.lng]).addTo(CAMADA_VEICULOS).bindPopup(`<b>${a.programa}</b><br>${a.motorista}<br>${a.bairro}`);
    }
  });
}

/* =======================
   UPLOAD & PROCESSAMENTO
======================= */
function inicializarUpload() {
  const input = document.getElementById("upload-mapa");
  document.getElementById("btn-upload")?.addEventListener("click", () => input.click());
  input?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      BASE_ATENDIMENTOS = linhas.map(l => {
        const placa = String(l["Placa Veículo"] || "").trim();
        if (!placa) return null;
        const bairroRaw = String(l["Localidade + Endereço"] || "").split(",");
        const bairro = bairroRaw.pop().trim() || "Rio de Janeiro";
        return { motorista: String(l["Motorista"] || ""), tipoVeiculo: String(l["Tipo de Veículo"] || ""), programa: String(l["Programa"] || "RIT").split("/")[0].trim(), placa: placa, bairro: bairro, lat: null, lng: null };
      }).filter(Boolean);
      preencherDropdownsFiltro(BASE_ATENDIMENTOS);
      geocodificarAtendimentos();
    };
    reader.readAsArrayBuffer(file);
  });
}

function inicializarUploadPlanejador() {
  const input = document.getElementById("upload-planejador");
  const btn = document.getElementById("btn-upload-planejador");
  
  if (!input || !btn) return;

  btn.addEventListener("click", () => input.click());
  
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Abrir Modal Loading
    const modal = document.getElementById("modalLote");
    const modalLoading = document.getElementById("modalLoteLoading");
    const modalContent = document.getElementById("modalLoteContent");
    const btnBaixar = document.getElementById("btnBaixarLote");
    
    modal.style.display = "flex";
    modalLoading.style.display = "block";
    modalContent.style.display = "none";
    btnBaixar.style.display = "none";

    const formData = new FormData();
    formData.append("planilha", file);
    
    try {
      const res = await fetch("/api/rotas/importar", {
        method: "POST",
        body: formData
      });
      const json = await res.json();
      
      if (!json.ok) {
        alert(json.error || "Erro ao processar lote.");
        modal.style.display = "none";
        return;
      }

      PLANNER_DATA = json.resultados;
      
      // Renderizar tabela
      const tbody = document.getElementById("tabelaLoteBody");
      tbody.innerHTML = "";
      
      json.resultados.forEach(r => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #333";
        tr.innerHTML = \`
          <td style="padding: 8px;">\${escHtml(r.origem)}</td>
          <td style="padding: 8px;">\${escHtml(r.destino)}</td>
          <td style="padding: 8px;">\${escHtml(r.horario || '')}</td>
          <td style="padding: 8px;">\${r.distancia_km ? r.distancia_km + ' km' : '-'}</td>
          <td style="padding: 8px;">\${r.tempo_min ? r.tempo_min + ' min' : '-'}</td>
          <td style="padding: 8px; font-weight:bold; color:var(--accent)">\${r.custo_estimado ? 'R$ ' + r.custo_estimado : '-'}</td>
          <td style="padding: 8px; color: \${r.status === 'SUCESSO' ? 'var(--accent)' : 'var(--bad)'}">\${escHtml(r.status)} \${r.erro ? '<br><small>'+escHtml(r.erro)+'</small>' : ''}</td>
        \`;
        tbody.appendChild(tr);
      });

      modalLoading.style.display = "none";
      modalContent.style.display = "block";
      btnBaixar.style.display = "block";

    } catch (err) {
      console.error(err);
      alert("Falha na comunicação com o servidor.");
      modal.style.display = "none";
    } finally {
      // Limpa input para permitir novo upload do mesmo arquivo se desejar
      input.value = "";
    }
  });

  document.getElementById("btnFecharModalLote")?.addEventListener("click", () => {
    document.getElementById("modalLote").style.display = "none";
  });

  document.getElementById("btnBaixarLote")?.addEventListener("click", () => {
    if (!PLANNER_DATA || PLANNER_DATA.length === 0) return;
    
    // Converte para aba usando XLSX
    const ws = XLSX.utils.json_to_sheet(PLANNER_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rotas Processadas");
    XLSX.writeFile(wb, "Rotas_Processadas_RIT.xlsx");
  });
}

/* =======================
   CONSULTOR NORMATIVO (CORREÇÕES 3.x)
======================= */
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function inicializarChatbot() {
  const btn = document.getElementById('btn-enviar');
  const inp = document.getElementById('pergunta');
  const chat = document.getElementById('chat');
  if(!btn) return;

  async function enviar() {
    const txt = inp.value.trim();
    if(!txt) return;
    chat.innerHTML += `<div class="msg user">${escHtml(txt)}</div>`;
    inp.value = "";
    
    const botId = "bot-" + Date.now();
    chat.innerHTML += `<div class="msg bot" id="${botId}"><i>Analisando base normativa (${escHtml(CHAT_CONTEXTO)})...</i></div>`;
    chat.scrollTop = chat.scrollHeight;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt, contexto: CHAT_CONTEXTO })
      });
      let data;
      try { data = await resp.json(); } catch (e) { data = {}; }
      const b = document.getElementById(botId);
      if (!b) return;
      if (!resp.ok) {
        const err = data.error || data.message || ('HTTP ' + resp.status);
        b.innerHTML = `<b>Consultor RIT:</b><br>${escHtml(err).replace(/\n/g, '<br>')}`;
      } else if (typeof data.response === 'string') {
        b.innerHTML = `<b>Consultor RIT:</b><br>${escHtml(data.response).replace(/\n/g, '<br>')}`;
      } else {
        b.innerHTML = '<b>Consultor RIT:</b><br>Resposta inesperada do servidor.';
      }
      chat.scrollTop = chat.scrollHeight;
    } catch (err) {
      const b = document.getElementById(botId);
      if(b) b.innerHTML = "Erro de conexão com o consultor.";
    }
  }
  btn.addEventListener('click', enviar);
  inp.addEventListener('keypress', e => { if(e.key==='Enter') enviar(); });
}

function limparChat() {
  const chat = document.getElementById('chat');
  if (chat) {
    chat.innerHTML = `<div class="msg bot">Histórico limpo. Como posso ajudar com as normas de transporte agora?</div>`;
    CHAT_CONTEXTO = "geral";
  }
}

function setContext(contexto) {
  CHAT_CONTEXTO = contexto;
  const chat = document.getElementById('chat');
  const labels = { 'norma': 'NORMA', 'contrato-cargas': 'CONTRATO CARGAS', 'contrato-pessoas': 'CONTRATO PESSOAS' };
  chat.innerHTML += `<div class="msg bot"><i>Contexto alterado para: <b>${labels[contexto] || 'GERAL'}</b>. Agora responderei focando neste documento.</i></div>`;
  chat.scrollTop = chat.scrollHeight;
}

/* =======================
   ABAS & MAPAS (CORREÇÃO 1 e 5)
======================= */
function inicializarAbas() {
  const btns = document.querySelectorAll('.tabBtn');
  const panes = document.querySelectorAll('.tabPane');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-tab'));
      if(target) target.classList.add('active');
      
      // Lazy Load
      if (btn.getAttribute('data-tab') === 'tab-rede') carregarMapaRede();

      // Forçar redimensionamento dos mapas
      setTimeout(() => {
        if(MAPA) MAPA.invalidateSize();
        if(MAPA_PLANNER) MAPA_PLANNER.invalidateSize();
      }, 300);
    });
  });
}

/* =======================
   OUTRAS FUNÇÕES (RESTAURAÇÃO)
======================= */
function carregarNormasResumo() {
  fetch('/api/normas').then(r => r.json()).then(data => {
    NORMAS_LISTA = data;
    const c = document.getElementById('normas-lista');
    if(!c) return;
    c.innerHTML = data.map(n => `<div class="card" onclick="consultarNormaDireta(${n.id})"><b>${n.icone} ${n.titulo}</b><br><span style="font-size:9px; color:var(--muted)">${n.resumo}</span></div>`).join('');
  });
}

function consultarNormaDireta(id) {
  const n = NORMAS_LISTA.find(x => x.id === id);
  if(!n) return;
  document.getElementById('pergunta').value = `Fale sobre: ${n.titulo}`;
  document.getElementById('btn-enviar').click();
}

function carregarEvento(nome, url) {
  EVENTO_ATUAL_URL = url;
  document.getElementById('evento-titulo').innerText = nome;
  let embedUrl = url;
  if (url.includes('mid=')) {
    const mid = url.split('mid=')[1].split('&')[0];
    embedUrl = `https://www.google.com/maps/d/embed?mid=${mid}`;
  }
  document.getElementById('iframe-evento').src = embedUrl;
  document.getElementById('btn-externo-evento').style.display = 'inline-flex';
}

function abrirMapaExterno() { if(EVENTO_ATUAL_URL) window.open(EVENTO_ATUAL_URL, '_blank'); }

function renderizarLista(lista) {
  const el = document.getElementById("listaAtendimentos");
  if(!el) return;
  el.innerHTML = lista.map(i => `<div class="card"><div class="row1"><span class="badgeProgram">${i.programa}</span></div><div class="meta-motorista">${i.motorista}</div><div class="meta-veiculo">${i.placa}</div><div class="meta-bairro">📍 ${i.bairro}</div></div>`).join("");
}

function preencherDropdownsFiltro(l) {
  const sp = document.getElementById("filtro-programa");
  const sb = document.getElementById("filtro-bairro");
  if(!sp) return;
  const progs = [...new Set(l.map(a => a.programa))].sort();
  const bairs = [...new Set(l.map(a => a.bairro))].sort();
  sp.innerHTML = '<option value="">Programa</option>' + progs.map(x => `<option value="${x}">${x}</option>`).join('');
  sb.innerHTML = '<option value="">Bairro</option>' + bairs.map(x => `<option value="${x}">${x}</option>`).join('');
}

function inicializarFiltros() {
  const sp = document.getElementById("filtro-programa");
  const sb = document.getElementById("filtro-bairro");
  function filtrar() {
    const f = BASE_ATENDIMENTOS.filter(a => (!sp.value || a.programa === sp.value) && (!sb.value || a.bairro === sb.value));
    plotarAtendimentosNoMapa(f);
    renderizarLista(f);
  }
  [sp, sb].forEach(s => s?.addEventListener("change", filtrar));
  document.getElementById("btn-centralizar")?.addEventListener("click", () => MAPA.setView([-22.9068, -43.1729], 11));
}

function inicializarPlanejador() {
  const el = document.getElementById("mapPlanner");
  if(!el) return;
  MAPA_PLANNER = L.map("mapPlanner", { center: [-22.9068, -43.1729], zoom: 11 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(MAPA_PLANNER);
}

function carregarMapaRede() {
  const i = document.getElementById('iframe-rede');
  if (i && !i.src) i.src = i.getAttribute('data-src');
}

function centralizarRedeRJ() { document.getElementById('iframe-rede').src = document.getElementById('iframe-rede').getAttribute('data-src'); }
function fecharGuiaVisual() { document.getElementById('modalGuia').style.display = 'none'; }
function abrirGuiaVisual() { document.getElementById('modalGuia').style.display = 'flex'; }
