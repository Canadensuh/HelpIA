/* =========================================================
   conversas.js — HelpIA Chat
   - Grupo da equipe (analistas e gestores) com avisos automáticos
     do HelpIA mencionando tickets. O Helpy NÃO participa dos chats.
   - Conversas diretas: analista ↔ analista/gestor/colaborador.
     O colaborador vê as conversas que um analista começou com ele.
   - "#007" no texto vira menção clicável; dá para anexar um ticket.
   - Emojis e anexos (documentos, prints, imagens, vídeos…): pelo clipe,
     colando um print (Ctrl+V) ou arrastando arquivos para a conversa.
   Parâmetros: ?conversa=ID | ?com=ID_PESSOA | ?grupo=1, mais
   &ticket=N (anexa o ticket) e &texto=... (mensagem já escrita).
   ========================================================= */

const usuario = Sessao.exigir(['colaborador', 'analista', 'gestor']);
const esc = TicketUI.esc;
const ehEquipe = usuario && usuario.perfil !== 'colaborador';
const ROTULOS = { colaborador: 'Colaborador', analista: 'Analista', gestor: 'Gestor' };

const elConversas = document.getElementById('listaConversas');
const elMensagens = document.getElementById('mensagens');
const elCompositor = document.getElementById('compositor');
const elTexto = document.getElementById('texto');
const elAnexo = document.getElementById('anexo');
const elDetalhes = document.getElementById('detalhes');
const elTitulo = document.getElementById('tituloConversa');
const elSub = document.getElementById('subConversa');
const elOffline = document.getElementById('avisoOffline');
const modalNova = document.getElementById('modalNova');
const modalMencionar = document.getElementById('modalMencionar');

let conversas = [];
let atual = null;              // conversa aberta
let mensagens = [];
let tickets = [];              // tickets que dá para mencionar
let contatos = [];
let anexo = null;              // número do ticket anexado à próxima mensagem
let pendentes = [];            // arquivos escolhidos para a próxima mensagem: { arquivo, previa }
let assinaturaLista = '';
let ultimaMensagem = 0;

const ticketPorNumero = (n) => tickets.find((c) => c.numero === Number(n));
const horaOuDia = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatarHora(iso) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ---------- Lista de conversas ----------
function avatarConversa(c) {
  if (c.tipo === 'grupo') return `<span class="conv-avatar conv-grupo">${ic('equipe')}</span>`;
  return Avatar.html(c.outro || { perfil: "colaborador" }, "conv-avatar");
}

function renderizarLista() {
  elConversas.innerHTML = conversas.length ? conversas.map((c) => {
    const previa = c.ultima
      ? `${c.ultima.sistema ? 'HelpIA: ' : c.ultima.autor_id === usuario.id ? 'Você: ' : c.tipo === 'grupo' ? `${esc(c.ultima.autor_nome.split(' ')[0])}: ` : ''}${
        c.ultima.texto ? esc(c.ultima.texto) : `📎 ${c.ultima.anexos?.length || 1} anexo${(c.ultima.anexos?.length || 1) > 1 ? 's' : ''}`}`
      : 'Nenhuma mensagem ainda';
    return `
      <li><button type="button" class="conv ${atual?.id === c.id ? 'ativa' : ''} ${c.nao_lidas ? 'nao-lida' : ''}" data-conversa="${c.id}">
        ${avatarConversa(c)}
        <span class="conv-texto">
          <span class="conv-topo"><strong>${esc(c.nome)}</strong>${c.ultima ? `<time>${horaOuDia(c.ultima.em)}</time>` : ''}</span>
          <span class="conv-sub">${c.tipo === 'grupo' ? `${ic('equipe')} Grupo · ` : c.outro ? `${ROTULOS[c.outro.perfil]} · ` : ''}${previa}</span>
        </span>
        ${c.nao_lidas ? `<span class="conv-badge">${c.nao_lidas}</span>` : ''}
      </button></li>`;
  }).join('') : `<li class="vazio">${ehEquipe ? 'Nenhuma conversa ainda.' : 'Quando um analista te mandar mensagem sobre um ticket, a conversa aparece aqui.'}</li>`;
}

