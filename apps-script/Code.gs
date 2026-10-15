// =====================================================================
// Code.gs — "Servidor" do login, rodando dentro da planilha do Google
//
// Como funciona:
//   - A planilha guarda as contas (aba "Usuarios"), as sessões ("Sessoes")
//     e os códigos de recuperação de senha ("Codigos").
//   - O site chama este script (publicado como "App da Web") e o script
//     confere e-mail e senha. A planilha NUNCA é lida direto pelo site.
//   - As senhas NÃO ficam salvas em texto: só um "hash" (impressão digital
//     da senha) + um "salt" (tempero aleatório).
//
// Passo a passo de instalação: veja o README.md.
// =====================================================================

// ---------------------------------------------------------------------
// CONFIGURAÇÕES (pode ajustar)
// ---------------------------------------------------------------------
const NOME_SISTEMA = "Calculadora BPC";   // aparece nos e-mails
const HORAS_SESSAO = 12;                  // por quanto tempo a pessoa fica logada
const MAX_TENTATIVAS = 5;                 // erros de senha antes de bloquear
const MINUTOS_BLOQUEIO = 15;              // tempo de bloqueio após errar demais
const MINUTOS_CODIGO = 15;                // validade do código de recuperação
const MIN_SENHA = 8;                      // tamanho mínimo da senha
// Quantas vezes a senha é "embaralhada". Mais = mais seguro, porém mais lento.
// Se o login ficar lento, diminua; se ficar rápido, pode aumentar.
const ITERACOES_HASH = 200;

// ---------------------------------------------------------------------
// ESTRUTURA DA PLANILHA (nomes das abas e colunas)
// ---------------------------------------------------------------------
const ABA_USUARIOS = "Usuarios";
const ABA_SESSOES = "Sessoes";
const ABA_CODIGOS = "Codigos";

const COLUNAS_USUARIOS = ["email", "senha_hash", "salt", "papel", "ativo", "criado_em", "tentativas", "bloqueado_ate"];
const COLUNAS_SESSOES = ["token_hash", "email", "expira_em", "criado_em"];
const COLUNAS_CODIGOS = ["email", "codigo_hash", "expira_em", "tentativas", "criado_em"];

// Posição de cada coluna da aba Usuarios (começa em 0).
const U_EMAIL = 0, U_HASH = 1, U_SALT = 2, U_PAPEL = 3, U_ATIVO = 4, U_CRIADO = 5, U_TENT = 6, U_BLOQ = 7;

// =====================================================================
// MENU DENTRO DA PLANILHA (aparece ao abrir a planilha)
// =====================================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(NOME_SISTEMA)
    .addItem("1) Configurar planilha (primeira vez)", "configurarPlanilha")
    .addSeparator()
    .addItem("Criar usuário", "menuCriarUsuario")
    .addItem("Redefinir senha de um usuário", "menuRedefinirSenha")
    .addItem("Encerrar todas as sessões (deslogar todos)", "menuEncerrarSessoes")
    .addToUi();
}

// Cria as abas e os cabeçalhos. Pode rodar de novo sem perder dados.
function configurarPlanilha() {
  const ss = SpreadsheetApp.getActive();

  const usuarios = garantirAba_(ss, ABA_USUARIOS, COLUNAS_USUARIOS);
  // Colunas que precisam ser TEXTO (senão o Google transforma hash em número/data).
  usuarios.getRange("A:C").setNumberFormat("@");
  usuarios.getRange("F:F").setNumberFormat("@");
  // Listas suspensas para o admin editar à mão sem errar.
  usuarios.getRange("D2:D1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["admin", "user"], true).build()
  );
  usuarios.getRange("E2:E1000").setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(["SIM", "NAO"], true).build()
  );

  const sessoes = garantirAba_(ss, ABA_SESSOES, COLUNAS_SESSOES);
  sessoes.getRange("A:B").setNumberFormat("@");

  const codigos = garantirAba_(ss, ABA_CODIGOS, COLUNAS_CODIGOS);
  codigos.getRange("A:B").setNumberFormat("@");

  SpreadsheetApp.getUi().alert(
    "Planilha configurada!\n\nPróximo passo: menu \"" + NOME_SISTEMA + "\" > \"Criar usuário\" para criar o primeiro administrador."
  );
}

function garantirAba_(ss, nome, colunas) {
  let aba = ss.getSheetByName(nome);
  if (!aba) aba = ss.insertSheet(nome);
  aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight("bold");
  aba.setFrozenRows(1);
  return aba;
}

