import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import path from "path"; // Importa 'path'
import { fileURLToPath } from "url"; // Importa 'fileURLToPath'

// --- Configuração base ---
const app = express();
const server = http.createServer(app);

// Habilita CORS para todas as origens
app.use(cors());

// Configura o Socket.io para permitir qualquer origem
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json());

// --- Configuração para servir arquivos estáticos (o frontend) ---
// Isso vai fazer sentido na Parte 2, quando criarmos o index.html
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Estamos dizendo que a pasta 'public' conterá nosso frontend
app.use(express.static(path.join(__dirname, "public")));

// --- Banco de dados SQLite ---
let db;
try {
  db = await open({
    filename: "./db.sqlite", // O arquivo do banco de dados
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS combinacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      n1 INTEGER,
      n2 INTEGER,
      n3 INTEGER
    )
  `);
  console.log("Banco de dados conectado e tabela verificada.");
} catch (e) {
  console.error("Erro ao abrir o banco de dados:", e);
  process.exit(1); // Encerra a aplicação se o DB falhar
}

// --- Rota: buscar combinações ---
app.get("/combinacoes", async (req, res) => {
  try {
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    res.json(lista);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: adicionar combinação ---
app.post("/combinacoes", async (req, res) => {
  try {
    const { nome, n1, n2, n3 } = req.body;
    if (!nome || !n1 || !n2 || !n3) {
      return res.status(400).send("Dados inválidos");
    }

    await db.run(
      "INSERT INTO combinacoes (nome, n1, n2, n3) VALUES (?, ?, ?, ?)",
      [nome, n1, n2, n3]
    );

    // Após salvar, busca a lista atualizada e envia para TODOS
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista); // A MÁGICA DO SOCKET.IO!

    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Socket.io: O que fazer quando um novo usuário se conectar ---
io.on("connection", async (socket) => {
  console.log("🟢 Usuário conectado:", socket.id);

  // Envia a lista atual assim que ele se conecta
  try {
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    socket.emit("update", lista); // Envia SÓ PARA ELE
  } catch (e) {
    console.error("Erro ao enviar lista inicial para socket:", e);
  }

  socket.on("disconnect", () => {
    console.log("🔴 Usuário desconectado:", socket.id);
  });
});

// --- Iniciar o servidor ---
// Vamos usar a porta 3000 como padrão
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
