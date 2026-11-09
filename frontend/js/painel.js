/* =========================================================
   painel.js — fila de chamados do analista (assumir / resolver)
   ========================================================= */

const elLista = document.getElementById('listaChamados');
const elResumo = document.getElementById('resumo');
const elAnalista = document.getElementById('analista');
const elOffline = document.getElementById('avisoOffline');
const botoesFiltro = document.querySelectorAll('.indicador');

const ICONES = { Hardware: '🖥️', Rede: '🌐', Acesso: '🔑', Software: '🧩', Geral: '🎫' };
let filtroAtual = 'Aguardando';

elAnalista.value = lerPreferencia('helpia-analista', 'Carlos Souza');
elAnalista.addEventListener('change', () => {
  elAnalista.value = elAnalista.value.trim() || 'Analista';
  salvarPreferencia('helpia-analista', elAnalista.value);
});

function acoesDo(chamado) {
  if (chamado.status === 'Aguardando') {
    return `<button class="btn btn-primary btn-sm" data-acao="assumir" data-numero="${chamado.numero}">Assumir →</button>`;
  }
  if (chamado.status === 'Em atendimento') {
    return `<button class="btn btn-success btn-sm" data-acao="resolver" data-numero="${chamado.numero}">✔ Resolver</button>`;
  }
  return '';
}

function renderizar(chamados) {
  const visiveis = filtroAtual ? chamados.filter((c) => c.status === filtroAtual) : chamados;

  elLista.innerHTML = visiveis.length
    ? visiveis.map((c) => `
        <li class="chamado ${c.prioridade === 'Alta' ? 'alta' : ''}">
          <div class="chamado-icone" aria-hidden="true">${ICONES[c.categoria] || '🎫'}</div>
          <div>
            <h3>${c.codigo} – ${escaparHtml(c.descricao)}</h3>
            <div class="chamado-meta">
              <span>${formatarHora(c.aberto_em)}</span>•
              <span>${escaparHtml(c.solicitante)}</span>•
              <span>${escaparHtml(c.fila)}</span>
              <span class="tag tag-${c.prioridade.toLowerCase()}">${escaparHtml(c.prioridade)}</span>
              <span class="tag ${classeStatus(c.status)}">${escaparHtml(c.status)}</span>
              ${c.analista ? `<span>· ${escaparHtml(c.analista)}</span>` : ''}
            </div>
          </div>
          <div class="chamado-acoes">${acoesDo(c)}</div>
        </li>`).join('')
    : '<li class="fila-vazia">Nenhum chamado nesta lista. 🎉</li>';

  // Contadores
  document.querySelectorAll('[data-contador]').forEach((el) => {
    const status = el.dataset.contador;
    el.textContent = status ? chamados.filter((c) => c.status === status).length : chamados.length;
  });

  const aguardando = chamados.filter((c) => c.status === 'Aguardando').length;
  elResumo.textContent = aguardando === 1
    ? '1 chamado aguardando atendimento.'
    : `${aguardando} chamados aguardando atendimento.`;
}

async function carregar() {
  try {
    const { dados } = await API.listar();
    elOffline.hidden = true;
    renderizar(dados);
  } catch {
    mostrarOffline(elOffline);
  }
}

elLista.addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-acao]');
  if (!botao) return;
  botao.disabled = true;

  const numero = botao.dataset.numero;
  try {
    const { ok, dados } = botao.dataset.acao === 'assumir'
      ? await API.assumir(numero, elAnalista.value)
      : await API.resolver(numero);
    if (!ok) elResumo.textContent = dados.erro || 'Não foi possível concluir a ação.';
  } catch {
    mostrarOffline(elOffline);
  }
  carregar();
});

botoesFiltro.forEach((botao) => {
  botao.addEventListener('click', () => {
    botoesFiltro.forEach((b) => b.classList.toggle('ativo', b === botao));
    filtroAtual = botao.dataset.status;
    carregar();
  });
});

carregar();
setInterval(carregar, 4000);