// ---- Itens do menu ----

function menuCriarUsuario() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Criar usuário", "E-mail da pessoa:", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt("Papel", "Digite  admin  (acessa o painel) ou  user  (só a calculadora):", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;

  try {
    // comLock_ evita que duas operações escrevam na planilha ao mesmo tempo.
    const email = normalizarEmail_(r1.getResponseText());
    const senha = comLock_(() => criarUsuario_(email, r2.getResponseText().trim().toLowerCase(), ""));
    ui.alert("Conta criada!\n\nE-mail: " + email + "\nSenha: " + senha + "\n\nAnote e repasse à pessoa. A senha não fica salva em lugar nenhum.");
  } catch (err) {
    ui.alert("Não foi possível criar: " + err.message);
  }
}

function menuRedefinirSenha() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Redefinir senha", "E-mail da pessoa:", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    const email = normalizarEmail_(r.getResponseText());
    const senha = comLock_(() => redefinirSenha_(email));
    ui.alert("Nova senha de " + email + ":\n\n" + senha + "\n\nAs sessões antigas dessa pessoa foram encerradas.");
  } catch (err) {
    ui.alert("Não foi possível redefinir: " + err.message);
  }
}

function menuEncerrarSessoes() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Deslogar TODAS as pessoas?", "Todo mundo precisará entrar de novo.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  comLock_(() => {
    const aba = abaSessoes_();
    if (aba.getLastRow() > 1) aba.deleteRows(2, aba.getLastRow() - 1);
  });
  ui.alert("Pronto. Todas as sessões foram encerradas.");
}

// =====================================================================
// PORTA DE ENTRADA DA API (o site chama aqui)
// =====================================================================

// Abrir a URL do app no navegador cai aqui — só serve para testar se está no ar.
function doGet() {
  return ContentService.createTextOutput("API da " + NOME_SISTEMA + " no ar.");
}

// O site envia um POST com um JSON: { action: "login", ... }
function doPost(e) {
  let resposta;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // espera até 20s se outra chamada estiver escrevendo
    const req = JSON.parse(e.postData.contents);
    resposta = rotear_(req);
  } catch (err) {
    // Erros "amigáveis" (que nós mesmos criamos) vão para a tela.
    // Erros inesperados ficam só no log do Apps Script (menu Execuções).
    if (!err.amigavel) console.error(err);
    resposta = {
      ok: false,
      error: err.amigavel ? err.message : "Erro interno no servidor. Tente novamente.",
      code: err.codigo || "",
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(resposta)).setMimeType(ContentService.MimeType.JSON);
}

// Escolhe o que fazer de acordo com "action".
function rotear_(req) {
  switch (req.action) {
    case "login":         return acaoLogin_(req);
    case "logout":        return acaoLogout_(req);
    case "me":            return { ok: true, user: exigirSessao_(req.token) };
    case "forgotRequest": return acaoPedirCodigo_(req);
    case "forgotConfirm": return acaoConfirmarCodigo_(req);
    case "adminList":     return acaoAdminListar_(req);
    case "adminCreate":   return acaoAdminCriar_(req);
    case "adminDelete":   return acaoAdminExcluir_(req);
    case "adminReset":    return acaoAdminRedefinir_(req);
    default: throw erro_("Ação desconhecida.");
  }
}

// =====================================================================
// AÇÕES: LOGIN, LOGOUT, RECUPERAR SENHA
// =====================================================================

