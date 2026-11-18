/* =========================================================
   helpy.js — o mascote Helpy e efeitos compartilhados
   - Helpy: avatar animado + balões de fala com ações pré-prontas
     (não é um chat livre: só opções pensadas antes).
   - Efeitos: toast, confete e contador animado.
   ========================================================= */

class Helpy {
  /** SVG do robô. Humores via classe no wrapper: feliz, pensando, comemorando, acenando, alerta. */
  static avatar(classe = '') {
    return `
      <div class="helpy-avatar ${classe}" aria-hidden="true">
        <svg viewBox="0 0 120 120" class="helpy-svg">
          <defs>
            <linearGradient id="helpyCabeca" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#EAD27F"/><stop offset="1" stop-color="#C9A94A"/>
            </linearGradient>
          </defs>
          <ellipse class="helpy-sombra" cx="60" cy="116" rx="26" ry="4"/>
          <g class="helpy-corpo">
            <line class="helpy-antena" x1="60" y1="24" x2="60" y2="12"/>
            <circle class="helpy-luz" cx="60" cy="9" r="5"/>
            <rect class="helpy-orelha" x="13" y="45" width="9" height="18" rx="4"/>
            <rect class="helpy-orelha" x="98" y="45" width="9" height="18" rx="4"/>
            <rect class="helpy-cabeca" x="20" y="22" width="80" height="62" rx="24" fill="url(#helpyCabeca)"/>
            <rect class="helpy-visor" x="31" y="35" width="58" height="35" rx="15"/>
            <g class="helpy-olhos">
              <ellipse class="helpy-olho" cx="48" cy="51" rx="5.5" ry="6.5"/>
              <ellipse class="helpy-olho" cx="72" cy="51" rx="5.5" ry="6.5"/>
            </g>
            <path class="helpy-boca" d="M51 61q9 6.5 18 0"/>
            <circle class="helpy-bochecha" cx="38" cy="63" r="3"/>
            <circle class="helpy-bochecha" cx="82" cy="63" r="3"/>
            <path class="helpy-tronco" d="M40 88h40a10 10 0 0 1 10 10v10H30v-10a10 10 0 0 1 10-10z"/>
            <circle class="helpy-botao" cx="60" cy="99" r="3.5"/>
            <path class="helpy-braco helpy-braco-esq" d="M32 96q-12 2-14 12"/>
            <path class="helpy-braco helpy-braco-dir" d="M88 96q12-2 16-14"/>
          </g>
        </svg>
      </div>`;
  }

  /**
   * @param {HTMLElement} raiz  elemento que contém .helpy-avatar
   * @param {HTMLElement} feed  onde os balões aparecem
   * @param {object} opcoes     { maxMensagens, balao }
   *   balao: mostra UMA fala por vez, como balão sobre a cabeça do Helpy.
   */
  constructor(raiz, feed, opcoes = {}) {
    this.raiz = raiz;
    this.feed = feed;
    this.maxMensagens = opcoes.maxMensagens || 30;
    this.balao = !!opcoes.balao;
    this.geracao = 0;          // muda em calar(): falas antigas da fila são descartadas
    this._soltar = null;
    this.fila = Promise.resolve();
  }

  /** Descarta as falas que ainda estão na fila (ex.: o usuário mudou de tela). */
  calar() {
    this.geracao++;
    if (this._soltar) this._soltar();
  }

  humor(nome, duracao = 0) {
    const avatar = this.raiz.querySelector('.helpy-avatar');
    if (!avatar) return;
    avatar.classList.remove('feliz', 'pensando', 'comemorando', 'acenando', 'alerta');
    if (nome) avatar.classList.add(nome);
    if (duracao) setTimeout(() => avatar.classList.remove(nome), duracao);
  }

  /**
   * Fala em fila (uma mensagem depois da outra), com indicador de digitação.
   * segurar: no modo balão, a fala fica na tela até o usuário escolher uma ação
   * (usado nas dicas), e só então a próxima fala aparece.
   * aoMostrar: chamado quando o balão aparece na tela (ex.: pôr o Helpy em foco).
   */
  dizer(html, { acoes = [], tipo = '', humor = 'feliz', atraso = 550, segurar = false, aoMostrar = null } = {}) {
    const geracao = this.geracao;
    this.fila = this.fila.then(() => (geracao === this.geracao
      ? this._falar(html, acoes, tipo, humor, atraso, segurar, geracao, aoMostrar)
      : null));
    return this.fila;
  }

