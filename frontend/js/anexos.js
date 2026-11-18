/* =========================================================
   anexos.js — anexos do HelpIA Chat (documentos, prints,
   imagens, vídeos, áudios…)
   No modo simulação os arquivos ficam no IndexedDB do navegador
   (compartilhado entre as abas, então o analista e o colaborador
   abertos em abas diferentes veem os mesmos anexos). A mensagem
   guarda só { id, nome, tipo, tamanho }. Com o backend, o
   salvar() vira um upload e o url() aponta para o servidor.
   ========================================================= */

const Anexos = {
  LIMITE: 25 * 1024 * 1024,         // 25 MB por arquivo
  MAX_POR_MENSAGEM: 10,
  _banco: null,
  _urls: new Map(),

  _abrir() {
    if (!this._banco) {
      this._banco = new Promise((resolver, rejeitar) => {
        const pedido = indexedDB.open('helpia-anexos', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('arquivos');
        pedido.onsuccess = () => resolver(pedido.result);
        pedido.onerror = () => rejeitar(pedido.error);
      });
    }
    return this._banco;
  },

  async _operar(modo, fn) {
    const banco = await this._abrir();
    return new Promise((resolver, rejeitar) => {
      const transacao = banco.transaction('arquivos', modo);
      const pedido = fn(transacao.objectStore('arquivos'));
      transacao.oncomplete = () => resolver(pedido?.result);
      transacao.onerror = () => rejeitar(transacao.error);
    });
  },

  /** Guarda o arquivo e devolve os dados que vão na mensagem. */
  async salvar(arquivo) {
    if (arquivo.size > this.LIMITE) throw new Error(`“${arquivo.name}” passa de ${this.tamanho(this.LIMITE)}.`);
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await this._operar('readwrite', (loja) => loja.put(arquivo, id));
    const nome = arquivo.name || `print-${new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-')}.png`;
    return { id, nome, tipo: arquivo.type || 'application/octet-stream', tamanho: arquivo.size };
  },

  /** Endereço local (blob:) para mostrar ou baixar o anexo. */
  async url(id) {
    if (this._urls.has(id)) return this._urls.get(id);
    const arquivo = await this._operar('readonly', (loja) => loja.get(id));
    if (!arquivo) return null;
    const url = URL.createObjectURL(arquivo);
    this._urls.set(id, url);
    return url;
  },

  categoria(tipo = '') {
    if (tipo.startsWith('image/')) return 'imagem';
    if (tipo.startsWith('video/')) return 'video';
    if (tipo.startsWith('audio/')) return 'audio';
    if (tipo === 'application/pdf') return 'pdf';
    if (/sheet|excel|csv/.test(tipo)) return 'planilha';
    if (/word|document|text\//.test(tipo)) return 'documento';
    if (/zip|compressed|rar|7z/.test(tipo)) return 'compactado';
    return 'arquivo';
  },

  ICONES: { pdf: 'documento', planilha: 'grafico', documento: 'documento', compactado: 'pacote', arquivo: 'documento', audio: 'fone', video: 'play', imagem: 'olho' },

  tamanho(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  },

  /** HTML de um anexo dentro do balão da mensagem (o src é preenchido depois por hidratar()). */
  html(a) {
    const esc = (t) => escaparHtml(String(t ?? ''));
    const tipo = this.categoria(a.tipo);
    if (tipo === 'imagem') {
      return `<button type="button" class="anexo-img" data-anexo-ver="${esc(a.id)}" aria-label="Ver a imagem ${esc(a.nome)}">
        <img data-anexo-src="${esc(a.id)}" alt="${esc(a.nome)}" /></button>`;
    }
    if (tipo === 'video') return `<video class="anexo-video" controls preload="metadata" data-anexo-src="${esc(a.id)}" aria-label="${esc(a.nome)}"></video>`;
    if (tipo === 'audio') return `<audio class="anexo-audio" controls preload="metadata" data-anexo-src="${esc(a.id)}" aria-label="${esc(a.nome)}"></audio>`;
    return `<a class="anexo-arquivo tipo-${tipo}" data-anexo-baixar="${esc(a.id)}" download="${esc(a.nome)}" href="#">
      <span class="anexo-ico">${ic(this.ICONES[tipo])}</span>
      <span class="anexo-info"><b>${esc(a.nome)}</b><small>${tipo === 'pdf' ? 'PDF' : tipo[0].toUpperCase() + tipo.slice(1)} · ${this.tamanho(a.tamanho)}</small></span>
      <span class="anexo-baixar" aria-hidden="true">${ic('seta-baixo')}</span></a>`;
  },

  /** Troca os data-anexo-* pelos endereços reais. */
  async hidratar(raiz) {
    for (const el of raiz.querySelectorAll('[data-anexo-src]:not([src])')) {
      const url = await this.url(el.dataset.anexoSrc);
      if (url) el.src = url; else el.replaceWith(Object.assign(document.createElement('span'), { className: 'anexo-sumiu', textContent: 'Anexo indisponível neste navegador' }));
    }
    for (const el of raiz.querySelectorAll('[data-anexo-baixar][href="#"]')) {
      const url = await this.url(el.dataset.anexoBaixar);
      if (url) el.href = url; else el.classList.add('indisponivel');
    }
  },
};

window.Anexos = Anexos;
