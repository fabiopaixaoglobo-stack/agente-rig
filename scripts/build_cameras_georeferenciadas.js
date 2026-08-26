const fs = require('fs');
const path = require('path');

// 1. Dicionário de Coordenadas Centrais e Eixos dos 138 Bairros do Rio de Janeiro
const BAIRRO_COORDS = {
    "Abolição": { lat: -22.8878, lon: -43.2986, heading: 45 },
    "Acari": { lat: -22.8256, lon: -43.3400, heading: 90 },
    "Água Santa": { lat: -22.8986, lon: -43.3089, heading: 180 },
    "Alto da Boa Vista": { lat: -22.9647, lon: -43.2736, heading: 270 },
    "Anchieta": { lat: -22.8247, lon: -43.3986, heading: 90 },
    "Andaraí": { lat: -22.9269, lon: -43.2536, heading: 135 },
    "Anil": { lat: -22.9558, lon: -43.3439, heading: 225 },
    "Bangu": { lat: -22.8767, lon: -43.4683, heading: 270 },
    "Barra da Tijuca": { lat: -23.0003, lon: -43.3659, heading: 180 },
    "Barra Olímpica": { lat: -22.9782, lon: -43.3854, heading: 210 },
    "Benfica": { lat: -22.8925, lon: -43.2389, heading: 90 },
    "Bento Ribeiro": { lat: -22.8631, lon: -43.3667, heading: 0 },
    "Bonsucesso": { lat: -22.8683, lon: -43.2561, heading: 45 },
    "Botafogo": { lat: -22.9519, lon: -43.1842, heading: 90 },
    "Brás de Pina": { lat: -22.8336, lon: -43.2981, heading: 45 },
    "Cachambi": { lat: -22.8894, lon: -43.2758, heading: 0 },
    "Cacuia": { lat: -22.8094, lon: -43.1936, heading: 90 },
    "Caju": { lat: -22.8833, lon: -43.2167, heading: 0 },
    "Camorim": { lat: -22.9653, lon: -43.4183, heading: 270 },
    "Campinho": { lat: -22.8825, lon: -43.3517, heading: 180 },
    "Campo Grande": { lat: -22.9039, lon: -43.5594, heading: 270 },
    "Cascadura": { lat: -22.8797, lon: -43.3314, heading: 90 },
    "Catete": { lat: -22.9258, lon: -43.1783, heading: 90 },
    "Catumbi": { lat: -22.9186, lon: -43.1989, heading: 0 },
    "Centro": { lat: -22.9068, lon: -43.1729, heading: 90 },
    "Cidade Nova": { lat: -22.9118, lon: -43.1975, heading: 90 },
    "Cidade Universitária": { lat: -22.8594, lon: -43.2333, heading: 45 },
    "Cocotá": { lat: -22.8019, lon: -43.1817, heading: 0 },
    "Coelho Neto": { lat: -22.8317, lon: -43.3486, heading: 90 },
    "Colégio": { lat: -22.8467, lon: -43.3364, heading: 90 },
    "Copacabana": { lat: -22.9694, lon: -43.1869, heading: 135 },
    "Cordovil": { lat: -22.8286, lon: -43.2983, heading: 45 },
    "Cosme Velho": { lat: -22.9419, lon: -43.1983, heading: 225 },
    "Cosmos": { lat: -22.9083, lon: -43.6167, heading: 270 },
    "Costa Barros": { lat: -22.8189, lon: -43.3642, heading: 0 },
    "Curicica": { lat: -22.9567, lon: -43.3989, heading: 225 },
    "Del Castilho": { lat: -22.8789, lon: -43.2708, heading: 0 },
    "Deodoro": { lat: -22.8583, lon: -43.3833, heading: 270 },
    "Encantado": { lat: -22.8944, lon: -43.2989, heading: 180 },
    "Engenho da Rainha": { lat: -22.8689, lon: -43.3039, heading: 0 },
    "Engenho de Dentro": { lat: -22.8967, lon: -43.2933, heading: 180 },
    "Engenho Novo": { lat: -22.9067, lon: -43.2683, heading: 180 },
    "Estácio": { lat: -22.9158, lon: -43.2047, heading: 90 },
    "Flamengo": { lat: -22.9328, lon: -43.1772, heading: 90 },
    "Freguesia (Ilha)": { lat: -22.7889, lon: -43.1783, heading: 0 },
    "Freguesia (Jacarepaguá)": { lat: -22.9417, lon: -43.3400, heading: 225 },
    "Galeão": { lat: -22.8156, lon: -43.2436, heading: 45 },
    "Gamboa": { lat: -22.8967, lon: -43.1950, heading: 0 },
    "Glória": { lat: -22.9217, lon: -43.1764, heading: 90 },
    "Grajaú": { lat: -22.9250, lon: -43.2639, heading: 225 },
    "Guadalupe": { lat: -22.8392, lon: -43.3742, heading: 270 },
    "Guaratiba": { lat: -22.9986, lon: -43.5936, heading: 225 },
    "Gávea": { lat: -22.9753, lon: -43.2289, heading: 180 },
    "Humaitá": { lat: -22.9567, lon: -43.1969, heading: 180 },
    "Imperial de São Cristóvão": { lat: -22.9000, lon: -43.2222, heading: 45 },
    "Inhaúma": { lat: -22.8717, lon: -43.2847, heading: 0 },
    "Inhoaíba": { lat: -22.9083, lon: -43.5850, heading: 270 },
    "Ipanema": { lat: -22.9839, lon: -43.2044, heading: 180 },
    "Irajá": { lat: -22.8317, lon: -43.3283, heading: 45 },
    "Itanhangá": { lat: -22.9933, lon: -43.3083, heading: 225 },
    "Jacarepaguá": { lat: -22.9469, lon: -43.3619, heading: 225 },
    "Jardim Botânico": { lat: -22.9667, lon: -43.2264, heading: 180 },
    "Jardim Carioca": { lat: -22.8067, lon: -43.2033, heading: 0 },
    "Jardim Guanabara": { lat: -22.8033, lon: -43.2083, heading: 0 },
    "Jardim Sulacap": { lat: -22.8933, lon: -43.3983, heading: 270 },
    "Lagoa": { lat: -22.9667, lon: -43.2083, heading: 180 },
    "Lapa": { lat: -22.9133, lon: -43.1817, heading: 90 },
    "Laranjeiras": { lat: -22.9333, lon: -43.1889, heading: 180 },
    "Leblon": { lat: -22.9844, lon: -43.2239, heading: 180 },
    "Leme": { lat: -22.9633, lon: -43.1667, heading: 90 },
    "Madureira": { lat: -22.8719, lon: -43.3383, heading: 90 },
    "Magalhães Bastos": { lat: -22.8783, lon: -43.4117, heading: 270 },
    "Mangueira": { lat: -22.9056, lon: -43.2417, heading: 90 },
    "Manguinhos": { lat: -22.8800, lon: -43.2450, heading: 45 },
    "Maracanã": { lat: -22.9122, lon: -43.2300, heading: 90 },
    "Marechal Hermes": { lat: -22.8617, lon: -43.3717, heading: 270 },
    "Maré": { lat: -22.8533, lon: -43.2450, heading: 45 },
    "Méier": { lat: -22.9017, lon: -43.2800, heading: 180 },
    "Olaria": { lat: -22.8417, lon: -43.2750, heading: 45 },
    "Osvaldo Cruz": { lat: -22.8683, lon: -43.3517, heading: 90 },
    "Paciência": { lat: -22.9000, lon: -43.6333, heading: 270 },
    "Padre Miguel": { lat: -22.8783, lon: -43.4417, heading: 270 },
    "Parada de Lucas": { lat: -22.8217, lon: -43.3033, heading: 45 },
    "Parque Anchieta": { lat: -22.8250, lon: -43.4117, heading: 270 },
    "Parque Colúmbia": { lat: -22.8133, lon: -43.3317, heading: 0 },
    "Pavuna": { lat: -22.8083, lon: -43.3650, heading: 0 },
    "Pechincha": { lat: -22.9367, lon: -43.3617, heading: 225 },
    "Penha": { lat: -22.8467, lon: -43.2800, heading: 45 },
    "Penha Circular": { lat: -22.8367, lon: -43.2867, heading: 45 },
    "Piedade": { lat: -22.8883, lon: -43.3100, heading: 180 },
    "Pilares": { lat: -22.8800, lon: -43.2900, heading: 0 },
    "Pitangueiras": { lat: -22.8133, lon: -43.1750, heading: 0 },
    "Portuguesa": { lat: -22.7983, lon: -43.2033, heading: 0 },
    "Praça da Bandeira": { lat: -22.9133, lon: -43.2167, heading: 90 },
    "Praça Seca": { lat: -22.8872, lon: -43.3540, heading: 225 },
    "Quintino Bocaiúva": { lat: -22.8833, lon: -43.3183, heading: 180 },
    "Ramos": { lat: -22.8550, lon: -43.2583, heading: 45 },
    "Realengo": { lat: -22.8800, lon: -43.4300, heading: 270 },
    "Recreio dos Bandeirantes": { lat: -23.0183, lon: -43.4683, heading: 180 },
    "Riachuelo": { lat: -22.9000, lon: -43.2617, heading: 180 },
    "Ribeira": { lat: -22.8233, lon: -43.1683, heading: 0 },
    "Ricardo de Albuquerque": { lat: -22.8383, lon: -43.3983, heading: 270 },
    "Rio Comprido": { lat: -22.9233, lon: -43.2117, heading: 180 },
    "Rocha": { lat: -22.8983, lon: -43.2550, heading: 180 },
    "Rocha Miranda": { lat: -22.8517, lon: -43.3483, heading: 90 },
    "Sampaio": { lat: -22.9017, lon: -43.2683, heading: 180 },
    "Santa Cruz": { lat: -22.9183, lon: -43.6850, heading: 270 },
    "Santa Teresa": { lat: -22.9267, lon: -43.1917, heading: 90 },
    "Santo Cristo": { lat: -22.8983, lon: -43.2000, heading: 0 },
    "Santíssimo": { lat: -22.8717, lon: -43.5133, heading: 270 },
    "Saúde": { lat: -22.8950, lon: -43.1850, heading: 0 },
    "Senador Camará": { lat: -22.8817, lon: -43.4867, heading: 270 },
    "Senador Vasconcelos": { lat: -22.8900, lon: -43.5317, heading: 270 },
    "Sepetiba": { lat: -22.9717, lon: -43.7017, heading: 180 },
    "São Conrado": { lat: -22.9983, lon: -43.2617, heading: 180 },
    "São Francisco Xavier": { lat: -22.9033, lon: -43.2433, heading: 180 },
    "Tanque": { lat: -22.9267, lon: -43.3583, heading: 225 },
    "Taquara": { lat: -22.9250, lon: -43.3717, heading: 225 },
    "Tauá": { lat: -22.7950, lon: -43.1867, heading: 0 },
    "Tijuca": { lat: -22.9250, lon: -43.2383, heading: 180 },
    "Todos os Santos": { lat: -22.8950, lon: -43.2833, heading: 180 },
    "Tomás Coelho": { lat: -22.8633, lon: -43.3083, heading: 0 },
    "Turiaçú": { lat: -22.8600, lon: -43.3400, heading: 90 },
    "Urca": { lat: -22.9517, lon: -43.1617, heading: 90 },
    "Vargem Grande": { lat: -22.9900, lon: -43.4983, heading: 225 },
    "Vargem Pequena": { lat: -22.9817, lon: -43.4567, heading: 225 },
    "Vasco da Gama": { lat: -22.8917, lon: -43.2267, heading: 45 },
    "Vaz Lobo": { lat: -22.8550, lon: -43.3283, heading: 90 },
    "Vicente de Carvalho": { lat: -22.8533, lon: -43.3117, heading: 0 },
    "Vidigal": { lat: -22.9933, lon: -43.2383, heading: 180 },
    "Vila da Penha": { lat: -22.8400, lon: -43.3083, heading: 45 },
    "Vila Isabel": { lat: -22.9167, lon: -43.2500, heading: 180 },
    "Vila Kennedy": { lat: -22.8583, lon: -43.4750, heading: 270 },
    "Vila Kosmos": { lat: -22.8467, lon: -43.3033, heading: 45 },
    "Vila Militar": { lat: -22.8633, lon: -43.4017, heading: 270 },
    "Vila Valqueire": { lat: -22.8867, lon: -43.3683, heading: 270 },
    "Vista Alegre": { lat: -22.8317, lon: -43.3133, heading: 45 },
    "Zumbi": { lat: -22.8200, lon: -43.1783, heading: 0 }
};

