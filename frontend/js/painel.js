/* =========================================================
   painel.js — mesa de trabalho do analista
   Bandeja de entrada (tickets chegando) → mesa (arrastar ou
   "Assumir") → carimbar com nota de resolução → arquivo.
   O Helpy anima, comemora e lembra de atendimentos anteriores:
   mesma máquina do mesmo colaborador ou mesmo problema.
   ========================================================= */

const usuario = Sessao.exigir(['analista', 'gestor']);

const elEntrada = document.getElementById('listaEntrada');
const elMesa = document.getElementById('listaMesa');
const elTampo = document.getElementById('tampo');
const elBandeja = document.querySelector('.bandeja');
const elColegas = document.getElementById('colegas');
const elListaColegas = document.getElementById('listaColegas');
const elArquivo = document.getElementById('arquivo');
const elOffline = document.getElementById('avisoOffline');
const modalNota = document.getElementById('modalNota');
const modalCarimbo = document.getElementById('modalCarimbo');
const elGaveta = document.getElementById('gavetaArquivo');
const elGavetaFundo = document.getElementById('gavetaFundo');

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });
const escritorio = Escritorio.montar();    // foco nas lembranças + configurações (js/escritorio.js)

const esc = (texto) => escaparHtml(String(texto ?? ''));
const primeiroNome = () => (usuario?.nome || '').split(' ')[0];
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let todos = [];
let assinatura = '';
let primeiraCarga = true;
let arrastando = false;
let ultimaFala = Date.now();
let chamadoEmCarimbo = null;
const vistosNaBandeja = new Set();

// ---------- Preferências do analista ----------
const CHAVE_LIDAS = `helpia-notas-lidas-${usuario?.id}`;
const CHAVE_META = `helpia-meta-${usuario?.id}`;
const notasLidas = new Set((() => {
  try { return JSON.parse(lerPreferencia(CHAVE_LIDAS, '[]')); } catch { return []; }
})());
let meta = Number(lerPreferencia(CHAVE_META, '5')) || 5;

function marcarLida(numero) {
  notasLidas.add(numero);
  salvarPreferencia(CHAVE_LIDAS, JSON.stringify([...notasLidas]));
}

// ---------- Falas do Helpy ----------
const ELOGIOS = [
  'Mais um! Você está voando hoje <i class="ic ic-foguete" aria-hidden="true"></i>',
  'Carimbado com estilo. <i class="ic ic-joinha" aria-hidden="true"></i>',
  'A fila agradece! <i class="ic ic-brilho" aria-hidden="true"></i>',
  'Isso é que é eficiência. <i class="ic ic-raio" aria-hidden="true"></i>',
  'Ticket fechado, colaborador feliz. <i class="ic ic-sorriso" aria-hidden="true"></i>',
  'Que mão firme nesse carimbo! <i class="ic ic-carimbo" aria-hidden="true"></i>',
];
const AO_ASSUMIR = [
  'Bora! Esse está em boas mãos. <i class="ic ic-joinha" aria-hidden="true"></i>',
  'Assumido! Leia a nota com calma antes de agir. <i class="ic ic-caneta" aria-hidden="true"></i>',
  'Mais um na mesa. Você dá conta! <i class="ic ic-cafe" aria-hidden="true"></i>',
];
const DICAS_OCIOSAS = [
  'Tickets com <i class="ic ic-chama" aria-hidden="true"></i> prioridade alta ficam sempre no topo da bandeja.',
  'Lembrete amigo: beba uma água. <i class="ic ic-gota" aria-hidden="true"></i>',
  'Precisa falar com o colaborador? Use o botão de mensagem no ticket: a conversa abre no HelpIA Chat. <i class="ic ic-chat" aria-hidden="true"></i>',
  'Uma boa nota de resolução ajuda o próximo analista. Capriche! <i class="ic ic-caneta" aria-hidden="true"></i>',
  'Você sabia? Dá para arrastar o ticket da bandeja direto para a mesa. <i class="ic ic-mao" aria-hidden="true"></i>',
];
const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

