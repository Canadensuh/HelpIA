/** Cliente da API — usa variável de build CONFIG.API_BASE_URL ou fallback para /api */

const CONFIG = (() => {
  return {
    API_BASE_URL: (typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : '/api')
  };
})();

const API = {
  async requisitar(caminho, opcoes = {}) {
    const url = `${CONFIG.API_BASE_URL}${caminho}`;
    const resposta = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, status: resposta.status, dados };
  },

  listar(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.status) params.set('status', filtros.status);
    if (filtros.solicitante) params.set('solicitante', filtros.solicitante);
    return this.requisitar(`/chamados?${params.toString()}`);
  },

  abrir(descricao, solicitante) {
    return this.requisitar('/chamados', {
      method: 'POST',
      body: JSON.stringify({ descricao, solicitante }),
    });
  },

  assumir(numero, analista) {
    return this.requisitar(`/chamados/${numero}/assumir`, {
      method: 'POST',
      body: JSON.stringify({ analista }),
    });
  },

  resolver(numero) {
    return this.requisitar(`/chamados/${numero}/resolver`, {
      method: 'POST',
    });
  },

  escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  },

  formatarHora(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  classeStatus(status) {
    return {
      aberto: 'status-aberto',
      em_andamento: 'status-andamento',
      resolvido: 'status-resolvido',
    }[status] || '';
  },

  lerPreferencia(chave, padrao = '') {
    try { return localStorage.getItem(chave) ?? padrao; } catch { return padrao; }
  },

  salvarPreferencia(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch {}
  },

  mostrarOffline(container) {
    container.innerHTML = `
      <div class=\"offline-banner\">
        <svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\"><path fill=\"currentColor\" d=\"M13.5 2.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm-6 12h12v2h-12v-2zm0-4h12v2h-12v-2zm0-4h12v2h-12v-2z\"/></svg>
        <span>Sem conexão com o servidor. Verifique sua internet ou tente mais tarde.</span>
      </div>
    `;
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