async function carregarConversas() {
  let resposta;
  try {
    resposta = await API.chatConversas();
    elOffline.hidden = true;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  if (!resposta.ok) return;
  conversas = resposta.dados;
  const nova = JSON.stringify(conversas.map((c) => [c.id, c.ultima?.id, c.nao_lidas, atual?.id === c.id]));
  if (nova !== assinaturaLista) { assinaturaLista = nova; renderizarLista(); }
  if (atual) {
    const fresca = conversas.find((c) => c.id === atual.id);
    if (fresca && (fresca.ultima?.id !== ultimaMensagem || fresca.encerrada !== atual.encerrada)) {
      atual = fresca; carregarMensagens(); atualizarEncerrada(); renderizarDetalhes();
    }
  }
}

// ---------- Conversa aberta ----------
async function abrirConversa(id) {
  atual = conversas.find((c) => c.id === id) || null;
  if (!atual) return;
  document.body.classList.add('conversa-aberta');          // no celular: a conversa ocupa a tela
  ultimaMensagem = 0;
  mensagens = [];
  cancelarResposta();
  elMensagens.innerHTML = '<li class="msg-carregando">Carregando…</li>';
  atualizarEncerrada();
  renderizarCabecalho();
  renderizarDetalhes();
  renderizarLista();
  history.replaceState(null, '', `conversas.html?conversa=${id}`);
  await carregarMensagens();
  elTexto.focus();
}

function renderizarCabecalho() {
  if (!atual) {
    elTitulo.innerHTML = `${ic('chat')} HelpIA Chat`;
    elSub.textContent = ehEquipe ? 'Escolha uma conversa ou comece uma nova.' : 'Suas conversas com a equipe de TI.';
    return;
  }
  elTitulo.innerHTML = `${atual.tipo === 'grupo' ? ic('equipe') : ic('chat')} ${esc(atual.nome)}`;
  elSub.textContent = atual.tipo === 'grupo'
    ? `${atual.participantes.length} pessoas · analistas e gestores`
    : `${ROTULOS[atual.outro?.perfil] || ''}${atual.ticket?.codigo ? ` · sobre o ticket ${atual.ticket.codigo}` : ''}`;
}

/** Pessoas que dá para mencionar com @ (quem está na conversa e os contatos da equipe). */
function pessoasMencionaveis() {
  const todas = [...(atual?.participantes || []), ...contatos];
  const vistas = new Map();
  todas.forEach((p) => { if (p?.nome && !vistas.has(p.id)) vistas.set(p.id, p); });
  return [...vistas.values()];
}
const escRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texto com "#007" vira botão que abre o ticket; "@Nome Sobrenome" vira menção à pessoa. */
function formatarTexto(texto) {
  let html = esc(texto).replace(/(^|[\s(])#(\d{1,4})\b/g, (todo, antes, n) => {
    const c = ticketPorNumero(n);
    return c ? `${antes}<button type="button" class="mencao pri-${Catalogo.nivel(c).id}" data-ticket="${c.numero}">${esc(c.codigo)}</button>` : todo;
  });
  const nomes = pessoasMencionaveis().map((p) => p.nome).sort((a, b) => b.length - a.length);
  if (nomes.length) {
    const padrao = new RegExp(`(^|[\\s(])@(${nomes.map((n) => escRegex(esc(n))).join('|')})`, 'g');
    html = html.replace(padrao, (todo, antes, nome) => {
      const eu = nome === esc(usuario.nome);
      return `${antes}<span class="mencao-pessoa ${eu ? 'eu' : ''}">@${nome}</span>`;
    });
  }
  return html;
}
const mencionaMim = (texto) => new RegExp(`(^|[\\s(])@${escRegex(usuario.nome)}`).test(texto || '');

const SETA_RESPONDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';

/** Mensagem respondida, citada em cima da resposta (clicando, a conversa rola até ela). */
function citacao(r) {
  if (!r) return '';
  if (r.apagada) return '<span class="msg-citacao apagada">Mensagem apagada</span>';
  return `<button type="button" class="msg-citacao" data-ir-msg="${r.id}">
    <b>${esc(r.autor_id === usuario.id ? 'Você' : r.autor_nome)}</b><span>${esc(r.texto)}</span></button>`;
}

function cartaoTicket(c) {
  const nivel = Catalogo.nivel(c);
  return `<button type="button" class="msg-ticket pri-${nivel.id}" data-ticket="${c.numero}">
    <span class="msg-ticket-faixa"><b>${esc(c.codigo)}</b>${nivel.rotulo}</span>
    <span class="msg-ticket-corpo"><span class="mini-ico">${Catalogo.icone(c.genero)}</span>
      <span><strong>${esc(c.genero_titulo || c.categoria)}</strong><small>${esc(c.subgenero_titulo || '')} · ${esc(c.status)}</small></span></span>
  </button>`;
}

function renderizarMensagens() {
  let dia = '';
  elMensagens.innerHTML = mensagens.length ? mensagens.map((m) => {
    const d = new Date(m.em).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const separador = d !== dia ? `<li class="msg-dia"><span>${d}</span></li>` : '';
    dia = d;
    const ticket = m.ticket ? (ticketPorNumero(m.ticket.numero) || m.ticket) : null;
    const responder = `<button type="button" class="msg-responder" data-responder="${m.id}" aria-label="Responder esta mensagem" title="Responder">${SETA_RESPONDER}</button>`;
    if (m.sistema) {
      return `${separador}<li class="msg msg-sistema" data-msg-id="${m.id}"><span class="msg-sistema-selo">HelpIA</span>
        <p>${formatarTexto(m.texto)}</p>${ticket ? cartaoTicket(ticket) : ''}<time>${formatarHora(m.em)}</time>${responder}</li>`;
    }
    const minha = m.autor_id === usuario.id;
    return `${separador}<li class="msg ${minha ? 'minha' : ''} ${!minha && mencionaMim(m.texto) ? 'me-mencionou' : ''}" data-msg-id="${m.id}">
      ${minha ? '' : Avatar.html({ perfil: m.autor_perfil, foto: m.autor_foto }, "conv-avatar")}
      <div class="msg-balao">
        ${responder}
        ${minha ? '' : `<span class="msg-autor">${esc(m.autor_nome)} <small>${ROTULOS[m.autor_perfil] || ''}</small></span>`}
        ${citacao(m.resposta)}
        ${m.texto ? `<p class="${soEmoji(m.texto) ? 'so-emoji' : ''}">${formatarTexto(m.texto)}</p>` : ''}
        ${m.anexos?.length ? `<div class="msg-anexos ${m.anexos.length > 1 ? 'varios' : ''}">${m.anexos.map((a) => Anexos.html(a)).join('')}</div>` : ''}
        ${ticket ? cartaoTicket(ticket) : ''}
        <time>${formatarHora(m.em)}</time>
      </div></li>`;
  }).join('') : `<li class="msg-vazio">${ic('chat')}<strong>Comece a conversa</strong><span>${atual?.tipo === 'grupo' ? 'Tudo o que for escrito aqui é visto pelos analistas e gestores.' : 'Mande a primeira mensagem.'}</span></li>`;
  elMensagens.scrollTop = elMensagens.scrollHeight;
  // As imagens chegam depois: mantém a conversa rolada até o fim
  Anexos.hidratar(elMensagens).then(() => {
    elMensagens.querySelectorAll('img[data-anexo-src]').forEach((img) => img.addEventListener('load', () => {
      elMensagens.scrollTop = elMensagens.scrollHeight;
    }, { once: true }));
    elMensagens.scrollTop = elMensagens.scrollHeight;
  });
}

/** Mensagem só com 1 a 3 emojis fica grande, como nos apps de conversa. */
function soEmoji(texto) {
  const limpo = String(texto).replace(/\s/g, '');
  return limpo.length > 0 && limpo.length <= 12 && /^(\p{Extended_Pictographic}|\u200d|\ufe0f|\p{Emoji_Modifier})+$/u.test(limpo);
}

async function carregarMensagens() {
  if (!atual) return;
  const id = atual.id;
  const { ok, dados } = await API.chatMensagens(id);
  if (!ok || atual?.id !== id) return;
  mensagens = dados;
  ultimaMensagem = dados.length ? dados[dados.length - 1].id : 0;
  renderizarMensagens();
  if (atual.nao_lidas) {
    await API.chatLida(id);
    atual.nao_lidas = 0;
    Navegacao.atualizarChat();
    carregarConversas();
  }
}

function renderizarDetalhes() {
  if (!atual) {
    elDetalhes.innerHTML = `<div class="detalhe-bloco"><strong>${ic('chat')} HelpIA Chat</strong>
      <p>${ehEquipe ? 'Converse com o grupo da equipe, com outros analistas e com os colaboradores sobre os tickets deles.' : 'Aqui ficam as mensagens que os analistas mandam sobre os seus tickets.'}</p>
      <p class="detalhe-dica">Escreva <b>#007</b> para mencionar um ticket e <b>@</b> para mencionar uma pessoa.${usuario.perfil === 'gestor' ? ' Como gestor, <b>/clear</b> limpa a conversa.' : ''}</p></div>`;
    return;
  }
  const ticket = atual.ticket?.numero ? ticketPorNumero(atual.ticket.numero) : null;
  const mencionados = [...new Set(mensagens.map((m) => m.ticket?.numero).filter(Boolean))].map(ticketPorNumero).filter(Boolean).slice(-3).reverse();
  elDetalhes.innerHTML = `
    <div class="detalhe-bloco">
      <strong>${ic('equipe')} ${atual.tipo === 'grupo' ? 'No grupo' : 'Na conversa'}</strong>
      <ul class="pessoas">${atual.participantes.map((p) => `
        <li>${Avatar.html(p, "conv-avatar")}
          <span><b>${esc(p.nome)}${p.id === usuario.id ? ' (você)' : ''}</b><small>${ROTULOS[p.perfil]}</small></span></li>`).join('')}
      </ul>
    </div>
    ${ticket ? `<div class="detalhe-bloco"><strong class="detalhe-titulo">${ic('ticket')} Ticket do assunto
        <button type="button" class="btn btn-sm key--rosa btn-tirar-assunto" data-tirar-assunto aria-label="Tirar o ticket do assunto desta conversa" title="Tirar o ticket desta conversa">${ic('x')}</button></strong>
      <ul class="lista-tickets">${TicketUI.padrao(ticket)}</ul></div>` : ''}
    ${!ticket && mencionados.length ? `<div class="detalhe-bloco"><strong>${ic('ticket')} Tickets mencionados</strong>
      <div class="mencionados">${mencionados.map(cartaoTicket).join('')}</div></div>` : ''}`;
}

// ---------- Conversa encerrada (ticket carimbado) ----------
const elEncerrada = document.createElement('p');
elEncerrada.className = 'conversa-encerrada';
elEncerrada.hidden = true;
elCompositor.after(elEncerrada);
function atualizarEncerrada() {
  const encerrada = Boolean(atual?.encerrada);
  elCompositor.hidden = !atual || encerrada;
  elEncerrada.hidden = !encerrada;
  if (encerrada) {
    elEncerrada.innerHTML = `${ic('carimbo')}<span><strong>Conversa encerrada</strong>${
      ehEquipe ? 'O ticket foi carimbado. A conversa volta quando o colaborador abrir um novo chamado.'
        : 'Seu ticket foi resolvido e carimbado. Se precisar de novo, é só abrir um novo chamado.'}</span>`;
  }
}

// ---------- Enviar ----------
function mostrarAnexo() {
  const c = anexo ? ticketPorNumero(anexo) : null;
  elAnexo.hidden = !c;
  elAnexo.innerHTML = c ? `${cartaoTicket(c)}<button type="button" class="btn btn-ghost btn-sm" id="tirarAnexo" aria-label="Tirar o ticket anexado">${ic('x')}</button>` : '';
}

// ---------- Responder uma mensagem (setinha no balão) ----------
let respondendo = null;           // mensagem que está sendo respondida
const elRespondendo = document.createElement('div');
elRespondendo.className = 'compositor-resposta';
elRespondendo.hidden = true;
elCompositor.prepend(elRespondendo);

function responderA(id) {
  const m = mensagens.find((x) => x.id === Number(id));
  if (!m) return;
  respondendo = m;
  const autor = m.sistema ? 'HelpIA' : m.autor_id === usuario.id ? 'você mesmo' : m.autor_nome;
  const trecho = m.texto || (m.anexos?.length ? '📎 Anexo' : '');
  elRespondendo.innerHTML = `${SETA_RESPONDER}<span><small>Respondendo a <b>${esc(autor)}</b></small>${esc(trecho.slice(0, 140))}</span>
    <button type="button" class="btn btn-ghost btn-sm" data-cancelar-resposta aria-label="Cancelar a resposta">${ic('x')}</button>`;
  elRespondendo.hidden = false;
  elTexto.focus();
}
function cancelarResposta() { respondendo = null; elRespondendo.hidden = true; elRespondendo.innerHTML = ''; }

/** Comando /clear: o gestor limpa a conversa inteira. */
async function comandoClear() {
  if (usuario.perfil !== 'gestor') {
    Efeitos.toast('Só o gestor pode usar o comando <strong>/clear</strong>.', { icone: ic('alerta'), tipo: 'alerta' });
    return;
  }
  if (!confirm(`Limpar todas as mensagens de "${atual.nome}"? Essa ação não pode ser desfeita.`)) return;
  const { ok, dados } = await API.chatLimpar(atual.id);
  if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível limpar a conversa.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
  elTexto.value = '';
  ajustarAltura();
  cancelarResposta();
  await carregarMensagens();
  carregarConversas();
  Efeitos.toast('Conversa limpa.', { icone: ic('check'), tipo: 'sucesso' });
}

elCompositor.addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = elTexto.value.trim();
  if ((!texto && !pendentes.length) || !atual) return;
  fecharSugestoes();
  if (/^\/clear$/i.test(texto)) { comandoClear(); return; }
  const botao = document.getElementById('enviar');
  botao.disabled = true;
  let metas = [];
  try {
    for (const p of pendentes) metas.push(await Anexos.salvar(p.arquivo));
  } catch (erro) {
    botao.disabled = false;
    Efeitos.toast(esc(erro.message || 'Não foi possível anexar o arquivo.'), { icone: ic('alerta'), tipo: 'alerta' });
    return;
  }
  const { ok, dados } = await API.chatEnviar(atual.id, texto, anexo, metas, respondendo?.id || null);
  botao.disabled = false;
  if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível enviar.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
  elTexto.value = '';
  ajustarAltura();
  cancelarResposta();
  anexo = null;
  mostrarAnexo();
  limparPendentes();
  mensagens.push(dados);
  ultimaMensagem = dados.id;
  renderizarMensagens();
  renderizarDetalhes();
  carregarConversas();
});
// ---------- Sugestões: "@" para mencionar uma pessoa, "/" para os comandos ----------
const COMANDOS = [{ id: 'clear', rotulo: '/clear', desc: 'Limpar todas as mensagens desta conversa', so: 'gestor' }];
const elSugestoes = document.createElement('ul');
elSugestoes.className = 'sugestoes';
elSugestoes.setAttribute('role', 'listbox');
elSugestoes.hidden = true;
elCompositor.appendChild(elSugestoes);
let sugestoes = { itens: [], escolhida: 0, inicio: 0 };

