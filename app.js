// =====================================================================
// app.js — Calculadora BPC (Fatores Ambientais e Atividades e Participação)
// Fórmulas: Anexo IV da Resolução CNJ nº 630/2025
// A página só aparece depois de confirmar que existe uma pessoa logada.
// =====================================================================

// Se true, os campos voltam a 0 depois de cada cálculo (comportamento original).
// Mude para false se quiser que os valores digitados continuem na tela.
const LIMPAR_APOS_CALCULAR = true;

// ---------------------------------------------------------------------
// Inicialização: confere login, mostra avatar e link de admin
// ---------------------------------------------------------------------
(async function init() {
  const session = await requireAuth();
  if (!session) return; // requireAuth já redireciona para login.html (a abertura continua até sair da página)

  // Avatar: 2 primeiras letras do e-mail, em maiúsculas.
  const email = session.user.email || "";
  document.getElementById("avatar").textContent = email.slice(0, 2).toUpperCase();

  // Só administradores veem o link "Painel Admin" (na barra e no menu do celular).
  if (session.user.role === "admin") {
    document.getElementById("link-admin").hidden = false;
    document.getElementById("nav-admin").hidden = false;
  }

  // Menu do celular: e-mail no topo e botão Sair.
  document.getElementById("nav-user").textContent = email;
  document.getElementById("nav-sair").addEventListener("click", signOut);

  document.getElementById("loading").hidden = true;
  document.getElementById("app").hidden = false;

  document.getElementById("btn-sair").addEventListener("click", signOut);

  hideSplash(); // login confirmado: a imagem de abertura pode sumir
})();

// ---------------------------------------------------------------------
// Classificação (N, L, M, G, C)
// Mesmas faixas da planilha oficial do TJCE:
// =IF(pct<=4,"NENHUMA",IF(pct<25,"LEVE",IF(pct<50,"MODERADA",IF(pct<96,"GRAVE","COMPLETA"))))
//
// Como ler cada item:
//   letter    = letra mostrada no círculo
//   label     = descrição
//   max       = limite superior da faixa
//   inclusive = true  -> vale até o limite (pct <= max)
//               false -> vale abaixo do limite (pct < max)
//   color     = prefixo das cores no styles.css (--n-color, --l-color...)
// A ordem importa: a lista é percorrida de cima para baixo.
// ---------------------------------------------------------------------
const LEVELS = [
  { letter: "N", label: "Nenhuma barreira / dificuldade", max: 4, inclusive: true, color: "n" },
  { letter: "L", label: "Barreira / dificuldade leve", max: 25, inclusive: false, color: "l" },
  { letter: "M", label: "Barreira / dificuldade moderada", max: 50, inclusive: false, color: "m" },
  { letter: "G", label: "Barreira / dificuldade grave", max: 96, inclusive: false, color: "g" },
  { letter: "C", label: "Barreira / dificuldade completa", max: Infinity, inclusive: true, color: "c" },
];

// Recebe a porcentagem e devolve a faixa correspondente.
function classify(pct) {
  for (const level of LEVELS) {
    if (level.inclusive ? pct <= level.max : pct < level.max) return level;
  }
  return LEVELS[LEVELS.length - 1]; // segurança: se nada servir, usa a última
}

// ---------------------------------------------------------------------
// Funções auxiliares para os campos de 0 a 4
// ---------------------------------------------------------------------

// Mantém só dígitos e limita o valor entre 0 e 4 enquanto a pessoa digita.
function clampInputValue(el) {
  const digits = el.value.replace(/[^0-9]/g, "");
  if (digits === "") {
    el.value = ""; // permite apagar para digitar de novo
    return;
  }
  let n = parseInt(digits, 10);
  if (isNaN(n)) n = 0;
  el.value = Math.min(4, Math.max(0, n));
}

// Liga as regras de digitação a uma lista de campos (pelos ids).
function enforceDomainLimits(ids) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => clampInputValue(el));

    // Campo vazio ao sair vira 0.
    el.addEventListener("blur", () => {
      if (el.value === "") el.value = 0;
    });

    // Bloqueia teclas que não sejam número.
    el.addEventListener("keydown", (e) => {
      // Atalhos (Ctrl+V, Ctrl+A, Ctrl+R, F5...) precisam continuar funcionando.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const allowed = ["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "F5"];
      if (allowed.includes(e.key)) return;
      if (!/^[0-9]$/.test(e.key)) e.preventDefault();
    });
  });
}

// Lê os valores dos campos e devolve uma lista de números (0 a 4).
function readDomains(ids) {
  return ids.map((id) => {
    const el = document.getElementById(id);
    let v = parseInt(el.value, 10);
    if (isNaN(v)) v = 0;
    v = Math.min(4, Math.max(0, v));
    el.value = v;
    return v;
  });
}

// Volta os campos a 0.
function clearDomains(ids) {
  ids.forEach((id) => {
    document.getElementById(id).value = 0;
  });
}

// Esconde a caixa de resultado.
function hideResult(resultEl) {
  resultEl.classList.remove("show");
}

// Mostra o resultado: círculo com a letra, porcentagem e descrição.
function paintResult({ badgeEl, pctEl, descEl, resultEl }, pct, level) {
  resultEl.classList.add("show");
  resultEl.style.background = `var(--${level.color}-bg)`;
  badgeEl.style.background = `var(--${level.color}-color)`;
  badgeEl.textContent = level.letter;
  const shown = pct < 0 ? 0 : pct; // nunca mostra porcentagem negativa
  pctEl.textContent = `${shown.toFixed(1)}% — Qualificador ${level.letter}`;
  descEl.textContent = level.label;
}

