/* =========================================================
   navegacao.js — trilho lateral com as abas do HelpIA
   Fica no canto esquerdo (de cima a baixo) e muda conforme
   o perfil. Passando o mouse, ele abre e mostra os nomes.
   Montado por Sessao.montarMenu() em todas as telas logadas.
   ========================================================= */

const Navegacao = {
  ITENS: {
    colaborador: [
      { href: 'chat.html', ic: 'pastas', rotulo: 'Minha Mesa', desc: 'Abrir chamados' },
      { href: 'conversas.html', ic: 'chat', rotulo: 'HelpIA Chat', desc: 'Mensagens dos analistas', chat: true },
      { href: 'historico.html', ic: 'arquivo', rotulo: 'Histórico de Tickets', desc: 'Tickets já finalizados' },
    ],
    analista: [
      { href: 'painel.html', ic: 'pastas', rotulo: 'Minha Mesa', desc: 'Bandeja e tickets em atendimento' },
      { href: 'metas.html', ic: 'alvo', rotulo: 'Metas', desc: 'Metas definidas pelo gestor' },
      { href: 'conversas.html', ic: 'chat', rotulo: 'HelpIA Chat', desc: 'Grupo da equipe e colaboradores', chat: true },
      { href: 'tickets.html', ic: 'entrada', rotulo: 'Tickets em Aberto', desc: 'Todos os tickets pendentes' },
      { href: 'historico.html', ic: 'arquivo', rotulo: 'Histórico de Tickets', desc: 'Tickets que você atendeu' },
    ],
    gestor: [
      { href: 'controle.html', ic: 'grafico', rotulo: 'Painel de Controle', desc: 'Andamento, atendimentos e regra do dia' },
      { href: 'criar-conta.html', ic: 'cracha', rotulo: 'Usuários', desc: 'Crachás de analistas, colaboradores e gestores' },
      { href: 'metas.html', ic: 'alvo', rotulo: 'Metas', desc: 'Metas que aparecem para os analistas' },
      { href: 'conversas.html', ic: 'chat', rotulo: 'HelpIA Chat', desc: 'Conversar com a equipe', chat: true },
      { href: 'tickets.html', ic: 'entrada', rotulo: 'Tickets em Aberto', desc: 'Conferir e mencionar no grupo' },
    ],
  },

  montar(usuario) {
    if (document.querySelector('.trilho')) return;
    const itens = this.ITENS[usuario.perfil] || [];
    if (!itens.length) return;
    const atual = location.pathname.split('/').pop() || 'index.html';
    const nav = document.createElement('nav');
    nav.className = 'trilho';
    nav.setAttribute('aria-label', 'Navegação do HelpIA');
    nav.innerHTML = `
      <a href="${Sessao.destino(usuario)}" class="trilho-marca" title="HelpIA — início"><img src="assets/logo.svg" alt="" /><span class="trilho-rotulo">Help<b>IA</b></span></a>
      <ul>
        ${itens.map((i) => {
          const ativo = i.href === atual;
          return `<li><a href="${i.href}" class="trilho-item ${ativo ? 'ativo' : ''}" ${ativo ? 'aria-current="page"' : ''} title="${i.rotulo}">
            <span class="trilho-ico"><i class="ic ic-${i.ic}" aria-hidden="true"></i>${i.chat ? '<span class="trilho-badge" data-badge-chat hidden></span>' : ''}</span>
            <span class="trilho-rotulo"><strong>${i.rotulo}</strong><small>${i.desc}</small></span>
          </a></li>`;
        }).join('')}
      </ul>`;
    document.body.prepend(nav);
    document.body.classList.add('com-trilho');
    if (itens.some((i) => i.chat)) {
      this.atualizarChat();
      setInterval(() => { if (!document.hidden) this.atualizarChat(); }, 5000);
    }
  },

  /** Bolinha com o número de mensagens não lidas no item "HelpIA Chat". */
  async atualizarChat() {
    let total = 0;
    try {
      const { ok, dados } = await API.chatNaoLidas();
      if (ok) total = dados.total || 0;
    } catch { return; }
    document.querySelectorAll('[data-badge-chat]').forEach((el) => {
      el.hidden = !total;
      el.textContent = total > 9 ? '9+' : String(total);
    });
  },
};

window.Navegacao = Navegacao;