function fecharSugestoes() { elSugestoes.hidden = true; sugestoes.itens = []; }

function atualizarSugestoes() {
  const ate = elTexto.selectionStart ?? elTexto.value.length;
  const antes = elTexto.value.slice(0, ate);
  const arroba = antes.match(/(^|\s)@([\p{L} ]{0,30})$/u);
  const barra = antes.match(/^\/(\w*)$/);
  let itens = [];
  if (arroba && !/\s{2}/.test(arroba[2])) {
    const termo = Busca.normalizar(arroba[2]);
    itens = (atual?.participantes || pessoasMencionaveis())
      .filter((p) => p.id !== usuario.id && Busca.normalizar(p.nome).startsWith(termo))
      .slice(0, 6)
      .map((p) => ({ texto: `@${p.nome} `, html: `${Avatar.html(p, 'conv-avatar')}<span><b>${esc(p.nome)}</b><small>${ROTULOS[p.perfil] || ''}</small></span>` }));
    sugestoes.inicio = ate - arroba[2].length - 1;
  } else if (barra) {
    itens = COMANDOS.filter((c) => c.id.startsWith(barra[1].toLowerCase()))
      .map((c) => ({ texto: c.rotulo, html: `<span class="sugestao-comando">${c.rotulo}</span><span><b>${esc(c.desc)}</b><small>${c.so === 'gestor' ? 'Só o gestor' : ''}</small></span>`, bloqueada: c.so && usuario.perfil !== c.so }));
    sugestoes.inicio = 0;
  }
  if (!itens.length) { fecharSugestoes(); return; }
  sugestoes = { ...sugestoes, itens, escolhida: 0 };
  elSugestoes.innerHTML = `<li class="sugestoes-titulo">${arroba ? 'Mencionar' : 'Comandos'}</li>${itens.map((s, i) => `
    <li><button type="button" class="sugestao ${i === 0 ? 'escolhida' : ''} ${s.bloqueada ? 'bloqueada' : ''}" data-sugestao="${i}" role="option">${s.html}</button></li>`).join('')}`;
  elSugestoes.hidden = false;
}

