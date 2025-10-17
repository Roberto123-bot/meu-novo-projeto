import express from "express";
import http from "http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import path from "path"; // Importa 'path'
import { fileURLToPath } from "url"; // Importa 'fileURLToPath'

// --- SENHA DE ADMIN ---
// Troque "mudar123" por uma senha sua
const ADMIN_PASSWORD = "mudar123";

// --- Função para formatar o nome ---
function toTitleCase(str) {
  if (!str) return "";
  return str.replace(
    /\w\S*/g,
    (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

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

    // await db.run(
    //   "INSERT INTO combinacoes (nome, n1, n2, n3) VALUES (?, ?, ?, ?)",
    //   [nome, n1, n2, n3]
    // );

    // Depois (com o nome limpo e formatado):
    const nomeFormatado = toTitleCase(nome.trim()); // .trim() remove espaços extras
    await db.run(
      "INSERT INTO combinacoes (nome, n1, n2, n3) VALUES (?, ?, ?, ?)",
      [nomeFormatado, n1, n2, n3] // Usa o nome formatado
    );
    // 👆 FIM DA MUDANÇA

    // Após salvar, busca a lista atualizada e envia para TODOS
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista); // A MÁGICA DO SOCKET.IO!

    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: deletar combinação (ADMIN) ---
app.delete("/combinacoes/:id", async (req, res) => {
  const { adminPassword } = req.body;
  const { id } = req.params;

  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).send("Senha de admin inválida");
  }

  try {
    await db.run("DELETE FROM combinacoes WHERE id = ?", [id]);

    // Atualiza todos os clientes
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: editar combinação (ADMIN) ---
app.put("/combinacoes/:id", async (req, res) => {
  const { adminPassword, nome, n1, n2, n3 } = req.body;
  const { id } = req.params;

  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).send("Senha de admin inválida");
  }

  try {
    const nomeFormatado = toTitleCase(nome.trim());
    await db.run(
      "UPDATE combinacoes SET nome = ?, n1 = ?, n2 = ?, n3 = ? WHERE id = ?",
      [nomeFormatado, n1, n2, n3, id]
    );

    // Atualiza todos os clientes
    const lista = await db.all("SELECT * FROM combinacoes ORDER BY id DESC");
    io.emit("update", lista);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Rota: LIMPAR TODA A LISTA (ADMIN) ---
app.delete("/combinacoes/all", async (req, res) => {
  const { adminPassword } = req.body;

  if (adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).send("Senha de admin inválida");
  }

  try {
    // Deleta TODOS os registros da tabela
    await db.run("DELETE FROM combinacoes");

    // Envia uma lista vazia para todos os clientes
    io.emit("update", []);
    res.json({ success: true, message: "Lista limpa." });
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
