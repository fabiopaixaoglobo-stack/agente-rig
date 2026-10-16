/**
 * test/traffic-alert/collaborator-auth-access.test.js
 * 
 * Testes Unitários de Cadastro e Acesso de Colaborador (RIT)
 * Valida o cadastramento e autorização de acesso do Colaborador Fabio da Silva Firmo
 * (Matrícula: 94735, E-mail: fabio.jfirmo@g.globo).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const xlsx = require('xlsx');

const { findInBase, determineUserRole, loadBaseColaboradores } = require('../../server/auth');

describe('👤 CADASTRO E CONTROLE DE ACESSO DE COLABORADORES (RIT)', () => {

    test('1. Deve validar o colaborador Fabio da Silva Firmo na base com matrícula 94735 e e-mail fabio.jfirmo@g.globo', () => {
        const byBoth = findInBase('94735', 'fabio.jfirmo@g.globo');
        assert.ok(byBoth, 'Colaborador deve ser localizado por matrícula e e-mail');
        assert.equal(String(byBoth.matricula || byBoth._matricula), '94735');
        assert.equal(String(byBoth._email).toLowerCase(), 'fabio.jfirmo@g.globo');
    });

    test('2. Deve permitir busca de conformidade tanto por matrícula isolada quanto por e-mail isolado', () => {
        const byMatricula = findInBase('94735', '');
        assert.ok(byMatricula, 'Deve localizar por matrícula');
        assert.equal(String(byMatricula.matricula || byMatricula._matricula), '94735');

        const byEmail = findInBase('', 'fabio.jfirmo@g.globo');
        assert.ok(byEmail, 'Deve localizar por e-mail corporativo');
        assert.equal(String(byEmail._email).toLowerCase(), 'fabio.jfirmo@g.globo');
    });

    test('3. Papel RBAC atribuído ao colaborador deve ser "Colaborador", com função e localidade corretas', () => {
        const colab = findInBase('94735', 'fabio.jfirmo@g.globo');
        const role = determineUserRole(colab, 'fabio.jfirmo@g.globo', '94735');
        assert.equal(role, 'Colaborador', 'Papel no sistema deve ser Colaborador');
        assert.equal(colab.funcao, 'LIDER SERVICOS E LOGISTICA', 'Função deve ser LIDER SERVICOS E LOGISTICA');
        assert.equal(colab.area, 'TRANSPORTES SP', 'Área/Localidade deve ser TRANSPORTES SP');
    });

    test('4. Base de Colaboradores Excel em Normas/ deve conter o registro com Função e Localidade corretas', () => {
        const excelPath = path.resolve(__dirname, '../../Normas/Base de Colaboradores Globo para validação do Agente RIT - Abril 2025.xlsx');
        const wb = xlsx.readFile(excelPath);
        const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        const entry = data.find(r => 
            String(r.Matricula).trim() === '94735' || 
            String(r['E-mail']).trim().toLowerCase() === 'fabio.jfirmo@g.globo'
        );

        assert.ok(entry, 'Registro deve existir na planilha oficial de colaboradores');
        assert.equal(String(entry.Matricula), '94735');
        assert.equal(String(entry['E-mail']).toLowerCase(), 'fabio.jfirmo@g.globo');
        assert.equal(entry['Nome Funcionário'], 'FABIO DA SILVA FIRMO');
        assert.equal(entry.Departamento, 'TRANSPORTES SP');
        assert.equal(entry.Cargo, 'LIDER SERVICOS E LOGISTICA');
    });
});
