const assert = require('assert');
const { getFogoCruzadoOccurrences, getFogoCruzadoToken, categorizarOcorrenciaFogo } = require('../server/fogocruzado');
const { haversineDistanceMeters, pointToSegmentDistanceMeters, analisarRiscoRota } = require('../server/risk-engine');

function getHojeSaoPaulo() {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
    const year = parts.find(p => p.type === 'year').value;
    return {
        day,
        month,
        year,
        yearShort: year.slice(-2),
        dateFull: `${day}/${month}/${year}`,
        dateShort: `${day}/${month}/${year.slice(-2)}`,
        inicioDia: '00:00:00',
        fimDia: '23:59:59',
        timezone: 'America/Sao_Paulo'
    };
}

async function runTestSuite() {
    console.log("================================================================================");
    console.log("SUITE DE TESTES E VALIDAÇÃO: FOGO CRUZADO V2 + INTELIGÊNCIA GEOESPACIAL DE RISCO");
    console.log("================================================================================\n");

    const hoje = getHojeSaoPaulo();

    // 1. TESTE DO MÓDULO FOGO CRUZADO
    console.log("1. TESTE DO MÓDULO FOGO CRUZADO V2 (Auth, Parser, Categorização)");
    const catTiroteio = categorizarOcorrenciaFogo("Tiroteio com vítimas");
    assert.strictEqual(catTiroteio.icone, '🔴');
    assert.strictEqual(catTiroteio.categoria, 'tiroteio');

    const catOperacao = categorizarOcorrenciaFogo("Operação policial militar");
    assert.strictEqual(catOperacao.icone, '🟠');
    assert.strictEqual(catOperacao.categoria, 'operacao_policial');

    const catDisparo = categorizarOcorrenciaFogo("Disparo de arma de fogo");
    assert.strictEqual(catDisparo.icone, '🟡');
    assert.strictEqual(catDisparo.categoria, 'disparo_ouvido');

    const catMonitoramento = categorizarOcorrenciaFogo("Policiamento regular");
    assert.strictEqual(catMonitoramento.icone, '🟢');

    console.log("✅ Categorização e ícones do Fogo Cruzado validados.");

    const fogoResult = await getFogoCruzadoOccurrences({ estado: 'RJ', hoje });
    assert(fogoResult.ok === true, "getFogoCruzadoOccurrences deve retornar ok: true");
    assert(Array.isArray(fogoResult.occurrences), "occurrences deve ser array");
    assert(fogoResult.occurrences.length > 0, "Deve conter ocorrências do dia");
    console.log(`✅ Fogo Cruzado retornou ${fogoResult.occurrences.length} ocorrências (${fogoResult.source}).\n`);

    // 2. TESTE DO MOTOR GEOESPACIAL (HAVERSINE & PONTO-A-SEGMENTO)
    console.log("2. TESTE DE CÁLCULO GEOESPACIAL E HAVERSINE");
    // Distância conhecida: Estúdios Globo (-22.9754, -43.4116) para BarraShopping (-22.9996, -43.3601) ~= 5.9 km
    const distEstudiosBarra = haversineDistanceMeters(-22.9754, -43.4116, -22.9996, -43.3601);
    console.log(`- Distância Estúdios Globo -> BarraShopping: ${(distEstudiosBarra / 1000).toFixed(2)} km`);
    assert(distEstudiosBarra > 5000 && distEstudiosBarra < 7000, "Distância deve ser em torno de 5.9km");

    // Ponto sobre a reta
    const distPontoSegmento = pointToSegmentDistanceMeters(-22.9875, -43.3858, -22.9754, -43.4116, -22.9996, -43.3601);
    console.log(`- Distância ponto intermediário ao segmento: ${Math.round(distPontoSegmento)} m`);
    assert(distPontoSegmento < 500, "Ponto intermediário deve estar a menos de 500m do segmento");
    console.log("✅ Cálculos geodésicos validados com sucesso.\n");

    // 3. TESTE DE ANÁLISE DE RISCO DA ROTA (CRUZAMENTO COM OCORRÊNCIAS)
    console.log("3. TESTE DE CRUZAMENTO DE ROTA COM CORREDOR DE RISCO");
    // Rota 1: Passando pela Av. Brasil (perto da Maré e Caju) -> Deve ter risco ALTO/CRÍTICO
    const rotaAvBrasil = [
        [-22.9068, -43.1729], // Centro
        [-22.8850, -43.2183], // Caju
        [-22.8480, -43.2420], // Maré
        [-22.8221, -43.2904]  // Cordovil
    ];

    // Ocorrências combinadas
    const ocorrenciasTeste = [
        ...fogoResult.occurrences,
        { id: "ott-1", tipo: "Tiroteio", lat: -22.8485, lon: -43.2425, bairro: "Maré", municipio: "Rio de Janeiro", fonte: "OTT", icone: "🔫" },
        { id: "ott-2", tipo: "Operação Policial", lat: -22.8855, lon: -43.2190, bairro: "Caju", municipio: "Rio de Janeiro", fonte: "OTT", icone: "🔫" }
    ];

    // Teste com Buffer 1000m
    const risco1000 = analisarRiscoRota(rotaAvBrasil, ocorrenciasTeste, 1000);
    console.log(`- Rota Av. Brasil (Buffer 1000m): Nível = ${risco1000.nivelRisco} | Cor = ${risco1000.corRisco} | Eventos no corredor = ${risco1000.totalNoCorredor}`);
    assert(risco1000.nivelRisco === 'CRÍTICO' || risco1000.nivelRisco === 'ALTO', "Rota de alto conflito deve ser classificada como ALTO ou CRÍTICO");
    assert(risco1000.totalNoCorredor >= 2, "Deve interceptar os eventos da Maré e Caju");

    // Teste com Rota Segura (ex: Recreio -> Barra Sul)
    const rotaSegura = [
        [-23.0150, -43.4650], // Recreio
        [-23.0080, -43.4300], // Américas
        [-23.0010, -43.3900]  // Barra Sul
    ];
    const riscoSegura = analisarRiscoRota(rotaSegura, ocorrenciasTeste, 1000);
    console.log(`- Rota Recreio -> Barra Sul (Buffer 1000m): Nível = ${riscoSegura.nivelRisco} | Cor = ${riscoSegura.corRisco} | Eventos no corredor = ${riscoSegura.totalNoCorredor}`);
    assert(riscoSegura.nivelRisco === 'BAIXO' || riscoSegura.nivelRisco === 'MODERADO', "Rota sem tiroteios deve ser BAIXO ou MODERADO");

    // Teste de variação de Buffers (500m, 1000m, 2000m, 3000m)
    [500, 1000, 2000, 3000].forEach(buf => {
        const resBuf = analisarRiscoRota(rotaAvBrasil, ocorrenciasTeste, buf);
        console.log(`  [Buffer ${buf}m] Eventos interceptados: ${resBuf.totalNoCorredor} | Menor distância: ${resBuf.menorDistanciaMetros}m`);
        assert(resBuf.bufferMetros === buf, `Buffer deve ser ${buf}m`);
    });
    console.log("✅ Motor de Risco geoespacial e buffers validados com precisão.\n");

    console.log("================================================================================");
    console.log("TODOS OS TESTES DE FOGO CRUZADO E INTELIGÊNCIA DE RISCO PASSARAM COM 100% DE SUCESSO!");
    console.log("================================================================================");
}

runTestSuite().catch(err => {
    console.error("❌ ERRO NO TESTE:", err);
    process.exit(1);
});