function falar(html, opcoes = {}) {
  ultimaFala = Date.now();
  // Quando o Helpy lembra de um caso, ele ganha o foco (como as dicas do colaborador)
  if (opcoes.tipo === 'memoria') opcoes = { ...opcoes, aoMostrar: () => escritorio.focar(3000) };
  return helpy.dizer(html, opcoes);
}

// ---------- Lembranças (histórico) ----------
const normMaquina = (m) => String(m || '').trim().toLowerCase().replace(/^0+/, '');

function quando(iso) {
  const dia = iso.slice(0, 10);
  if (dia === hojeIso()) return 'hoje';
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemIso = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
  return dia === ontemIso ? 'ontem' : `em ${Efeitos.dataCurta(iso)}`;
}

function lembranca(chamado) {
  const resolvidos = todos
    .filter((c) => c.status === 'Resolvido' && c.resolucao && c.numero !== chamado.numero)
    .sort((a, b) => b.resolvido_em.localeCompare(a.resolvido_em));
  const mesmaMaquina = chamado.maquina && resolvidos.find((c) =>
    c.solicitante === chamado.solicitante && normMaquina(c.maquina) === normMaquina(chamado.maquina));
  if (mesmaMaquina) return { tipo: 'maquina', chamado: mesmaMaquina };
  const mesmoProblema = resolvidos.find((c) => c.genero === chamado.genero && c.subgenero === chamado.subgenero);
  if (mesmoProblema) return { tipo: 'problema', chamado: mesmoProblema };
  return null;
}

function textoLembranca(l) {
  const c = l.chamado;
  const eu = c.analista === usuario.nome;
  const citacao = `<div class="helpy-citacao">“${esc(c.resolucao)}”<small>${eu ? 'Sua nota' : `${esc(c.analista)}`} · ${esc(c.codigo)} · ${quando(c.resolvido_em)}</small></div>`;
  if (l.tipo === 'maquina') {
    return `<p><strong>${esc(primeiroNome())}</strong>, ${eu ? 'você já tratou' : `<strong>${esc(c.analista)}</strong> já tratou`}
      um chamado de <strong>${esc(c.solicitante)}</strong> na máquina <strong>${esc(c.maquina)}</strong> ${quando(c.resolvido_em)}.
      ${eu ? 'Sua última nota:' : 'A nota carimbada foi:'}</p>${citacao}`;
  }
  return eu
    ? `<p><strong>${esc(primeiroNome())}</strong>, você já resolveu esse mesmo problema e carimbou:</p>${citacao}`
    : `<p><strong>${esc(primeiroNome())}</strong>, um outro analista que resolveu esse problema carimbou essa nota:</p>${citacao}`;
}

// ---------- Ticket (tamanho padrão, igual ao do colaborador) ----------
// Só a faixa do topo muda de cor: verde = baixa · azul = normal · amarelo = média · vermelho = alta (pisca).
function seloPrioridade(nivel) {
  return `<span class="tkp-pri">${nivel.id === 'alta' ? ic('chama') : ''}${nivel.rotulo}</span>`;
}