function usarSugestao(i) {
  const s = sugestoes.itens[i];
  if (!s) return;
  const ate = elTexto.selectionStart ?? elTexto.value.length;
  elTexto.value = elTexto.value.slice(0, sugestoes.inicio) + s.texto + elTexto.value.slice(ate);
  const pos = sugestoes.inicio + s.texto.length;
  elTexto.focus();
  elTexto.setSelectionRange(pos, pos);
  fecharSugestoes();
  ajustarAltura();
}

elSugestoes.addEventListener('mousedown', (e) => {
  const b = e.target.closest('[data-sugestao]');
  if (b) { e.preventDefault(); usarSugestao(Number(b.dataset.sugestao)); }
});

elTexto.addEventListener('keydown', (e) => {
  if (!elSugestoes.hidden && sugestoes.itens.length) {
    const n = sugestoes.itens.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sugestoes.escolhida = (sugestoes.escolhida + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      elSugestoes.querySelectorAll('.sugestao').forEach((b, i) => b.classList.toggle('escolhida', i === sugestoes.escolhida));
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !/^\/clear$/i.test(elTexto.value.trim()))) {
      e.preventDefault(); usarSugestao(sugestoes.escolhida); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); fecharSugestoes(); return; }
  }
  if (e.key === 'Escape' && respondendo) { cancelarResposta(); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); elCompositor.requestSubmit(); }
});
function ajustarAltura() {
  elTexto.style.height = 'auto';
  elTexto.style.height = `${Math.min(140, elTexto.scrollHeight)}px`;
}
elTexto.addEventListener('input', () => { ajustarAltura(); atualizarSugestoes(); });
elTexto.addEventListener('click', atualizarSugestoes);
elTexto.addEventListener('blur', () => setTimeout(fecharSugestoes, 150));

