// =====================================================================
// splash.js — Tela de abertura (imagem que some quando a página carrega)
// Como funciona:
//   - Páginas simples (forgot-password): some sozinha quando a página termina de carregar.
//   - Páginas com <body data-splash-wait> (login, app, admin): esperam também a
//     conferência de login; a página chama hideSplash() quando estiver pronta.
//   - Fica no mínimo MIN_MS na tela (para a imagem não "piscar") e, por segurança,
//     some sozinha depois de 8 s mesmo que algo demore.
// =====================================================================
(function () {
  var splash = document.getElementById("splash");
  if (!splash) return;

  var MIN_MS = 700;                                   // tempo mínimo na tela
  var esperarPagina = document.body.hasAttribute("data-splash-wait");
  var carregou = document.readyState === "complete";  // recursos da página (CSS, imagens)
  var liberado = !esperarPagina;                      // página avisou que está pronta
  var escondido = false;

  function tentarEsconder() {
    if (escondido || !carregou || !liberado) return;
    escondido = true;
    var resta = Math.max(0, MIN_MS - performance.now());
    setTimeout(function () {
      splash.classList.add("hide");
      setTimeout(function () { splash.remove(); }, 600);
    }, resta);
  }

  // As páginas chamam isto quando terminam de conferir o login.
  window.hideSplash = function () { liberado = true; tentarEsconder(); };

  if (!carregou) {
    window.addEventListener("load", function () { carregou = true; tentarEsconder(); });
  }
  setTimeout(function () { carregou = true; liberado = true; tentarEsconder(); }, 8000);
  tentarEsconder();
})();
