/* =========================================================
   sessao.js — sessão do usuário logado e proteção das telas
   A sessão fica no sessionStorage (uma por aba: dá para abrir
   o colaborador e o analista lado a lado no mesmo navegador).
   Com "Manter conectado", fica também no localStorage.
   ========================================================= */

const Sessao = {
  CHAVE: 'helpia-sessao',

  ler() {
    for (const area of [sessionStorage, localStorage]) {
      try {
        const bruto = area.getItem(this.CHAVE);
        if (bruto) return JSON.parse(bruto);
      } catch { /* armazenamento indisponível ou valor corrompido */ }
    }
    return null;
  },

  salvar(sessao, lembrar = false) {
    const texto = JSON.stringify(sessao);
    try { sessionStorage.setItem(this.CHAVE, texto); } catch {}
    try {
      if (lembrar) localStorage.setItem(this.CHAVE, texto);
      else localStorage.removeItem(this.CHAVE);
    } catch {}
  },

  limpar() {
    try { sessionStorage.removeItem(this.CHAVE); } catch {}
    try { localStorage.removeItem(this.CHAVE); } catch {}
  },

  token() { return this.ler()?.token || null; },
  usuario() { return this.ler()?.usuario || null; },

  /** Tela inicial de cada perfil depois do login. */
  destino(usuario) {
    return { colaborador: 'chat.html', analista: 'painel.html', gestor: 'controle.html' }[usuario.perfil] || 'login.html';
  },

  /**
   * Protege a página: sem sessão ou com perfil errado, manda para o login
   * (ou para a tela do perfil certo). Retorna o usuário quando pode ficar.
   */
  exigir(perfisPermitidos) {
    const usuario = this.usuario();
    if (!usuario) {
      const volta = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      location.replace(`login.html?volta=${volta}`);
      return null;
    }
    if (!perfisPermitidos.includes(usuario.perfil)) {
      location.replace(this.destino(usuario));
      return null;
    }
    document.documentElement.classList.add(`perfil-${usuario.perfil}`);
    this.validarNoServidor();
    return usuario;
  },

  /** Se o servidor reiniciou ou o token expirou, volta para o login. */
  async validarNoServidor() {
    try {
      const { status } = await API.eu();
      if (status === 401) this.sair('expirou');
    } catch { /* offline: a própria tela mostra o aviso */ }
  },

  sair(motivo = '') {
    this.limpar();
    location.href = motivo ? `login.html?motivo=${motivo}` : 'login.html';
  },

  /** Preenche o menu do usuário no cabeçalho e mostra itens do perfil. */
  montarMenu(usuario) {
    const iniciais = usuario.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    const rotulos = { colaborador: 'Colaborador', analista: 'Analista', gestor: 'Gestor' };
    document.querySelectorAll('[data-usuario-nome]').forEach((el) => { el.textContent = usuario.nome; });
    document.querySelectorAll('[data-usuario-iniciais]').forEach((el) => { el.textContent = iniciais; });
    document.querySelectorAll('[data-usuario-perfil]').forEach((el) => {
      const empresa = usuario.empresa?.nome ? ` · ${usuario.empresa.nome}` : '';
      el.textContent = `${rotulos[usuario.perfil] || usuario.perfil}${empresa}`;
    });
    document.querySelectorAll('[data-somente]').forEach((el) => {
      el.hidden = !el.dataset.somente.split(' ').includes(usuario.perfil);
    });
    document.querySelectorAll('[data-acao="sair"]').forEach((botao) => {
      botao.addEventListener('click', () => this.sair());
    });
    document.querySelectorAll('[data-inicio]').forEach((link) => { link.href = this.destino(usuario); });
    window.Navegacao?.montar(usuario);          // trilho lateral com as abas (js/navegacao.js)
  },
};

window.Sessao = Sessao;
