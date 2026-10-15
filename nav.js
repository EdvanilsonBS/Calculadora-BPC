// =====================================================================
// nav.js — Menu "hambúrguer" do celular (abrir/fechar)
// O botão #nav-toggle abre e fecha o painel #nav-menu.
// Fecha ao: clicar fora, apertar Esc, escolher um item ou voltar à tela larga.
// =====================================================================
(function () {
  var botao = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-menu");
  if (!botao || !menu) return;

  function abrir(sim) {
    menu.hidden = !sim;
    botao.classList.toggle("open", sim);
    botao.setAttribute("aria-expanded", sim ? "true" : "false");
    botao.setAttribute("aria-label", sim ? "Fechar menu" : "Abrir menu");
  }
  window.fecharNav = function () { abrir(false); };

  botao.addEventListener("click", function (e) {
    e.stopPropagation();
    abrir(menu.hidden);
  });
  menu.addEventListener("click", function (e) {
    // Qualquer botão ou link dentro do menu fecha o painel.
    if (e.target.closest("button, a")) abrir(false);
  });
  document.addEventListener("click", function (e) {
    if (!menu.hidden && !menu.contains(e.target)) abrir(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !menu.hidden) { abrir(false); botao.focus(); }
  });
  window.matchMedia("(min-width: 721px)").addEventListener("change", function (m) {
    if (m.matches) abrir(false);
  });
})();
