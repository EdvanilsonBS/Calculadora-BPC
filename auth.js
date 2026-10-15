// =====================================================================
// auth.js — Funções de login usadas por TODAS as páginas
// Fala com o Apps Script (Code.gs). Precisa vir DEPOIS de config.js.
//
// Como o login funciona:
//   1. A pessoa envia e-mail e senha -> o Apps Script confere.
//   2. Se estiver certo, devolve um "token" (um código de sessão).
//   3. O token fica salvo no navegador (localStorage) e é enviado
//      em toda chamada seguinte para provar quem é a pessoa.
// =====================================================================

const CHAVE_TOKEN = "bpc_token"; // nome sob o qual o token fica guardado no navegador

// ---- Guardar / ler / apagar o token (com proteção contra navegador que bloqueia localStorage) ----
function lerToken() {
  try { return localStorage.getItem(CHAVE_TOKEN) || ""; } catch (_) { return ""; }
}
function salvarToken(t) {
  try { localStorage.setItem(CHAVE_TOKEN, t); } catch (_) {}
}
function apagarToken() {
  try { localStorage.removeItem(CHAVE_TOKEN); } catch (_) {}
}

// Chama uma ação no servidor. Sempre devolve { ok: true/false, ... }, nunca lança erro.
// Exemplo: const r = await chamarApi("login", { email, password }, false);
async function chamarApi(action, dados = {}, comToken = true) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.startsWith("COLE_AQUI")) {
    return { ok: false, error: "Servidor não configurado. Cole a URL do Apps Script em config.js." };
  }

  const corpo = { action, ...dados };
  if (comToken) corpo.token = lerToken();

  let resposta;
  try {
    resposta = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // "text/plain" de propósito: evita a verificação CORS prévia, que o Apps Script não responde.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(corpo),
    });
  } catch (_) {
    return { ok: false, error: "Sem conexão com o servidor. Verifique sua internet." };
  }

  try {
    return await resposta.json();
  } catch (_) {
    return {
      ok: false,
      error: "Resposta inválida do servidor. Confira a URL em config.js e se o app foi publicado com acesso 'Qualquer pessoa'.",
    };
  }
}

// Devolve { token, user: { email, role } } se a pessoa está logada, ou null.
async function getSession() {
  const token = lerToken();
  if (!token) return null;

  const r = await chamarApi("me");
  if (r.ok) return { token, user: r.user };

  // Só apaga o token se o servidor disse que a sessão é inválida
  // (e não por uma falha de internet, para a pessoa não ser deslogada à toa).
  if (r.code === "SESSAO") apagarToken();
  return null;
}

// Entra com e-mail e senha. Devolve { error: null } ou { error: { message } }.
async function signIn(email, password) {
  const r = await chamarApi("login", { email, password }, false);
  if (r.ok) {
    salvarToken(r.token);
    return { error: null };
  }
  return { error: { message: r.error } };
}

// Sai da conta e volta para a tela de login.
async function signOut() {
  await chamarApi("logout"); // avisa o servidor para apagar a sessão
  apagarToken();
  window.location.href = "login.html";
}

// Recuperar senha, passo 1: envia o código por e-mail.
async function sendPasswordReset(email) {
  const r = await chamarApi("forgotRequest", { email }, false);
  return r.ok ? { error: null } : { error: { message: r.error } };
}

// Recuperar senha, passo 2: confere o código e grava a nova senha.
async function confirmPasswordReset(email, code, newPassword) {
  const r = await chamarApi("forgotConfirm", { email, code, newPassword }, false);
  return r.ok ? { error: null } : { error: { message: r.error } };
}

// As mensagens do servidor já vêm em português; aqui só garantimos um texto padrão.
function traduzErroAuth(error) {
  return (error && error.message) || "Algo deu errado. Tente novamente.";
}

// Protege uma página: sem login, manda para login.html.
// Uso: const session = await requireAuth(); if (!session) return;
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}