// ---------------------------------------------------------------------
// Fatores Ambientais:  [(e1+e2+e3+e4+e5) × 5] − 0,1
// ---------------------------------------------------------------------
const AMBIENTAIS_IDS = ["e1", "e2", "e3", "e4", "e5"];

function calcAmbientais() {
  const values = readDomains(AMBIENTAIS_IDS);
  const sum = values.reduce((a, b) => a + b, 0);
  const pct = sum * 5 - 0.1; // fórmula do Anexo IV
  const level = classify(Math.max(pct, 0));

  paintResult(
    {
      badgeEl: document.getElementById("badge-ambientais"),
      pctEl: document.getElementById("pct-ambientais"),
      descEl: document.getElementById("desc-ambientais"),
      resultEl: document.getElementById("result-ambientais"),
    },
    pct,
    level
  );

  if (LIMPAR_APOS_CALCULAR) clearDomains(AMBIENTAIS_IDS);
}

// ---------------------------------------------------------------------
// Atividades e Participação
//   16 anos ou mais: [(d1+…+d9) × 25/9] − 0,1   (25/9 = 2,7777...)
//   Menores de 16:   [(d6+d7+d8+d9) × 6,25] − 0,1
// ---------------------------------------------------------------------
const PARTICIPACAO_TODOS = ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9"];
const PARTICIPACAO_SOCIAL = ["d6", "d7", "d8", "d9"];

let participacaoMode = "16mais"; // "16mais" ou "menor16"

// Campos usados na aba atual.
function idsParticipacaoAtuais() {
  return participacaoMode === "16mais" ? PARTICIPACAO_TODOS : PARTICIPACAO_SOCIAL;
}

function calcParticipacao() {
  const ids = idsParticipacaoAtuais();
  const multiplier = participacaoMode === "16mais" ? 25 / 9 : 6.25;

  const values = readDomains(ids);
  const sum = values.reduce((a, b) => a + b, 0);
  const pct = sum * multiplier - 0.1;
  const level = classify(Math.max(pct, 0));

  paintResult(
    {
      badgeEl: document.getElementById("badge-participacao"),
      pctEl: document.getElementById("pct-participacao"),
      descEl: document.getElementById("desc-participacao"),
      resultEl: document.getElementById("result-participacao"),
    },
    pct,
    level
  );

  if (LIMPAR_APOS_CALCULAR) clearDomains(ids);
}

// Troca de aba (16+ / menores de 16): ajusta botões, texto e campos visíveis.
function setParticipacaoMode(mode) {
  participacaoMode = mode;
  const is16mais = mode === "16mais";

  document.getElementById("grupo-medico").hidden = !is16mais; // d1 a d5
  document.getElementById("subtab-16mais").classList.toggle("active", is16mais);
  document.getElementById("subtab-menor16").classList.toggle("active", !is16mais);
  document.getElementById("subtab-16mais").setAttribute("aria-selected", is16mais);
  document.getElementById("subtab-menor16").setAttribute("aria-selected", !is16mais);

  document.getElementById("sub-participacao").textContent = is16mais
    ? "Qualificador final = [(d1+…+d9) × 2,77777777777778] − 0,1"
    : "Qualificador parcial = [(d6+d7+d8+d9) × 6,25] − 0,1";

  // Limpa tudo ao trocar de aba para não misturar valores.
  hideResult(document.getElementById("result-participacao"));
  clearDomains(PARTICIPACAO_TODOS);
}

// ---------------------------------------------------------------------
// Ligação dos botões às funções
// ---------------------------------------------------------------------
document.getElementById("calc-ambientais").addEventListener("click", calcAmbientais);
document.getElementById("calc-participacao").addEventListener("click", calcParticipacao);

document.getElementById("clear-ambientais").addEventListener("click", () => {
  clearDomains(AMBIENTAIS_IDS);
  hideResult(document.getElementById("result-ambientais"));
});

document.getElementById("clear-participacao").addEventListener("click", () => {
  clearDomains(idsParticipacaoAtuais());
  hideResult(document.getElementById("result-participacao"));
});

document.getElementById("subtab-16mais").addEventListener("click", () => setParticipacaoMode("16mais"));
document.getElementById("subtab-menor16").addEventListener("click", () => setParticipacaoMode("menor16"));

// Ativa as regras de digitação (só números de 0 a 4) em todos os campos.
enforceDomainLimits(AMBIENTAIS_IDS);
enforceDomainLimits(PARTICIPACAO_TODOS);

// ---------------------------------------------------------------------
// Navegação: menu inicial <-> cada calculadora
// ---------------------------------------------------------------------
function showMenu() {
  document.getElementById("menu-inicial").hidden = false;
  document.getElementById("view-ambientais").hidden = true;
  document.getElementById("view-participacao").hidden = true;
}

function showView(viewId) {
  document.getElementById("menu-inicial").hidden = true;
  document.getElementById("view-ambientais").hidden = viewId !== "view-ambientais";
  document.getElementById("view-participacao").hidden = viewId !== "view-participacao";
}

document.getElementById("menu-ambientais").addEventListener("click", () => showView("view-ambientais"));
document.getElementById("menu-participacao").addEventListener("click", () => showView("view-participacao"));
document.getElementById("voltar-ambientais").addEventListener("click", showMenu);
document.getElementById("voltar-participacao").addEventListener("click", showMenu);

// Menu do celular: cada opção leva para a mesma tela dos cartões do menu inicial.
document.querySelectorAll("#nav-menu [data-go]").forEach((item) => {
  item.addEventListener("click", () => {
    const destino = item.dataset.go;
    if (destino === "menu-inicial") showMenu();
    else showView(destino);
    window.scrollTo({ top: 0 });
  });
});
