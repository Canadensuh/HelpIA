/* =========================================================
   conta.js — o cartão do usuário (canto superior direito)
   Clicando no cartão abre um menu com:
   - Configurações da conta (dados da conta e troca de senha);
   - só para o gestor: Modo simulação (joga chamados fictícios na
     empresa) e Limpar dados (apaga os tickets e as conversas);
   - Sair.
   Montado por Sessao.montarMenu() em todas as telas logadas.
   ========================================================= */

const Conta = {
  ROTULOS: { colaborador: 'Colaborador', analista: 'Analista', gestor: 'Gestor' },
  esc: (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  ic: (nome) => (Conta.SVG[nome] || `<i class="ic ic-${nome}" aria-hidden="true"></i>`),
  SVG: {
    engrenagem: '<svg class="conta-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sair: '<svg class="conta-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  },

  montar(usuario) {
    const cartao = document.querySelector('.usuario-menu');
    if (!cartao || cartao.dataset.conta) return;
    cartao.dataset.conta = '1';
    this.usuario = usuario;
    this.ehGestor = usuario.perfil === 'gestor';

    // O cartão inteiro vira o botão do menu (o "Sair" passa para dentro do menu)
    cartao.querySelector('[data-acao="sair"]')?.remove();
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'conta-botao';
    botao.setAttribute('aria-haspopup', 'menu');
    botao.setAttribute('aria-expanded', 'false');
    botao.setAttribute('aria-label', `Conta de ${usuario.nome}: configurações e sair`);
    [...cartao.childNodes].forEach((n) => botao.appendChild(n));
    botao.insertAdjacentHTML('beforeend', '<span class="conta-seta" aria-hidden="true"></span>');
    cartao.appendChild(botao);

    const menu = document.createElement('div');
    menu.className = 'conta-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.innerHTML = this.htmlMenu();
    cartao.appendChild(menu);
    this.cartao = cartao; this.botao = botao; this.menu = menu;

    botao.addEventListener('click', (e) => { e.stopPropagation(); this.abrirMenu(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !cartao.contains(e.target)) this.abrirMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { this.abrirMenu(false); botao.focus(); } });
    menu.addEventListener('click', (e) => this.aoClicar(e));
    menu.addEventListener('change', (e) => { if (e.target.matches('[data-simulacao]')) this.alternarSimulacao(e.target); });
  },

  htmlMenu() {
    const u = this.usuario;
    // O crachá da pessoa (o mesmo da tela de Usuários do gestor, css/cracha.css)
    return `
      <div class="conta-cracha" aria-hidden="true">
        <div class="cracha-item">
          <span class="cordao"></span>
          <div class="cracha p-${u.perfil}">
            <span class="cracha-faixa"></span>
            <span class="cracha-foto">${Avatar.conteudo(u)}</span>
            <span class="cracha-nome">${this.esc(u.nome)}</span>
            <span class="cracha-cargo">${this.ROTULOS[u.perfil] || ''}</span>
            <span class="cracha-email">${this.esc(u.email || '')}</span>
            <span class="cracha-id">ID ${String(u.id ?? 0).padStart(4, '0')} · ${this.esc(u.empresa?.nome || 'HelpIA')}</span>
            <span class="codigo-barras"></span>
          </div>
        </div>
      </div>
      <span class="sr-only">${this.esc(u.nome)}, ${this.ROTULOS[u.perfil] || ''}</span>
      <div class="conta-acoes">
        <button type="button" class="btn btn-sm" role="menuitem" data-conta="config">${this.ic('engrenagem')} Configurações</button>
        <button type="button" class="btn btn-sm key--rosa" role="menuitem" data-conta="sair">${this.ic('sair')} Sair</button>
      </div>
      ${this.ehGestor ? `
      <div class="conta-grupo" role="group" aria-label="Demonstração">
        <span class="conta-grupo-titulo">Demonstração</span>
        <label class="conta-item conta-chave">
          ${this.ic('play')}
          <span>Modo simulação<small>Coloca chamados fictícios na fila, na mesa e no histórico</small></span>
          <input type="checkbox" role="switch" data-simulacao />
          <span class="chave" aria-hidden="true"></span>
        </label>
        <button type="button" class="conta-item conta-perigo" role="menuitem" data-conta="limpar">${this.ic('x')}<span>Limpar dados<small>Apaga todos os tickets e as conversas da empresa</small></span></button>
      </div>` : ''}`;
  },

  async abrirMenu(abrir) {
    this.menu.hidden = !abrir;
    this.botao.setAttribute('aria-expanded', String(abrir));
    this.cartao.classList.toggle('aberto', abrir);
    if (abrir && this.ehGestor) {
      const chave = this.menu.querySelector('[data-simulacao]');
      try {
        const { ok, dados } = await API.simulacao();
        if (ok) chave.checked = dados.ativo;
        chave.disabled = !ok;
      } catch { chave.disabled = true; }
    }
  },

  aoClicar(e) {
    const item = e.target.closest('[data-conta]');
    if (!item) return;
    const acao = item.dataset.conta;
    if (acao === 'sair') { Sessao.sair(); return; }
    this.abrirMenu(false);
    if (acao === 'config') this.abrirConfiguracoes();
    if (acao === 'limpar') this.confirmar({
      titulo: 'Limpar todos os dados?',
      texto: 'Todos os tickets (na fila, em atendimento e no histórico) e as mensagens do HelpIA Chat da empresa serão apagados. As contas e as metas continuam. Essa ação não pode ser desfeita.',
      botao: 'Limpar dados',
      fn: async () => {
        const { ok, dados } = await API.limparDados();
        if (!ok) throw new Error(dados.erro || 'Não foi possível limpar os dados.');
        this.recarregar('Dados limpos.');
      },
    });
  },

  async alternarSimulacao(chave) {
    const ativo = chave.checked;
    chave.disabled = true;
    try {
      const { ok, dados } = await API.definirSimulacao(ativo);
      if (!ok) throw new Error(dados.erro);
      this.recarregar(ativo ? 'Modo simulação ligado: chamados fictícios na fila.' : 'Modo simulação desligado: os chamados fictícios saíram.');
    } catch (erro) {
      chave.checked = !ativo;
      chave.disabled = false;
      this.aviso(erro.message || 'Não foi possível mudar o modo simulação.');
    }
  },

  /** Recarrega a tela para tudo refletir os dados novos (e avisa depois de recarregar). */
  recarregar(mensagem) {
    try { sessionStorage.setItem('helpia-aviso-conta', mensagem); } catch {}
    location.reload();
  },
  mostrarAvisoPendente() {
    let msg = null;
    try { msg = sessionStorage.getItem('helpia-aviso-conta'); sessionStorage.removeItem('helpia-aviso-conta'); } catch {}
    if (msg) setTimeout(() => this.aviso(msg, 'sucesso'), 400);
  },
  aviso(texto, tipo = 'alerta') {
    if (window.Efeitos?.toast) Efeitos.toast(this.esc(texto), { icone: this.ic(tipo === 'sucesso' ? 'check' : 'alerta'), tipo });
    else alert(texto);
  },

  // ---------- Janelas ----------
  dialogo(html, classe = '') {
    const d = document.createElement('dialog');
    d.className = `modal modal-conta ${classe}`;
    d.innerHTML = html;
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fechar-conta]')) d.close(); });
    d.addEventListener('close', () => d.remove());
    document.body.appendChild(d);
    d.showModal();
    return d;
  },

  confirmar({ titulo, texto, botao, fn }) {
    const d = this.dialogo(`
      <div class="modal-conteudo">
        <header class="modal-topo"><h2>${this.esc(titulo)}</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-fechar-conta aria-label="Fechar">${this.ic('x')}</button></header>
        <p class="conta-texto">${this.esc(texto)}</p>
        <p class="aviso aviso-erro" data-erro hidden></p>
        <div class="modal-acoes">
          <button type="button" class="btn btn-ghost" data-fechar-conta>Cancelar</button>
          <button type="button" class="btn key--red" data-ok>${this.ic('x')} ${this.esc(botao)}</button>
        </div>
      </div>`);
    d.querySelector('[data-ok]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await fn(); } catch (erro) {
        const el = d.querySelector('[data-erro]');
        el.textContent = erro.message; el.hidden = false; e.currentTarget.disabled = false;
      }
    });
  },

  abrirConfiguracoes() {
    const u = this.usuario;
    const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${this.esc(valor || '—')}</dd></div>`;
    const d = this.dialogo(`
      <div class="modal-conteudo">
        <header class="modal-topo"><h2>${this.ic('engrenagem')} Configurações da conta</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-fechar-conta aria-label="Fechar">${this.ic('x')}</button></header>
        <div class="conta-perfil">
          ${Avatar.html(u, 'conta-avatar')}
          <div><strong>${this.esc(u.nome)}</strong><span>${this.ROTULOS[u.perfil] || ''}</span></div>
        </div>
        <dl class="conta-dados">
          ${linha('E-mail', u.email)}
          ${linha('Cargo', this.ROTULOS[u.perfil])}
          ${linha('Empresa', u.empresa?.nome)}
          ${linha('Plano', u.empresa?.plano_nome)}
        </dl>
        <p class="conta-nota">Nome, e-mail e cargo são definidos pelo gestor da empresa, na tela de Usuários.</p>
        <form class="conta-senha" data-senha novalidate>
          <strong>${this.ic('chave')} Trocar a senha</strong>
          <label class="campo">Senha atual<input class="input" type="password" name="atual" autocomplete="current-password" required /></label>
          <div class="conta-senha-linha">
            <label class="campo">Nova senha<input class="input" type="password" name="nova" minlength="6" autocomplete="new-password" required /></label>
            <label class="campo">Confirmar<input class="input" type="password" name="nova2" autocomplete="new-password" required /></label>
          </div>
          <p class="aviso" data-aviso hidden></p>
          <div class="modal-acoes">
            <button type="button" class="btn btn-ghost" data-fechar-conta>Fechar</button>
            <button type="submit" class="btn btn-primary">${this.ic('check')} Salvar nova senha</button>
          </div>
        </form>
      </div>`);
    const form = d.querySelector('[data-senha]');
    const aviso = d.querySelector('[data-aviso]');
    const mostrar = (texto, ok = false) => { aviso.textContent = texto; aviso.className = `aviso ${ok ? 'aviso-sucesso' : 'aviso-erro'}`; aviso.hidden = false; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { atual, nova, nova2 } = Object.fromEntries(new FormData(form));
      if (!atual || !nova) return mostrar('Preencha a senha atual e a nova senha.');
      if (nova.length < 6) return mostrar('A nova senha deve ter pelo menos 6 caracteres.');
      if (nova !== nova2) return mostrar('As senhas novas não conferem.');
      try {
        const { ok, dados } = await API.trocarSenha(atual, nova);
        if (!ok) return mostrar(dados.erro || 'Não foi possível trocar a senha.');
        form.reset();
        mostrar('Senha trocada. Use a nova senha no próximo login.', true);
      } catch { mostrar('Sem conexão com o servidor.'); }
    });
  },
};

window.Conta = Conta;
document.addEventListener('DOMContentLoaded', () => Conta.mostrarAvisoPendente());