// ---------- Anexos: clipe, colar print (Ctrl+V) e arrastar arquivos para a conversa ----------
const elPendentes = document.getElementById('arquivosPendentes');
const elArquivo = document.getElementById('arquivoInput');

function adicionarArquivos(lista) {
  const arquivos = [...lista].filter(Boolean);
  for (const arquivo of arquivos) {
    if (pendentes.length >= Anexos.MAX_POR_MENSAGEM) {
      Efeitos.toast(`Até ${Anexos.MAX_POR_MENSAGEM} anexos por mensagem.`, { icone: ic('alerta'), tipo: 'alerta' });
      break;
    }
    if (arquivo.size > Anexos.LIMITE) {
      Efeitos.toast(`<strong>${esc(arquivo.name)}</strong> passa de ${Anexos.tamanho(Anexos.LIMITE)}.`, { icone: ic('alerta'), tipo: 'alerta' });
      continue;
    }
    pendentes.push({ arquivo, previa: arquivo.type.startsWith('image/') ? URL.createObjectURL(arquivo) : null });
  }
  renderizarPendentes();
  elTexto.focus();
}
function renderizarPendentes() {
  elPendentes.hidden = !pendentes.length;
  elPendentes.innerHTML = pendentes.map((p, i) => {
    const tipo = Anexos.categoria(p.arquivo.type);
    return `<li class="pendente">
      ${p.previa ? `<img src="${p.previa}" alt="" />` : `<span class="anexo-ico">${ic(Anexos.ICONES[tipo])}</span>`}
      <span class="anexo-info"><b>${esc(p.arquivo.name || 'print.png')}</b><small>${Anexos.tamanho(p.arquivo.size)}</small></span>
      <button type="button" class="btn btn-ghost btn-sm" data-tirar-arquivo="${i}" aria-label="Tirar ${esc(p.arquivo.name || 'arquivo')}">${ic('x')}</button>
    </li>`;
  }).join('');
}
function limparPendentes() {
  pendentes.forEach((p) => p.previa && URL.revokeObjectURL(p.previa));
  pendentes = [];
  renderizarPendentes();
}
const elBotaoAnexar = document.getElementById('anexar');
const elMenuAnexo = document.createElement('div');
elMenuAnexo.className = 'menu-anexo';
elMenuAnexo.hidden = true;
elMenuAnexo.innerHTML = `
  <button type="button" class="menu-anexo-item" data-arquivo>${ic('arquivo')}<span><b>Arquivo</b><small>Documentos, prints, imagens e vídeos</small></span></button>
  <button type="button" class="menu-anexo-item" data-camera>${ic('olho')}<span><b>Câmera</b><small>Tirar uma foto agora</small></span></button>`;
