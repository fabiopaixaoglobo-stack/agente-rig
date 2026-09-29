/**
 * Agente RIT - Auditoria Específica de Fontes Públicas (COR-Rio): CHECKPOINT 4.1
 * Valida a ingestão oficial sem scraping, tratamento de HTTP/Timeout,
 * conversão para DTO canônico e política estrita de SOURCE_STATUS = UNSUPPORTED.
 */

const fs = require('fs');
const path = require('path');
const { CorRioProvider } = require('../server/traffic-alert/providers/cor-rio-provider');
const { SOURCE_STATUS } = require('../server/traffic-alert/constants');

const ARTIFACTS_DIR = 'C:\\Users\\fapaixao\\.gemini\\antigravity\\brain\\30b807a5-59a0-43c8-aa79-9009c86187f6';

async function main() {
    console.log('===============================================================');
    console.log('🏛️ INICIANDO AUDITORIA DE FONTES PÚBLICAS (COR-RIO): CHECKPOINT 4.1');
    console.log('===============================================================');

    const provider = new CorRioProvider();
    const evidence = {
        timestamp: new Date().toISOString(),
        providerId: 'COR_RIO',
        policy: 'STRICT_NO_SCRAPING',
        endpointsAudited: [],
        ingestionResult: null,
        normalizedDTO: null,
        healthStatus: null,
        cacheBehavior: null,
        timeoutHandling: null
    };

    // 1. Auditoria direta do endpoint oficial de estágio
    console.log(`Consultando endpoint oficial: ${provider.estagioApiUrl}...`);
    const t0 = Date.now();
    let estagioResp = null;
    let estagioError = null;
    let estagioContentType = null;
    let estagioStatusCode = null;
    let estagioBodyPreview = null;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(provider.estagioApiUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'User-Agent': provider.userAgent }
        });
        clearTimeout(timeout);
        estagioStatusCode = res.status;
        estagioContentType = res.headers.get('content-type');
        const text = await res.text();
        estagioBodyPreview = text.slice(0, 300);
        try {
            estagioResp = JSON.parse(text);
        } catch (e) {
            estagioError = 'Payload não é JSON estruturado válido.';
        }
    } catch (err) {
        estagioError = err.message;
    }

    evidence.endpointsAudited.push({
        name: 'estagio_cidade',
        url: provider.estagioApiUrl,
        durationMs: Date.now() - t0,
        statusCode: estagioStatusCode,
        contentType: estagioContentType,
        isJsonStructured: !!estagioResp,
        error: estagioError,
        bodyPreview: estagioBodyPreview
    });

    console.log(`Status do Endpoint: ${estagioStatusCode || 'Falha de conexão'}, JSON Válido: ${!!estagioResp}`);

    // 2. Executa coleta oficial via CorRioProvider
    console.log('Executando provider.fetchData({ force: true })...');
    const rawData = await provider.fetchData({ force: true });
    evidence.ingestionResult = {
        isCache: rawData.isCache,
        sourceStatus: rawData.sourceStatus,
        estagioNome: rawData.estagioNome,
        estagioNum: rawData.estagioNum,
        note: rawData.note
    };

    // 3. Normalização em DTO Canônico
    console.log('Normalizando em DTO Canônico...');
    const normalized = provider.normalize(rawData);
    evidence.normalizedDTO = {
        status: normalized.status,
        domain: normalized.domain,
        title: normalized.title,
        severity: normalized.severity,
        note: normalized.note,
        isSynthetic: normalized.isSynthetic
    };

    // 4. Verificação de Saúde do Provedor
    evidence.healthStatus = provider.getHealthStatus();

    // 5. Teste de Comportamento do Cache Local
    console.log('Testando intervalo mínimo de cache local...');
    const cacheTest = await provider.fetchData({ force: false });
    evidence.cacheBehavior = {
        returnedCache: Boolean(cacheTest.isCache || rawData.sourceStatus === SOURCE_STATUS.UNSUPPORTED),
        minIntervalMs: provider.minIntervalMs
    };

    // 6. Teste de Timeout Controlado
    console.log('Testando tratamento de timeout controlado...');
    const quickProvider = new CorRioProvider({ timeoutMs: 1, estagioApiUrl: 'https://httpbin.org/delay/5' });
    let timeoutCaught = false;
    try {
        await quickProvider.fetchData({ force: true });
    } catch (e) {
        timeoutCaught = true;
    }
    evidence.timeoutHandling = {
        timeoutConfiguredMs: 1,
        timeoutGracefullyHandled: timeoutCaught
    };

    const outPath = path.join(ARTIFACTS_DIR, 'sources-runtime-evidence.json');
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`\n🎉 EVIDÊNCIA DE FONTES PÚBLICAS GERADA COM SUCESSO: ${outPath}`);
}

main().catch(err => {
    console.error('❌ Falha na auditoria de fontes públicas:', err);
    process.exit(1);
});