function acaoLogin_(req) {
  const email = normalizarEmail_(req.email);
  const senha = String(req.password || "");
  const generico = "E-mail ou senha incorretos."; // mesma mensagem para e-mail inexistente e senha errada

  const u = acharUsuario_(email);
  if (!u) {
    hashSenha_(senha, "0000"); // gasta o mesmo tempo, para não revelar se o e-mail existe
    throw erro_(generico);
  }

  // Está bloqueado por erros anteriores?
  const agora = Date.now();
  const bloqueadoAte = Number(u.dados[U_BLOQ]) || 0;
  if (bloqueadoAte > agora) {
    throw erro_("Muitas tentativas incorretas. Tente de novo em " + Math.ceil((bloqueadoAte - agora) / 60000) + " minuto(s).");
  }

  // Confere a senha.
  const certa = iguais_(String(u.dados[U_HASH]), hashSenha_(senha, String(u.dados[U_SALT])));
  if (!certa) {
    const tentativas = (Number(u.dados[U_TENT]) || 0) + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      u.aba.getRange(u.linha, U_TENT + 1, 1, 2).setValues([[0, agora + MINUTOS_BLOQUEIO * 60000]]);
    } else {
      u.aba.getRange(u.linha, U_TENT + 1).setValue(tentativas);
    }
    throw erro_(generico);
  }

  // Senha certa, mas a conta foi desativada pelo admin (coluna "ativo" = NAO)?
  if (String(u.dados[U_ATIVO]).trim().toUpperCase() !== "SIM") {
    throw erro_("Conta desativada. Fale com o administrador.");
  }

  // Tudo certo: zera as tentativas e cria a sessão.
  u.aba.getRange(u.linha, U_TENT + 1, 1, 2).setValues([[0, 0]]);
  const token = criarSessao_(email);
  return { ok: true, token: token, user: { email: email, role: papelDe_(u.dados) } };
}

function acaoLogout_(req) {
  if (req.token) {
    const h = sha256Hex_(String(req.token));
    const aba = abaSessoes_();
    const linhas = lerLinhas_(aba, COLUNAS_SESSOES.length);
    for (let i = linhas.length - 1; i >= 0; i--) {
      if (String(linhas[i][0]) === h) aba.deleteRow(i + 2);
    }
  }
  return { ok: true };
}

// Passo 1 da recuperação: envia um código de 6 dígitos por e-mail.
function acaoPedirCodigo_(req) {
  const email = normalizarEmail_(req.email);
  const u = emailValido_(email) ? acharUsuario_(email) : null;

  if (u && String(u.dados[U_ATIVO]).trim().toUpperCase() === "SIM") {
    const aba = abaCodigos_();
    const linhas = lerLinhas_(aba, COLUNAS_CODIGOS.length);
    let linhaExistente = -1;
    for (let i = 0; i < linhas.length; i++) {
      if (String(linhas[i][0]) === email) linhaExistente = i + 2;
    }
    // Anti-spam: no máximo 1 código por minuto para o mesmo e-mail.
    const recente = linhaExistente > 0 && Date.now() - Number(linhas[linhaExistente - 2][4]) < 60000;

    if (!recente) {
      const codigo = gerarCodigo_();
      const nova = [email, sha256Hex_(email + ":" + codigo), Date.now() + MINUTOS_CODIGO * 60000, 0, Date.now()];
      if (linhaExistente > 0) aba.getRange(linhaExistente, 1, 1, nova.length).setValues([nova]);
      else aba.appendRow(nova);

      try {
        MailApp.sendEmail({
          to: email,
          subject: NOME_SISTEMA + " — código para redefinir a senha",
          body: "Seu código é: " + codigo + "\n\nEle vale por " + MINUTOS_CODIGO + " minutos.\n" +
                "Se você não pediu isso, ignore este e-mail.",
        });
      } catch (err) {
        console.error("Falha ao enviar e-mail: " + err); // ex.: limite diário de e-mails
      }
    }
  }
  // Resposta SEMPRE igual, exista a conta ou não (não revela quem tem conta).
  return { ok: true };
}

// Passo 2: confere o código e grava a nova senha.
function acaoConfirmarCodigo_(req) {
  const email = normalizarEmail_(req.email);
  const codigo = String(req.code || "").trim();
  const novaSenha = String(req.newPassword || "");
  if (novaSenha.length < MIN_SENHA) throw erro_("A senha precisa ter pelo menos " + MIN_SENHA + " caracteres.");

  const aba = abaCodigos_();
  const linhas = lerLinhas_(aba, COLUNAS_CODIGOS.length);
  let achada = -1;
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0]) === email) achada = i;
  }
  const invalido = "Código inválido ou expirado. Peça um novo.";
  if (achada < 0) throw erro_(invalido);

  const linha = achada + 2;
  const dados = linhas[achada];
  if (Number(dados[2]) < Date.now() || Number(dados[3]) >= MAX_TENTATIVAS) {
    aba.deleteRow(linha);
    throw erro_(invalido);
  }
  if (!iguais_(String(dados[1]), sha256Hex_(email + ":" + codigo))) {
    aba.getRange(linha, 4).setValue(Number(dados[3]) + 1); // conta a tentativa errada
    throw erro_("Código incorreto.");
  }

  const u = acharUsuario_(email);
  if (!u) throw erro_(invalido);
  gravarSenha_(u, novaSenha);
  aba.deleteRow(linha);
  encerrarSessoesDe_(email); // quem estava logado com a senha antiga é deslogado
  return { ok: true };
}

