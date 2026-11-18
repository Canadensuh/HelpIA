/* =========================================================
   landing.js — a página inicial em "deck" (index.html)
   - As 7 telas ficam lado a lado. Um giro do mouse leva, numa animação
     suave, para a tela da DIREITA; dentro de cada tela, cada giro mostra
     mais um pedaço da animação dela (mensagens chegando no chat, tickets
     presos no mural, os 4 atos do ticket #008, crachás caindo…).
   - Depois da última tela, a página desce para a chamada final.
   - A rolagem continua sendo a do navegador (barra de rolagem, teclado,
     links do menu): o deck só traduz a posição vertical em "telas".
   - Celular, tela baixa ou "menos movimento" no sistema: as telas ficam
     uma embaixo da outra, completas (html sem a classe .deck).
   Variáveis que o CSS usa:
     --e  (0 a 1) progresso de cada elemento com data-faixa="início fim"
     --m / --ma  posição da tela em relação à vista (-1 a 1) e o módulo
     --a --b --c --d  os 4 atos do "Como funciona" (no palco)
   ========================================================= */

(() => {
  const html = document.documentElement;
  const deck = document.querySelector('[data-deck]');
  if (!deck) return;
  const vista = deck.querySelector('.lp-deck-vista');
  const trilho = deck.querySelector('.lp-deck-trilho');
  const telas = [...deck.querySelectorAll('.lp-tela')];
  const final = document.getElementById('comecar');
  const N = telas.length;

  const limitar = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const suave = (t) => t * t * (3 - 2 * t);
  const vaiEVolta = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* Quantos "giros" do mouse cada tela tem por dentro (0 = só passa) */
  const GIROS = { inicio: 0, plataforma: 5, relato: 6, 'como-funciona': 12, perfis: 7, planos: 4, equipe: 3 };
  /* Onde o menu leva em cada tela (0 = começo da animação, 1 = completa) */
  const ANCORA = { inicio: 0, plataforma: 1, relato: 1, 'como-funciona': .25, perfis: 1, planos: 1, equipe: 1 };
  const MENU = { plataforma: 'plataforma', relato: 'plataforma', 'como-funciona': 'como-funciona', perfis: 'perfis', planos: 'planos', equipe: 'equipe' };
  const CLARAS = new Set(['relato', 'planos']);
  const PASSO = 120;   // px de rolagem por giro

  // ---------- Palavras do título dos perfis: cada uma vira um pedaço ----------
  document.querySelectorAll('[data-palavras]').forEach((el) => {
    const [ini, fim] = el.dataset.palavras.split(' ').map(Number);
    const palavras = el.textContent.trim().split(/\s+/);
    const fatia = (fim - ini) / palavras.length;
    el.innerHTML = palavras.map((p, i) => {
      const a = ini + i * fatia;
      return `<span class="lp-palavra" data-faixa="${a.toFixed(3)} ${(a + fatia * 2.2).toFixed(3)}">${p}</span>`;
    }).join(' ');
  });

  // ---------- Elementos animados de cada tela ----------
  const porTela = telas.map((tela) => [...tela.querySelectorAll('[data-faixa]')].map((el) => {
    const [a, b] = el.dataset.faixa.split(' ').map(Number);
    return { el, a, b, ultimo: -1 };
  }));
  const palco = deck.querySelector('[data-palco]');
  const palcoCena = palco?.querySelector('.lp-palco-cena');
  const atos = [...deck.querySelectorAll('.lp-ato')];
  const trilhaAtos = [...deck.querySelectorAll('.lp-atos-trilha span')];
  const iframe = deck.querySelector('[data-vitrine] iframe');
  const navLinks = [...document.querySelectorAll('[data-nav]')];

  // ---------- Modo: deck (lado a lado) ou lista (uma embaixo da outra) ----------
  const podeDeck = matchMedia('(min-width: 1000px) and (min-height: 600px) and (hover: hover) and (pointer: fine)');
  const comAnimacao = html.classList.contains('anima');
  let ehDeck = false;

  // Posições (px, relativas ao topo do deck): começo e fim da parte "por dentro" de cada tela
  let ini = [], fim = [], MOVE = 0, L = 0, topoDeck = 0;

  function medir() {
    const H = innerHeight;
    MOVE = Math.round(H * .9);           // rolagem que leva de uma tela para a outra
    ini = []; fim = [];
    let y = 0;
    telas.forEach((tela, i) => {
      ini[i] = y;
      y += (GIROS[tela.dataset.tela] || 0) * PASSO;
      fim[i] = y;
      if (i < N - 1) y += MOVE;
    });
    L = y;
    deck.style.height = ehDeck ? `${L + H}px` : '';
    topoDeck = deck.offsetTop;
  }

  /** Em que ponto do deck estamos: x = tela (com fração no meio da passagem) e t de cada tela. */
  function situacao(y) {
    const rel = limitar(y - topoDeck, 0, L);
    for (let i = 0; i < N; i++) {
      if (rel <= fim[i] + .5) {
        if (rel >= ini[i] - .5) {
          const dentro = fim[i] - ini[i];
          return { i, x: i, t: dentro ? limitar((rel - ini[i]) / dentro) : 1, dentro: true };
        }
        // passagem da tela i-1 para a i
        const f = limitar((rel - fim[i - 1]) / MOVE);
        return { i: i - 1, x: i - 1 + f, t: 1, dentro: false };
      }
    }
    return { i: N - 1, x: N - 1, t: 1, dentro: true };
  }

  // ---------- Desenho ----------
  let ultimoX = -1, ultimoT = [], vitrineT = -1, atoAtual = -1;

  function desenhar() {
    if (!ehDeck) return;
    const s = situacao(scrollY);
    const x = s.x;
    if (vista.scrollLeft) vista.scrollLeft = 0;   // navegador sem overflow: clip
    if (x !== ultimoX) {
      trilho.style.transform = `translate3d(${(-x * 100).toFixed(3)}%, 0, 0)`;
      telas.forEach((tela, i) => {
        const m = limitar(i - x, -1, 1);
        tela.style.setProperty('--m', m.toFixed(4));
        tela.style.setProperty('--ma', Math.abs(m).toFixed(4));
      });
      ultimoX = x;
    }
    // progresso de cada tela: as da esquerda ficam completas, as da direita no começo
    telas.forEach((tela, i) => {
      const t = i < s.i ? 1 : i > s.i ? 0 : s.dentro ? s.t : 1;
      if (t === ultimoT[i]) return;
      ultimoT[i] = t;
      animarTela(i, t);
    });
    // menu e tom (tela clara ou escura)
    const atual = Math.round(x);
    const nome = telas[atual].dataset.tela;
    vista.toggleAttribute('data-claro', CLARAS.has(nome));
    const abaixo = scrollY > topoDeck + L + innerHeight * .5;   // já na chamada final
    navLinks.forEach((a) => a.classList.toggle('ativo', !abaixo && a.dataset.nav === MENU[nome]));
  }

  function animarTela(i, t) {
    porTela[i].forEach((item) => {
      const e = item.b > item.a ? suave(limitar((t - item.a) / (item.b - item.a))) : Number(t >= item.a);
      const r = Math.round(e * 1000) / 1000;
      if (r === item.ultimo) return;
      item.ultimo = r;
      item.el.style.setProperty('--e', r);
      item.el.classList.toggle('cheio', r >= 1);
    });
    const nome = telas[i].dataset.tela;
    if (nome === 'como-funciona') animarAtos(t);
    if (nome === 'plataforma') enviarVitrine(t);
  }

  /** Os 4 atos: cada um anima em 80% do seu trecho e "descansa" nos 20% finais. */
  function animarAtos(t) {
    const p = t * 4;
    ['a', 'b', 'c', 'd'].forEach((v, k) => palco.style.setProperty(`--${v}`, suave(limitar((p - k) / .8)).toFixed(4)));
    const idx = limitar(Math.ceil(p) - 1, 0, 3);
    if (idx !== atoAtual) {
      atoAtual = idx;
      atos.forEach((el, k) => { el.classList.toggle('atual', k === idx); el.classList.toggle('passou', k < idx); });
    }
    trilhaAtos.forEach((el, k) => el.style.setProperty('--f', limitar(p - k).toFixed(3)));
  }

  /** A vitrine do chat recebe o progresso e mostra as mensagens chegando. */
  let vitrineQuer = 0;
  function enviarVitrine(t) {
    vitrineQuer = t;
    if (!iframe?.contentWindow || Math.abs(t - vitrineT) < .004) return;
    vitrineT = t;
    iframe.contentWindow.postMessage({ tipo: 'helpia-vitrine', t }, '*');
  }
  iframe?.addEventListener('load', () => { vitrineT = -1; enviarVitrine(ehDeck ? vitrineQuer : 1); });

  // ---------- Tamanho da vitrine e do palco ----------
  function ajustarTamanhos() {
    const area = deck.querySelector('.lp-vitrine-area');
    const tela = deck.querySelector('.lp-vitrine-tela');
    if (area && tela) {
      const w = area.clientWidth;
      const h = ehDeck ? area.clientHeight : Infinity;
      const s = Math.max(.2, Math.min(w / 1440, h / 900));
      tela.style.setProperty('--vt-s', s.toFixed(4));
      tela.style.setProperty('--vt-w', `${Math.floor(1440 * s)}px`);
      tela.style.setProperty('--vt-h', `${Math.floor(900 * s)}px`);
    }
    if (palco) {
      const w = palco.clientWidth || 600;
      const hLivre = ehDeck ? innerHeight - 200 : Infinity;
      palco.style.setProperty('--palco-s', Math.min(1, w / 600, hLivre / 480).toFixed(4));
    }
  }

  // ---------- Rolagem suave (o deck "anda" para a próxima tela) ----------
  let alvo = scrollY, atual = scrollY, salto = null, rodando = false, esperado = null;
  let travaAte = 0, travaMax = 0;

  function rolar(y) { esperado = Math.round(y); scrollTo(0, y); }
  function laco(agora) {
    if (salto) {
      const k = limitar((agora - salto.t0) / salto.dur);
      atual = salto.de + (salto.para - salto.de) * vaiEVolta(k);
      rolar(atual);
      if (k >= 1) { salto = null; atual = alvo; travaAte = agora + 160; travaMax = agora + 1300; }
    } else {
      atual += (alvo - atual) * .16;
      if (Math.abs(alvo - atual) < .6) atual = alvo;
      rolar(atual);
    }
    if (salto || atual !== alvo) requestAnimationFrame(laco);
    else rodando = false;
  }
  function andar() { if (!rodando) { rodando = true; requestAnimationFrame(laco); } }
  function saltar(y, telasPassadas = 1) {
    alvo = y;
    salto = { de: scrollY, para: y, t0: performance.now(), dur: Math.min(1700, 760 + 220 * (telasPassadas - 1)) };
    andar();
  }
  const yDe = (i, frac) => topoDeck + ini[i] + (fim[i] - ini[i]) * frac;
  const yFinal = () => final.offsetTop;

  /** Um "giro" para frente (dir = 1) ou para trás (dir = -1). forte = pula direto de tela. */
  function girar(dir, quanto = PASSO, forte = false) {
    const base = salto ? salto.para : alvo;
    const s = situacao(base);
    const rel = base - topoDeck;
    if (dir > 0) {
      if (base > topoDeck + L + 2) return false;                     // já desceu: rolagem normal
      if (!s.dentro) { saltar(yDe(s.i + 1, 0)); return true; }
      if (forte || rel >= fim[s.i] - 1) {
        if (s.i < N - 1) saltar(yDe(s.i + 1, 0));
        else saltar(yFinal());
        return true;
      }
      alvo = Math.min(topoDeck + fim[s.i], base + quanto);
    } else {
      if (base > topoDeck + L + 2) return false;
      if (!s.dentro) { saltar(yDe(s.i, 1)); return true; }
      if (forte || rel <= ini[s.i] + 1) {
        if (s.i > 0) saltar(yDe(s.i - 1, 1));
        else return false;
        return true;
      }
      alvo = Math.max(topoDeck + ini[s.i], base - quanto);
    }
    salto = null;
    andar();
    return true;
  }

  function aoGirar(e) {
    if (!ehDeck || e.ctrlKey) return;
    let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (e.deltaMode === 1) d *= 40;
    if (e.deltaMode === 2) d *= innerHeight;
    if (!d) return;
    // Abaixo do deck a página rola normal (a chamada final e o rodapé)
    if (scrollY > topoDeck + L + 2 && !salto) return;
    const agora = performance.now();
    if (salto) { e.preventDefault(); return; }
    // Logo depois de um salto, o "embalo" do touchpad não conta como giro novo
    if (agora < travaAte) {
      e.preventDefault();
      if (Math.abs(d) < 60 && agora < travaMax) travaAte = agora + 90;
      return;
    }
    // Mouse: cada "clique" da rodinha é um giro inteiro. Touchpad: proporcional ao gesto.
    if (girar(Math.sign(d), Math.abs(d) >= 50 ? PASSO : Math.abs(d))) e.preventDefault();
  }
  addEventListener('wheel', aoGirar, { passive: false });

  addEventListener('keydown', (e) => {
    if (!ehDeck || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const frente = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const tras = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (!frente && !tras) return;
    const forte = e.key.startsWith('Page') || e.key === ' ';
    if (girar(frente ? 1 : -1, PASSO, forte)) e.preventDefault();
  });

  // Rolagem que não foi nossa (barra de rolagem, toque): acompanha
  addEventListener('scroll', () => {
    if (rodando) {
      if (esperado !== null && Math.abs(scrollY - esperado) > 3) { salto = null; alvo = atual = scrollY; }
    } else alvo = atual = scrollY;
    pedirQuadro();
  }, { passive: true });

  // ---------- Links do menu e dos botões (#planos, #perfis…) ----------
  function irParaTela(id, instantaneo = false) {
    const i = telas.findIndex((t) => t.id === id);
    if (i < 0) return false;
    const y = yDe(i, ANCORA[telas[i].dataset.tela] ?? 1);
    if (instantaneo) { alvo = atual = y; rolar(y); pedirQuadro(); return true; }
    saltar(y, Math.abs(i - Math.round(situacao(scrollY).x)) || 1);
    return true;
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!ehDeck) return;                      // sem deck: a âncora normal resolve
    if (id === 'comecar') { e.preventDefault(); saltar(yFinal()); return; }
    if (irParaTela(id)) { e.preventDefault(); history.replaceState(null, '', `#${id}`); }
  });

  // ---------- Liga / desliga o deck ----------
  let pedido = 0;
  function pedirQuadro() { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; desenhar(); }); }

  function aplicarModo() {
    const antes = ehDeck ? situacao(scrollY) : null;
    ehDeck = comAnimacao && podeDeck.matches;
    html.classList.toggle('deck', ehDeck);
    medir();
    ajustarTamanhos();
    if (!ehDeck) {
      // lista: tudo completo
      trilho.style.transform = '';
      telas.forEach((tela, i) => { tela.style.removeProperty('--m'); tela.style.removeProperty('--ma'); animarTela(i, 1); });
      porTela.flat().forEach((item) => { item.el.style.removeProperty('--e'); item.el.classList.add('cheio'); item.ultimo = -1; });
      palco?.style.removeProperty('--a'); palco?.style.removeProperty('--b'); palco?.style.removeProperty('--c'); palco?.style.removeProperty('--d');
      atos.forEach((el) => el.classList.add('atual'));
      ultimoX = -1; ultimoT = [];
      return;
    }
    atos.forEach((el) => el.classList.remove('atual'));
    atoAtual = -1; ultimoX = -1; ultimoT = [];
    if (antes) {   // mesma tela e mesmo ponto depois de mudar o tamanho da janela
      const y = antes.dentro ? yDe(antes.i, antes.t) : yDe(Math.round(antes.x), 0);
      alvo = atual = y; rolar(y);
    }
    desenhar();
  }
  let esperaResize = 0;
  addEventListener('resize', () => { clearTimeout(esperaResize); esperaResize = setTimeout(aplicarModo, 120); });
  podeDeck.addEventListener?.('change', aplicarModo);

  // Chamada final: o ticket grande entra quando aparece
  const caixaFinal = final?.querySelector('.lp-final-caixa');
  if (caixaFinal && 'IntersectionObserver' in window) {
    new IntersectionObserver((entradas, obs) => {
      entradas.forEach((en) => { if (en.isIntersecting) { caixaFinal.classList.add('visto'); obs.disconnect(); } });
    }, { threshold: .25 }).observe(caixaFinal);
  } else caixaFinal?.classList.add('visto');

  aplicarModo();
  // Abriu com #planos, #perfis… no endereço: vai direto para a tela
  if (ehDeck && location.hash) {
    const id = location.hash.slice(1);
    if (id === 'comecar') rolar(yFinal()); else irParaTela(id, true);
  }
  document.fonts?.ready.then(() => { ajustarTamanhos(); pedirQuadro(); });
})();
