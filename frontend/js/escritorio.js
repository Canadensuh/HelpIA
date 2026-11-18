/* =========================================================
   escritorio.js — o escritoriozinho do Helpy (comum às mesas)
   - Helpy em foco: ao dar uma dica, a tela escurece e desfoca,
     com um círculo nítido em volta do balão e do Helpy (3 s).
   - Botão de configurações na mesinha (liga/desliga o foco).
   Precisa no HTML: #focoVeu, #helpyFeed, .escritorio,
   #botaoConfig, #painelConfig e #configFoco.
   Uso: const escritorio = Escritorio.montar();
        escritorio.focar(3000);
   ========================================================= */

const Escritorio = {
  montar() {
  const CHAVE_FOCO = 'helpia-foco-dica';
  const elVeu = document.getElementById('focoVeu');
  const elConfigFoco = document.getElementById('configFoco');
  let timerFoco = null;

  const focoLigado = () => lerPreferencia(CHAVE_FOCO, 'sim') !== 'nao';
  elConfigFoco.checked = focoLigado();
  elConfigFoco.addEventListener('change', () => salvarPreferencia(CHAVE_FOCO, elConfigFoco.checked ? 'sim' : 'nao'));

  /**
   * Escurece e desfoca a tela, deixando um CÍRCULO nítido em volta do balão
   * e do Helpy. O círculo "fecha" ao entrar e "abre" ao sair (íris).
   */
  let quadroFoco = null;

  /** Centro e raio do círculo: envolve o balão da fala e o escritório do Helpy. */
  function posicionarCirculo() {
    const caixas = [document.getElementById('helpyFeed').lastElementChild, document.querySelector('.escritorio')]
      .filter(Boolean).map((el) => el.getBoundingClientRect());
    if (!caixas.length) return;
    const esq = Math.min(...caixas.map((r) => r.left));
    const dir = Math.max(...caixas.map((r) => r.right));
    const topo = Math.min(...caixas.map((r) => r.top));
    const base = Math.max(...caixas.map((r) => r.bottom));
    elVeu.style.setProperty('--fx', `${(esq + dir) / 2}px`);
    elVeu.style.setProperty('--fy', `${(topo + base) / 2}px`);
    elVeu.style.setProperty('--alvo-r', `${Math.hypot(dir - esq, base - topo) / 2 + 6}px`);
  }

  function focarNoHelpy(duracao = 3000) {
    if (!focoLigado()) return;
    clearTimeout(timerFoco);
    cancelAnimationFrame(quadroFoco);
    // O balão ainda está entrando e a lateral pode se acomodar: o círculo acompanha a cada quadro
    const acompanhar = () => { posicionarCirculo(); quadroFoco = requestAnimationFrame(acompanhar); };
    acompanhar();
    document.body.classList.add('foco-helpy');
    elVeu.classList.add('ativo');
    timerFoco = setTimeout(soltarFoco, duracao);
  }
  function soltarFoco() {
    clearTimeout(timerFoco);
    document.body.classList.remove('foco-helpy');
    elVeu.classList.remove('ativo');
    // segue o Helpy até a íris abrir (sem parar um foco novo que já tenha começado)
    setTimeout(() => { if (!elVeu.classList.contains('ativo')) cancelAnimationFrame(quadroFoco); }, 900);
  }
  // Qualquer clique encerra o foco antes dos 3 s (o véu não bloqueia cliques)
  document.addEventListener('pointerdown', () => { if (elVeu.classList.contains('ativo')) soltarFoco(); });

  // Botão de configurações na mesinha do Helpy
  const elBotaoConfig = document.getElementById('botaoConfig');
  const elPainelConfig = document.getElementById('painelConfig');
  function abrirConfig(abrir = elPainelConfig.hidden) {
    elPainelConfig.hidden = !abrir;
    elBotaoConfig.setAttribute('aria-expanded', String(abrir));
  }
  elBotaoConfig.addEventListener('click', (e) => { e.stopPropagation(); abrirConfig(); });
  document.addEventListener('click', (e) => {
    if (!elPainelConfig.hidden && !e.target.closest('#painelConfig')) abrirConfig(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { abrirConfig(false); soltarFoco(); }
  });
    return { focar: focarNoHelpy, soltar: soltarFoco };
  },
};

window.Escritorio = Escritorio;
