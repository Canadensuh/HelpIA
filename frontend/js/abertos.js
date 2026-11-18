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
    [...new Set(todos.map((c) => c.analista).filter(Boolean))].sort().map((n) => `<option value="${esc(n)}">${esc(n)}${n === usuario.nome ? " (Você)" : ""}</option>`).join('')}`);
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
    // Cobrar: o gestor escolhe o grupo ou um analista; Gerenciar: prioridade, passar para um analista, excluir
    botoes.push(`<button type="button" class="btn btn-sm ${demorando(c) ? 'key--red' : ''}" data-cobrar="${c.numero}">${ic('chat')} Cobrar</button>`);
    botoes.push(`<button type="button" class="btn btn-sm" data-gerenciar="${c.numero}" title="Prioridade, passar para um analista ou excluir">${ic('ferramenta')} Gerenciar</button>`);
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
      const onde = c.status === "Aguardando" ? "na fila" : `com ${esc(TicketUI.quem(c.analista))}`;
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
    if (c) el.textContent = `${TicketUI.minutosParado(c)} min ${c.status === "Aguardando" ? "na fila" : `com ${TicketUI.quem(c.analista)}`}`;
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

// ---------- Gestor: janelas de Cobrar e Gerenciar ----------
function janela(titulo, corpo) {
  const d = document.createElement('dialog');
  d.className = 'modal modal-gestao';
  d.innerHTML = `<div class="modal-conteudo">
    <header class="modal-topo"><h2>${titulo}</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-fechar-janela aria-label="Fechar">${ic('x')}</button></header>
    ${corpo}</div>`;
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fechar-janela]')) d.close(); });
  d.addEventListener('close', () => d.remove());
  document.body.appendChild(d);
  d.showModal();
  return d;
}
const analistasDaEquipe = () => pessoas.filter((p) => p.perfil === 'analista' && p.ativo !== false);

/** Cobrar: escolhe o grupo da equipe ou um analista; o chat abre com o ticket e o @ certo. */
function abrirCobrar(c) {
  const parado = TicketUI.minutosParado(c);
  const situacao = c.status === 'Aguardando' ? `está há ${parado} min na fila sem analista` : `está há ${parado} min em atendimento`;
  const d = janela(`${ic('chat')} Cobrar o ${esc(c.codigo)}`, `
    <ul class="lista-tickets">${TicketUI.padrao(c, { clique: false })}</ul>
    <p class="gestao-dica">Para quem vai a cobrança? O HelpIA Chat abre com o ticket anexado e a mensagem já escrita.</p>
    <div class="gestao-opcoes">
      <button type="button" class="gestao-opcao" data-para="grupo">
        <span class="conv-avatar conv-grupo">${ic('equipe')}</span>
        <span><b>Grupo da equipe</b><small>Todos os analistas e gestores veem</small></span></button>
      ${analistasDaEquipe().map((p) => `<button type="button" class="gestao-opcao ${p.nome === c.analista ? 'destaque' : ''}" data-para="${p.id}">
        ${Avatar.html(p, 'conv-avatar')}<span><b>${esc(p.nome)}</b><small>${p.nome === c.analista ? 'Está com o ticket' : 'Analista'}</small></span></button>`).join('')}
    </div>`);
  d.querySelectorAll('[data-para]').forEach((b) => b.addEventListener('click', () => {
    const para = b.dataset.para;
    const nome = para === 'grupo' ? c.analista : pessoas.find((p) => p.id === Number(para))?.nome;
    const mencao = nome ? `@${nome}, ` : 'Time, ';
    const texto = `${mencao}o ${c.codigo} (${c.genero_titulo}) ${situacao}. ${c.status === 'Aguardando' ? 'Alguém pode assumir?' : 'Como está?'}`;
    irParaChat(para === 'grupo' ? { grupo: true, ticket: c.numero, texto } : { com: Number(para), ticket: c.numero, texto });
  }));
}

/** Gerenciar: trocar a prioridade, passar para a mesa de um analista ou excluir. */
function abrirGerenciar(c) {
  const nivel = Catalogo.nivel(c).id;
  const NIVEIS = [['baixa', 'Baixa'], ['normal', 'Normal'], ['media', 'Média'], ['alta', 'Alta']];
  const d = janela(`${ic('ferramenta')} Gerenciar o ${esc(c.codigo)}`, `
    <ul class="lista-tickets">${TicketUI.padrao(c, { clique: false })}</ul>
    <section class="gestao-bloco"><strong>Prioridade</strong>
      <div class="gestao-niveis">${NIVEIS.map(([id, rotulo]) => `<button type="button" class="btn btn-sm nivel-${id} ${id === nivel ? 'ativo' : ''}" data-nivel="${id}">${rotulo}</button>`).join('')}</div></section>
    <section class="gestao-bloco"><strong>Passar para a mesa de um analista</strong>
      <div class="gestao-linha"><select class="input" data-analista>${analistasDaEquipe().map((p) => `<option value="${p.id}" ${p.nome === c.analista ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary" data-atribuir>${ic('pastas')} Passar</button></div></section>
    <section class="gestao-bloco gestao-perigo"><strong>Excluir o ticket</strong>
      <p class="gestao-dica">O ticket sai da fila e da mesa e não pode ser recuperado.</p>
      <button type="button" class="btn key--red" data-excluir-ticket>${ic('x')} Excluir ${esc(c.codigo)}</button></section>
    <p class="aviso aviso-erro" data-erro hidden></p>`);
  const erro = (texto) => { const el = d.querySelector('[data-erro]'); el.textContent = texto; el.hidden = false; };
  const feito = (texto) => { d.close(); Efeitos.toast(texto, { icone: ic('check'), tipo: 'sucesso' }); carregar(true); };
  d.querySelectorAll('[data-nivel]').forEach((b) => b.addEventListener('click', async () => {
    const { ok, dados } = await API.mudarPrioridade(c.numero, b.dataset.nivel);
    if (!ok) return erro(dados.erro || 'Não foi possível trocar a prioridade.');
    feito(`Prioridade do <strong>${esc(c.codigo)}</strong> agora é <strong>${b.textContent}</strong>.`);
  }));
  d.querySelector('[data-atribuir]').addEventListener('click', async () => {
    const id = Number(d.querySelector('[data-analista]').value);
    if (!id) return erro('Nenhum analista ativo na equipe.');
    const { ok, dados } = await API.atribuir(c.numero, id);
    if (!ok) return erro(dados.erro || 'Não foi possível passar o ticket.');
    feito(`<strong>${esc(c.codigo)}</strong> foi para a mesa de <strong>${esc(dados.analista)}</strong>.`);
  });
  const botaoExcluir = d.querySelector('[data-excluir-ticket]');
  botaoExcluir.addEventListener('click', async () => {
    if (!botaoExcluir.classList.contains('confirmar')) {           // primeiro clique pede confirmação
      botaoExcluir.classList.add('confirmar');
      botaoExcluir.innerHTML = `${ic('alerta')} Clique de novo para excluir`;
      return;
    }
    const { ok, dados } = await API.excluir(c.numero);
    if (!ok) return erro(dados.erro || 'Não foi possível excluir.');
    feito(`Ticket <strong>${esc(c.codigo)}</strong> excluído.`);
  });
}

