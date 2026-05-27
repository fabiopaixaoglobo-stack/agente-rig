const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, 'agente_rig.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar no banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite (Autenticação e Auditoria).');
        db.run(`CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT,
            sobrenome TEXT,
            matricula TEXT UNIQUE,
            email TEXT UNIQUE,
            senha TEXT,
            funcao TEXT,
            area TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_usuario INTEGER,
            data_hora_login DATETIME,
            data_hora_logout DATETIME,
            tempo_sessao INTEGER,
            ip_origem TEXT,
            FOREIGN KEY(id_usuario) REFERENCES usuarios(id)
        )`);
    }
});

module.exports = db;