// =====================================================================
// AÇÕES DO PAINEL ADMIN
// =====================================================================

function acaoAdminListar_(req) {
  exigirAdmin_(req.token);
  const linhas = lerLinhas_(abaUsuarios_(), COLUNAS_USUARIOS.length);
  const usuarios = linhas
    .filter((l) => String(l[U_EMAIL]).trim() !== "")
    .map((l) => ({
      email: String(l[U_EMAIL]),
      role: papelDe_(l),
      active: String(l[U_ATIVO]).trim().toUpperCase() === "SIM",
      created: String(l[U_CRIADO]),
    }));
  return { ok: true, users: usuarios };
}

function acaoAdminCriar_(req) {
  exigirAdmin_(req.token);
  const senha = criarUsuario_(req.email, req.role, String(req.password || ""));
  return { ok: true, password: senha };
}

function acaoAdminExcluir_(req) {
  const eu = exigirAdmin_(req.token);
  const email = normalizarEmail_(req.email);
  if (email === eu.email) throw erro_("Você não pode excluir a sua própria conta.");
  const u = acharUsuario_(email);
  if (!u) throw erro_("Conta não encontrada.");
  u.aba.deleteRow(u.linha);
  encerrarSessoesDe_(email);
  return { ok: true };
}

function acaoAdminRedefinir_(req) {
  const eu = exigirAdmin_(req.token);
  const email = normalizarEmail_(req.email);
  if (email === eu.email) throw erro_("Para trocar a sua própria senha, use 'Esqueci minha senha'.");
  return { ok: true, password: redefinirSenha_(email) };
}

// =====================================================================
// REGRAS DE CONTAS (usadas pela API e pelo menu da planilha)
// =====================================================================

// Cria a conta. Se "senha" vier vazia, gera uma. Devolve a senha usada.
function criarUsuario_(emailBruto, papelBruto, senha) {
  const email = normalizarEmail_(emailBruto);
  if (!emailValido_(email)) throw erro_("E-mail inválido.");
  const papel = String(papelBruto || "").trim().toLowerCase() === "admin" ? "admin" : "user";
  if (acharUsuario_(email)) throw erro_("Já existe uma conta com esse e-mail.");

  if (!senha) senha = gerarSenha_();
  if (senha.length < MIN_SENHA) throw erro_("A senha precisa ter pelo menos " + MIN_SENHA + " caracteres.");

  const salt = gerarSalt_();
  abaUsuarios_().appendRow([email, hashSenha_(senha, salt), salt, papel, "SIM", agora_(), 0, 0]);
  return senha;
}

// Gera uma senha nova para a conta e derruba as sessões antigas.
function redefinirSenha_(email) {
  const u = acharUsuario_(email);
  if (!u) throw erro_("Conta não encontrada.");
  const senha = gerarSenha_();
  gravarSenha_(u, senha);
  encerrarSessoesDe_(email);
  return senha;
}

// Grava hash + salt novos e zera bloqueios.
function gravarSenha_(u, senha) {
  const salt = gerarSalt_();
  u.aba.getRange(u.linha, U_HASH + 1, 1, 2).setValues([[hashSenha_(senha, salt), salt]]);
  u.aba.getRange(u.linha, U_TENT + 1, 1, 2).setValues([[0, 0]]);
}

// Procura a conta pelo e-mail. Devolve {aba, linha, dados} ou null.
function acharUsuario_(email) {
  if (!email) return null;
  const aba = abaUsuarios_();
  const linhas = lerLinhas_(aba, COLUNAS_USUARIOS.length);
  for (let i = 0; i < linhas.length; i++) {
    if (normalizarEmail_(linhas[i][U_EMAIL]) === email) {
      return { aba: aba, linha: i + 2, dados: linhas[i] }; // +2: cabeçalho + base 1
    }
  }
  return null;
}

function papelDe_(dados) {
  return String(dados[U_PAPEL]).trim().toLowerCase() === "admin" ? "admin" : "user";
}

// =====================================================================
// SESSÕES
// =====================================================================

// Cria a sessão e devolve o token. A planilha guarda só o HASH do token,
// então quem ler a planilha não consegue usar as sessões.
function criarSessao_(email) {
  const token = novoToken_();
  const aba = abaSessoes_();
  limparSessoesExpiradas_(aba);
  aba.appendRow([sha256Hex_(token), email, Date.now() + HORAS_SESSAO * 3600000, Date.now()]);
  return token;
}