elLista.addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-puxar], [data-cobrar], [data-avisar], [data-colega], [data-mencionar], [data-ver], [data-gerenciar]');
  if (!botao) return;
  const d = botao.dataset;
  const c = todos.find((x) => x.numero === Number(d.puxar || d.cobrar || d.avisar || d.colega || d.mencionar || d.ver || d.gerenciar));
  if (!c) return;
  const alvo = (s) => botao.matches(s) && botao;
  if (alvo('[data-puxar]')) {
    alvo('[data-puxar]').disabled = true;
    const { ok, dados } = await API.assumir(c.numero, usuario.nome);
    if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível puxar o ticket.'), { icone: ic('alerta'), tipo: 'alerta' }); carregar(true); return; }
    Efeitos.toast(`Ticket <strong>${esc(c.codigo)}</strong> está na sua mesa. <a href="painel.html">Ir para a mesa →</a>`, { icone: ic('pastas'), tipo: 'sucesso' });
    carregar(true);
  } else if (alvo('[data-cobrar]')) {
    abrirCobrar(c);
  } else if (alvo('[data-gerenciar]')) {
    abrirGerenciar(c);
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
    ? `Tickets há mais de ${DEMORA_MIN} min ficam em vermelho. Cobrar avisa o grupo ou um analista; Gerenciar troca a prioridade, passa para um analista ou exclui.`
    : 'Puxe tickets da fila para a sua mesa ou veja o que os colegas estão atendendo.';
  API.chatContatos().then(({ ok, dados }) => { if (ok) { pessoas = dados; renderizar(); } }).catch(() => {});
  carregar(true);
  setInterval(() => { if (!document.hidden) carregar(); }, 4000);
}