// 2. Pontos Notórios e Específicos de Câmeras (COR Rio / CCO)
const NOTORIOUS_CAMERAS = {
    "405": {
        id: "000405",
        nome: "Abelardo Bueno Frente 3600",
        bairro: "Barra Olímpica",
        endereco: "Av. Embaixador Abelardo Bueno, 3600 - Barra Olímpica",
        latitude: -22.9782,
        longitude: -43.3854,
        angulo: 180,
        orientacao: 210,
        alcance: 600,
        status: "online",
        operadora: "COR Rio"
    },
    "127": {
        id: "000127",
        nome: "AV. ARMANDO LOMBARDI ACESSO BARRA POINT",
        bairro: "Barra da Tijuca",
        endereco: "Av. Armando Lombardi, Acesso Barra Point - Barra da Tijuca",
        latitude: -23.0064,
        longitude: -43.3108,
        angulo: 180,
        orientacao: 90,
        alcance: 500,
        status: "online",
        operadora: "COR Rio"
    },
    "64": {
        id: "000064",
        nome: "AV. AMÉRICAS X ESTAÇÃO BRT AFRÂNIO COSTA",
        bairro: "Barra da Tijuca",
        endereco: "Av. das Américas x Estação BRT Afrânio Costa - Barra da Tijuca",
        latitude: -23.0031,
        longitude: -43.3245,
        angulo: 180,
        orientacao: 270,
        alcance: 550,
        status: "online",
        operadora: "COR Rio"
    },
    "100": {
        id: "000100",
        nome: "AV. 31 DE MARÇO X AV. SALVADOR DE SÁ",
        bairro: "Cidade Nova",
        endereco: "Av. 31 de Março x Av. Salvador de Sá - Cidade Nova",
        latitude: -22.9118,
        longitude: -43.1975,
        angulo: 180,
        orientacao: 180,
        alcance: 500,
        status: "online",
        operadora: "COR Rio"
    },
    "1014": {
        id: "001014",
        nome: "CamerasRJ - Curicica / Estúdios Globo",
        bairro: "Curicica",
        endereco: "Estr. dos Bandeirantes x Estr. da Curicica (Estúdios Globo)",
        latitude: -22.9567,
        longitude: -43.3989,
        angulo: 180,
        orientacao: 225,
        alcance: 700,
        status: "online",
        operadora: "CamerasRJ"
    },
    "1010": {
        id: "001010",
        nome: "CamerasRJ - Barra Alvorada / Transoeste",
        bairro: "Barra da Tijuca",
        endereco: "Av. das Américas / Alvorada - Barra da Tijuca",
        latitude: -22.9995,
        longitude: -43.3644,
        angulo: 180,
        orientacao: 180,
        alcance: 650,
        status: "online",
        operadora: "CamerasRJ"
    }
};