function ticketMesa(c, { naMesa = false, comAcoes = true, indice = 0, novo = false } = {}) {
  const l = lembranca(c);
  const nivel = Catalogo.nivel(c);
  const giro = naMesa ? ((c.numero * 37) % 5 - 2) * .6 : 0;     // na mesa, cada ticket "jogado" num ângulo
  return `
    <li class="tkp-item tkp-analista ${naMesa ? 'em-mesa' : ''} ${novo ? 'chegando' : ''}" style="--i:${indice}; --giro:${giro}deg"
        data-numero="${c.numero}" ${!naMesa && comAcoes ? 'data-arrastavel title="Segure e arraste até a mesa"' : ''}>
      ${l && comAcoes ? '<span class="tkm-lembra"><i class="ic ic-lampada" aria-hidden="true"></i> Helpy lembra</span>' : ''}
      <div class="tkp-sombra">
        <article class="tkp ticket pri-${nivel.id}">
          <header class="tkp-faixa">
            <span class="tkp-codigo">${esc(c.codigo)}</span>
            ${seloPrioridade(nivel)}
          </header>
          <div class="tkp-corpo">
            <span class="mini-ico">${Catalogo.icone(c.genero)}</span>
            <div class="tkp-tipo"><strong>${esc(c.genero_titulo || c.categoria)}</strong><span>${esc(c.subgenero_titulo || c.descricao)}</span></div>
          </div>
          <span class="ticket-picote"></span>
          <footer class="tkp-rodape">
            <span>${ic('usuario')} <b>${esc(c.solicitante)}</b>${c.maquina ? ` · ${ic('etiqueta')} ${esc(c.maquina)}` : ''}
              · <span class="tkp-tempo" data-tempo="${c.aberto_em}">${Efeitos.tempoDesde(c.aberto_em)}</span></span>
            ${comAcoes ? `
              <span class="tkp-acoes">
                <button type="button" class="btn btn-sm btn-nota ${notasLidas.has(c.numero) ? '' : 'nova'}" data-acao="nota" data-numero="${c.numero}" title="Ler a nota do colaborador"><i class="ic ic-envelope" aria-hidden="true"></i> Nota</button>
                ${naMesa && c.solicitante_id ? `<button type="button" class="btn btn-sm btn-mensagem" data-acao="mensagem" data-numero="${c.numero}" title="Mandar mensagem para ${esc(c.solicitante)} pelo HelpIA Chat" aria-label="Mandar mensagem para ${esc(c.solicitante)}"><i class="ic ic-chat" aria-hidden="true"></i></button>` : ''}
                ${naMesa
                  ? `<button type="button" class="btn btn-sm key--green" data-acao="carimbar" data-numero="${c.numero}"><i class="ic ic-carimbo" aria-hidden="true"></i> Carimbar</button>`
                  : `<button type="button" class="btn btn-sm btn-primary" data-acao="assumir" data-numero="${c.numero}">Assumir →</button>`}
              </span>` : `<span>${ic('pasta')} ${esc(c.fila)}</span>`}
          </footer>
        </article>
      </div>
    </li>`;
}

