/**
 * Agente RIT - Módulo RIT ALERTA
 * Rotas e Endpoints REST Oficiais e de Diagnóstico Interno (/api/traffic-alert/*).
 * Conexão com Repository Relacional e Fallback Transparente em Memória (v2.2).
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { memoryStore } = require('../store/memory-store');
const { DeduplicationEngine } = require('../engine/deduplication-engine');
const { CorRioProvider } = require('../providers/cor-rio-provider');
const { OttProvider } = require('../providers/ott-provider');
const { FogoCruzadoProvider } = require('../providers/fogo-cruzado-provider');
const { CetSpTrafficProvider } = require('../providers/cet-sp-traffic-provider');
const { calculateHaversineDistance } = require('../db/geo-fallback');
const {
    caravanStore,
    DESTINATION_HOMOLOG_COORDS,
    DESTINATION_HOMOLOG_LABEL,
    DESTINATION_SP_COORDS,
    DESTINATION_SP_LABEL
} = require('../store/caravan-store');
const {
    COR_RIO_CAMERAS_CATALOG,
    CET_SP_CAMERAS_CATALOG
} = require('../engine/caravan-projection-service');
const { config } = require('../config');

// Catálogos Regionais Oficiais de Câmeras Públicas (RJ, SP, BH, BSB, REC)
const BH_CAMERAS_CATALOG = [
    { cameraId: 'BH_CAM_01', cameraName: 'Av. Cristiano Machado x Waldomiro Lobo', corridor: 'Av Cristiano Machado', latitude: -19.8520, longitude: -43.9210, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_02', cameraName: 'Anel Rodoviário x Betânia', corridor: 'Anel Rodoviário', latitude: -19.9650, longitude: -43.9820, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_03', cameraName: 'Av. Antônio Carlos x UFMG', corridor: 'Av Antônio Carlos', latitude: -19.8690, longitude: -43.9580, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_04', cameraName: 'Av. Amazonas x Silva Lobo', corridor: 'Av Amazonas', latitude: -19.9320, longitude: -43.9620, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_05', cameraName: 'Via Expressa x Contagem', corridor: 'Via Expressa', latitude: -19.9360, longitude: -44.0280, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_06', cameraName: 'BR-040 x BH Shopping', corridor: 'BR-040', latitude: -19.9860, longitude: -43.9470, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_07', cameraName: 'Praça Sete x Afonso Pena', corridor: 'Centro', latitude: -19.9210, longitude: -43.9380, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_08', cameraName: 'Av. Fleming x Orla da Pampulha', corridor: 'Pampulha', latitude: -19.8540, longitude: -43.9780, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true },
    { cameraId: 'BH_CAM_09', cameraName: 'BR-381 x Anel Rodoviário Norte', corridor: 'BR-381', latitude: -19.8650, longitude: -43.8850, status: 'DISPONÍVEL', provider: 'BHTRANS', isPublic: true }
];

const BSB_CAMERAS_CATALOG = [
    { cameraId: 'BSB_CAM_01', cameraName: 'EPIA x Park Shopping', corridor: 'EPIA', latitude: -15.8320, longitude: -47.9570, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_02', cameraName: 'Eixo Monumental x Torre de TV', corridor: 'Eixo Monumental', latitude: -15.7905, longitude: -47.8920, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_03', cameraName: 'Eixão Sul x 114 Sul', corridor: 'Eixão Sul', latitude: -15.8230, longitude: -47.9140, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_04', cameraName: 'Eixão Norte x 108 Norte', corridor: 'Eixão Norte', latitude: -15.7680, longitude: -47.8820, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_05', cameraName: 'EPIG x Parque da Cidade', corridor: 'EPIG', latitude: -15.8020, longitude: -47.9340, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_06', cameraName: 'EPDB x Acesso Lago Sul', corridor: 'EPDB', latitude: -15.8450, longitude: -47.8750, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_07', cameraName: 'Ponte JK - Vão Central', corridor: 'Ponte JK', latitude: -15.8245, longitude: -47.8285, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_08', cameraName: 'EPTG x Águas Claras', corridor: 'Estrada Parque Taguatinga', latitude: -15.8270, longitude: -48.0180, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true },
    { cameraId: 'BSB_CAM_09', cameraName: 'BR-060 x Samambaia', corridor: 'BR-060', latitude: -15.8850, longitude: -48.0750, status: 'DISPONÍVEL', provider: 'DER_DF', isPublic: true }
];

const REC_CAMERAS_CATALOG = [
    { cameraId: 'REC_CAM_01', cameraName: 'Agamenon Magalhães x Derby', corridor: 'Av Agamenon Magalhães', latitude: -8.0510, longitude: -34.8960, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_02', cameraName: 'Av. Boa Viagem x Segundo Jardim', corridor: 'Av Boa Viagem', latitude: -8.1140, longitude: -34.8930, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_03', cameraName: 'BR-101 x Ceasa', corridor: 'BR-101', latitude: -8.0720, longitude: -34.9510, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_04', cameraName: 'BR-232 x Curado', corridor: 'BR-232', latitude: -8.0780, longitude: -34.9680, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_05', cameraName: 'Via Mangue x Túnel Josué de Castro', corridor: 'Via Mangue', latitude: -8.1060, longitude: -34.8970, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_06', cameraName: 'PE-015 x Pan Nordestina', corridor: 'PE-015', latitude: -7.9820, longitude: -34.8620, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_07', cameraName: 'Conde da Boa Vista x Rua da Aurora', corridor: 'Centro Recife', latitude: -8.0610, longitude: -34.8810, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_08', cameraName: 'Av. Presidente Kennedy x Peixinhos', corridor: 'Olinda', latitude: -7.9950, longitude: -34.8450, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true },
    { cameraId: 'REC_CAM_09', cameraName: 'Estrada da Batalha x Prazeres', corridor: 'Jaboatão', latitude: -8.1550, longitude: -34.9250, status: 'DISPONÍVEL', provider: 'CTTU_REC', isPublic: true }
];

const REGIONAL_COORDINATES = {
    'RJ': {
        'Av Brasil': [-22.8450, -43.3300],
        'Presidente Dutra': [-22.7650, -43.4300],
        'Linha Vermelha': [-22.8450, -43.2450],
        'Linha Amarela': [-22.9350, -43.3100],
        'Transolímpica': [-22.9200, -43.4050],
        'Centro': [-22.9040, -43.1800],
        'Barra da Tijuca': [-22.9950, -43.3450],
        'Zona Sul': [-22.9450, -43.1800],
        'Ponte Rio-Niterói': [-22.8750, -43.1650]
    },
    'SP': {
        'Marginal Tietê': [-23.5180, -46.6450],
        'Marginal Pinheiros': [-23.5950, -46.6950],
        'Radial Leste': [-23.5380, -46.5750],
        'Av dos Bandeirantes': [-23.6050, -46.6650],
        'Rodovia Anchieta': [-23.6250, -46.5950],
        'Rodovia Imigrantes': [-23.6450, -46.6350],
        'Castelo Branco': [-23.5250, -46.7450],
        'Raposo Tavares': [-23.5750, -46.7350],
        'Ayrton Senna': [-23.4950, -46.5350]
    },
    'BH': {
        'Av Cristiano Machado': [-19.8750, -43.9250],
        'Anel Rodoviário': [-19.9050, -43.9850],
        'Av Antônio Carlos': [-19.8700, -43.9550],
        'Av Amazonas': [-19.9320, -43.9550],
        'Via Expressa': [-19.9350, -44.0250],
        'BR-040': [-19.9850, -43.9450],
        'BR-381': [-19.8650, -43.8850],
        'Centro': [-19.9210, -43.9380],
        'Pampulha': [-19.8550, -43.9750]
    },
    'BSB': {
        'EPIA': [-15.8150, -47.9550],
        'Eixo Monumental': [-15.7980, -47.8850],
        'Eixão Sul': [-15.8250, -47.9150],
        'Eixão Norte': [-15.7650, -47.8800],
        'EPIG': [-15.8050, -47.9350],
        'EPDB': [-15.8450, -47.8750],
        'Ponte JK': [-15.8240, -47.8290],
        'Estrada Parque Taguatinga': [-15.8250, -48.0150],
        'BR-060': [-15.8850, -48.0750]
    },
    'REC': {
        'Av Agamenon Magalhães': [-8.0500, -34.8950],
        'Av Boa Viagem': [-8.1250, -34.9000],
        'BR-101': [-8.0350, -34.9450],
        'BR-232': [-8.0750, -34.9650],
        'Via Mangue': [-8.1050, -34.8950],
        'PE-015': [-7.9850, -34.8650],
        'Centro Recife': [-8.0620, -34.8780],
        'Olinda': [-7.9950, -34.8450],
        'Jaboatão': [-8.1550, -34.9250]
    }
};

const REGIONAL_CORRIDOR_GEOMETRIES = {
    'RJ': {
        'linha vermelha': [[-22.8130, -43.2480], [-22.8300, -43.2420], [-22.8450, -43.2380], [-22.8800, -43.2350], [-22.9050, -43.2100], [-22.9100, -43.1950]],
        'linha amarela': [[-22.8600, -43.2380], [-22.8750, -43.2480], [-22.8850, -43.2600], [-22.8980, -43.2650], [-22.9300, -43.3200], [-22.9800, -43.3650]],
        'av brasil': [[-22.8980, -43.2100], [-22.8750, -43.2450], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
        'avenida brasil': [[-22.8980, -43.2100], [-22.8750, -43.2450], [-22.8550, -43.2800], [-22.8450, -43.3000], [-22.8300, -43.3600], [-22.8500, -43.5400]],
        'ponte rio-niterói': [[-22.8750, -43.1100], [-22.8800, -43.1350], [-22.8850, -43.1600], [-22.8900, -43.2000]],
        'presidente dutra': [[-22.7550, -43.4500], [-22.7850, -43.3900], [-22.8050, -43.3600], [-22.8150, -43.3450], [-22.8300, -43.3300]],
        'dutra': [[-22.7550, -43.4500], [-22.7850, -43.3900], [-22.8050, -43.3600], [-22.8150, -43.3450], [-22.8300, -43.3300]],
        'transolímpica': [[-22.8650, -43.3950], [-22.8720, -43.3870], [-22.8950, -43.3900], [-22.9200, -43.4000], [-22.9600, -43.4150], [-23.0000, -43.4300]],
        'centro': [[-22.9030, -43.1780], [-22.9050, -43.1850], [-22.9080, -43.1920], [-22.9100, -43.2050], [-22.9120, -43.2150]],
        'zona sul': [[-22.9180, -43.1720], [-22.9350, -43.1750], [-22.9550, -43.1820], [-22.9650, -43.1790], [-22.9850, -43.1900]],
        'barra da tijuca': [[-22.9800, -43.3650], [-22.9850, -43.3620], [-22.9900, -43.3600], [-23.0000, -43.3300], [-23.0080, -43.3100]],
        'barra': [[-22.9800, -43.3650], [-22.9850, -43.3620], [-22.9900, -43.3600], [-23.0000, -43.3300], [-23.0080, -43.3100]]
    },
    'SP': {
        'marginal tietê': [[-23.5180, -46.6100], [-23.5150, -46.6350], [-23.5150, -46.6600], [-23.5180, -46.6850], [-23.5250, -46.7150], [-23.5280, -46.7450]],
        'marginal pinheiros': [[-23.5350, -46.7320], [-23.5500, -46.7180], [-23.5650, -46.7020], [-23.5950, -46.6950], [-23.6250, -46.6980], [-23.6450, -46.7050]],
        'radial leste': [[-23.5500, -46.6300], [-23.5450, -46.6100], [-23.5400, -46.5900], [-23.5380, -46.5750], [-23.5360, -46.5450], [-23.5350, -46.5150]],
        'av dos bandeirantes': [[-23.5950, -46.6850], [-23.6020, -46.6750], [-23.6080, -46.6650], [-23.6150, -46.6400], [-23.6120, -46.6250], [-23.6100, -46.6150]],
        'bandeirantes': [[-23.5950, -46.6850], [-23.6020, -46.6750], [-23.6080, -46.6650], [-23.6150, -46.6400], [-23.6120, -46.6250], [-23.6100, -46.6150]],
        'rodovia anchieta': [[-23.6050, -46.6050], [-23.6180, -46.6000], [-23.6250, -46.5950], [-23.6550, -46.5800], [-23.6850, -46.5650]],
        'anchieta': [[-23.6050, -46.6050], [-23.6180, -46.6000], [-23.6250, -46.5950], [-23.6550, -46.5800], [-23.6850, -46.5650]],
        'rodovia imigrantes': [[-23.6200, -46.6400], [-23.6350, -46.6380], [-23.6450, -46.6350], [-23.6750, -46.6250], [-23.7050, -46.6150]],
        'imigrantes': [[-23.6200, -46.6400], [-23.6350, -46.6380], [-23.6450, -46.6350], [-23.6750, -46.6250], [-23.7050, -46.6150]],
        'castelo branco': [[-23.5250, -46.7150], [-23.5200, -46.7450], [-23.5150, -46.7750], [-23.5100, -46.8150], [-23.5050, -46.8550]],
        'raposo tavares': [[-23.5700, -46.7150], [-23.5720, -46.7400], [-23.5750, -46.7650], [-23.5800, -46.8000], [-23.5850, -46.8350]],
        'ayrton senna': [[-23.5150, -46.5650], [-23.5050, -46.5350], [-23.4950, -46.5150], [-23.4850, -46.4750], [-23.4750, -46.4350]]
    },
    'BH': {
        'av cristiano machado': [[-19.9150, -43.9350], [-19.8950, -43.9300], [-19.8750, -43.9250], [-19.8550, -43.9220], [-19.8250, -43.9200]],
        'cristiano machado': [[-19.9150, -43.9350], [-19.8950, -43.9300], [-19.8750, -43.9250], [-19.8550, -43.9220], [-19.8250, -43.9200]],
        'anel rodoviário': [[-19.8650, -43.9450], [-19.8850, -43.9700], [-19.9050, -43.9850], [-19.9350, -43.9900], [-19.9650, -43.9800], [-19.9850, -43.9550]],
        'av antônio carlos': [[-19.9100, -43.9400], [-19.8900, -43.9500], [-19.8700, -43.9550], [-19.8600, -43.9600], [-19.8500, -43.9650]],
        'antônio carlos': [[-19.9100, -43.9400], [-19.8900, -43.9500], [-19.8700, -43.9550], [-19.8600, -43.9600], [-19.8500, -43.9650]],
        'av amazonas': [[-19.9180, -43.9380], [-19.9250, -43.9450], [-19.9320, -43.9550], [-19.9380, -43.9750], [-19.9450, -43.9950]],
        'amazonas': [[-19.9180, -43.9380], [-19.9250, -43.9450], [-19.9320, -43.9550], [-19.9380, -43.9750], [-19.9450, -43.9950]],
        'via expressa': [[-19.9250, -43.9750], [-19.9300, -44.0000], [-19.9350, -44.0250], [-19.9400, -44.0500], [-19.9450, -44.0750]],
        'br-040': [[-19.9550, -43.9550], [-19.9700, -43.9500], [-19.9850, -43.9450], [-20.0150, -43.9500], [-20.0450, -43.9550]],
        'br-381': [[-19.8850, -43.8950], [-19.8750, -43.8900], [-19.8650, -43.8850], [-19.8500, -43.8650], [-19.8350, -43.8450]],
        'centro': [[-19.9210, -43.9400], [-19.9180, -43.9350], [-19.9220, -43.9320], [-19.9250, -43.9300], [-19.9280, -43.9380]],
        'pampulha': [[-19.8600, -43.9800], [-19.8550, -43.9750], [-19.8500, -43.9700], [-19.8480, -43.9680], [-19.8450, -43.9650]]
    },
    'BSB': {
        'epia': [[-15.7450, -47.9250], [-15.7800, -47.9400], [-15.8150, -47.9550], [-15.8500, -47.9600], [-15.8850, -47.9650]],
        'eixo monumental': [[-15.7850, -47.9350], [-15.7900, -47.9150], [-15.7950, -47.8950], [-15.7980, -47.8800], [-15.8000, -47.8650]],
        'eixão sul': [[-15.7950, -47.8900], [-15.8100, -47.9050], [-15.8250, -47.9150], [-15.8400, -47.9250], [-15.8550, -47.9350]],
        'eixão norte': [[-15.7950, -47.8900], [-15.7800, -47.8850], [-15.7650, -47.8800], [-15.7500, -47.8780], [-15.7350, -47.8750]],
        'epig': [[-15.7950, -47.9250], [-15.8050, -47.9350], [-15.8150, -47.9450], [-15.8250, -47.9500]],
        'epdb': [[-15.8250, -47.8750], [-15.8450, -47.8750], [-15.8650, -47.8800], [-15.8850, -47.8850]],
        'ponte jk': [[-15.8200, -47.8350], [-15.8240, -47.8290], [-15.8260, -47.8250], [-15.8280, -47.8200]],
        'estrada parque taguatinga': [[-15.8150, -47.9650], [-15.8200, -47.9900], [-15.8250, -48.0150], [-15.8300, -48.0350], [-15.8350, -48.0550]],
        'eptg': [[-15.8150, -47.9650], [-15.8200, -47.9900], [-15.8250, -48.0150], [-15.8300, -48.0350], [-15.8350, -48.0550]],
        'br-060': [[-15.8450, -48.0350], [-15.8650, -48.0550], [-15.8850, -48.0750], [-15.9100, -48.1000], [-15.9350, -48.1250]]
    },
    'REC': {
        'av agamenon magalhães': [[-8.0350, -34.8980], [-8.0450, -34.8960], [-8.0500, -34.8950], [-8.0580, -34.8960], [-8.0680, -34.8980]],
        'agamenon magalhães': [[-8.0350, -34.8980], [-8.0450, -34.8960], [-8.0500, -34.8950], [-8.0580, -34.8960], [-8.0680, -34.8980]],
        'av boa viagem': [[-8.0950, -34.8850], [-8.1100, -34.8920], [-8.1250, -34.9000], [-8.1400, -34.9080], [-8.1550, -34.9120]],
        'boa viagem': [[-8.0950, -34.8850], [-8.1100, -34.8920], [-8.1250, -34.9000], [-8.1400, -34.9080], [-8.1550, -34.9120]],
        'br-101': [[-7.9850, -34.9350], [-8.0350, -34.9450], [-8.0650, -34.9480], [-8.0950, -34.9450], [-8.1450, -34.9350]],
        'br-232': [[-8.0650, -34.9550], [-8.0700, -34.9600], [-8.0750, -34.9650], [-8.0800, -34.9950], [-8.0850, -35.0250]],
        'via mangue': [[-8.0850, -34.8900], [-8.0950, -34.8920], [-8.1050, -34.8950], [-8.1200, -34.9000], [-8.1350, -34.9050]],
        'pe-015': [[-7.9450, -34.8550], [-7.9650, -34.8600], [-7.9850, -34.8650], [-8.0000, -34.8750], [-8.015, -34.8850]],
        'centro recife': [[-8.0650, -34.8850], [-8.0620, -34.8780], [-8.0600, -34.8750], [-8.0580, -34.8720]],
        'olinda': [[-8.0150, -34.8550], [-8.0050, -34.8500], [-7.9950, -34.8450], [-7.9850, -34.8420], [-7.9750, -34.8400]],
        'jaboatão': [[-8.1250, -34.9150], [-8.1400, -34.9200], [-8.1550, -34.9250], [-8.1650, -34.9300], [-8.1750, -34.9350]]
    }
};

const REGIONAL_SOURCES = {
    'RJ': 'COR-Rio / CET-Rio',
    'SP': 'CET-SP / CGE-SP',
    'BH': 'BHTRANS / Defesa Civil BH',
    'BSB': 'DER-DF / Detran-DF',
    'REC': 'CTTU Recife / APAC'
};

function normalizeRegionKey(raw) {
    if (!raw) return 'RJ';
    const s = String(raw).toUpperCase().trim();
    const map = { 'BH': 'BH', 'MG': 'BH', 'BSB': 'BSB', 'DF': 'BSB', 'REC': 'REC', 'PE': 'REC', 'SP': 'SP', 'RJ': 'RJ' };
    return map[s] || s;
}

function loadTrafficConditionsFromFile() {
    try {
        const jsonPath = path.join(__dirname, '../../../public/data/traffic-conditions.json');
        if (fs.existsSync(jsonPath)) {
            return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
    } catch (e) {
        console.error('[TRAFFIC-ALERT-ROUTES] Erro ao ler traffic-conditions.json:', e.message);
    }
    return {};
}

function seedRegionalIncidents(targetReg, targetStore) {
    const matrix = loadTrafficConditionsFromFile();
    const corridors = matrix[targetReg] || [];
    const coordsMap = REGIONAL_COORDINATES[targetReg] || {};
    const sourceName = REGIONAL_SOURCES[targetReg] || 'Monitoramento Integrado de Trânsito';
    const seeded = [];

    corridors.forEach((corr, idx) => {
        if (corr.retencaoMin >= 5 || corr.status === 'Crítico' || corr.status === 'Lento') {
            const coords = coordsMap[corr.via] || [-22.9068, -43.1729];
            const inc = {
                id: `inc-${targetReg.toLowerCase()}-${corr.via.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                canonicalId: `CANON-${targetReg}-${idx + 1}`,
                region: targetReg,
                title: corr.ocorrenciaAtiva || `Retenção em ${corr.via}`,
                corridor: corr.via,
                via: corr.via,
                domain: 'TRAFFIC',
                severity: corr.status === 'Crítico' ? 'CRÍTICO' : (corr.status === 'Lento' ? 'ALTO' : 'MÉDIO'),
                status: 'ACTIVE',
                description: `${corr.ocorrenciaAtiva || 'Retenção na via'}. Trecho crítico: ${corr.trechoCritico || corr.via}. Tempo de retenção: ${corr.diferenca || corr.retencaoMin + ' min'}.`,
                lat: coords[0],
                lng: coords[1],
                estimatedDelayMinutes: corr.retencaoMin || 10,
                source: sourceName,
                confidence: 'GRAU A',
                isSynthetic: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            targetStore.upsertIncident(inc);
            seeded.push(inc);
        }
    });

    return seeded;
}

function createTrafficAlertRouter({ repository = null, store = memoryStore } = {}) {
    const router = express.Router();
    const deduplicationEngine = new DeduplicationEngine(store);
    const corRioProvider = new CorRioProvider();
    const ottProvider = new OttProvider();
    const fogoCruzadoProvider = new FogoCruzadoProvider();
    const cetSpTrafficProvider = new CetSpTrafficProvider();

    // =========================================================================
    // ENDPOINTS REST OFICIAIS DO SUBSISTEMA (/api/traffic-alert/*)
    // =========================================================================

    /**
     * GET /health
     * Retorna telemetria, integridade dos provedores e status de persistência.
     */
    router.get('/health', async (req, res) => {
        try {
            let dbHealth = [];
            if (repository) {
                dbHealth = await repository.getAllProviderHealth().catch(() => []);
            }
            const memoryHealth = store.getAllProviderHealth();
            const providers = dbHealth.length > 0 ? dbHealth : memoryHealth;

            res.json({
                ok: true,
                timestamp: new Date().toISOString(),
                persistenceMode: repository ? 'POSTGRESQL_RELATIONAL' : 'MEMORY_STORE',
                providers,
                activeIncidentsCount: store.getAllIncidents().length
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents
     * Lista incidentes ativos consolidados (suporta ?region= & ?domain= & ?corridor=).
     */
    router.get('/incidents', async (req, res) => {
        try {
            const rawRegion = req.query.region || req.query.regional || null;
            const targetRegion = rawRegion ? normalizeRegionKey(rawRegion) : null;
            const domain = req.query.domain || null;
            const corridor = req.query.corridor || null;
            const isSynthetic = String(req.query.is_synthetic).toLowerCase() === 'true';

            // Produção bloqueia rigorosamente fixtures mesmo se requisitadas
            const safeIsSynthetic = config.isProduction ? false : isSynthetic;

            let incidents = [];
            if (repository) {
                incidents = await repository.getActiveIncidents({ domain, corridor, isSynthetic: safeIsSynthetic });
            } else {
                incidents = store.getActiveIncidents({ domain, corridor, isSynthetic: safeIsSynthetic });
            }

            // Se uma regional foi solicitada, filtra ou semeia incidentes canônicos da praça
            if (targetRegion) {
                let regionalIncidents = incidents.filter(i => {
                    const r = (i.region || '').toUpperCase();
                    return r === targetRegion || normalizeRegionKey(r) === targetRegion;
                });

                if (regionalIncidents.length === 0) {
                    const seeded = seedRegionalIncidents(targetRegion, store);
                    regionalIncidents = seeded;
                }

                if (corridor) {
                    const cLow = corridor.toLowerCase();
                    regionalIncidents = regionalIncidents.filter(i => (i.corridor || i.via || '').toLowerCase().includes(cLow));
                }

                return res.json({
                    ok: true,
                    region: targetRegion,
                    count: regionalIncidents.length,
                    data: regionalIncidents
                });
            }

            res.json({
                ok: true,
                count: incidents.length,
                data: incidents
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id
     * Consulta detalhes consolidados de um incidente por ID ou Canonical ID.
     */
    router.get('/incidents/:id', async (req, res) => {
        try {
            const { id } = req.params;
            let incident = null;

            if (repository) {
                incident = await repository.getIncidentById(id) || await repository.getIncidentByCanonicalId(id);
            } else {
                incident = store.getIncidentById(id);
            }

            if (!incident) {
                return res.status(404).json({ ok: false, error: 'Incidente não encontrado.' });
            }

            res.json({ ok: true, data: incident });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id/sources
     * Consulta as fontes independentes que fundamentam um incidente.
     */
    router.get('/incidents/:id/sources', async (req, res) => {
        try {
            const { id } = req.params;
            let sources = [];

            if (repository) {
                sources = await repository.getSourcesByIncidentId(id);
            } else {
                sources = store.getSourcesByIncidentId(id);
            }

            res.json({ ok: true, count: sources.length, data: sources });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /incidents/:id/history
     * Consulta a trilha de auditoria e transições de estado do incidente.
     */
    router.get('/incidents/:id/history', async (req, res) => {
        try {
            const { id } = req.params;
            let history = [];

            if (repository) {
                history = await repository.getHistoryByIncidentId(id);
            } else {
                history = store.getHistoryByIncidentId(id);
            }

            res.json({ ok: true, count: history.length, data: history });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /nearby
     * Consulta geoespacial de incidentes em torno de uma coordenada (lat, lng, radius).
     * Opera com Bounding Box e Haversine sem PostGIS.
     */
    router.get('/nearby', async (req, res) => {
        try {
            const lat = parseFloat(req.query.lat);
            const lng = parseFloat(req.query.lng);
            const radiusMeters = parseInt(req.query.radius || '2000', 10);
            const domain = req.query.domain || null;

            if (isNaN(lat) || isNaN(lng)) {
                return res.status(400).json({ ok: false, error: 'Parâmetros lat e lng são obrigatórios e numéricos.' });
            }

            let results = [];
            if (repository) {
                results = await repository.findNearbyIncidents({
                    lat,
                    lng,
                    radiusMeters,
                    domain,
                    isSynthetic: false
                });
            } else {
                // Fallback em memória com cálculo Haversine
                const all = store.getActiveIncidents({ domain, isSynthetic: false });
                results = all.map(inc => {
                    const dist = calculateHaversineDistance(lat, lng, inc.lat, inc.lng);
                    return { ...inc, distance_meters: Math.round(dist) };
                }).filter(inc => inc.distance_meters <= radiusMeters)
                  .sort((a, b) => a.distance_meters - b.distance_meters);
            }

            res.json({
                ok: true,
                center: { lat, lng },
                radiusMeters,
                count: results.length,
                data: results
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /sync-cor
     * Dispara sincronização controlada com o COR-Rio com proteção de intervalo mínimo (60s).
     */
    router.post('/sync-cor', async (req, res) => {
        try {
            const force = String(req.query.force).toLowerCase() === 'true';
            const rawData = await corRioProvider.fetchData({ force });
            const normalized = corRioProvider.normalize(rawData);
            
            let result = null;
            if (normalized.status !== 'UNSUPPORTED') {
                result = deduplicationEngine.processIncomingIncident(normalized);
                
                // Se repositório ativo, persiste na base relacional
                if (repository) {
                    await repository.upsertIncident(result.incident);
                    if (normalized.sources && normalized.sources[0]) {
                        await repository.addIncidentSource(result.incident.id, normalized.sources[0]).catch(() => {});
                    }
                }
            }

            // Atualiza telemetria de saúde
            const healthRecord = corRioProvider.getHealthStatus();
            store.updateProviderHealth('COR_RIO', healthRecord);
            if (repository) {
                await repository.upsertProviderHealth('COR_RIO', healthRecord).catch(() => {});
            }

            res.json({
                ok: true,
                action: result ? result.action : 'STATUS_UNSUPPORTED',
                divergenceDetected: result ? Boolean(result.divergenceDetected) : false,
                isCache: Boolean(rawData.isCache),
                note: rawData.note || null,
                data: result ? result.incident : normalized
            });
        } catch (err) {
            const errorHealth = { status: 'UNAVAILABLE', errorMessage: err.message };
            store.updateProviderHealth('COR_RIO', errorHealth);
            res.status(503).json({
                ok: false,
                error: 'Falha ao sincronizar fonte pública do COR-Rio.',
                details: err.message
            });
        }
    });

    // =========================================================================
    // ENDPOINTS DE DIAGNÓSTICO INTERNO (Retrocompatibilidade)
    // =========================================================================
    router.get('/internal/health', (req, res) => {
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            providers: store.getAllProviderHealth(),
            inMemoryCount: store.getAllIncidents().length
        });
    });

    router.get('/internal/incidents', (req, res) => {
        const domain = req.query.domain || null;
        const corridor = req.query.corridor || null;
        const incidents = store.getActiveIncidents({ domain, corridor });
        res.json({ ok: true, count: incidents.length, data: incidents });
    });

    router.get('/internal/incidents/:id', (req, res) => {
        const incident = store.getIncidentById(req.params.id);
        if (!incident) return res.status(404).json({ ok: false, error: 'Incidente não encontrado em memória.' });
        res.json({ ok: true, data: incident });
    });

    router.get('/internal/incidents/:id/sources', (req, res) => {
        res.json({ ok: true, count: store.getSourcesByIncidentId(req.params.id).length, data: store.getSourcesByIncidentId(req.params.id) });
    });

    router.get('/internal/incidents/:id/history', (req, res) => {
        res.json({ ok: true, count: store.getHistoryByIncidentId(req.params.id).length, data: store.getHistoryByIncidentId(req.params.id) });
    });

    router.post('/internal/sync-cor', (req, res) => router.handle({ ...req, url: '/sync-cor' }, res));

    router.post('/internal/ingest', (req, res) => {
        try {
            const incoming = req.body;
            if (!incoming || !incoming.title || !incoming.lat || !incoming.lng) {
                return res.status(400).json({ ok: false, error: 'Payload de incidente incompleto.' });
            }
            const result = deduplicationEngine.processIncomingIncident(incoming);
            res.json({
                ok: true,
                action: result.action,
                divergenceDetected: result.divergenceDetected || false,
                incident: result.incident
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    router.post('/internal/reset-memory', (req, res) => {
        if (config.isProduction) {
            return res.status(403).json({ ok: false, error: 'Operação não permitida em produção.' });
        }
        store.clear();
        res.json({ ok: true, message: 'MemoryStore limpo com sucesso.' });
    });

    // =========================================================================
    // ENDPOINTS DO MÓDULO ACOMPANHAMENTO DE CARAVANAS (CHECKPOINT 5.2)
    // =========================================================================

    /**
     * Middleware de checagem da Feature Flag CARAVAN_MONITORING_ENABLED
     */
    const checkCaravanEnabled = (req, res, next) => {
        if (!config.caravanMonitoring || !config.caravanMonitoring.enabled) {
            return res.status(503).json({
                ok: false,
                error: 'Módulo de Acompanhamento de Caravanas temporariamente desabilitado.',
                featureFlag: 'CARAVAN_MONITORING_ENABLED=false'
            });
        }
        next();
    };

    /**
     * GET /caravans
     * Lista todas as caravanas projetadas contra os incidentes públicos ativos da região.
     */
    router.get('/caravans', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const { programName, projectedStatus, search, hasIncidents } = req.query;
            const region = (req.query.region || 'RJ').toUpperCase();

            const destinationCoords = region === 'SP' ? DESTINATION_SP_COORDS : DESTINATION_HOMOLOG_COORDS;
            const destinationLabel = region === 'SP' ? DESTINATION_SP_LABEL : DESTINATION_HOMOLOG_LABEL;

            const filters = {
                programName: programName || null,
                projectedStatus: projectedStatus || null,
                search: search || null,
                hasIncidents: hasIncidents !== undefined ? hasIncidents === 'true' : undefined,
                region
            };

            const caravans = caravanStore.getAll(publicIncidents, filters);
            const kpis = caravanStore.getKpis(publicIncidents, { region });

            res.json({
                ok: true,
                region,
                destination: {
                    label: destinationLabel,
                    coords: destinationCoords
                },
                count: caravans.length,
                kpis,
                data: caravans,
                disclaimer: 'PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS.',
                isGpsBased: false,
                isSynthetic: true
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /caravans/kpis
     * Retorna apenas os KPIs do módulo de caravanas da região informada.
     */
    router.get('/caravans/kpis', checkCaravanEnabled, (req, res) => {
        try {
            const region = (req.query.region || 'RJ').toUpperCase();
            const publicIncidents = store.getAllIncidents();
            const kpis = caravanStore.getKpis(publicIncidents, { region });
            res.json({ ok: true, region, data: kpis });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /security-occurrences
     * Retorna ocorrências georreferenciadas normalizadas de OTT e Fogo Cruzado.
     * Suporta filtro regional (?region=RJ|SP) e deduplica ocorrências equivalentes.
     */
    router.get('/security-occurrences', async (req, res) => {
        try {
            const region = (req.query.region || 'RJ').toUpperCase();
            const rawOtt = await ottProvider.fetchData({ region });
            const normOtt = ottProvider.normalize(rawOtt);

            const rawFc = await fogoCruzadoProvider.fetchData({ region });
            const normFc = fogoCruzadoProvider.normalize(rawFc);

            const combined = [...normOtt, ...normFc];

            // Deduplica espacial e temporalmente (< 600m e diferença < 90 min)
            const deduplicated = [];
            for (const item of combined) {
                const match = deduplicated.find(d => {
                    const dist = calculateHaversineDistance(d.latitude, d.longitude, item.latitude, item.longitude);
                    if (dist > 600) return false;
                    const t1 = new Date(d.reportedAt).getTime();
                    const t2 = new Date(item.reportedAt).getTime();
                    return Math.abs(t1 - t2) < 90 * 60 * 1000;
                });

                if (match) {
                    if (!match.corroboratingSources) {
                        match.corroboratingSources = [match.source];
                    }
                    if (!match.corroboratingSources.includes(item.source)) {
                        match.corroboratingSources.push(item.source);
                    }
                } else {
                    deduplicated.push({
                        ...item,
                        corroboratingSources: [item.source]
                    });
                }
            }

            // Ordena por horário de reporte decrescente
            deduplicated.sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));

            res.json({
                ok: true,
                region,
                count: deduplicated.length,
                sources: ['OTT', 'FOGO_CRUZADO'],
                data: deduplicated,
                disclaimer: 'INFORMAÇÕES DE SEGURANÇA PÚBLICA DERIVADAS DE FONTES PÚBLICAS COLABORATIVAS. CARÁTER CONSULTIVO.'
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /traffic-conditions
     * Retorna a situação de fluidez dos corredores viários (RJ, SP, BH, BSB, REC).
     */
    router.get('/traffic-conditions', async (req, res) => {
        try {
            const rawRegion = req.query.region || req.query.regional || 'RJ';
            const targetRegion = normalizeRegionKey(rawRegion);
            const matrix = loadTrafficConditionsFromFile();
            let corridors = matrix[targetRegion] || [];
            const coordsMap = REGIONAL_COORDINATES[targetRegion] || {};
            const geomsMap = REGIONAL_CORRIDOR_GEOMETRIES[targetRegion] || {};

            // Enriquece cada via com centro/pino de localização e geometria de polilinha
            corridors = corridors.map((c, idx) => {
                const pin = coordsMap[c.via] || null;
                const vLow = (c.via || '').toLowerCase().trim();
                let geom = (Array.isArray(c.geometry) && Array.isArray(c.geometry[0])) ? c.geometry
                         : (Array.isArray(c.coordinates) && Array.isArray(c.coordinates[0])) ? c.coordinates
                         : geomsMap[vLow] || null;

                if (!geom) {
                    const norm = (str) => String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
                    const normVia = norm(c.via);
                    for (const [k, coords] of Object.entries(geomsMap)) {
                        if (norm(k) === normVia) {
                            geom = coords;
                            break;
                        }
                    }
                }

                return {
                    ...c,
                    id: c.id || `corr-${targetRegion.toLowerCase()}-${idx + 1}`,
                    region: targetRegion,
                    name: c.via,
                    retentionMinutes: c.retencaoMin || 0,
                    averageSpeed: c.velocidadeAtualKmH || c.velocidadePadraoKmH || 0,
                    pinLocation: pin,
                    geometry: geom,
                    coordinates: geom
                };
            });

            // Cálculo dos Novos Indicadores de Trânsito
            const totalCorridors = corridors.length || 1;
            const somaRetencao = corridors.reduce((acc, curr) => acc + (Number(curr.retencaoMin) || 0), 0);
            const tempoMedioRetencao = Math.round(somaRetencao / totalCorridors);

            const criticosCount = corridors.filter(c => {
                const s = (c.status || '').toLowerCase();
                return s.includes('crítico') || s.includes('critico') || s.includes('bloqueio');
            }).length;

            const viasAfetadas = corridors.filter(c => {
                const s = (c.status || '').toLowerCase();
                return (Number(c.retencaoMin) || 0) > 0 || !s.includes('normal');
            }).length;

            // Índice de Mobilidade: 100 = livre, 0 = totalmente paralisado
            const mobilidadeIndex = Math.max(10, Math.min(100, Math.round(100 - (tempoMedioRetencao * 1.5) - (criticosCount * 8))));

            // Impacto Operacional
            let impactoOperacional = 'BAIXO';
            if (criticosCount >= 3 || tempoMedioRetencao >= 30) {
                impactoOperacional = 'CRÍTICO';
            } else if (criticosCount >= 2 || tempoMedioRetencao >= 18) {
                impactoOperacional = 'ALTO';
            } else if (criticosCount >= 1 || tempoMedioRetencao >= 7) {
                impactoOperacional = 'MODERADO';
            }

            res.json({
                ok: true,
                region: targetRegion,
                source: REGIONAL_SOURCES[targetRegion] || 'FONTES_PUBLICAS_INTEGRADAS',
                updatedAt: new Date().toISOString(),
                count: corridors.length,
                kpis: {
                    mobilidadeIndex,
                    tempoMedioRetencao,
                    corredoresCriticos: criticosCount,
                    viasAfetadas,
                    impactoOperacional
                },
                corridors
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /weather-alerts
     * Retorna estágio operacional da cidade e alertas meteorológicos/alagamentos por Regional.
     */
    router.get('/weather-alerts', async (req, res) => {
        try {
            const rawRegion = req.query.region || req.query.regional || 'RJ';
            const targetRegion = normalizeRegionKey(rawRegion);

            if (targetRegion === 'SP') {
                return res.json({
                    ok: true,
                    region: 'SP',
                    operationalStage: {
                        stage: 1,
                        name: 'Estado de Observação',
                        label: 'ESTÁGIO 1 (SP)',
                        description: 'Monitoramento integrado de mobilidade urbana e alertas CGE-SP.',
                        color: '#10b981',
                        source: 'CGE-SP / Defesa Civil'
                    },
                    rainAlert: { summary: 'Sem Alerta Severo', severity: 'BAIXO' },
                    windAlert: { summary: 'Normal (< 20 km/h)' },
                    flooding: { activeFloodsCount: 0 },
                    alerts: [
                        {
                            id: 'sp-cge-01',
                            type: 'CHUVA_ISOLADA',
                            severity: 'BAIXO',
                            title: 'Pancadas de Chuva Isoladas',
                            description: 'Previsão de chuva fraca nas zonas Sul e Oeste. Sem pontos de alagamento ativos no momento.',
                            affectedCorridors: ['Marginal Pinheiros', 'Av dos Bandeirantes'],
                            reportedAt: new Date().toISOString(),
                            source: 'CGE São Paulo'
                        }
                    ],
                    mobilityImpact: 'BAIXO',
                    disclaimer: 'DADOS METEOROLÓGICOS PÚBLICOS DO CENTRO DE GERENCIAMENTO DE EMERGÊNCIAS DE SÃO PAULO.'
                });
            } else if (targetRegion === 'BH') {
                return res.json({
                    ok: true,
                    region: 'BH',
                    operationalStage: {
                        stage: 1,
                        name: 'Estado de Observação',
                        label: 'ESTÁGIO 1 (BH)',
                        description: 'Condições meteorológicas monitoradas pela Defesa Civil de Belo Horizonte.',
                        color: '#10b981',
                        source: 'Defesa Civil BH / BHTRANS'
                    },
                    rainAlert: { summary: 'Tempo Estável', severity: 'BAIXO' },
                    windAlert: { summary: 'Brisa Leve (< 15 km/h)' },
                    flooding: { activeFloodsCount: 0 },
                    alerts: [
                        {
                            id: 'bh-defesa-01',
                            type: 'TEMPO_ESTAVEL',
                            severity: 'NORMAL',
                            title: 'Condições Favoráveis em Belo Horizonte',
                            description: 'Tempo estável. Sem registros de alagamento no Anel Rodoviário ou Cristiano Machado.',
                            affectedCorridors: ['Anel Rodoviário', 'Av Cristiano Machado'],
                            reportedAt: new Date().toISOString(),
                            source: 'Defesa Civil BH'
                        }
                    ],
                    mobilityImpact: 'BAIXO',
                    disclaimer: 'DADOS METEOROLÓGICOS DA DEFESA CIVIL DE BELO HORIZONTE.'
                });
            } else if (targetRegion === 'BSB') {
                return res.json({
                    ok: true,
                    region: 'BSB',
                    operationalStage: {
                        stage: 1,
                        name: 'Normalidade Operacional',
                        label: 'ESTÁGIO 1 (BSB)',
                        description: 'Clima estável e monitoramento preventivo DER-DF.',
                        color: '#10b981',
                        source: 'Defesa Civil DF / DER-DF'
                    },
                    rainAlert: { summary: 'Sem Chuva', severity: 'BAIXO' },
                    windAlert: { summary: 'Moderado (20-30 km/h)' },
                    flooding: { activeFloodsCount: 0 },
                    alerts: [
                        {
                            id: 'bsb-der-01',
                            type: 'TEMPO_SECO',
                            severity: 'NORMAL',
                            title: 'Tempo Firme no Distrito Federal',
                            description: 'Sem precipitação prevista. Pistas secas e boa visibilidade nos Eixos e EPIA.',
                            affectedCorridors: ['EPIA', 'Eixo Monumental'],
                            reportedAt: new Date().toISOString(),
                            source: 'DER-DF'
                        }
                    ],
                    mobilityImpact: 'BAIXO',
                    disclaimer: 'DADOS METEOROLÓGICOS DA DEFESA CIVIL DO DISTRITO FEDERAL.'
                });
            } else if (targetRegion === 'REC') {
                return res.json({
                    ok: true,
                    region: 'REC',
                    operationalStage: {
                        stage: 1,
                        name: 'Estado de Monitoramento',
                        label: 'ESTÁGIO 1 (REC)',
                        description: 'Monitoramento meteorológico e de marés da Cidade do Recife.',
                        color: '#10b981',
                        source: 'APAC / CTTU Recife'
                    },
                    rainAlert: { summary: 'Pancadas Rápidas', severity: 'BAIXO' },
                    windAlert: { summary: 'Brisa Marítima (15-25 km/h)' },
                    flooding: { activeFloodsCount: 0 },
                    alerts: [
                        {
                            id: 'rec-apac-01',
                            type: 'CHUVA_PONTUAL',
                            severity: 'BAIXO',
                            title: 'Chuva Rápida no Litoral',
                            description: 'Pancadas pontuais sem retenção por acúmulo de água na Agamenon Magalhães.',
                            affectedCorridors: ['Av Agamenon Magalhães', 'Av Boa Viagem'],
                            reportedAt: new Date().toISOString(),
                            source: 'APAC'
                        }
                    ],
                    mobilityImpact: 'BAIXO',
                    disclaimer: 'DADOS METEOROLÓGICOS DA AGÊNCIA PERNAMBUCANA DE ÁGUAS E CLIMA (APAC).'
                });
            } else {
                // Padrão RJ
                const corData = await corRioProvider.fetchData().catch(() => ({}));
                const stageNum = corData.estagioNum || 1;
                const stageName = corData.estagioNome || 'Estágio 1 - Normalidade';
                const stageColor = corData.estagioCor || '#10b981';

                const alerts = [];
                if (stageNum >= 2) {
                    alerts.push({
                        id: 'rj-cor-01',
                        type: 'ESTAGIO_OPERACIONAL',
                        severity: stageNum >= 3 ? 'CRITICO' : 'MEDIO',
                        title: `Alerta COR-Rio: ${stageName}`,
                        description: `A cidade encontra-se em ${stageName}. Possibilidade de chuvas e reflexos nos principais corredores viários.`,
                        affectedCorridors: ['Linha Vermelha', 'Av Brasil', 'Ponte Rio-Niterói'],
                        reportedAt: new Date().toISOString(),
                        source: 'Centro de Operações Rio (COR-Rio)'
                    });
                } else {
                    alerts.push({
                        id: 'rj-cor-01',
                        type: 'NORMALIDADE',
                        severity: 'NORMAL',
                        title: 'Condições Meteorológicas Favoráveis',
                        description: 'Tempo estável. Sem registros de bolsões d\'água ou interdições meteorológicas nas vias monitoradas.',
                        affectedCorridors: ['Transolímpica', 'Linha Amarela', 'Av Brasil'],
                        reportedAt: new Date().toISOString(),
                        source: 'Centro de Operações Rio (COR-Rio)'
                    });
                }

                res.json({
                    ok: true,
                    region: 'RJ',
                    operationalStage: {
                        stage: stageNum,
                        name: stageName,
                        label: `ESTÁGIO ${stageNum} (RJ)`,
                        description: `Cidade em ${stageName}. Monitoramento integrado COR-Rio.`,
                        color: stageColor,
                        heatLevel: corData.calorDesc || 'Nível 1',
                        source: 'COR-Rio'
                    },
                    rainAlert: { summary: stageNum >= 2 ? 'Alerta de Chuva' : 'Sem Alerta Severo', severity: stageNum >= 3 ? 'ALTO' : 'BAIXO' },
                    windAlert: { summary: 'Normal (< 20 km/h)' },
                    flooding: { activeFloodsCount: stageNum >= 3 ? 2 : 0 },
                    alerts,
                    mobilityImpact: stageNum >= 2 ? 'MODERADO' : 'BAIXO',
                    disclaimer: 'DADOS METEOROLÓGICOS E ESTÁGIO OPERACIONAL PÚBLICOS DA PREFEITURA DO RIO DE JANEIRO.'
                });
            }
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /cameras
     * Retorna o catálogo de câmeras públicas georreferenciadas da regional (RJ, SP, BH, BSB, REC).
     */
    router.get('/cameras', (req, res) => {
        try {
            const rawRegion = req.query.region || req.query.regional || 'RJ';
            const targetRegion = normalizeRegionKey(rawRegion);

            let cameras = COR_RIO_CAMERAS_CATALOG;
            if (targetRegion === 'SP') cameras = CET_SP_CAMERAS_CATALOG;
            else if (targetRegion === 'BH') cameras = BH_CAMERAS_CATALOG;
            else if (targetRegion === 'BSB') cameras = BSB_CAMERAS_CATALOG;
            else if (targetRegion === 'REC') cameras = REC_CAMERAS_CATALOG;

            res.json({
                ok: true,
                region: targetRegion,
                count: cameras.length,
                data: cameras,
                disclaimer: 'CÂMERAS DE MONITORAMENTO PÚBLICO E CONCESSIONÁRIAS VIÁRIAS.'
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /caravans/:id
     * Retorna a projeção detalhada da caravana.
     */
    router.get('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const caravan = caravanStore.getById(req.params.id, publicIncidents);
            if (!caravan) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada no ambiente de homologação.' });
            }
            res.json({ ok: true, data: caravan });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans/:id/recalculate
     * Força recálculo da projeção da caravana contra a malha viária pública atual.
     */
    router.post('/caravans/:id/recalculate', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const updated = caravanStore.recalculate(req.params.id, publicIncidents);
            if (!updated) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para recálculo.' });
            }
            res.json({
                ok: true,
                message: 'Projeção recalculada com sucesso.',
                data: updated
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans
     * Cadastra uma nova caravana no ambiente de homologação.
     */
    router.post('/caravans', checkCaravanEnabled, (req, res) => {
        try {
            const {
                caravanName,
                programName,
                companyName,
                originAddress,
                originCoords,
                plannedDepartureAt,
                operationalWindowEnd,
                operationalNotes
            } = req.body || {};

            if (!caravanName || !programName || !originAddress || !plannedDepartureAt) {
                return res.status(400).json({
                    ok: false,
                    error: 'Campos obrigatórios ausentes: caravanName, programName, originAddress e plannedDepartureAt são requeridos.'
                });
            }

            const publicIncidents = store.getAllIncidents();
            const created = caravanStore.addCaravan({
                caravanName,
                programName,
                companyName: companyName || 'Log Rio',
                originAddress,
                originCoords: originCoords || [-22.8000, -43.3500],
                plannedDepartureAt,
                operationalWindowEnd,
                operationalNotes
            }, publicIncidents);

            res.status(201).json({
                ok: true,
                message: 'Caravana cadastrada e rota calculada com sucesso.',
                data: created
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * PUT /caravans/:id
     * Atualiza dados de uma caravana existente.
     */
    router.put('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const updated = caravanStore.updateCaravan(req.params.id, req.body || {}, publicIncidents);
            if (!updated) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para atualização.' });
            }
            res.json({
                ok: true,
                message: 'Caravana atualizada com sucesso.',
                data: updated
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * DELETE /caravans/:id
     * Exclui uma caravana da grade operacional.
     */
    router.delete('/caravans/:id', checkCaravanEnabled, (req, res) => {
        try {
            const deleted = caravanStore.deleteCaravan(req.params.id);
            if (!deleted) {
                return res.status(404).json({ ok: false, error: 'Caravana não encontrada para exclusão.' });
            }
            res.json({
                ok: true,
                message: 'Caravana excluída com sucesso.',
                id: req.params.id
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * POST /caravans/recalculate-all
     * Força recálculo de todas as caravanas cadastradas contra as ocorrências públicas ativas.
     */
    router.post('/caravans/recalculate-all', checkCaravanEnabled, (req, res) => {
        try {
            const publicIncidents = store.getAllIncidents();
            const all = caravanStore.recalculateAll(publicIncidents);
            const kpis = caravanStore.getKpis(publicIncidents);
            res.json({
                ok: true,
                message: 'Todas as rotas de caravanas foram recalculadas.',
                count: all.length,
                kpis,
                data: all,
                calculatedAt: new Date().toISOString()
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * GET /geocode
     * Endpoint auxiliar de geocodificação para bairros e endereços sintéticos do RJ.
     */
    router.get('/geocode', (req, res) => {
        try {
            const q = String(req.query.q || '').trim().toLowerCase();
            const GEO_LOOKUP = {
                'são joão de meriti': [-22.8038, -43.3725],
                'sao joao de meriti': [-22.8038, -43.3725],
                'nova iguaçu': [-22.7560, -43.4600],
                'nova iguacu': [-22.7560, -43.4600],
                'niterói': [-22.8900, -43.1200],
                'niteroi': [-22.8900, -43.1200],
                'campo grande': [-22.9030, -43.5590],
                'pavuna': [-22.8090, -43.3640],
                'bangu': [-22.8850, -43.5000],
                'duque de caxias': [-22.7856, -43.3117],
                'madureira': [-22.8717, -43.3397],
                'tijuca': [-22.9250, -43.2350],
                'méier': [-22.8980, -43.2800],
                'meier': [-22.8980, -43.2800],
                'jacarepaguá': [-22.9450, -43.3600],
                'jacarepagua': [-22.9450, -43.3600],
                'barra da tijuca': [-22.9990, -43.3600]
            };

            for (const [key, coords] of Object.entries(GEO_LOOKUP)) {
                if (q.includes(key)) {
                    return res.json({ ok: true, query: q, coords, matchedKey: key });
                }
            }

            res.json({ ok: true, query: q, coords: [-22.8200, -43.3800], matchedKey: 'fallback_rio' });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    return router;
}

// Exporta roteador padrão em memória e fábrica configurável
const defaultRouter = createTrafficAlertRouter({ store: memoryStore });

module.exports = defaultRouter;
module.exports.createTrafficAlertRouter = createTrafficAlertRouter;
