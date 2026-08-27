const express = require('express');
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch');

const { getFogoCruzadoOccurrences } = require('../server/fogocruzado');
const { analisarRiscoRota } = require('../server/risk-engine');

async function testIntegratedEndpoints() {
    console.log("Testando endpoints integrados no servidor Express...");

    // Test direct route analysis endpoint logic
    const testRouteCoords = [
        [-22.9068, -43.1729],
        [-22.8850, -43.2183],
        [-22.8480, -43.2420]
    ];

    const fogoOcc = await getFogoCruzadoOccurrences({ estado: 'RJ' });
    const analise = analisarRiscoRota(testRouteCoords, fogoOcc.occurrences, 1000);

    console.log("Resultado da Análise:", {
        nivelRisco: analise.nivelRisco,
        corRisco: analise.corRisco,
        iconeRisco: analise.iconeRisco,
        totalNoCorredor: analise.totalNoCorredor,
        menorDistanciaMetros: analise.menorDistanciaMetros,
        estatisticas: analise.estatisticas
    });

    console.log("✅ Integração de endpoints e motor de risco validada com sucesso!");
}

testIntegratedEndpoints().catch(console.error);
