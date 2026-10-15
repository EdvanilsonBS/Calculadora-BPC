// =====================================================================
// admin.js — Painel do administrador
// Funções: listar membros, criar conta, redefinir senha e excluir conta.
// Tudo passa pelo Apps Script, que confere de novo se quem chamou é admin.
// Esconder botões aqui NÃO é segurança — a segurança está no servidor.
// =====================================================================

// E-mail de quem está logado (para não oferecer "excluir" na própria conta).
let meuEmail = null;

// ---------------------------------------------------------------------
// Inicialização: confere login e permissão antes de mostrar o painel
// ---------------------------------------------------------------------
(async function init() {
  const session = await requireAuth();
  if (!session) return; // requireAuth já mandou para o login

  meuEmail = session.user.email;
  document.getElementById("loading").hidden = true;
  hideSplash(); // login conferido: a imagem de abertura pode sumir

  // Logado, mas sem permissão: mostra a tela "Acesso restrito".
  if (session.user.role !== "admin") {
    document.getElementById("acesso-negado").hidden = false;
    return;
  }

  document.getElementById("app").hidden = false;
  document.getElementById("btn-sair").addEventListener("click", signOut);
  document.getElementById("nav-user").textContent = meuEmail;
  document.getElementById("nav-sair").addEventListener("click", signOut);
  carregarMembros();
})();

// ---------------------------------------------------------------------
// Mensagens na tela
// ---------------------------------------------------------------------
function mostrarErro(texto) {
  document.getElementById("msg-success").classList.remove("show");
  const erro = document.getElementById("msg-error");
  erro.textContent = texto;
  erro.classList.add("show");
}

function mostrarSucesso(texto) {
  document.getElementById("msg-error").classList.remove("show");
  const ok = document.getElementById("msg-success");
  ok.textContent = texto;
  ok.classList.add("show");
}

// Se o servidor disser que a sessão expirou, volta para o login.
// Devolve true quando redirecionou (aí quem chamou deve parar).
function sessaoExpirou(resposta) {
  if (resposta && resposta.code === "SESSAO") {
    apagarToken();
    window.location.href = "login.html";
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------
// Listar membros
// ---------------------------------------------------------------------
async function carregarMembros() {
  const corpo = document.getElementById("members-body");
  const contagem = document.getElementById("members-count");

  const r = await chamarApi("adminList");
  if (sessaoExpirou(r)) return;

  if (!r.ok) {
    contagem.textContent = "Não foi possível carregar a lista.";
    mostrarErro(r.error);
    return;
  }

  const lista = r.users;
  contagem.textContent = lista.length === 1 ? "1 membro" : lista.length + " membros";
  corpo.innerHTML = ""; // limpa antes de redesenhar

  lista.forEach((membro) => {
    const linha = document.createElement("tr");

    // textContent (e não innerHTML) impede que um e-mail com código HTML seja executado.
    const tdEmail = document.createElement("td");
    tdEmail.textContent = membro.email;

    const tdPapel = document.createElement("td");
    const selo = document.createElement("span");
    selo.className = "role-pill " + (membro.role === "admin" ? "role-admin" : "role-user");
    selo.textContent = membro.role === "admin" ? "Admin" : "Usuário";
    tdPapel.appendChild(selo);
    if (!membro.active) {
      const off = document.createElement("span");
      off.className = "role-pill role-off";
      off.textContent = "Desativado";
      tdPapel.append(" ", off);
    }

    const tdData = document.createElement("td");
    tdData.textContent = membro.created;

    const tdAcao = document.createElement("td");
    tdAcao.className = "td-action";
    if (membro.email === meuEmail) {
      const voce = document.createElement("span");
      voce.className = "you-tag";
      voce.textContent = "você";
      tdAcao.appendChild(voce);
    } else {
      const btnSenha = document.createElement("button");
      btnSenha.type = "button";
      btnSenha.className = "btn-outline";
      btnSenha.textContent = "Nova senha";
      btnSenha.addEventListener("click", () => redefinirSenha(membro, btnSenha));

      const btnExcluir = document.createElement("button");
      btnExcluir.type = "button";
      btnExcluir.className = "btn-danger";
      btnExcluir.textContent = "Excluir";
      btnExcluir.addEventListener("click", () => excluirMembro(membro, btnExcluir));

      tdAcao.append(btnSenha, btnExcluir);
    }

    linha.append(tdEmail, tdPapel, tdData, tdAcao);
    corpo.appendChild(linha);
  });
}

// ---------------------------------------------------------------------
// Redefinir senha (gera uma senha nova e mostra para repassar)
// ---------------------------------------------------------------------
async function redefinirSenha(membro, botao) {
  if (!confirm("Gerar uma nova senha para " + membro.email + "?\n\nA senha atual deixa de funcionar e a pessoa será deslogada.")) return;

  botao.disabled = true;
  botao.textContent = "Gerando...";

  const r = await chamarApi("adminReset", { email: membro.email });
  if (sessaoExpirou(r)) return;

  botao.disabled = false;
  botao.textContent = "Nova senha";

  if (!r.ok) return mostrarErro(r.error);
  mostrarSucesso("Nova senha de " + membro.email + ": " + r.password + " (anote e repasse; ela não fica salva em lugar nenhum)");
}

// ---------------------------------------------------------------------
// Excluir membro
// ---------------------------------------------------------------------
async function excluirMembro(membro, botao) {
  // Pede confirmação: excluir não tem volta.
  if (!confirm("Excluir a conta " + membro.email + "?\n\nEssa pessoa perderá o acesso. Isso não pode ser desfeito.")) return;

  botao.disabled = true;
  botao.textContent = "Excluindo...";

  const r = await chamarApi("adminDelete", { email: membro.email });
  if (sessaoExpirou(r)) return;

  if (!r.ok) {
    mostrarErro(r.error);
    botao.disabled = false;
    botao.textContent = "Excluir";
    return;
  }

  mostrarSucesso("Conta " + membro.email + " excluída.");
  carregarMembros(); // atualiza a lista
}

// ---------------------------------------------------------------------
// Gerar senha aleatória (botão "Gerar senha")
// ---------------------------------------------------------------------
function gerarSenhaAleatoria() {
  // Sem letras/números parecidos (0/O, 1/l/I) para facilitar a leitura.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  // crypto.getRandomValues é aleatório de verdade (Math.random é previsível).
  const sorteio = new Uint32Array(10);
  crypto.getRandomValues(sorteio);
  let senha = "";
  for (let i = 0; i < sorteio.length; i++) senha += chars[sorteio[i] % chars.length];
  return senha;
}

document.getElementById("gerar-senha-btn").addEventListener("click", () => {
  document.getElementById("new-password").value = gerarSenhaAleatoria();
});

// ---------------------------------------------------------------------
// Criar conta
// ---------------------------------------------------------------------
document.getElementById("create-user-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById("submit-btn");
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value; // pode ficar vazio
  const role = document.getElementById("new-role").value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Criando...";

  const r = await chamarApi("adminCreate", { email, password, role });
  if (sessaoExpirou(r)) return;

  submitBtn.disabled = false;
  submitBtn.textContent = "Criar conta";

  if (!r.ok) return mostrarErro(r.error);

  // O servidor devolve a senha usada (a digitada ou a gerada).
  mostrarSucesso("Conta criada! Repasse para a pessoa: " + email + " / senha " + r.password);
  document.getElementById("create-user-form").reset();
  carregarMembros(); // a nova pessoa aparece na lista
});