elCompositor.appendChild(elMenuAnexo);
function fecharMenuAnexo() { elMenuAnexo.hidden = true; elBotaoAnexar.setAttribute('aria-expanded', 'false'); }
elBotaoAnexar.setAttribute('aria-haspopup', 'menu');
elBotaoAnexar.addEventListener('click', (e) => {
  e.stopPropagation();
  elMenuAnexo.hidden = !elMenuAnexo.hidden;
  elBotaoAnexar.setAttribute('aria-expanded', String(!elMenuAnexo.hidden));
});
document.addEventListener('click', (e) => { if (!elMenuAnexo.hidden && !e.target.closest('.menu-anexo, #anexar')) fecharMenuAnexo(); });

// ---------- Câmera: no celular abre a câmera do aparelho; no computador, a webcam ----------
const elCameraInput = document.createElement('input');
Object.assign(elCameraInput, { type: 'file', accept: 'image/*', hidden: true });
elCameraInput.setAttribute('capture', 'environment');
elCompositor.appendChild(elCameraInput);
elCameraInput.addEventListener('change', () => { adicionarArquivos(elCameraInput.files); elCameraInput.value = ''; });

async function abrirCamera() {
  const celular = matchMedia('(pointer: coarse)').matches;
  if (celular || !navigator.mediaDevices?.getUserMedia) { elCameraInput.click(); return; }
  let fluxo;
  try {
    fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    Efeitos.toast('Não deu para abrir a câmera. Confira a permissão do navegador ou escolha um arquivo.', { icone: ic('alerta'), tipo: 'alerta' });
    return;
  }
  const modal = document.createElement('dialog');
  modal.className = 'modal modal-camera';
  modal.innerHTML = `<div class="modal-conteudo">
    <header class="modal-topo"><h2>${ic('olho')} Tirar foto</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-fechar aria-label="Fechar">${ic('x')}</button></header>
    <video class="camera-video" autoplay playsinline muted></video>
    <div class="modal-acoes">
      <button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>
      <button type="button" class="btn key--green" data-foto>${ic('olho')} Tirar foto</button>
    </div></div>`;
  document.body.appendChild(modal);
  const video = modal.querySelector('video');
  video.srcObject = fluxo;
  modal.addEventListener('close', () => { fluxo.getTracks().forEach((t) => t.stop()); modal.remove(); });
  modal.querySelector('[data-foto]').addEventListener('click', () => {
    const tela = document.createElement('canvas');
    tela.width = video.videoWidth || 1280;
    tela.height = video.videoHeight || 720;
    tela.getContext('2d').drawImage(video, 0, 0, tela.width, tela.height);
    tela.toBlob((blob) => {
      if (blob) {
        const hora = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
        adicionarArquivos([new File([blob], `foto-${hora}.jpg`, { type: 'image/jpeg' })]);
      }
      modal.close();
    }, 'image/jpeg', .9);
  });
  modal.showModal();
}
elArquivo.addEventListener('change', () => { adicionarArquivos(elArquivo.files); elArquivo.value = ''; });
elTexto.addEventListener('paste', (e) => {
  const arquivos = [...(e.clipboardData?.files || [])];
  if (arquivos.length) { e.preventDefault(); adicionarArquivos(arquivos); }
});
const elTampoChat = document.getElementById('tampoChat');
const elSoltar = document.getElementById('soltarAqui');
const temArquivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
elTampoChat.addEventListener('dragover', (e) => {
  if (!temArquivos(e) || !atual) return;
  e.preventDefault();
  elSoltar.hidden = false;
});
elTampoChat.addEventListener('dragleave', (e) => { if (!elTampoChat.contains(e.relatedTarget)) elSoltar.hidden = true; });
elTampoChat.addEventListener('drop', (e) => {
  if (!temArquivos(e) || !atual) return;
  e.preventDefault();
  elSoltar.hidden = true;
  adicionarArquivos(e.dataTransfer.files);
});

