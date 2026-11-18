/** Cliente da API — usa variável de build CONFIG.API_BASE_URL ou fallback para /api */

const CONFIG = (() => {
  if (typeof __API_BASE_URL__ !== 'undefined') return { API_BASE_URL: __API_BASE_URL__ };
  // Front aberto por outro servidor local (ex.: Live Server na porta 5500):
  // usa a API do Flask local em vez de procurar /api no próprio Live Server.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && location.port !== '5000') return { API_BASE_URL: 'http://localhost:5000/api' };
  return { API_BASE_URL: '/api' };
})();

const API = {
  async requisitar(caminho, opcoes = {}) {
    // Modo de desenvolvimento sem backend: ver js/simulador.js
    if (window.Simulador?.ativo) {
      const corpo = opcoes.body ? JSON.parse(opcoes.body) : null;
      return Simulador.responder(opcoes.method || 'GET', caminho, corpo, window.Sessao?.token());
    }

    const url = `${CONFIG.API_BASE_URL}${caminho}`;
    const cabecalhos = { 'Content-Type': 'application/json' };
    const token = window.Sessao?.token();
    if (token) cabecalhos.Authorization = `Bearer ${token}`;

    const resposta = await fetch(url, { ...opcoes, headers: cabecalhos });
    const dados = await resposta.json().catch(() => ({}));
    // 404/405 sem JSON = a rota não existe nesse servidor (backend antigo ou ausente)
    if (!resposta.ok && !dados.erro && [404, 405].includes(resposta.status)) {
      dados.erro = `O servidor em ${CONFIG.API_BASE_URL} não tem esta função (HTTP ${resposta.status}). `
        + 'Verifique se o backend atualizado está rodando.';
    }
    return { ok: resposta.ok, status: resposta.status, dados };
  },

  enviar(caminho, corpo) {
    return this.requisitar(caminho, { method: 'POST', body: JSON.stringify(corpo || {}) });
  },

  // ---------- Contas e acesso ----------
  login(email, senha, perfil) { return this.enviar('/auth/login', { email, senha, perfil }); },
  eu() { return this.requisitar('/auth/eu'); },
  planos() { return this.requisitar('/planos'); },
  contratar(dados) { return this.enviar('/empresas', dados); },
  listarContas() { return this.requisitar('/contas'); },
  criarConta(dados) { return this.enviar('/contas', dados); },
  atualizarConta(id, dados) {
    return this.requisitar(`/contas/${id}`, { method: 'PATCH', body: JSON.stringify(dados) });
  },
  redefinirSenha(id, senha) { return this.enviar(`/contas/${id}/senha`, { senha }); },

  // ---------- Chamados ----------
  listar(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.status) params.set('status', filtros.status);
    if (filtros.solicitante) params.set('solicitante', filtros.solicitante);
    return this.requisitar(`/chamados?${params.toString()}`);
  },

  /** dados: { genero, subgenero, impacto, maquina, nota, contato: { tipo, valor } } */
  abrir(dados) { return this.enviar('/chamados', dados); },
  assumir(numero, analista) { return this.enviar(`/chamados/${numero}/assumir`, { analista }); },
  resolver(numero, nota) { return this.enviar(`/chamados/${numero}/resolver`, { nota }); },
  /** Só tickets "Aguardando" do próprio colaborador. */
  excluir(numero) { return this.requisitar(`/chamados/${numero}`, { method: 'DELETE' }); },
  /** Tira um ticket resolvido da coluna "Histórico" da mesa do colaborador (continua na tela Histórico de Tickets). */
  removerDoHistorico(numero) { return this.enviar(`/chamados/${numero}/ocultar`); },

  // ---------- HelpIA Chat ----------
  chatConversas() { return this.requisitar('/chat/conversas'); },
  chatNaoLidas() { return this.requisitar('/chat/nao-lidas'); },
  chatContatos() { return this.requisitar('/chat/contatos'); },
  /** Abre (ou reaproveita) a conversa direta com a pessoa; ticket = contexto opcional. */
  chatAbrir(com, ticket = null) { return this.enviar('/chat/conversas', { com, ticket }); },
  chatMensagens(id) { return this.requisitar(`/chat/conversas/${id}/mensagens`); },
  /** anexos: [{ id, nome, tipo, tamanho }] — os arquivos são guardados antes por Anexos.salvar() */
  /** resposta = id da mensagem respondida (opcional) */
  chatEnviar(id, texto, ticket = null, anexos = [], resposta = null) { return this.enviar(`/chat/conversas/${id}/mensagens`, { texto, ticket, anexos, resposta }); },
  /** Comando /clear (só o gestor): apaga as mensagens da conversa. */
  chatLimpar(id) { return this.requisitar(`/chat/conversas/${id}/mensagens`, { method: 'DELETE' }); },
  chatLida(id) { return this.enviar(`/chat/conversas/${id}/lida`); },

  // ---------- Minha conta e modo simulação (gestor) ----------
  trocarSenha(atual, nova) { return this.enviar('/auth/senha', { atual, nova }); },
  simulacao() { return this.requisitar('/simulacao'); },
  definirSimulacao(ativo) { return this.enviar('/simulacao', { ativo }); },
  limparDados() { return this.enviar('/simulacao/limpar'); },

  // ---------- Metas (definidas pelo gestor) ----------
  metas() { return this.requisitar('/metas'); },
  salvarMetas(dados) { return this.requisitar('/metas', { method: 'PATCH', body: JSON.stringify(dados) }); },
  adicionarMotivacional(texto) { return this.enviar('/metas/motivacionais', { texto }); },
  removerMotivacional(id) { return this.requisitar(`/metas/motivacionais/${id}`, { method: 'DELETE' }); },

  // ---------- Utilitários de tela ----------
  escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  },

  formatarHora(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  /** Classe da etiqueta de status (ver .tag-* em base.css). */
  classeStatus(status) {
    return {
      'Aguardando': 'tag-aguardando',
      'Em atendimento': 'tag-em-atendimento',
      'Resolvido': 'tag-resolvido',
    }[status] || 'tag-neutra';
  },

  lerPreferencia(chave, padrao = '') {
    try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
  },

  salvarPreferencia(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch {}
  },

  mostrarOffline(container) {
    container.hidden = false;
    container.textContent = 'Sem conexão com o servidor. Verifique sua internet ou tente mais tarde.';
  },
};

// Exporta utilitários como globais para compatibilidade com chat.js / painel.js
window.escaparHtml = API.escaparHtml;
window.formatarHora = API.formatarHora;
window.classeStatus = API.classeStatus;
window.lerPreferencia = API.lerPreferencia;
window.salvarPreferencia = API.salvarPreferencia;
window.mostrarOffline = API.mostrarOffline;

window.API = API;