// ---------- Carga e renderização ----------
async function carregar(forcar = false) {
  let dados;
  try {
    ({ dados } = await API.listar());
    elOffline.hidden = true;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  todos = dados;
  const nova = JSON.stringify(dados.map((c) => [c.numero, c.status, c.analista]));
  if (!forcar && (nova === assinatura || arrastando)) {
    atualizarTempos();
    return;
  }
  assinatura = nova;
  renderizar();
}

function renderizar() {
  const ORDEM = { alta: 0, media: 1, normal: 2, baixa: 3 };
  const peso = (c) => ORDEM[Catalogo.nivel(c).id];
  const entrada = todos.filter((c) => c.status === 'Aguardando')
    .sort((a, b) => peso(a) - peso(b) || a.aberto_em.localeCompare(b.aberto_em));
  const minhaMesa = todos.filter((c) => c.status === 'Em atendimento' && c.analista === usuario.nome);
  const comColegas = todos.filter((c) => c.status === 'Em atendimento' && c.analista !== usuario.nome);
  const arquivados = todos.filter((c) => c.status === 'Resolvido');
  const hoje = arquivados.filter((c) => c.analista === usuario.nome && (c.resolvido_em || '').startsWith(hojeIso()));

  // Tickets que acabaram de chegar
  const novos = entrada.filter((c) => !vistosNaBandeja.has(c.numero));
  entrada.forEach((c) => vistosNaBandeja.add(c.numero));

  elEntrada.innerHTML = entrada.length
    ? entrada.map((c, i) => ticketMesa(c, { indice: i, novo: primeiraCarga || novos.includes(c) })).join('')
    : '<li class="mesa-vazia"><span><i class="ic ic-festa" aria-hidden="true"></i></span><strong>Bandeja vazia!</strong>Nenhum ticket esperando.</li>';

  elMesa.innerHTML = minhaMesa.length
    ? minhaMesa.map((c, i) => ticketMesa(c, { naMesa: true, indice: i })).join('')
    : `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico"><i class="ic ic-cafe" aria-hidden="true"></i></span><strong>Mesa limpa</strong><span>Arraste um ticket da bandeja para cá ou clique em “Assumir”.</span></li>`;
  elMesa.classList.toggle('vazia', !minhaMesa.length);
  document.getElementById('contadorMesa').textContent = minhaMesa.length;

  elColegas.hidden = comColegas.length === 0;
  elListaColegas.innerHTML = comColegas.map((c) =>
    `<span class="colega" title="${esc(c.descricao)}">${esc(c.codigo)} · ${esc(c.analista)}</span>`).join('');

  atualizarPlacar(entrada.length, minhaMesa.length, hoje.length);
  document.getElementById('contadorArquivo').textContent = arquivados.length;
  document.title = entrada.length ? `(${entrada.length}) HelpIA — Mesa do analista` : 'HelpIA — Mesa do analista';
  if (elGaveta.classList.contains('aberta')) renderizarArquivo();

  if (!primeiraCarga && novos.length) anunciarChegada(novos);
  if (primeiraCarga) boasVindas(entrada, minhaMesa);
  primeiraCarga = false;
}

function atualizarTempos() {
  document.querySelectorAll('[data-tempo]').forEach((el) => {
    el.textContent = Efeitos.tempoDesde(el.dataset.tempo);
  });
}

function atualizarPlacar(fila, maos, hoje) {
  const elHoje = document.getElementById('placarHoje');
  const subiu = Number(elHoje.dataset.valor || 0) < hoje && !primeiraCarga;
  Efeitos.contarAte(document.getElementById('placarFila'), fila);
  Efeitos.contarAte(document.getElementById('placarMaos'), maos);
  Efeitos.contarAte(elHoje, hoje);
  if (subiu) { elHoje.classList.remove('sobe'); void elHoje.offsetWidth; elHoje.classList.add('sobe'); }

  const contador = document.getElementById('contadorBandeja');
  if (contador.textContent !== String(fila)) { contador.classList.remove('pulo'); void contador.offsetWidth; contador.classList.add('pulo'); }
  contador.textContent = fila;
  document.getElementById('contadorAlca').textContent = fila;

  // Meta do dia fica no post-it da parede do escritório do Helpy
  const batida = hoje >= meta;
  document.getElementById('metaTexto').textContent = `${hoje}/${meta} feitos`;
  document.getElementById('placarMeta').classList.toggle('batida', batida);
  document.getElementById('postItMeta').innerHTML = batida ? 'BATIDA! <i class="ic ic-trofeu" aria-hidden="true"></i>' : `${meta} tickets`;
  return batida;
}

function boasVindas(entrada, minhaMesa) {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const conhecido = entrada.find((c) => lembranca(c));
  falar(`<p>${saudacao}, <strong>${esc(primeiroNome())}</strong>! <i class="ic ic-cafe" aria-hidden="true"></i></p>
    <p>${entrada.length ? `Tem <strong>${entrada.length}</strong> ticket(s) na bandeja` : 'A bandeja está vazia'}${minhaMesa.length ? ` e <strong>${minhaMesa.length}</strong> na sua mesa` : ''}. Bora?</p>
    ${conhecido ? `<p><i class="ic ic-olho" aria-hidden="true"></i> Já conheço o caso do <strong>${esc(conhecido.codigo)}</strong>. Abre a nota que eu te conto.</p>` : ''}`, { humor: 'acenando' });
  if (muralGestor?.regra_do_dia) {
    falar(`<p>${ic('alvo')} <strong>Regra do dia</strong> (${esc(muralGestor.regra_do_dia.autor)}):</p><p>“${esc(muralGestor.regra_do_dia.texto)}”</p>`, { humor: 'feliz', atraso: 900 });
  }
}

function anunciarChegada(novos) {
  const alca = document.getElementById('alcaBandeja');
  alca.classList.remove('chegou');
  void alca.offsetWidth;
  alca.classList.add('chegou');
  elBandeja.classList.remove('recebendo');
  void elBandeja.offsetWidth;
  elBandeja.classList.add('recebendo');
  novos.forEach((c) => {
    const alta = c.prioridade === 'Alta';
    Efeitos.toast(`<strong>Novo ticket ${esc(c.codigo)}</strong><br>${esc(c.solicitante)} · ${esc(c.descricao)}`, {
      icone: alta ? '<i class="ic ic-chama" aria-hidden="true"></i>' : '<i class="ic ic-entrada" aria-hidden="true"></i>', tipo: alta ? 'alerta' : '',
    });
  });
  const c = novos[0];
  const l = lembranca(c);
  falar(`<i class="ic ic-entrada" aria-hidden="true"></i> Chegou o <strong>${esc(c.codigo)}</strong> de ${esc(c.solicitante)}: ${esc(c.descricao)}${c.prioridade === 'Alta' ? ' — <strong>prioridade alta!</strong> <i class="ic ic-chama" aria-hidden="true"></i>' : '.'}
    ${l ? '<br>E eu já conheço esse caso <i class="ic ic-olho" aria-hidden="true"></i>' : ''}`, { humor: c.prioridade === 'Alta' ? 'alerta' : 'acenando', tipo: c.prioridade === 'Alta' ? 'alerta' : '' });
}

// ---------- Ações ----------
function buscar(numero) { return todos.find((c) => c.numero === Number(numero)); }

async function assumir(numero, origem) {
  const { ok, dados } = await API.assumir(numero, usuario.nome);
  if (!ok) {
    Efeitos.toast(esc(dados.erro || 'Não foi possível assumir.'), { icone: '<i class="ic ic-alerta" aria-hidden="true"></i>', tipo: 'alerta' });
    carregar(true);
    return;
  }
  if (origem) {
    origem.style.visibility = 'hidden';
    await Efeitos.voar(origem, elTampo, { duracao: 650, escalaFinal: .85 });
  }
  await carregar(true);
  const naMesa = elMesa.querySelector(`[data-numero="${numero}"]`);
  naMesa?.classList.add('chegando');
  const l = lembranca(dados);
  if (l) falar(textoLembranca(l), { tipo: 'memoria', humor: 'acenando', atraso: 700 });
  else falar(sortear(AO_ASSUMIR), { atraso: 400 });
}

function abrirNota(numero) {
  const c = buscar(numero);
  if (!c) return;
  marcarLida(c.numero);
  document.querySelector(`[data-acao="nota"][data-numero="${c.numero}"]`)?.classList.remove('nova');

  const contato = Catalogo.contatos.find((k) => k.id === c.contato?.tipo);
  const valor = c.contato?.valor || '';
  const link = !contato ? '' : contato.id === 'whatsapp'
    ? `https://wa.me/55${valor.replace(/\D/g, '').replace(/^55/, '')}`
    : contato.id === 'teams'
      ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(valor)}`
      : `mailto:${encodeURIComponent(valor)}?subject=${encodeURIComponent(`Chamado ${c.codigo}`)}`;
  const l = lembranca(c);

  document.getElementById('conteudoNota').innerHTML = `
    <header class="modal-topo">
      <h2><i class="ic ic-envelope" aria-hidden="true"></i> Nota do ticket ${esc(c.codigo)}</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-fechar aria-label="Fechar"><i class="ic ic-x" aria-hidden="true"></i></button>
    </header>
    <div class="nota-papel">
      <p>${esc(c.nota || c.descricao)}</p>
      <p class="nota-assinatura">— ${esc(c.solicitante)}${c.maquina ? `, máquina ${esc(c.maquina)}` : ''} · ${esc(c.descricao)} · ${Efeitos.dataCurta(c.aberto_em)} ${c.aberto_em.slice(11, 16)}</p>
    </div>
    ${contato ? `
      <div class="contato-urgencia">
        <strong><i class="ic ic-alerta" aria-hidden="true"></i> Contato para urgência · use só se for realmente necessário</strong>
        <div class="linha">
          <span>${ic(contato.ic)} ${contato.titulo}: <span class="valor">${esc(valor)}</span></span>
          <a class="btn btn-outline btn-sm" href="${esc(link)}" target="_blank" rel="noopener">Abrir ${contato.titulo}</a>
        </div>
      </div>` : ''}
    ${l ? `<div class="lembranca">${Helpy.avatar('feliz')}<div>${textoLembranca(l)}</div></div>` : ''}
    <div class="modal-acoes">
      <button type="button" class="btn btn-ghost" data-fechar>Fechar</button>
      ${c.status === 'Aguardando' ? `<button type="button" class="btn btn-primary" data-assumir="${c.numero}">Assumir este ticket →</button>` : ''}
      ${c.status === 'Em atendimento' && c.analista === usuario.nome ? `<button type="button" class="btn btn-primary" data-carimbar="${c.numero}"><i class="ic ic-carimbo" aria-hidden="true"></i> Carimbar</button>` : ''}
    </div>`;
  modalNota.showModal();
}

modalNota.addEventListener('click', (e) => {
  if (e.target === modalNota || e.target.closest('[data-fechar]')) modalNota.close();
  const assumirBotao = e.target.closest('[data-assumir]');
  if (assumirBotao) {
    modalNota.close();
    const numero = assumirBotao.dataset.assumir;
    assumir(numero, elEntrada.querySelector(`[data-numero="${numero}"]`));
  }
  const carimbarBotao = e.target.closest('[data-carimbar]');
  if (carimbarBotao) {
    modalNota.close();
    abrirCarimbo(carimbarBotao.dataset.carimbar);
  }
});

function abrirCarimbo(numero) {
  const c = buscar(numero);
  if (!c) return;
  chamadoEmCarimbo = c;
  const l = lembranca(c);
  const agora = new Date().toLocaleDateString('pt-BR');
  document.getElementById('carimboTicket').innerHTML = `
    <ul class="lista-tickets">${ticketMesa(c, { comAcoes: false })}</ul>
    <div class="carimbo-tinta"><big>Resolvido</big><small>${esc(usuario.nome)} · ${agora}</small></div>
    ${l ? `<button type="button" class="btn btn-ghost btn-sm" id="usarNotaAnterior"><i class="ic ic-lampada" aria-hidden="true"></i> Usar a nota anterior: “${esc(l.chamado.resolucao.slice(0, 60))}${l.chamado.resolucao.length > 60 ? '…' : ''}”</button>` : ''}`;
  document.getElementById('carimboTicket').classList.remove('carimbado');
  const area = document.getElementById('notaResolucao');
  area.value = '';
  document.getElementById('erroCarimbo').hidden = true;
  document.getElementById('botaoCarimbar').disabled = false;
  document.getElementById('usarNotaAnterior')?.addEventListener('click', () => { area.value = l.chamado.resolucao; area.focus(); });
  modalCarimbo.showModal();
  setTimeout(() => area.focus(), 100);
}

document.getElementById('botaoCarimbar').addEventListener('click', async () => {
  const c = chamadoEmCarimbo;
  const nota = document.getElementById('notaResolucao').value.trim();
  const erro = document.getElementById('erroCarimbo');
  if (nota.length < 10) {
    erro.textContent = 'Escreva a nota de resolução (mínimo de 10 caracteres). Ela ajuda o próximo analista!';
    erro.hidden = false;
    return;
  }
  const botao = document.getElementById('botaoCarimbar');
  botao.disabled = true;
  const { ok, dados } = await API.resolver(c.numero, nota);
  if (!ok) {
    erro.textContent = dados.erro || 'Não foi possível finalizar.';
    erro.hidden = false;
    botao.disabled = false;
    return;
  }

  // Bate o carimbo!
  document.getElementById('carimboTicket').classList.add('carimbado');
  setTimeout(() => { modalCarimbo.classList.add('tela-tremendo'); }, 260);
  setTimeout(async () => {
    modalCarimbo.classList.remove('tela-tremendo');
    modalCarimbo.close();
    const cartao = elMesa.querySelector(`[data-numero="${c.numero}"]`);
    if (cartao) {
      cartao.style.visibility = 'hidden';
      await Efeitos.voar(cartao, elArquivo, { duracao: 800, escalaFinal: .1 });
    }
    elArquivo.classList.remove('engoliu');
    void elArquivo.offsetWidth;
    elArquivo.classList.add('engoliu');
    Efeitos.confete(elArquivo, 50);
    await carregar(true);
    comemorar();
  }, 1100);
});

function comemorar() {
  const hoje = Number(document.getElementById('placarHoje').dataset.valor || 0);
  if (hoje === meta) {
    Efeitos.confete(null, 160);
    Efeitos.toast(`<strong>Meta do dia batida!</strong> ${hoje} tickets resolvidos. <i class="ic ic-trofeu" aria-hidden="true"></i>`, { icone: '<i class="ic ic-trofeu" aria-hidden="true"></i>', tipo: 'sucesso', duracao: 6000 });
    falar(`<i class="ic ic-trofeu" aria-hidden="true"></i> <strong>META BATIDA, ${esc(primeiroNome().toUpperCase())}!</strong> ${hoje} tickets carimbados hoje. Você é fera!`, { humor: 'comemorando', tipo: 'sucesso' });
  } else {
    const faltam = meta - hoje;
    falar(`${sortear(ELOGIOS)}${faltam > 0 ? `<br><small>Faltam ${faltam} para a meta do dia.</small>` : ''}`, { humor: 'comemorando', tipo: 'sucesso' });
  }
}

// ---------- Cliques nos tickets ----------
document.querySelector('.mesa').addEventListener('click', (e) => {
  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  const numero = botao.dataset.numero;
  if (botao.dataset.acao === 'nota') abrirNota(numero);
  if (botao.dataset.acao === 'assumir') { botao.disabled = true; assumir(numero, botao.closest('li')); }
  if (botao.dataset.acao === 'carimbar') abrirCarimbo(numero);
  if (botao.dataset.acao === 'mensagem') falarComColaborador(numero);
});

/** Abre o HelpIA Chat com o colaborador do ticket, já com o ticket anexado. */
function falarComColaborador(numero) {
  const c = buscar(numero);
  if (!c?.solicitante_id) return;
  const q = new URLSearchParams({ com: c.solicitante_id, ticket: c.numero, texto: `Oi ${c.solicitante.split(' ')[0]}! Sobre o seu ticket ${c.codigo}: ` });
  location.href = `conversas.html?${q}`;
}

// ---------- Arrastar da bandeja para a mesa (o ticket acompanha o cursor, balançando) ----------
Arrastar.ligar(elEntrada, {
  item: '.tkp-item',
  ignorar: 'input, label, a, button',
  aoMover({ alvo }) {
    arrastando = true;
    elTampo.classList.toggle('alvo', !!alvo?.closest('#tampo'));
  },
  async aoSoltar({ el, alvo }) {
    elTampo.classList.remove('alvo');
    if (!alvo?.closest('#tampo')) return null;                 // soltou fora da mesa: volta para a bandeja
    arrastando = false;
    await assumir(el.dataset.numero, null);
    return elMesa.querySelector(`[data-numero="${el.dataset.numero}"]`);
  },
  aoTerminar() { arrastando = false; elTampo.classList.remove('alvo'); },
});

// ---------- Bandeja retrátil (começa recolhida, para a mesa ficar em destaque) ----------
const elAlca = document.getElementById('alcaBandeja');
function alternarBandeja(abrir = !document.body.classList.contains('coluna-aberta')) {
  document.body.classList.toggle('coluna-aberta', abrir);
  elAlca.setAttribute('aria-expanded', String(abrir));
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-alternar-coluna]')) alternarBandeja(); });

// ---------- Meta do dia, regra do dia e mensagens: definidas pelo gestor (tela de Metas) ----------
let muralGestor = null;
document.getElementById('placarMeta').addEventListener('click', () => { location.href = 'metas.html'; });
async function carregarMetas() {
  try {
    const { ok, dados } = await API.metas();
    if (!ok) return;
    muralGestor = dados;
    if (dados.minha_meta && dados.minha_meta !== meta) { meta = dados.minha_meta; carregar(true); }
  } catch { /* sem conexão: segue com a meta que já tinha */ }
}

// ---------- Arquivo ----------
function renderizarArquivo() {
  const termo = document.getElementById('buscaArquivo').value.trim().toLowerCase();
  const lista = todos
    .filter((c) => c.status === 'Resolvido')
    .sort((a, b) => (b.resolvido_em || '').localeCompare(a.resolvido_em || ''))
    .filter((c) => !termo || [c.codigo, c.solicitante, c.maquina, c.descricao, c.nota, c.resolucao, c.analista]
      .some((v) => String(v || '').toLowerCase().includes(termo)));
  document.getElementById('listaArquivo').innerHTML = lista.length ? lista.map((c) => `
    <li class="arquivado">
      <div class="arquivado-topo"><strong>${esc(c.codigo)} · ${esc(c.descricao)}</strong><span>${c.resolvido_em ? quando(c.resolvido_em) : ''}</span></div>
      <p><i class="ic ic-usuario" aria-hidden="true"></i> ${esc(c.solicitante)}${c.maquina ? ` · <i class="ic ic-etiqueta" aria-hidden="true"></i> ${esc(c.maquina)}` : ''} · <i class="ic ic-ferramenta" aria-hidden="true"></i> ${esc(c.analista || '—')}</p>
      ${c.resolucao ? `<blockquote>${esc(c.resolucao)}</blockquote>` : ''}
      <span class="mini-carimbo">RESOLVIDO</span>
    </li>`).join('') : '<li class="mesa-vazia">Nada encontrado no arquivo.</li>';
}

function abrirArquivo() {
  renderizarArquivo();
  elGaveta.classList.add('aberta');
  elGaveta.setAttribute('aria-hidden', 'false');
  elGavetaFundo.hidden = false;
  document.getElementById('buscaArquivo').focus();
}
function fecharArquivo() {
  elGaveta.classList.remove('aberta');
  elGaveta.setAttribute('aria-hidden', 'true');
  elGavetaFundo.hidden = true;
}
elArquivo.addEventListener('click', abrirArquivo);
document.getElementById('fecharArquivo').addEventListener('click', fecharArquivo);
elGavetaFundo.addEventListener('click', fecharArquivo);
document.getElementById('buscaArquivo').addEventListener('input', renderizarArquivo);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharArquivo(); });

// ---------- Início ----------
if (usuario) {
  Sessao.montarMenu(usuario);
  carregarMetas().finally(() => carregar(true));
  setInterval(carregarMetas, 30000);
  setInterval(carregar, 3000);
  setInterval(() => {
    if (Date.now() - ultimaFala > 70000 && !document.hidden) {
      const doGestor = (muralGestor?.motivacionais || []).map((m) => `${ic('brilho')} ${esc(m.texto)}`);
      falar(sortear([...DICAS_OCIOSAS, ...doGestor, ...doGestor]), { humor: 'feliz' });
    }
  }, 15000);
}
