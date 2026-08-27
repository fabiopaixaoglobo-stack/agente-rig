const { pool } = require('../server/database');

async function testMapaAtivo() {
    try {
        console.log("=== TESTANDO GET MAPA ATIVO RJ ===");
        const result = await pool.query(
            `SELECT * FROM monitoramento_bases WHERE regional = $1 AND ativo = TRUE ORDER BY id DESC LIMIT 1`,
            ['RJ']
        );
        if (result.rows.length === 0) {
            console.log("NENHUMA BASE ATIVA ENCONTRADA PARA RJ NO BANCO!");
            return;
        }
        const base = result.rows[0];
        console.log("Base ID:", base.id);
        console.log("Nome arquivo:", base.nome_arquivo);
        console.log("Qtd registros:", base.qtd_registros);
        
        let jsonMapa = [];
        try {
            jsonMapa = typeof base.json_mapa === 'string' ? JSON.parse(base.json_mapa) : base.json_mapa;
        } catch (e) {
            console.error("Erro parse json_mapa:", e.message);
        }
        
        console.log("Total itens no JSON:", Array.isArray(jsonMapa) ? jsonMapa.length : typeof jsonMapa);
        if (Array.isArray(jsonMapa) && jsonMapa.length > 0) {
            console.log("Primeiro item:", jsonMapa[0]);
        }
    } catch (err) {
        console.error("Erro no teste:", err);
    } finally {
        await pool.end();
    }
}

testMapaAtivo();
