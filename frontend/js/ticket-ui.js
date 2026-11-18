/* =========================================================
   ticket-ui.js — tickets nas telas de lista (histórico e
   tickets em aberto) e no chat.
   - TicketUI.padrao(c, {...}): ticket no tamanho padrão (300×200),
     só a faixa muda de cor pela prioridade.
   - TicketUI.abrir(c, {...}): modal com o ticket grande compacto.
   - TicketUI.filtrar(lista, filtros): busca por #ID, pessoa e problema.
   ========================================================= */

/* ---------- Busca tolerante: sem acento, sem caixa alta e com pequenos erros ----------
   "impresora", "BEATRIS", "média", "#6", "006" e "alta beatriz" funcionam. */
const Busca = {
  normalizar(texto) {
    return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9#\s]/g, ' ').replace(/\s+/g, ' ').trim();
  },
  /** Distância de edição (Levenshtein), parando cedo quando passa do limite. */
  distancia(a, b, limite = 2) {
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const atual = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        menor = Math.min(menor, atual[j]);
      }
      if (menor > limite) return limite + 1;
      anterior = atual;
    }
    return anterior[b.length];
  },
  /** Uma palavra da busca combina com alguma palavra do texto? */
  palavraCombina(q, palavras) {
    const limite = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    return palavras.some((p) => p.includes(q)
      || (limite && (this.distancia(q, p, limite) <= limite || this.distancia(q, p.slice(0, q.length), limite) <= limite)));
  },
  /** O ticket combina com TODAS as palavras da busca? */
  ticket(c, consulta) {
    const termos = this.normalizar(consulta).split(' ').filter(Boolean);
    if (!termos.length) return true;
    const nivel = Catalogo.nivel(c);
    const palavras = this.normalizar([
      c.codigo, c.genero_titulo, c.subgenero_titulo, c.descricao, c.categoria, c.fila, c.solicitante, c.analista,
      c.status, nivel.rotulo, `prioridade ${nivel.rotulo}`, c.maquina, c.nota, c.resolucao,
    ].filter(Boolean).join(' ')).split(' ');
    return termos.every((q) => {
      const numero = q.replace(/^#/, '');
      if (/^\d+$/.test(numero)) return Number(numero) === c.numero || palavras.some((p) => p.includes(numero));
      return this.palavraCombina(q.replace(/^#/, ''), palavras);
    });
  },
};
window.Busca = Busca;

const TicketUI = {
  esc: (texto) => escaparHtml(String(texto ?? '')),
  dataBr: (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'),
  dataHoraBr(iso) { return iso ? `${this.dataBr(iso)} às ${formatarHora(iso)}` : '—'; },
  ORDEM: { alta: 0, media: 1, normal: 2, baixa: 3 },

  /** Nome curto da pessoa: quem está logado vira "(Você)". */
  quem(nome) {
    return nome && nome === window.Sessao?.usuario()?.nome ? '(Você)' : nome;
  },
  /** Nome completo + marca "(Você)" (para o ticket grande). */
  quemCompleto(nome) {
    return nome && nome === window.Sessao?.usuario()?.nome ? `${nome} (Você)` : nome;
  },

  selo(nivel) {
    return `<span class="tkp-pri">${nivel.id === 'alta' ? ic('chama') : ''}${nivel.rotulo}</span>`;
  },

  carimbo(c, grande = false) {
    const quem = this.esc(c.analista || 'Analista');
    return `<div class="carimbo-resolvido ${grande ? 'grande' : ''}" role="img" aria-label="Resolvido por ${quem} em ${this.dataBr(c.resolvido_em)}">
      <b>Resolvido</b><span>${quem}</span><small>${this.dataBr(c.resolvido_em)}</small></div>`;
  },

  /** Minutos que o ticket está parado na etapa atual (na fila ou em atendimento). */
  minutosParado(c) {
    return Math.round((Date.now() - new Date(c.assumido_em || c.aberto_em)) / 60000);
  },

  /**
   * historico: carimbo do analista · linhas: [linha 1, linha 2] do rodapé (HTML)
   * clique: false para só mostrar (sem abrir o modal)
   */
  padrao(c, { historico = false, linhas = null, clique = true, classe = '', i = 0 } = {}) {
    const esc = this.esc;
    const nivel = Catalogo.nivel(c);
    const rodape = linhas || (historico
      ? [`${ic('relogio')} Aberto ${Efeitos.dataCurta(c.aberto_em)}`, `${ic('usuario')} ${esc(c.solicitante)}`]
      : [`<span class="tag ${classeStatus(c.status)}">${esc(c.status)}</span> ${Efeitos.tempoDesde(c.aberto_em)}`,
        c.analista ? `${ic('usuario')} <b>${esc(this.quem(c.analista))}</b>` : `${ic('relogio')} Esperando um analista`]);
    return `
      <li class="tkp-item ${historico ? 'tkp-hist' : ''} ${classe}" style="--i:${i}" data-numero="${c.numero}">
        <div class="tkp-sombra">
          <article class="tkp ticket pri-${nivel.id}">
            <header class="tkp-faixa"><span class="tkp-codigo">${esc(c.codigo)}</span>${this.selo(nivel)}</header>
            <div class="tkp-corpo">
              <span class="mini-ico">${Catalogo.icone(c.genero)}</span>
              <div class="tkp-tipo"><strong>${esc(c.genero_titulo || c.categoria)}</strong><span>${esc(c.subgenero_titulo || c.descricao)}</span></div>
            </div>
            <span class="ticket-picote"></span>
            <footer class="tkp-rodape">${rodape.filter(Boolean).map((l) => (l.startsWith('<span class="tkp-acoes') ? l : `<span>${l}</span>`)).join('')}</footer>
            ${historico ? this.carimbo(c) : ''}
          </article>
          ${clique ? `<button type="button" class="tkp-abrir" data-ver="${c.numero}" aria-label="Abrir o ticket ${esc(c.codigo)}"></button>` : ''}
        </div>
      </li>`;
  },

  /** Ticket grande compacto (o mesmo da tela "rever ticket" do colaborador). */
  grande(c) {
    const esc = this.esc;
    const resolvido = c.status === 'Resolvido';
    const contato = Catalogo.contatos.find((t) => t.id === c.contato?.tipo);
    const dados = [
      ['Fila', esc(c.fila)],
      ['Solicitante', esc(this.quemCompleto(c.solicitante))],
      c.maquina ? ['Máquina', esc(c.maquina)] : null,
      c.contato ? [`Contato · ${contato?.titulo || c.contato.tipo}`, esc(c.contato.valor)] : null,
      ['Aberto em', this.dataHoraBr(c.aberto_em)],
      c.analista ? ['Analista', esc(this.quemCompleto(c.analista))] : null,
      c.assumido_em ? ['Assumido em', this.dataHoraBr(c.assumido_em)] : null,
      resolvido ? ['Resolvido em', this.dataHoraBr(c.resolvido_em)] : null,
    ].filter(Boolean);
    const nivel = Catalogo.nivel(c);
    return `
      <div class="ticket-palco">
        <article class="card ticket tk tk-compacto pri-${nivel.id}">
          <header class="tk-faixa"><span class="tk-marca">Help<b>IA</b> · Ticket de suporte</span>${this.selo(nivel)}</header>
          <div class="tk-cabeca">
            <div class="tk-numero">${esc(c.codigo)}</div>
            <div class="tk-tipo">
              <span class="mini-ico">${Catalogo.icone(c.genero)}</span>
              <div><strong>${esc(c.genero_titulo || c.categoria)}</strong><span>${esc(c.subgenero_titulo || c.descricao)}</span></div>
            </div>
          </div>
          <span class="ticket-picote"></span>
          <dl class="tk-dados">${dados.map(([r, v]) => `<div><dt>${r}</dt><dd>${v}</dd></div>`).join('')}</dl>
          <div class="tk-textos">
            ${c.nota ? `<p class="tk-nota">“${esc(c.nota)}”</p>` : ''}
            ${c.resolucao ? `<div class="meu-resolucao tk-resolucao"><b>Solução do analista:</b> ${esc(c.resolucao)}</div>` : ''}
          </div>
          <div class="codigo-barras"></div>
          ${resolvido ? this.carimbo(c, true) : ''}
        </article>
      </div>`;
  },

  alinharPicotes(raiz = document) {
    raiz.querySelectorAll('.tk').forEach((t) => {
      const picote = t.querySelector('.ticket-picote');
      if (picote) t.style.setProperty('--corte', `${picote.offsetTop + 1}px`);
    });
  },

  _modal: null,
  /** Abre o ticket num modal. acoes: HTML de botões extras (3D) no rodapé do modal. */
  abrir(c, { acoes = '' } = {}) {
    if (!this._modal) {
      this._modal = document.createElement('dialog');
      this._modal.className = 'modal modal-ticket';
      this._modal.addEventListener('click', (e) => {
        if (e.target === this._modal || e.target.closest('[data-fechar-modal]')) this._modal.close();
      });
      document.body.appendChild(this._modal);
    }
    this._modal.innerHTML = `
      <div class="modal-conteudo">
        <header class="modal-topo">
          <h2>${ic('olho')} Ticket ${this.esc(c.codigo)}</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-fechar-modal aria-label="Fechar"><i class="ic ic-x" aria-hidden="true"></i></button>
        </header>
        ${this.grande(c)}
        <div class="modal-acoes">${acoes}<button type="button" class="btn" data-fechar-modal>Fechar</button></div>
      </div>`;
    this._modal.showModal();
    this.alinharPicotes(this._modal);
    return this._modal;
  },

  /** termo: #ID, pessoa, problema ou texto da nota/solução. */
  filtrar(lista, { termo = '', prioridade = '', genero = '', status = '', analista = '', solicitante = '' } = {}) {
    return lista.filter((c) => {
      if (prioridade && Catalogo.nivel(c).id !== prioridade) return false;
      if (genero && c.genero !== genero) return false;
      if (status && c.status !== status) return false;
      if (analista === '__sem__' ? c.analista : analista && c.analista !== analista) return false;
      if (solicitante && c.solicitante !== solicitante) return false;
      return Busca.ticket(c, termo);
    });
  },

  /** Opções de <select> (sem repetir), já escapadas. */
  opcoes(valores, rotuloTodos) {
    const unicos = [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return `<option value="">${rotuloTodos}</option>${unicos.map((v) => `<option value="${this.esc(v)}">${this.esc(v)}</option>`).join('')}`;
  },
};

window.TicketUI = TicketUI;
