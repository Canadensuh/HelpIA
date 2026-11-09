/* =========================================================
   api.js — comunicação com o backend Flask e funções utilitárias
   ========================================================= */

const API = {
  async requisitar(caminho, opcoes = {}) {
    const resposta = await fetch(`/api${caminho}`, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, status: resposta.status, dados };
  },

  listar(filtros = {}) {
    const params = new URLSearchParams(
      Object.entries(filtros).filter(([, valor]) => valor)
    );
    return this.requisitar(`/chamados?${params}`);
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
    return this.requisitar(`/chamados/${numero}/resolver`, { method: 'POST' });
  },
};

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function formatarHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function classeStatus(status) {
  return 'tag-' + status.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
}

function lerPreferencia(chave, padrao) {
  try { return localStorage.getItem(chave) || padrao; } catch { return padrao; }
}

function salvarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* armazenamento indisponível */ }
}

function mostrarOffline(elemento) {
  elemento.hidden = false;
  elemento.textContent =
    'Não foi possível falar com o servidor. Inicie o backend com "python -m backend.app" ' +
    'e acesse http://localhost:5000.';
}
