const test = require('node:test');
const assert = require('node:assert/strict');
const { MetarProvider } = require('../../server/rit-fly/providers/metar-provider');

test('🌤️ PROVEDOR METAR & CLIMA OPERACIONAL DE AEROPORTOS', async (t) => {
    const metarProvider = new MetarProvider();

    await t.test('Deve decodificar METAR real ou sintético para os aeroportos brasileiros', async () => {
        const metarSBGL = await metarProvider.getMetarForStation('SBGL');
        assert.ok(metarSBGL, 'Deveria retornar dados METAR para SBGL (GIG)');
        assert.equal(metarSBGL.icao, 'SBGL');
        assert.equal(metarSBGL.iata, 'GIG');
        assert.ok(metarSBGL.vento && metarSBGL.vento.direcaoGraus !== undefined);
        assert.ok(metarSBGL.visibilidade && metarSBGL.visibilidade.metros !== undefined);
        assert.ok(metarSBGL.temperaturaC !== undefined);
        assert.ok(metarSBGL.flightRule, 'Deveria determinar regra de voo (VFR, MVFR ou IFR)');
    });

    await t.test('Deve classificar corretamente condições IFR quando teto ou visibilidade forem baixos', async () => {
        const rawIfr = 'METAR SBSP 131500Z 32014KT 2000 OVC008 19/18 Q1013';
        const parsed = metarProvider.parseMetar('SBSP', rawIfr, {
            wdir: 320,
            wspd: 14,
            visib: 1.2,
            cover: 'OVC'
        });

        assert.equal(parsed.flightRule, 'IFR');
        assert.equal(parsed.statusOperacional, 'OPERANDO_IFR');
        assert.equal(parsed.tetoFt, 800);
        assert.equal(parsed.visibilidade.metros, 2000);
    });

    await t.test('Deve classificar VFR quando teto for alto e visibilidade excelente', async () => {
        const rawVfr = 'METAR SBRJ 131500Z 15008KT 9999 FEW030 27/20 Q1016';
        const parsed = metarProvider.parseMetar('SBRJ', rawVfr, {
            wdir: 150,
            wspd: 8,
            visib: 10
        });

        assert.equal(parsed.flightRule, 'VFR');
        assert.equal(parsed.statusOperacional, 'ABERTO_VFR');
        assert.ok(parsed.visibilidade.metros >= 9999);
    });
});
