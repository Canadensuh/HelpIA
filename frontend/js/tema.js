/* =========================================================
   tema.js — modo escuro (padrão) / modo claro
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
      const rotulo = tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
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
