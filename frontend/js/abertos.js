/* =========================================================
   abertos.js — Tickets em Aberto (tela inteira)
   - Analista: puxa tickets da fila para a mesa e vê o que os
     colegas estão atendendo (pode mandar mensagem a eles).
   - Gestor: acompanha a fila e cobra quem está demorando
     (abre o HelpIA Chat já com a mensagem e o ticket).
   Filtros: #ID/pessoa/problema, prioridade, tipo, situação e analista.
   ========================================================= */

const usuario = Sessao.exigir(['analista', 'gestor']);
const esc = TicketUI.esc;
const DEMORA_MIN = 30;          // a partir daqui o ticket aparece como "demorando"

const elLista = document.getElementById('lista');
const elBusca = document.getElementById('busca');
const elTipo = document.getElementById('filtroTipo');
const elStatus = document.getElementById('filtroStatus');
const elAnalista = document.getElementById('filtroAnalista');
const elOffline = document.getElementById('avisoOffline');
const ehGestor = usuario?.perfil === 'gestor';

let todos = [];
let pessoas = [];             // contatos do chat (para achar o id do analista)
let prioridade = '';
let assinatura = '';

async function carregar(forcar = false) {
  let resposta;
  try {
    resposta = await API.listar();
    elOffline.hidden = true;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  todos = (resposta.dados || []).filter((c) => c.status !== 'Resolvido')
    .sort((a, b) => TicketUI.ORDEM[Catalogo.nivel(a).id] - TicketUI.ORDEM[Catalogo.nivel(b).id] || a.aberto_em.localeCompare(b.aberto_em));
  const nova = JSON.stringify(todos.map((c) => [c.numero, c.status, c.analista]));
  if (!forcar && nova === assinatura) { atualizarTempos(); return; }
  assinatura = nova;
  montarFiltros();
  renderizar();
}

function montarFiltros() {
  const manter = (el, html) => { const v = el.value; el.innerHTML = html; el.value = v; };
  manter(elTipo, `<option value="">Todos os tipos</option>${Catalogo.generos.map((g) => `<option value="${g.id}">${esc(g.titulo)}</option>`).join('')}`);
  manter(elAnalista, `<option value="">Todos os analistas</option><option value="__sem__">Sem analista (na fila)</option>${
    [...new Set(todos.map((c) => c.analista).filter(Boolean))].sort().map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}`);
}

const demorando = (c) => TicketUI.minutosParado(c) >= DEMORA_MIN;
const idDe = (nome) => pessoas.find((p) => p.nome === nome)?.id;

/** Leva para o HelpIA Chat com a conversa, o ticket e um texto já escrito. */
function irParaChat({ com = null, grupo = false, ticket, texto }) {
  const q = new URLSearchParams({ ticket, texto });
  if (grupo) q.set('grupo', '1'); else q.set('com', com);
  location.href = `conversas.html?${q}`;
}

function acoes(c) {
  const botoes = [];
  if (ehGestor) {
    if (c.status === 'Em atendimento' && idDe(c.analista)) {
      botoes.push(`<button type="button" class="btn btn-sm ${demorando(c) ? 'key--red' : ''}" data-cobrar="${c.numero}">${ic('chat')} Cobrar</button>`);
    } else if (c.status === 'Aguardando') {
      botoes.push(`<button type="button" class="btn btn-sm ${demorando(c) ? 'key--red' : ''}" data-avisar="${c.numero}">${ic('sino')} Avisar equipe</button>`);
    }
  } else if (c.status === 'Aguardando') {
    botoes.push(`<button type="button" class="btn btn-sm btn-primary" data-puxar="${c.numero}">Puxar para a mesa →</button>`);
  } else if (c.analista === usuario.nome) {
    botoes.push(`<a class="btn btn-sm" href="painel.html">${ic('pastas')} Na sua mesa</a>`);
  } else if (idDe(c.analista)) {
    botoes.push(`<button type="button" class="btn btn-sm" data-colega="${c.numero}">${ic('chat')} Falar com ${esc(c.analista.split(' ')[0])}</button>`);
  }
  // Qualquer ticket pode ser mencionado no grupo do HelpIA Chat
  botoes.push(`<button type="button" class="btn btn-sm btn-mencionar-grupo" data-mencionar="${c.numero}" title="Mencionar no grupo do HelpIA Chat" aria-label="Mencionar ${esc(c.codigo)} no grupo">#</button>`);
  return `<span class="tkp-acoes">${botoes.join('')}</span>`;
}

function renderizar() {
  const lista = TicketUI.filtrar(todos, {
    termo: elBusca.value, prioridade, genero: elTipo.value, status: elStatus.value, analista: elAnalista.value,
  });
  document.getElementById('contador').textContent = todos.length;
  const atrasados = lista.filter(demorando).length;
  document.getElementById('resumo').innerHTML = `${lista.length} de ${todos.length}${atrasados ? ` · <b class="resumo-alerta">${atrasados} demorando</b>` : ''}`;
  elLista.classList.toggle('vazia', !lista.length);
  elLista.innerHTML = lista.length
    ? lista.map((c, i) => {
      const parado = TicketUI.minutosParado(c);
      const onde = c.status === 'Aguardando' ? 'na fila' : `com ${esc(c.analista)}`;
      return TicketUI.padrao(c, {
        i, classe: demorando(c) ? 'demorando' : '',
        linhas: [
          `${ic('usuario')} <b>${esc(c.solicitante)}</b> · <span class="${demorando(c) ? 'tempo-alerta' : ''}" data-parado="${c.numero}">${parado} min ${onde}</span>`,
          acoes(c),
        ],
      });
    }).join('')
    : `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('festa')}</span>
        <strong>${todos.length ? 'Nada encontrado' : 'Nenhum ticket em aberto'}</strong>
        <span>${todos.length ? 'Tente outra busca ou limpe os filtros.' : 'A fila está zerada. Bom trabalho, time!'}</span></li>`;
}

function atualizarTempos() {
  document.querySelectorAll('[data-parado]').forEach((el) => {
    const c = todos.find((x) => x.numero === Number(el.dataset.parado));
    if (c) el.textContent = `${TicketUI.minutosParado(c)} min ${c.status === 'Aguardando' ? 'na fila' : `com ${c.analista}`}`;
  });
}

[elBusca, elTipo, elStatus, elAnalista].forEach((el) => el.addEventListener('input', renderizar));
document.getElementById('filtroPrioridade').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-prioridade]');
  if (!botao) return;
  prioridade = botao.dataset.prioridade;
  document.querySelectorAll('[data-prioridade]').forEach((b) => b.classList.toggle('ativo', b === botao));
  renderizar();
});