function limparSessoesExpiradas_(aba) {
  const linhas = lerLinhas_(aba, COLUNAS_SESSOES.length);
  for (let i = linhas.length - 1; i >= 0; i--) { // de baixo para cima, para os números das linhas não mudarem
    if (Number(linhas[i][2]) < Date.now()) aba.deleteRow(i + 2);
  }
}

function encerrarSessoesDe_(email) {
  const aba = abaSessoes_();
  const linhas = lerLinhas_(aba, COLUNAS_SESSOES.length);
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (String(linhas[i][1]) === email) aba.deleteRow(i + 2);
  }
}

// Confere o token. Devolve {email, role} ou lança erro com code "SESSAO".
function exigirSessao_(token) {
  const falha = () => erro_("Sessão expirada. Entre novamente.", "SESSAO");
  if (!token) throw falha();

  const h = sha256Hex_(String(token));
  const linhas = lerLinhas_(abaSessoes_(), COLUNAS_SESSOES.length);
  for (let i = 0; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== h) continue;
    if (Number(linhas[i][2]) < Date.now()) throw falha();

    // A conta ainda existe e continua ativa? (o admin pode ter desativado)
    const u = acharUsuario_(String(linhas[i][1]));
    if (!u || String(u.dados[U_ATIVO]).trim().toUpperCase() !== "SIM") throw falha();
    return { email: normalizarEmail_(u.dados[U_EMAIL]), role: papelDe_(u.dados) };
  }
  throw falha();
}

function exigirAdmin_(token) {
  const user = exigirSessao_(token);
  if (user.role !== "admin") throw erro_("Apenas administradores podem fazer isso.");
  return user;
}

// =====================================================================
// FUNÇÕES AUXILIARES
// =====================================================================

// Cria um erro com mensagem que pode ser mostrada ao usuário.
function erro_(mensagem, codigo) {
  const e = new Error(mensagem);
  e.amigavel = true;
  e.codigo = codigo || "";
  return e;
}

// Roda uma função com "trava" (uma operação por vez na planilha).
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function abaOuErro_(nome) {
  const aba = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!aba) throw erro_("Planilha não configurada. Use o menu \"" + NOME_SISTEMA + "\" > \"Configurar planilha\".");
  return aba;
}
function abaUsuarios_() { return abaOuErro_(ABA_USUARIOS); }
function abaSessoes_() { return abaOuErro_(ABA_SESSOES); }
function abaCodigos_() { return abaOuErro_(ABA_CODIGOS); }

// Lê todas as linhas de dados (sem o cabeçalho). Devolve lista vazia se não houver.
function lerLinhas_(aba, qtdColunas) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, qtdColunas).getValues();
}

function normalizarEmail_(e) { return String(e || "").trim().toLowerCase(); }

// Exige começar com letra/número (bloqueia "=FORMULA()" digitada como e-mail).
function emailValido_(e) { return /^[a-z0-9][^\s@]*@[^\s@]+\.[^\s@]+$/.test(e); }

function agora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"); }

// ---- Criptografia ----

function bytesParaHex_(bytes) {
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function sha256Hex_(texto) {
  return bytesParaHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8));
}

// Hash da senha: SHA-256 repetido várias vezes, misturado com o salt.
function hashSenha_(senha, salt) {
  let h = sha256Hex_(salt + senha);
  for (let i = 1; i < ITERACOES_HASH; i++) h = sha256Hex_(h + salt + senha);
  return h;
}

// Compara dois textos sem "vazar" onde diferem pelo tempo de resposta.
function iguais_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Sorteia n números de 0 a 255 a partir de UUIDs aleatórios.
function aleatorios_(n) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()
  );
  return bytes.slice(0, n).map((b) => (b + 256) % 256);
}

function gerarSalt_() { return bytesParaHex_(aleatorios_(16)); }

function novoToken_() {
  return sha256Hex_(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
}

// Senha de 10 caracteres sem letras parecidas (0/O, 1/l/I).
function gerarSenha_() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return aleatorios_(10).map((n) => chars[n % chars.length]).join("");
}

// Código de 6 dígitos para recuperar senha.
function gerarCodigo_() {
  return aleatorios_(6).map((n) => String(n % 10)).join("");
}