function padId(rawId) {
    const s = String(rawId).trim();
    if (s.length >= 6) return s;
    return s.padStart(6, '0');
}

// 3. Processa base bruta de câmeras
const rawCamerasPath = path.join(__dirname, '..', 'public', 'data', 'cameras.json');
const rawData = JSON.parse(fs.readFileSync(rawCamerasPath, 'utf8'));

const georeferencedList = [];
const seenIds = new Set();

// 3.1 Adiciona câmeras notórias prioritariamente
Object.values(NOTORIOUS_CAMERAS).forEach(notorious => {
    const formattedId = notorious.id;
    seenIds.add(String(parseInt(notorious.id, 10)));
    seenIds.add(formattedId);
    
    georeferencedList.push({
        id: formattedId,
        nome: notorious.nome,
        bairro: notorious.bairro,
        regiao: "RJ",
        endereco: notorious.endereco,
        latitude: notorious.latitude,
        longitude: notorious.longitude,
        angulo: notorious.angulo || 180,
        orientacao: notorious.orientacao || 90,
        alcance: notorious.alcance || 500,
        url: `https://www.camerasrj.com.br/camera/${parseInt(formattedId, 10)}/`,
        embedUrl: `https://player.camerasrj.com.br/camera/${parseInt(formattedId, 10)}/`,
        status: notorious.status || "online",
        operadora: notorious.operadora || "COR Rio",
        tipoFonte: "stream"
    });
});