elLista.addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-puxar], [data-cobrar], [data-avisar], [data-colega], [data-mencionar], [data-ver]');
  if (!botao) return;
  const d = botao.dataset;
  const c = todos.find((x) => x.numero === Number(d.puxar || d.cobrar || d.avisar || d.colega || d.mencionar || d.ver));
  if (!c) return;
  const alvo = (s) => botao.matches(s) && botao;
  if (alvo('[data-puxar]')) {
    alvo('[data-puxar]').disabled = true;
    const { ok, dados } = await API.assumir(c.numero, usuario.nome);
    if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível puxar o ticket.'), { icone: ic('alerta'), tipo: 'alerta' }); carregar(true); return; }
    Efeitos.toast(`Ticket <strong>${esc(c.codigo)}</strong> está na sua mesa. <a href="painel.html">Ir para a mesa →</a>`, { icone: ic('pastas'), tipo: 'sucesso' });
    carregar(true);
  } else if (alvo('[data-cobrar]')) {
    irParaChat({ com: idDe(c.analista), ticket: c.numero,
      texto: `Oi ${c.analista.split(' ')[0]}, como está o ${c.codigo}? Ele está há ${TicketUI.minutosParado(c)} min em atendimento.` });
  } else if (alvo('[data-avisar]')) {
    irParaChat({ grupo: true, ticket: c.numero,
      texto: `Time, o ${c.codigo} (${c.genero_titulo}) está há ${TicketUI.minutosParado(c)} min na fila. Alguém pode assumir?` });
  } else if (alvo('[data-mencionar]')) {
    irParaChat({ grupo: true, ticket: c.numero, texto: `${c.codigo} · ${c.genero_titulo}: ` });
  } else if (alvo('[data-colega]')) {
    irParaChat({ com: idDe(c.analista), ticket: c.numero, texto: `Oi ${c.analista.split(' ')[0]}, sobre o ${c.codigo}: ` });
  } else if (alvo('[data-ver]')) {
    TicketUI.abrir(c, {
      acoes: !ehGestor && c.status === 'Aguardando'
        ? `<button type="button" class="btn btn-primary" data-puxar-modal="${c.numero}">Puxar para a mesa →</button>` : '',
    }).querySelector('[data-puxar-modal]')?.addEventListener('click', async (ev) => {
      ev.currentTarget.closest('dialog').close();
      const { ok, dados } = await API.assumir(c.numero, usuario.nome);
      if (!ok) Efeitos.toast(esc(dados.erro || 'Não foi possível puxar o ticket.'), { icone: ic('alerta'), tipo: 'alerta' });
      else Efeitos.toast(`Ticket <strong>${esc(c.codigo)}</strong> está na sua mesa.`, { icone: ic('pastas'), tipo: 'sucesso' });
      carregar(true);
    });
  }
});

if (usuario) {
  Sessao.montarMenu(usuario);
  document.getElementById('subtitulo').textContent = ehGestor
    ? `Tickets há mais de ${DEMORA_MIN} min ficam em vermelho. Use # para mencionar um ticket no grupo do HelpIA Chat.`
    : 'Puxe tickets da fila para a sua mesa ou veja o que os colegas estão atendendo.';
  API.chatContatos().then(({ ok, dados }) => { if (ok) { pessoas = dados; renderizar(); } }).catch(() => {});
  carregar(true);
  setInterval(() => { if (!document.hidden) carregar(); }, 4000);
}