// ---------- Emojis ----------
const EMOJIS = {
  'Rostos': '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😍 🤩 😎 🤔 😐 😴 😢 😭 😡 🤯 🥳 😬 🙄 🙏',
  'Gestos': '👍 👎 👏 🙌 👋 ✌️ 🤝 💪 👀 👌 🤞 ✋',
  'Trabalho': '💻 🖥️ 🖨️ ⌨️ 🖱️ 📱 🔌 🔋 📶 🔒 🔑 🛠️ ⚙️ 📎 📄 📊 📅 ⏰ ☕ 🚀',
  'Símbolos': '✅ ❌ ⚠️ 🔥 ⭐ ❤️ 💡 ❓ ❗ 🎉 ✔️ ➡️ 🆗 🆘',
};
const elEmojis = document.getElementById('painelEmojis');
const elBotaoEmoji = document.getElementById('abrirEmojis');
elEmojis.innerHTML = Object.entries(EMOJIS).map(([grupo, lista]) => `
  <span class="emojis-grupo">${grupo}</span>
  <div class="emojis-grade">${lista.split(' ').map((e) => `<button type="button" class="emoji" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`).join('');
function abrirEmojis(abrir = elEmojis.hidden) {
  elEmojis.hidden = !abrir;
  elBotaoEmoji.setAttribute('aria-expanded', String(abrir));
}
elBotaoEmoji.addEventListener('click', (e) => { e.stopPropagation(); abrirEmojis(); });
elEmojis.addEventListener('click', (e) => {
  const b = e.target.closest('[data-emoji]');
  if (!b) return;
  const ini = elTexto.selectionStart ?? elTexto.value.length;
  const fim = elTexto.selectionEnd ?? ini;
  elTexto.value = elTexto.value.slice(0, ini) + b.dataset.emoji + elTexto.value.slice(fim);
  const pos = ini + b.dataset.emoji.length;
  elTexto.focus();
  elTexto.setSelectionRange(pos, pos);
  ajustarAltura();
});
document.addEventListener('click', (e) => { if (!elEmojis.hidden && !e.target.closest('#painelEmojis, #abrirEmojis')) abrirEmojis(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirEmojis(false); });

// ---------- Ver uma imagem grande ----------
async function verImagem(id) {
  const msg = mensagens.find((m) => m.anexos?.some((a) => a.id === id));
  const a = msg?.anexos.find((x) => x.id === id);
  const url = await Anexos.url(id);
  if (!url) return;
  const modal = document.getElementById('modalImagem');
  document.getElementById('imagemGrande').src = url;
  document.getElementById('imagemGrande').alt = a?.nome || 'Imagem';
  document.getElementById('tituloImagem').textContent = a?.nome || 'Imagem';
  const baixar = document.getElementById('baixarImagem');
  baixar.href = url;
  baixar.download = a?.nome || 'imagem';
  modal.showModal();
}

// ---------- Mencionar um ticket ----------
function renderizarMencao() {
  const lista = TicketUI.filtrar(tickets, { termo: document.getElementById('buscaMencao').value })
    .sort((a, b) => (a.status === 'Resolvido') - (b.status === 'Resolvido') || b.numero - a.numero).slice(0, 24);
  document.getElementById('listaMencao').innerHTML = lista.length
    ? lista.map((c) => `<li>${cartaoTicket(c).replace('data-ticket=', 'data-escolher=')}</li>`).join('')
    : '<li class="vazio">Nenhum ticket encontrado.</li>';
}
document.getElementById('mencionar').addEventListener('click', () => {
  document.getElementById('buscaMencao').value = '';
  renderizarMencao();
  modalMencionar.showModal();
});
document.getElementById('buscaMencao').addEventListener('input', renderizarMencao);

// ---------- Nova conversa ----------
function renderizarContatos() {
  const termo = document.getElementById('buscaContato').value.trim().toLowerCase();
  const grupos = ['analista', 'gestor', 'colaborador'].map((perfil) => [perfil, contatos.filter((p) => p.perfil === perfil && p.nome.toLowerCase().includes(termo))]);
  document.getElementById('listaContatos').innerHTML = grupos.filter(([, l]) => l.length).map(([perfil, l]) => `
    <span class="contatos-grupo">${ROTULOS[perfil]}s</span>
    ${l.map((p) => `<button type="button" class="contato" data-com="${p.id}">
      ${Avatar.html(p, "conv-avatar")}<span><b>${esc(p.nome)}</b><small>${esc(p.email)}</small></span></button>`).join('')}`).join('')
    || '<p class="vazio">Ninguém encontrado.</p>';
}
document.getElementById('novaConversa').addEventListener('click', () => {
  document.getElementById('buscaContato').value = '';
  renderizarContatos();
  modalNova.showModal();
});
document.getElementById('buscaContato').addEventListener('input', renderizarContatos);

async function conversarCom(id, ticket = null) {
  const { ok, dados } = await API.chatAbrir(id, ticket);
  if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível abrir a conversa.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
  await carregarConversas();
  await abrirConversa(dados.id);
}

// ---------- Cliques ----------
document.addEventListener('click', async (e) => {
  const alvo = (s) => e.target.closest(s);
  if (alvo('[data-tirar-assunto]')) {
    const { ok, dados } = await API.chatTirarTicket(atual.id);
    if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível tirar o ticket.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
    atual = { ...atual, ticket: null };
    renderizarDetalhes();
    Efeitos.toast('Ticket tirado do assunto da conversa.', { icone: ic('check'), tipo: 'sucesso' });
    return;
  }
  if (alvo('[data-camera]')) { abrirCamera(); fecharMenuAnexo(); return; }
  if (alvo('[data-arquivo]')) { elArquivo.click(); fecharMenuAnexo(); return; }
  if (alvo('[data-responder]')) { responderA(alvo('[data-responder]').dataset.responder); return; }
  if (alvo('[data-cancelar-resposta]')) { cancelarResposta(); elTexto.focus(); return; }
  if (alvo('[data-ir-msg]')) {
    const li = elMensagens.querySelector(`[data-msg-id="${alvo('[data-ir-msg]').dataset.irMsg}"]`);
    if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.remove('destacada'); void li.offsetWidth; li.classList.add('destacada'); }
    return;
  }
  if (alvo('[data-fechar]')) alvo('dialog')?.close();
  else if (alvo('[data-conversa]')) abrirConversa(Number(alvo('[data-conversa]').dataset.conversa));
  else if (alvo('[data-com]')) { modalNova.close(); conversarCom(Number(alvo('[data-com]').dataset.com)); }
  else if (alvo('[data-escolher]')) { anexo = Number(alvo('[data-escolher]').dataset.escolher); modalMencionar.close(); mostrarAnexo(); elTexto.focus(); }
  else if (alvo('#tirarAnexo')) { anexo = null; mostrarAnexo(); }
  else if (alvo('[data-tirar-arquivo]')) {
    const [tirado] = pendentes.splice(Number(alvo('[data-tirar-arquivo]').dataset.tirarArquivo), 1);
    if (tirado?.previa) URL.revokeObjectURL(tirado.previa);
    renderizarPendentes();
  }
  else if (alvo('[data-anexo-ver]')) verImagem(alvo('[data-anexo-ver]').dataset.anexoVer);
  else if (alvo('[data-ticket]')) { const c = ticketPorNumero(alvo('[data-ticket]').dataset.ticket); if (c) TicketUI.abrir(c); }
  else if (alvo('[data-ver]')) { const c = ticketPorNumero(alvo('[data-ver]').dataset.ver); if (c) TicketUI.abrir(c); }
  else if (e.target.matches('dialog.modal')) e.target.close();
});

// ---------- Início ----------
(async () => {
  if (!usuario) return;
  Sessao.montarMenu(usuario);
  document.getElementById('novaConversa').hidden = !ehEquipe;
  renderizarCabecalho();
  renderizarDetalhes();
  try {
    const [rTickets, rContatos] = await Promise.all([
      API.listar(ehEquipe ? {} : { solicitante: usuario.nome }),
      API.chatContatos(),
    ]);
    tickets = rTickets.ok ? rTickets.dados : [];
    contatos = rContatos.ok ? rContatos.dados : [];
  } catch {
    mostrarOffline(elOffline);
  }
  await carregarConversas();

  const q = new URLSearchParams(location.search);
  if (q.get('ticket')) anexo = Number(q.get('ticket'));
  if (q.get('com') && ehEquipe) await conversarCom(Number(q.get('com')), anexo);
  else if (q.get('grupo')) { const g = conversas.find((c) => c.tipo === 'grupo'); if (g) await abrirConversa(g.id); }
  else if (q.get('conversa')) await abrirConversa(Number(q.get('conversa')));
  // No celular a tela começa pela lista de conversas (como nos apps de mensagem)
  else if (conversas.length && !matchMedia('(max-width: 760px)').matches) await abrirConversa((conversas.find((c) => c.nao_lidas) || conversas[0]).id);
  if (q.get('texto')) { elTexto.value = q.get('texto'); ajustarAltura(); }
  mostrarAnexo();

  setInterval(() => { if (!document.hidden) carregarConversas(); }, 2500);
})();

// Celular: voltar da conversa para a lista
document.getElementById('voltarConversas')?.addEventListener('click', () => {
  document.body.classList.remove('conversa-aberta');
  fecharSugestoes();
});
