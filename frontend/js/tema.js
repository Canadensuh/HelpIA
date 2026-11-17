/* =========================================================
   tema.js — fundo verde-quadro (padrão) / fundo papel kraft
   Carregado no <head> para aplicar o tema antes da página
   aparecer, evitando o "piscar" de cores.
   ========================================================= */

(function () {
  const CHAVE = 'helpia-tema';
  const raiz = document.documentElement;

  function lerTema() {
    try { return localStorage.getItem(CHAVE) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }

  function aplicarTema(tema) {
    raiz.setAttribute('data-theme', tema);
    try { localStorage.setItem(CHAVE, tema); } catch { /* armazenamento indisponível */ }
    document.querySelectorAll('.btn-tema').forEach((botao) => {
      const rotulo = tema === 'dark' ? 'Trocar para fundo kraft' : 'Trocar para fundo verde-quadro';
      botao.setAttribute('aria-label', rotulo);
      botao.title = rotulo;
    });
  }

  raiz.setAttribute('data-theme', lerTema());

  document.addEventListener('DOMContentLoaded', () => {
    aplicarTema(lerTema());
    document.querySelectorAll('.btn-tema').forEach((botao) => {
      botao.addEventListener('click', () => {
        aplicarTema(raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    });
  });
})();