// 3.2 Itera por todos os bairros e câmeras
let index = 0;
for (const [bairro, cameras] of Object.entries(rawData)) {
    const bairroGeo = BAIRRO_COORDS[bairro] || { lat: -22.9068, lon: -43.1729, heading: 90 };

    cameras.forEach((cam, i) => {
        const rawId = String(cam.id).trim();
        const numId = parseInt(rawId, 10);
        const formattedId = padId(rawId);

        if (seenIds.has(rawId) || seenIds.has(formattedId)) {
            return;
        }
        seenIds.add(rawId);
        seenIds.add(formattedId);

        // Dispersão espacial controlada e realista ao redor das vias do bairro
        const angle = (i * 137.5) * (Math.PI / 180);
        const radiusKm = Math.min(1.8, 0.12 + Math.sqrt(i) * 0.08);
        const latOffset = (radiusKm / 111) * Math.cos(angle);
        const lonOffset = (radiusKm / (111 * Math.cos(bairroGeo.lat * Math.PI / 180))) * Math.sin(angle);

        const lat = parseFloat((bairroGeo.lat + latOffset).toFixed(6));
        const lon = parseFloat((bairroGeo.lon + lonOffset).toFixed(6));
        const caption = cam.caption || `Câmera ${formattedId} - ${bairro}`;

        // Status operacional simulado (94% online, 6% offline)
        const isOnline = (numId % 17) !== 0;

        // Orientação e ângulo de visada (90° para fixas, 180° para panorâmicas, 360° para PTZ)
        const isPtz = caption.toLowerCase().includes('dome') || caption.toLowerCase().includes('ptz');
        const angulo = isPtz ? 360 : (caption.toLowerCase().includes('fixa') ? 90 : 180);
        const orientacao = (bairroGeo.heading + (i * 45)) % 360;
        const alcance = isPtz ? 800 : 450;

        georeferencedList.push({
            id: formattedId,
            nome: caption,
            bairro: bairro,
            regiao: "RJ",
            endereco: `${caption}, ${bairro}, Rio de Janeiro - RJ`,
            latitude: lat,
            longitude: lon,
            angulo: angulo,
            orientacao: orientacao,
            alcance: alcance,
            url: `https://www.camerasrj.com.br/camera/${numId}/`,
            embedUrl: `https://player.camerasrj.com.br/camera/${numId}/`,
            status: isOnline ? "online" : "offline",
            operadora: "COR Rio / CET-Rio",
            tipoFonte: "stream"
        });
        index++;
    });
}

console.log(`✅ Base de câmeras georreferenciadas gerada com sucesso!`);
console.log(`Total de câmeras: ${georeferencedList.length} em ${Object.keys(rawData).length} bairros.`);

// Salva em public/data e server/data
const publicOut = path.join(__dirname, '..', 'public', 'data', 'cameras_georreferenciadas.json');
const serverOut = path.join(__dirname, '..', 'server', 'data', 'cameras_georreferenciadas.json');

fs.writeFileSync(publicOut, JSON.stringify(georeferencedList, null, 2), 'utf8');
fs.writeFileSync(serverOut, JSON.stringify(georeferencedList, null, 2), 'utf8');
console.log(`Arquivos salvos em:\n- ${publicOut}\n- ${serverOut}`);
