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
    const rotulos = { colaborador: 'Colaborador', analista: 'Analista', gestor: 'Gestor' };
    document.querySelectorAll('[data-usuario-nome]').forEach((el) => { el.textContent = usuario.nome; });
    document.querySelectorAll('[data-usuario-iniciais]').forEach((el) => {
      el.classList.add('avatar', `perfil-${usuario.perfil}`);
      el.innerHTML = Avatar.conteudo(usuario);
    });
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
    window.Conta?.montar(usuario);            // cartão do usuário vira menu (configurações, simulação, sair)
    document.querySelectorAll('[data-inicio]').forEach((link) => { link.href = this.destino(usuario); });
    window.Navegacao?.montar(usuario);          // trilho lateral com as abas (js/navegacao.js)
  },
};

window.Sessao = Sessao;

/* ---------- Avatar das pessoas ----------
   Com foto (campo "foto" da conta): mostra a foto.
   Sem foto (ou se a foto não carregar): ícone colorido do cargo —
   colaborador = bonequinho · analista = ferramenta · gestor = coroa.
   A cor de fundo vem da classe perfil-<cargo> do contêiner (base.css). */
const Avatar = {
  ICONES: { colaborador: 'usuario', analista: 'ferramenta', gestor: 'coroa' },

  conteudo(pessoa) {
    const icone = `<i class="ic ic-${this.ICONES[pessoa?.perfil] || 'usuario'} av-ico" aria-hidden="true"></i>`;
    const foto = String(pessoa?.foto || '');
    if (!/^https:\/\//.test(foto)) return icone;
    const src = foto.replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
    return `${icone}<img class="av-foto" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />`;
  },

  /** Avatar completo: <span class="avatar perfil-x classe">…</span> */
  html(pessoa, classe = '') {
    return `<span class="avatar perfil-${pessoa?.perfil || 'colaborador'} ${classe}" aria-hidden="true">${this.conteudo(pessoa)}</span>`;
  },
};

window.Avatar = Avatar;