  _falar(html, acoes, tipo, humor, atraso, segurar, geracao, aoMostrar) {
    return new Promise((resolver) => {
      this.desativarAcoes();
      if (this.balao) this.feed.replaceChildren();
      this.humor('pensando');
      const digitando = document.createElement('div');
      digitando.className = 'helpy-msg helpy-digitando';
      digitando.innerHTML = '<span></span><span></span><span></span>';
      this.feed.appendChild(digitando);
      this._rolar();

      setTimeout(() => {
        digitando.remove();
        if (geracao !== this.geracao) { resolver(null); return; }   // foi calado enquanto "digitava"
        const msg = document.createElement('div');
        msg.className = `helpy-msg ${tipo ? `helpy-msg-${tipo}` : ''}`;
        msg.innerHTML = html;
        if (acoes.length) {
          const linha = document.createElement('div');
          linha.className = 'helpy-acoes';
          acoes.forEach((acao) => {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = `helpy-acao ${acao.destaque ? 'helpy-acao-destaque' : ''}`;
            botao.innerHTML = acao.rotulo;
            botao.addEventListener('click', () => {
              this.desativarAcoes();
              botao.classList.add('escolhida');
              if (this._soltar) this._soltar();
              acao.fn();
            });
            linha.appendChild(botao);
          });
          msg.appendChild(linha);
        }
        this.feed.appendChild(msg);
        while (this.feed.children.length > this.maxMensagens) this.feed.firstElementChild.remove();
        this._rolar();
        this.humor(humor);
        aoMostrar?.(msg);
        if (this.balao && segurar && acoes.length) {
          this._soltar = () => { this._soltar = null; resolver(msg); };
        } else {
          resolver(msg);
        }
      }, atraso);
    });
  }

  desativarAcoes() {
    this.feed.querySelectorAll('.helpy-acao:not(:disabled)').forEach((b) => { b.disabled = true; });
  }

  limpar() {
    this.feed.innerHTML = '';
  }

  _rolar() {
    this.feed.scrollTo({ top: this.feed.scrollHeight, behavior: 'smooth' });
  }
}

const Efeitos = {
  _toasts: null,

  toast(html, { tipo = '', icone = '<i class="ic ic-sino" aria-hidden="true"></i>', duracao = 4200 } = {}) {
    if (!this._toasts) {
      this._toasts = document.createElement('div');
      this._toasts.className = 'toasts';
      this._toasts.setAttribute('aria-live', 'polite');
      document.body.appendChild(this._toasts);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo ? `toast-${tipo}` : ''}`;
    toast.innerHTML = `<span class="toast-icone">${icone}</span><div>${html}</div>`;
    this._toasts.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('saindo');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duracao);
  },

  /** Confete saindo de um elemento (ou do centro da tela). */
  confete(origem, quantidade = 70) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const caixa = origem?.getBoundingClientRect?.();
    const x = caixa ? caixa.left + caixa.width / 2 : innerWidth / 2;
    const y = caixa ? caixa.top + caixa.height / 2 : innerHeight / 2;
    const cores = ['#8FA858', '#E3C567', '#C98B3A', '#A6F08A', '#4C6B3C', '#F7F2E2'];
    for (let i = 0; i < quantidade; i++) {
      const peca = document.createElement('span');
      peca.className = 'confete';
      const angulo = Math.random() * Math.PI * 2;
      const forca = 120 + Math.random() * 260;
      peca.style.cssText = `
        left:${x}px; top:${y}px;
        background:${cores[i % cores.length]};
        --dx:${Math.cos(angulo) * forca}px;
        --dy:${Math.sin(angulo) * forca - 160}px;
        --giro:${(Math.random() - .5) * 1080}deg;
        width:${6 + Math.random() * 6}px; height:${8 + Math.random() * 8}px;
        animation-duration:${900 + Math.random() * 700}ms;`;
      document.body.appendChild(peca);
      peca.addEventListener('animationend', () => peca.remove(), { once: true });
    }
  },

  /** Anima um número de onde está até o valor final. */
  contarAte(el, valor, duracao = 900) {
    const inicio = Number(el.dataset.valor || 0);
    el.dataset.valor = valor;
    if (inicio === valor || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = valor;
      return;
    }
    const t0 = performance.now();
    const passo = (agora) => {
      const p = Math.min(1, (agora - t0) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(inicio + (valor - inicio) * suave);
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  },

  /** "há 5 min", "há 2 h", "ontem"… */
  tempoDesde(iso) {
    const minutos = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (minutos < 1) return 'agora';
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'ontem' : `há ${dias} dias`;
  },

  dataCurta(iso) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  },

  /** Clona um elemento e o "voa" até o destino (ticket indo para a mesa, arquivo…). */
  voar(elemento, destino, { duracao = 800, escalaFinal = .2 } = {}) {
    return new Promise((resolver) => {
      if (!elemento || !destino || matchMedia('(prefers-reduced-motion: reduce)').matches) { resolver(); return; }
      const de = elemento.getBoundingClientRect();
      const para = destino.getBoundingClientRect();
      const clone = elemento.cloneNode(true);
      clone.classList.add('voando');
      clone.style.cssText = `position:fixed; left:${de.left}px; top:${de.top}px; width:${de.width}px; height:${de.height}px; margin:0; z-index:950; pointer-events:none;`;
      document.body.appendChild(clone);
      const dx = para.left + para.width / 2 - (de.left + de.width / 2);
      const dy = para.top + para.height / 2 - (de.top + de.height / 2);
      const animacao = clone.animate([
        { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * .5}px, ${dy * .5 - 80}px) scale(${(1 + escalaFinal) / 2}) rotate(-8deg)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx}px, ${dy}px) scale(${escalaFinal}) rotate(6deg)`, opacity: .1 },
      ], { duration: duracao, easing: 'cubic-bezier(.5,0,.3,1)' });
      animacao.onfinish = () => { clone.remove(); resolver(); };
    });
  },
};

window.Helpy = Helpy;
window.Efeitos = Efeitos;
