/* =========================================================
   arrastar.js — arrastar tickets com o mouse (ou o dedo)
   Enquanto você segura, uma "cópia" do ticket acompanha o cursor,
   levantada e balançando conforme o movimento. Ao soltar:
   - aoSoltar() devolve o elemento (ou retângulo) onde o ticket
     deve assentar → a cópia desliza até lá;
   - devolve null → a cópia volta para o lugar de origem.
   Um clique simples (sem mover) continua sendo clique.

   Uso:
     Arrastar.ligar(raiz, {
       item: '.tkp-item',                  // o que pode ser arrastado
       ignorar: 'input, label, a, ...',     // onde o clique NÃO começa um arrasto
       aoMover({ el, alvo }) {},            // para destacar onde vai cair
       async aoSoltar({ el, alvo }) {},     // devolve elemento/retângulo de destino ou null
       aoTerminar() {},
     });
   ========================================================= */

const Arrastar = {
  ativo: false,

  ligar(raiz, {
    item = '.tkp-item',
    ignorar = 'input, label, a, select, textarea, button:not(.tkp-abrir)',
    podeArrastar = null, aoMover = null, aoSoltar = null, aoTerminar = null,
  } = {}) {
    const LIMIAR = 6;              // pixels até virar arrasto (menos que isso é clique)
    let s = null;

    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

    raiz.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.ativo) return;
      const el = e.target.closest(item);
      if (!el || !raiz.contains(el) || e.target.closest(ignorar)) return;
      if (podeArrastar && !podeArrastar(el)) return;
      s = { el, x0: e.clientX, y0: e.clientY, ativo: false };
    });

    const comecar = (e) => {
      const r = s.el.getBoundingClientRect();
      const fantasma = s.el.cloneNode(true);
      fantasma.classList.add('arrasto-fantasma');
      fantasma.removeAttribute('id');
      fantasma.style.cssText = `position:fixed; left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px; margin:0; z-index:900; pointer-events:none;`;
      document.body.appendChild(fantasma);
      Object.assign(s, { ativo: true, fantasma, r, dx: e.clientX - r.left, dy: e.clientY - r.top, ultimoX: e.clientX, giro: 0 });
      s.el.classList.add('arrasto-origem');
      document.body.classList.add('arrastando-ticket');
      this.ativo = true;
    };

    const posicionar = (x, y) => {
      s.fantasma.style.transform =
        `translate(${x - s.dx - s.r.left}px, ${y - s.dy - s.r.top}px) rotate(${s.giro.toFixed(2)}deg) scale(1.06)`;
    };

    window.addEventListener('pointermove', (e) => {
      if (!s) return;
      if (!s.ativo) {
        if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < LIMIAR) return;
        comecar(e);
      }
      e.preventDefault();
      // O ticket "balança" para o lado em que está sendo puxado
      const vx = e.clientX - s.ultimoX;
      s.ultimoX = e.clientX;
      s.giro = s.giro * .82 + limitar(vx * 1.2, -16, 16) * .18;
      posicionar(e.clientX, e.clientY);
      aoMover?.({ el: s.el, alvo: document.elementFromPoint(e.clientX, e.clientY), x: e.clientX, y: e.clientY });
    }, { passive: false });

    const terminar = async (e, cancelado = false) => {
      if (!s) return;
      const atual = s;
      s = null;
      if (!atual.ativo) return;                 // foi só um clique

      // O clique que o navegador dispara depois de soltar não deve abrir o ticket
      const bloquear = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', bloquear, true);
      setTimeout(() => window.removeEventListener('click', bloquear, true), 0);

      let destino = null;
      if (!cancelado) {
        const alvo = document.elementFromPoint(e.clientX, e.clientY);
        try { destino = await aoSoltar?.({ el: atual.el, alvo, x: e.clientX, y: e.clientY }); } catch { destino = null; }
      }
      const origemViva = atual.el.isConnected ? atual.el.getBoundingClientRect() : atual.r;
      const final = destino ? (destino.getBoundingClientRect ? destino.getBoundingClientRect() : destino) : origemViva;

      const duracao = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 260;
      const anim = atual.fantasma.animate([
        { transform: atual.fantasma.style.transform },
        { transform: `translate(${final.left - atual.r.left}px, ${final.top - atual.r.top}px) rotate(0deg) scale(1)` },
      ], { duration: duracao, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' });
      // Nem sempre o "finished" chega (aba em segundo plano, por exemplo): o tempo garante que a cópia some
      await Promise.race([anim.finished.catch(() => {}), new Promise((r) => setTimeout(r, duracao + 80))]);
      atual.fantasma.remove();
      atual.el.classList.remove('arrasto-origem');
      document.body.classList.remove('arrastando-ticket');
      this.ativo = false;
      aoTerminar?.();
    };

    window.addEventListener('pointerup', (e) => terminar(e));
    window.addEventListener('pointercancel', (e) => terminar(e, true));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && s?.ativo) terminar(e, true); });
  },
};

window.Arrastar = Arrastar;
