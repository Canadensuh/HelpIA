/* =========================================================
   chat.js — mesa do colaborador
   Mesmo layout da mesa do analista:
   - esquerda: chamados resolvidos;
   - centro (desktop): chamados pendentes. Ao abrir um chamado,
     todo o passo a passo acontece aqui dentro;
   - direita: Helpy com o café, falando por balão sobre a cabeça.
   Não é um chat livre: são perguntas e respostas pré-prontas.
   Fluxo: Tipo (gênero) → Detalhe (subgênero) → Situação (impacto
   e máquina) → Nota → Revisão → Ticket impresso e entregue ao Helpy.
   (O contato agora é pelo HelpIA Chat: não perguntamos mais.)
   ========================================================= */

const usuario = Sessao.exigir(['colaborador']);

const elPalco = document.getElementById('palco');
const elPassos = document.getElementById('passos');
const elOffline = document.getElementById('avisoOffline');
const elTitulo = document.getElementById('tituloTampo');
const elAcao = document.getElementById('desktopAcao');
const elListaResolvidos = document.getElementById('listaResolvidos');
const elContadorResolvidos = document.getElementById('contadorResolvidos');
const elPlacar = {
  fila: document.getElementById('placarFila'),
  atendimento: document.getElementById('placarAtendimento'),
  resolvidos: document.getElementById('placarResolvidos'),
};

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });

let meus = [];            // chamados do colaborador, mais novo primeiro
let assinatura = null;    // evita redesenhar a mesa se nada mudou
let destaque = null;      // número do ticket que acabou de chegar na mesa
let visto = null;         // número do ticket aberto no centro (etapa "ver")
const selecionados = new Set();   // tickets da mesa marcados na caixinha (para excluir com o X)
const marcadosHist = new Set();   // tickets do histórico marcados (para remover do histórico)
let excluindo = null;     // tickets esperando confirmação no modal

const PASSOS = [
  { id: 'genero', rotulo: 'Tipo' },
  { id: 'sub', rotulo: 'Detalhe' },
  { id: 'situacao', rotulo: 'Situação' },
  { id: 'nota', rotulo: 'Nota' },
  { id: 'revisao', rotulo: 'Revisão' },
];
const MIN_NOTA = 15;

let estado = novoEstado();
let etapaAtual = null;
const statusConhecidos = {};

function novoEstado() {
  return {
    genero: null, sub: null, impacto: null, maquina: '', nota: '',
    contato: { tipo: 'whatsapp', valor: '' },
  };
}

const esc = (texto) => escaparHtml(String(texto ?? ''));
const primeiroNome = () => (usuario?.nome || '').split(' ')[0];

/** Etapa "Situação" só aparece se houver o que perguntar. */
function precisaSituacao() {
  return !(estado.genero?.prioridade && !estado.genero?.pedeMaquina);
}
function passosVisiveis() {
  return PASSOS.filter((p) => p.id !== 'situacao' || precisaSituacao());
}

// ---------- Cabeçalho do desktop (título, etapas e botão) ----------
const pendentes = () => meus.filter((c) => c.status !== 'Resolvido');

const tecla = (classe, atributos, html) => `<button type="button" class="btn ${classe}" ${atributos}>${html}</button>`;

/**
 * Barra de botões 3D no topo da mesa. Não há botões soltos embaixo das telas:
 * esquerda = voltar um passo · direita = cancelar e avançar.
 */
function botoesDaEtapa() {
  const esq = [];
  const dir = [];
  const voltar = (rotulo = '← Voltar') => tecla('btn-voltar', 'data-voltar', rotulo);
  // Cancelar: sempre no canto superior direito, em tecla rosada (Continuar fica à direita dele)
  const cancelar = tecla('key--rosa', 'data-cancelar', `${ic('x')} Cancelar`);
  switch (etapaAtual) {
    case 'mesa': {
      if (!pendentes().length) break;     // mesa vazia: o botão vai para o centro (preencherMesa)
      const n = selecionados.size;
      esq.push('<span data-vaga-busca></span>');
      dir.push(
        tecla('btn-primary', 'data-abrir', `${ic('mais')} Abrir chamado`),
        tecla(`key--red btn-excluir-marcados ${n ? 'com-marcados' : ''}`,
          `data-excluir-marcados aria-label="${n ? `Excluir ${n} ticket${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''}` : 'Excluir tickets marcados'}"
           title="${n ? 'Excluir os tickets marcados' : 'Marque a caixinha de um ticket para excluir'}"`,
          `${ic('x')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`),
      );
      break;
    }
    case 'ver': {
      const c = chamadoVisto();
      esq.push(tecla('btn-voltar', 'data-fechar-ver', '← Voltar para a mesa'));
      if (c && podeExcluir(c)) dir.push(tecla('key--red', `data-excluir="${c.numero}"`, `${ic('x')} Excluir ticket`));
      if (c?.status === 'Resolvido') dir.push(tecla('key--red', `data-remover-hist="${c.numero}"`, `${ic('x')} Remover do histórico`));
      break;
    }
    case 'genero':
      dir.push(cancelar);
      break;
    case 'sub':
      esq.push(voltar());
      dir.push(cancelar);
      break;
    case 'situacao': {
      const falta = !estado.genero.prioridade && !estado.impacto;
      esq.push(voltar());
      dir.push(cancelar, tecla('btn-primary', `data-avancar ${falta ? 'disabled' : ''}`, 'Continuar →'));
      break;
    }
    case 'nota':
      esq.push(voltar());
      dir.push(cancelar, tecla('btn-primary', 'data-avancar', 'Revisar ticket →'));
      break;
    case 'revisao':
      esq.push(voltar('← Ajustar'));
      dir.push(cancelar, tecla('btn-primary', 'id="gerarTicket" data-gerar', `${ic('ticket')} Gerar ticket`));
      break;
    case 'fim':
      dir.push(tecla('', 'data-cancelar', `${ic('x')} Fechar`));
      break;
    default:
      break;
  }
  if (!esq.length && !dir.length) return '';
  return `<div class="acao-lado">${esq.join('')}</div><div class="acao-lado acao-dir">${dir.join('')}</div>`;
}

// ---------- Histórico retrátil ----------
// Começa recolhido (só a alça). Enquanto um chamado está sendo aberto
// (passo a passo, impressão e "resolvido sem ticket"), ele some de vez.
function atualizarHistoricoVisivel() {
  document.body.classList.toggle('abrindo-chamado', !['mesa', 'ver'].includes(etapaAtual));
}
function alternarHistorico(abrir = !document.body.classList.contains('coluna-aberta')) {
  document.body.classList.toggle('coluna-aberta', abrir);
  document.querySelectorAll('.coluna-alca').forEach((b) => b.setAttribute('aria-expanded', String(abrir)));
  if (abrir) setTimeout(() => document.querySelector('.btn-recolher')?.focus({ preventScroll: true }), 50);
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-alternar-coluna]')) alternarHistorico(); });

function renderizarCabecalho() {
  atualizarHistoricoVisivel();
  const abertos = pendentes().length;
  if (etapaAtual === 'mesa') {
    elTitulo.innerHTML = `${ic('pastas')} Minha mesa <span class="contador" id="contadorPendentes">${abertos}</span>`;
  } else if (etapaAtual === 'ver') {
    elTitulo.innerHTML = `${ic('olho')} Ticket ${esc(chamadoVisto()?.codigo || '')}`;
  } else {
    elTitulo.innerHTML = `${ic('ticket')} Novo chamado`;
  }
  const digitando = document.activeElement === elInputBusca;
  const cursor = digitando ? elInputBusca.selectionStart : null;
  elAcao.innerHTML = botoesDaEtapa();
  const vaga = elAcao.querySelector('[data-vaga-busca]');
  if (vaga) {
    vaga.replaceWith(elBuscaMesa);
    if (digitando) { elInputBusca.focus(); elInputBusca.setSelectionRange(cursor, cursor); }
  }

  const visiveis = passosVisiveis();
  const indice = visiveis.findIndex((p) => p.id === etapaAtual);
  elPassos.hidden = indice < 0;
  elPassos.innerHTML = indice < 0 ? '' : visiveis.map((p, i) => {
    const classe = i < indice ? 'feito' : i === indice ? 'atual' : '';
    return `<li class="passo-topo ${classe}">
      <button type="button" data-ir="${p.id}" ${i < indice ? '' : 'disabled'}>
        <span class="passo-bolinha">${i < indice ? '<i class="ic ic-check" aria-hidden="true"></i>' : i + 1}</span><span class="passo-rotulo">${p.rotulo}</span>
      </button></li>`;
  }).join('');
}

elPassos.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-ir]');
  if (botao && !botao.disabled) irPara(botao.dataset.ir, 'esq');
});

// Botões que aparecem em vários lugares (barra da mesa, mesa vazia, tickets, histórico, Helpy)
document.addEventListener('click', (e) => {
  const alvo = (seletor) => e.target.closest(seletor);
  if (alvo('[data-abrir]')) iniciarChamado();
  else if (alvo('[data-cancelar]')) cancelarChamado();
  else if (alvo('[data-voltar]')) irPara(anteriorA(etapaAtual), 'esq');
  else if (alvo('[data-avancar]')) avancarDe(etapaAtual);
  else if (alvo('[data-gerar]')) gerarTicket();
  else if (alvo('[data-excluir-marcados]')) pedirExclusao([...selecionados], 'fila');
  else if (alvo('[data-excluir]')) pedirExclusao([Number(alvo('[data-excluir]').dataset.excluir)], 'fila');
  else if (alvo('[data-excluir-hist]')) pedirExclusao([...marcadosHist], 'historico');
  else if (alvo('[data-remover-hist]')) pedirExclusao([Number(alvo('[data-remover-hist]').dataset.removerHist)], 'historico');
  else if (alvo('[data-info-maquina]')) explicarMaquina();
  else if (alvo('[data-fechar-ver]')) fecharTicket();
  else if (alvo('[data-ver]')) verTicket(Number(alvo('[data-ver]').dataset.ver));
});

// Caixinha de seleção no canto do ticket (mesa ou histórico)
document.addEventListener('change', (e) => {
  const caixa = e.target.closest('[data-marcar]');
  if (!caixa) return;
  const numero = Number(caixa.dataset.marcar);
  const doHistorico = caixa.dataset.lista === 'hist';
  const conjunto = doHistorico ? marcadosHist : selecionados;
  if (caixa.checked) conjunto.add(numero); else conjunto.delete(numero);
  caixa.closest('.tkp-item')?.classList.toggle('marcado', caixa.checked);
  if (doHistorico) atualizarBotaoHistorico(); else renderizarCabecalho();
});

function iniciarChamado() {
  estado = novoEstado();
  irPara('genero');
}

// ---------- Rever um ticket no centro ----------
const chamadoVisto = () => meus.find((c) => c.numero === visto) || null;

function verTicket(numero) {
  if (etapaAtual === 'envio') return;
  if (PASSOS.some((p) => p.id === etapaAtual)) {          // tem rascunho aberto
    helpy.dizer('Você está no meio de um chamado novo. Quer deixar o rascunho de lado para ver esse ticket?', {
      acoes: [
        { rotulo: 'Ver o ticket', fn: () => { estado = novoEstado(); abrirTicket(numero); } },
        { rotulo: 'Continuar o chamado', destaque: true, fn: () => {} },
      ],
    });
    return;
  }
  abrirTicket(numero);
}

function abrirTicket(numero) {
  visto = numero;
  irPara('ver', 'dir');
}

function fecharTicket() {
  irPara('mesa', 'esq', { falar: false });
}

/** Marca no histórico/mesa qual ticket está aberto no centro. */
function marcarVisto() {
  document.querySelectorAll('.tkp-item[data-numero]').forEach((li) => {
    li.classList.toggle('selecionado', Number(li.dataset.numero) === visto);
  });
}

// ---------- Excluir (mesa) e remover do histórico: caixinha + X ----------
const elModalExcluir = document.getElementById('modalExcluir');
const elErroExcluir = document.getElementById('erroExcluir');
const elConfirmarExcluir = document.getElementById('confirmarExcluir');
const elBotaoHist = document.getElementById('excluirHist');
const podeExcluir = (c) => c.status === 'Aguardando';

const MODOS_EXCLUSAO = {
  fila: {
    pode: podeExcluir,
    titulo: (n) => (n > 1 ? `Excluir ${n} tickets?` : 'Excluir este ticket?'),
    botao: (n) => (n > 1 ? `Excluir ${n} tickets` : 'Excluir ticket'),
    aviso: 'Ele sai da fila e o analista não vai mais vê-lo. Essa ação não pode ser desfeita.',
    chamar: (numero) => API.excluir(numero),
    lista: '#listaPendentes',
    feito: (codigos, plural) => `${plural ? 'Tickets' : 'Ticket'} ${codigos} excluído${plural ? 's' : ''}`,
    fala: (codigos, plural) => `Pronto, joguei ${plural ? 'os tickets' : 'o ticket'} <strong>${codigos}</strong> fora. Se o problema voltar, é só abrir outro.`,
    vazio: () => (pendentes().some(podeExcluir)
      ? 'Marque a <strong>caixinha</strong> no canto do ticket que você quer apagar e depois clique no <strong>X</strong>.'
      : 'Seus tickets já estão com um analista, então não dá mais para excluir. Se o problema sumiu, avise o analista que está cuidando.'),
  },
  historico: {
    pode: (c) => c.status === 'Resolvido',
    titulo: (n) => (n > 1 ? `Remover ${n} tickets do histórico?` : 'Remover do histórico?'),
    botao: (n) => (n > 1 ? `Remover ${n} tickets` : 'Remover do histórico'),
    aviso: 'Eles somem só do seu histórico. A equipe de TI continua com o registro do atendimento.',
    chamar: (numero) => API.removerDoHistorico(numero),
    lista: '#listaResolvidos',
    feito: (codigos, plural) => `${plural ? 'Tickets' : 'Ticket'} ${codigos} removido${plural ? 's' : ''} do histórico`,
    fala: (codigos, plural) => `Tirei ${plural ? 'os tickets' : 'o ticket'} <strong>${codigos}</strong> do seu histórico. <i class="ic ic-sorriso" aria-hidden="true"></i>`,
    vazio: () => 'Marque a <strong>caixinha</strong> dos tickets do histórico que você quer remover e clique no <strong>X</strong> ao lado de “Histórico”.',
  },
};

function atualizarBotaoHistorico() {
  const n = marcadosHist.size;
  elBotaoHist.classList.toggle('com-marcados', n > 0);
  elBotaoHist.innerHTML = `${ic('x')}${n ? `<span class="excluir-qtd">${n}</span>` : ''}`;
  elBotaoHist.setAttribute('aria-label', n ? `Remover ${n} ticket${n > 1 ? 's' : ''} do histórico` : 'Remover tickets marcados do histórico');
  elBotaoHist.title = n ? 'Remover os tickets marcados do histórico' : 'Marque a caixinha de um ticket do histórico para remover';
}

function pedirExclusao(numeros, modo) {
  const regra = MODOS_EXCLUSAO[modo];
  const lista = numeros.map((n) => meus.find((c) => c.numero === n)).filter((c) => c && regra.pode(c));
  if (!lista.length) {
    helpy.dizer(regra.vazio(), { humor: 'pensando' });
    return;
  }
  excluindo = { lista, modo };
  elModalExcluir.querySelector('h2').textContent = regra.titulo(lista.length);
  document.getElementById('excluirAviso').textContent = regra.aviso;
  elConfirmarExcluir.innerHTML = `${ic('x')} ${regra.botao(lista.length)}`;
  document.getElementById('excluirTicket').innerHTML =
    `<ul class="lista-tickets excluir-previa">${lista.map((c) => ticketPadrao(c, { estatico: true, historico: modo === 'historico' })).join('')}</ul>`;
  elErroExcluir.hidden = true;
  elConfirmarExcluir.disabled = false;
  elModalExcluir.showModal();
}

elModalExcluir.addEventListener('close', () => { excluindo = null; });

elConfirmarExcluir.addEventListener('click', async () => {
  if (!excluindo) return;
  const { lista, modo } = excluindo;
  const regra = MODOS_EXCLUSAO[modo];
  elConfirmarExcluir.disabled = true;
  const feitos = [];
  for (const c of lista) {
    let resposta;
    try {
      resposta = await regra.chamar(c.numero);
    } catch {
      mostrarOffline(elOffline);
      break;
    }
    if (!resposta.ok) {
      elErroExcluir.textContent = `${c.codigo}: ${resposta.dados.erro || 'não foi possível concluir.'}`;
      elErroExcluir.hidden = false;
      break;
    }
    feitos.push(c);
  }
  if (!feitos.length) { elConfirmarExcluir.disabled = false; return; }
  if (feitos.length === lista.length) elModalExcluir.close();

  // Os tickets "amassam" e somem
  feitos.forEach((c) => document.querySelector(`${regra.lista} .tkp-item[data-numero="${c.numero}"]`)?.classList.add('saindo'));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise((r) => setTimeout(r, 420));
  feitos.forEach((c) => { delete statusConhecidos[c.numero]; selecionados.delete(c.numero); marcadosHist.delete(c.numero); });
  await atualizarMeus();
  if (etapaAtual === 'ver' && feitos.some((c) => c.numero === visto)) fecharTicket();
  renderizarCabecalho();
  atualizarBotaoHistorico();
  const codigos = feitos.map((c) => esc(c.codigo)).join(', ');
  const plural = feitos.length > 1;
  Efeitos.toast(regra.feito(codigos, plural), { icone: ic('x') });
  helpy.dizer(regra.fala(codigos, plural), { humor: 'feliz' });
});

// ---------- Escritório do Helpy: foco nas dicas e configurações (js/escritorio.js) ----------
const escritorio = Escritorio.montar();
const focarNoHelpy = (duracao) => escritorio.focar(duracao);

function cancelarChamado() {
  const estavaAbrindo = PASSOS.some((p) => p.id === etapaAtual);
  estado = novoEstado();
  irPara('mesa', 'esq', { falar: !estavaAbrindo });
  if (estavaAbrindo) helpy.dizer('Tudo bem, deixei o rascunho de lado. Se precisar, é só abrir de novo. <i class="ic ic-sorriso" aria-hidden="true"></i>');
}

// ---------- Troca de etapa com animação ----------
const RENDER = {
  mesa: telaMesa,
  genero: telaGenero,
  sub: telaSub,
  situacao: telaSituacao,
  nota: telaNota,
  revisao: telaRevisao,
  ver: telaVer,
};

function irPara(etapa, direcao = 'dir', { falar = true } = {}) {
  helpy.calar();                       // o que o Helpy ia dizer da tela anterior não vale mais
  if (etapa !== 'ver') visto = null;
  marcarVisto();
  const anterior = elPalco.querySelector('.etapa-tela');
  const mostrar = () => {
    etapaAtual = etapa;
    elPalco.innerHTML = `<section class="etapa-tela etapa-${etapa} entra-${direcao}">${RENDER[etapa]()}</section>`;
    elPalco.scrollTop = 0;
    alinharPicotes();
    renderizarCabecalho();
    ligarEventos(etapa);
    if (falar) falarSobre(etapa);
  };
  if (anterior && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    anterior.classList.add('sai');
    setTimeout(mostrar, 180);
  } else {
    mostrar();
  }
}

function proximaDepois(etapa) {
  const visiveis = passosVisiveis().map((p) => p.id);
  return visiveis[visiveis.indexOf(etapa) + 1];
}
function anteriorA(etapa) {
  const visiveis = passosVisiveis().map((p) => p.id);
  return visiveis[visiveis.indexOf(etapa) - 1];
}

// ---------- Ticket padrão ----------
// Todo ticket do colaborador tem o mesmo tamanho (mesa, histórico, modal).
// Só a FAIXA DO TOPO muda de cor, conforme a prioridade:
// verde = baixa · azul = normal · amarelo = média · vermelho = alta (pisca).
const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const dataHoraBr = (iso) => (iso ? `${dataBr(iso)} às ${formatarHora(iso)}` : '—');

function seloPrioridade(nivel) {
  return `<span class="tkp-pri">${nivel.id === 'alta' ? ic('chama') : ''}${nivel.rotulo}</span>`;
}

function carimboResolvido(c, grande = false) {
  const quem = c.analista || 'Analista';
  return `
    <div class="carimbo-resolvido ${grande ? 'grande' : ''}" role="img" aria-label="Resolvido por ${esc(quem)} em ${dataBr(c.resolvido_em)}">
      <b>Resolvido</b><span>${esc(quem)}</span><small>${dataBr(c.resolvido_em)}</small>
    </div>`;
}

/**
 * historico: mostra o carimbo do analista em vez do status.
 * estatico: só a figura (sem clique e sem caixinha), usado no modal de exclusão.
 * Na mesa, cada ticket tem uma caixinha no canto superior esquerdo:
 * marque e clique no X (ao lado de "Abrir chamado") para excluir.
 */
function ticketPadrao(c, { i = 0, historico = false, estatico = false } = {}) {
  const nivel = Catalogo.nivel(c);
  const exclui = podeExcluir(c);
  const comCaixa = !estatico;
  const marcado = comCaixa && (historico ? marcadosHist : selecionados).has(c.numero);
  const giro = historico || estatico ? 0 : ((c.numero * 37) % 5 - 2) * .6;   // "jogado" na mesa
  const rotulo = `Ticket ${c.codigo}: ${c.genero_titulo || c.categoria}, prioridade ${nivel.rotulo}, ${c.status}`;
  const classes = [
    'tkp-item',
    comCaixa ? 'com-caixa' : '',
    marcado ? 'marcado' : '',
    c.numero === destaque ? 'chegando' : '',
    c.numero === visto ? 'selecionado' : '',
  ].join(' ');
  const acao = historico ? 'remover do histórico' : 'excluir';
  const caixa = !comCaixa ? '' : (exclui || historico)
    ? `<label class="tkp-caixa" title="Marcar para ${acao}">
         <input type="checkbox" data-marcar="${c.numero}" ${historico ? 'data-lista="hist"' : ''} ${marcado ? 'checked' : ''} aria-label="Marcar ticket ${esc(c.codigo)} para ${acao}" />
         <span aria-hidden="true">${ic('check')}</span>
       </label>`
    : `<span class="tkp-caixa travada" title="Já está em atendimento: não dá para excluir" aria-label="Ticket ${esc(c.codigo)} em atendimento, não pode ser excluído">${ic('cadeado')}</span>`;
  return `
    <li class="${classes}" style="--i:${i}; --giro:${giro}deg" data-numero="${c.numero}">
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
            ${historico ? `
              <span>${ic('relogio')} Aberto ${Efeitos.dataCurta(c.aberto_em)}</span>
              <span>${ic('pasta')} ${esc(c.fila)}</span>` : `
              <span><span class="tag ${classeStatus(c.status)}">${esc(c.status)}</span> ${Efeitos.tempoDesde(c.aberto_em)}</span>
              <span>${c.analista ? `${ic('usuario')} <b>${esc(c.analista)}</b> está cuidando` : `${ic('relogio')} Esperando um analista`}</span>`}
          </footer>
          ${historico ? carimboResolvido(c) : ''}
        </article>
        ${estatico ? '' : `<button type="button" class="tkp-abrir" data-ver="${c.numero}" aria-label="${esc(rotulo)}. Abrir no centro"></button>`}
        ${caixa}
      </div>
    </li>`;
}

// ---------- Telas ----------
/** Centro: os tickets em aberto "jogados" na mesa. */
function telaMesa() {
  return '<ul class="lista-tickets desktop-tickets mesa-grade" id="listaPendentes"></ul>';
}

// ---------- Grade da mesa: cada ticket fica preso a uma casa, e dá para trocar de lugar ----------
const CHAVE_POSICOES = `helpia-mesa-posicoes-${usuario?.id}`;
let posicoes = (() => { try { return JSON.parse(lerPreferencia(CHAVE_POSICOES, '{}')) || {}; } catch { return {}; } })();
let mesaPendente = false;        // chegou atualização enquanto um ticket estava sendo arrastado
const salvarPosicoes = () => salvarPreferencia(CHAVE_POSICOES, JSON.stringify(posicoes));

/** Quantas colunas e linhas cabem na mesa (sempre sobra pelo menos uma casa livre). */
function medirGrade(lista, quantidade) {
  const estilo = getComputedStyle(document.body);
  const larguraTicket = parseFloat(estilo.getPropertyValue('--tkp-w')) || 300;
  const alturaTicket = parseFloat(estilo.getPropertyValue('--tkp-h')) || 200;
  const largura = lista.clientWidth - 16;
  const colunas = Math.max(1, Math.floor((largura + 24) / (larguraTicket + 24)));
  const sobra = elPalco.getBoundingClientRect().bottom - lista.getBoundingClientRect().top - 24;
  const linhasQueCabem = Math.max(1, Math.floor((sobra + 27) / (alturaTicket + 27)));
  const linhas = Math.max(linhasQueCabem, Math.ceil((quantidade + 1) / colunas));
  return { colunas, total: colunas * linhas };
}

function preencherMesa() {
  const lista = document.getElementById('listaPendentes');
  if (!lista) return;
  if (Arrastar.ativo) { mesaPendente = true; return; }
  const abertos = pendentes();
  // Só continuam marcados os tickets que ainda podem ser excluídos
  for (const n of [...selecionados]) {
    if (!abertos.some((c) => c.numero === n && podeExcluir(c))) selecionados.delete(n);
  }
  lista.classList.toggle('vazia', !abertos.length);
  let grade = '';
  if (abertos.length) {
    const { colunas, total } = medirGrade(lista, abertos.length);
    // Cada ticket fica na casa salva; quem não tem casa (ou ficou fora da grade) vai para a primeira livre
    const usadas = new Set();
    const casa = {};
    abertos.forEach((c) => {
      const p = posicoes[c.numero];
      if (Number.isInteger(p) && p < total && !usadas.has(p)) { casa[c.numero] = p; usadas.add(p); }
    });
    abertos.forEach((c) => {
      if (casa[c.numero] != null) return;
      let i = 0;
      while (usadas.has(i)) i++;
      casa[c.numero] = i; usadas.add(i);
    });
    posicoes = { ...posicoes, ...casa };
    salvarPosicoes();
    const porCasa = Object.fromEntries(abertos.map((c) => [casa[c.numero], c]));
    lista.style.gridTemplateColumns = `repeat(${colunas}, var(--tkp-w))`;
    grade = Array.from({ length: total }, (_, i) => (porCasa[i]
      ? ticketPadrao(porCasa[i], { i }).replace('<li class="', `<li data-casa="${i}" class="`)
      : `<li class="casa-vazia" data-casa="${i}" aria-hidden="true"></li>`)).join('');
  } else {
    lista.style.gridTemplateColumns = '';
  }
  lista.innerHTML = abertos.length ? grade : `
    <li class="mesa-vazia mesa-vazia-centro">
      <span class="mesa-vazia-ico">${ic('sorriso')}</span>
      <strong>Você não tem nenhum ticket em aberto</strong>
      <span>Está tudo funcionando? Ótimo! Se algo der problema, é só abrir um chamado.</span>
      <button type="button" class="btn btn-primary btn-lg" data-abrir>${ic('mais')} Abrir chamado</button>
    </li>`;
  destaque = null;
  renderizarCabecalho();          // botões da mesa somem/voltam conforme a mesa
  filtrarMesa();
}

// Arrastar um ticket para outra casa da grade (se a casa estiver ocupada, os dois trocam de lugar)
Arrastar.ligar(elPalco, {
  item: '#listaPendentes .tkp-item',
  ignorar: 'input, label, a, .tkp-caixa, button:not(.tkp-abrir)',
  aoMover({ alvo }) {
    const casa = alvo?.closest('#listaPendentes [data-casa]');
    document.querySelectorAll('#listaPendentes .casa-alvo').forEach((el) => { if (el !== casa) el.classList.remove('casa-alvo'); });
    casa?.classList.add('casa-alvo');
  },
  aoSoltar({ el, alvo }) {
    const casa = alvo?.closest('#listaPendentes [data-casa]');
    if (!casa) return null;
    const numero = Number(el.dataset.numero);
    const de = posicoes[numero];
    const para = Number(casa.dataset.casa);
    if (de === para) return casa;
    const vizinho = Object.keys(posicoes).find((n) => Number(n) !== numero && posicoes[n] === para && pendentes().some((c) => c.numero === Number(n)));
    posicoes[numero] = para;
    if (vizinho) posicoes[vizinho] = de;
    salvarPosicoes();
    Arrastar.ativo = false;
    preencherMesa();
    const novo = document.querySelector(`#listaPendentes .tkp-item[data-numero="${numero}"]`);
    novo?.classList.add('arrasto-origem');
    if (vizinho) document.querySelector(`#listaPendentes .tkp-item[data-numero="${vizinho}"]`)?.classList.add('trocou');
    return novo;
  },
  aoTerminar() {
    document.querySelectorAll('#listaPendentes .arrasto-origem, #listaPendentes .casa-alvo').forEach((el) => el.classList.remove('arrasto-origem', 'casa-alvo'));
    if (mesaPendente) { mesaPendente = false; preencherMesa(); }
  },
});

let timerGrade = null;
addEventListener('resize', () => {
  clearTimeout(timerGrade);
  timerGrade = setTimeout(() => { if (etapaAtual === 'mesa') preencherMesa(); }, 150);
});

// ---------- Busca na mesa (tolerante a acento, caixa alta e erros de digitação) ----------
const elBuscaMesa = document.createElement('label');
elBuscaMesa.className = 'busca-campo busca-mesa';
elBuscaMesa.innerHTML = `${ic('olho')}<input class="input" id="buscaMesa" type="search" autocomplete="off"
  placeholder="Buscar por #ID, prioridade, analista ou problema…" aria-label="Buscar ticket na mesa" />
  <span class="busca-resultado" id="buscaResultado" hidden></span>`;
const elInputBusca = elBuscaMesa.querySelector('input');
elInputBusca.addEventListener('input', filtrarMesa);
elInputBusca.addEventListener('keydown', (e) => { if (e.key === 'Escape') { elInputBusca.value = ''; filtrarMesa(); } });

/** Não tira ninguém da grade: só apaga quem não combina com a busca. */
function filtrarMesa() {
  const termo = elInputBusca.value;
  const itens = [...document.querySelectorAll('#listaPendentes .tkp-item')];
  let achados = 0;
  itens.forEach((li) => {
    const c = meus.find((x) => x.numero === Number(li.dataset.numero));
    const combina = !termo.trim() || (c && Busca.ticket(c, termo));
    li.classList.toggle('apagado', !combina);
    li.classList.toggle('achado', !!termo.trim() && combina);
    if (combina) achados += 1;
  });
  const resultado = document.getElementById('buscaResultado');
  resultado.hidden = !termo.trim();
  resultado.textContent = achados ? `${achados} encontrado${achados > 1 ? 's' : ''}` : 'nada encontrado';
  resultado.classList.toggle('nada', !achados);
}

function preencherResolvidos() {
  const resolvidos = meus.filter((c) => c.status === 'Resolvido');
  for (const n of [...marcadosHist]) if (!resolvidos.some((c) => c.numero === n)) marcadosHist.delete(n);
  atualizarBotaoHistorico();
  elBotaoHist.hidden = !resolvidos.length;
  elContadorResolvidos.textContent = resolvidos.length;
  document.getElementById('contadorAlca').textContent = resolvidos.length;
  elListaResolvidos.innerHTML = resolvidos.length
    ? resolvidos.map((c, i) => ticketPadrao(c, { i, historico: true })).join('')
    : '<li class="vazio">Quando um analista resolver um ticket seu, ele fica guardado aqui com o carimbo.</li>';
}

/** Centro: um ticket aberto para rever (do histórico ou da mesa). */
function telaVer() {
  const c = chamadoVisto();
  if (!c) {
    return `<div class="sucesso"><h1>Ticket não encontrado</h1><p>Ele pode ter sido excluído.</p>
      <div class="sucesso-acoes"><button type="button" class="btn btn-primary" data-fechar-ver>Voltar para a mesa</button></div></div>`;
  }
  const resolvido = c.status === 'Resolvido';
  const contato = Catalogo.contatos.find((t) => t.id === c.contato?.tipo);
  const dados = [
    ['Fila', esc(c.fila)],
    ['Solicitante', esc(c.solicitante)],
    c.maquina ? ['Máquina', esc(c.maquina)] : null,
    c.contato ? [`Contato · ${contato?.titulo || c.contato.tipo}`, esc(c.contato.valor)] : null,
    ['Aberto em', dataHoraBr(c.aberto_em)],
    c.analista ? ['Analista', esc(c.analista)] : null,
    c.assumido_em ? ['Assumido em', dataHoraBr(c.assumido_em)] : null,
    resolvido ? ['Resolvido em', dataHoraBr(c.resolvido_em)] : null,
  ].filter(Boolean);
  return `
    ${ticketGrande({
      compacto: true,
      codigo: c.codigo,
      genero: c.genero,
      generoTitulo: c.genero_titulo || c.categoria,
      subTitulo: c.subgenero_titulo || c.descricao,
      nivel: Catalogo.nivel(c),
      dados,
      nota: c.nota,
      resolucao: c.resolucao,
      carimbo: resolvido ? carimboResolvido(c, true) : '',
    })}`;
}

function atualizarPlacar() {
  Efeitos.contarAte(elPlacar.fila, meus.filter((c) => c.status === 'Aguardando').length);
  Efeitos.contarAte(elPlacar.atendimento, meus.filter((c) => c.status === 'Em atendimento').length);
  Efeitos.contarAte(elPlacar.resolvidos, meus.filter((c) => c.status === 'Resolvido').length);
}

function telaGenero() {
  return `
    <div class="etapa-cabeca">
      <span class="saudacao"><span class="mao"><i class="ic ic-aceno" aria-hidden="true"></i></span> Olá, ${esc(primeiroNome())}!</span>
      <h1>Por que você está aqui <span class="acento">hoje</span>?</h1>
      <p>Escolha o que mais parece com o seu problema. A gente cuida do resto.</p>
    </div>
    <div class="generos">
      ${Catalogo.generos.map((g, i) => `
        <button type="button" class="cartao ${g.prioridade === 'Alta' ? 'cartao-urgente' : ''}" data-genero="${g.id}" style="--i:${i}">
          <span class="cartao-ico">${Catalogo.icone(g.id)}</span>
          <strong>${g.titulo}</strong>
          <span class="cartao-desc">${g.descricao}</span>
        </button>`).join('')}
    </div>`;
}

function migalha() {
  return `<div class="migalha"><span class="mini-ico">${Catalogo.icone(estado.genero.id)}</span>${esc(estado.genero.titulo)}</div>`;
}

function telaSub() {
  const g = estado.genero;
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>${esc(g.pergunta)}</h1>
      <p>Toque na opção que descreve melhor a situação.</p>
    </div>
    <div class="opcoes">
      ${g.subgeneros.map((s, i) => `
        <button type="button" class="opcao ${estado.sub?.id === s.id ? 'selecionada' : ''}" data-sub="${s.id}" style="--i:${i}">
          <span class="opcao-emoji">${ic(s.ic)}</span>
          <span><strong>${esc(s.titulo)}</strong>${s.dica ? '<small>O Helpy tem uma dica</small>' : ''}</span>
        </button>`).join('')}
    </div>`;
}

function telaSituacao() {
  const g = estado.genero;
  const perguntaImpacto = !g.prioridade;
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>${perguntaImpacto ? 'Quem está sendo afetado?' : 'Qual equipamento?'}</h1>
      <p>${esc(estado.sub.titulo)} · isso ajuda a definir a prioridade do seu ticket.</p>
    </div>
    ${perguntaImpacto ? `
      <div class="bloco">
        <div class="opcoes">
          ${Catalogo.impactos.map((imp, i) => `
            <button type="button" class="opcao ${estado.impacto === imp.id ? 'selecionada' : ''}" data-impacto="${imp.id}" style="--i:${i}">
              <span class="opcao-emoji">${ic(imp.ic)}</span>
              <span><strong>${imp.titulo}</strong><small>${imp.descricao}</small></span>
            </button>`).join('')}
        </div>
      </div>` : ''}
    ${g.pedeMaquina ? `
      <div class="bloco bloco-maquina">
        <button type="button" class="btn-info" data-info-maquina aria-label="Como encontro o número da máquina?" title="Como encontro o número da máquina?">i</button>
        <div class="bloco-titulo"><h2>${esc(g.rotuloMaquina || 'Número da máquina')}</h2><span>opcional, mas ajuda muito</span></div>
        <label class="campo campo-maquina">
          <span class="campo-ajuda">Está na etiqueta de patrimônio colada no equipamento (ex.: 043).</span>
          <input id="maquina" type="text" maxlength="30" value="${esc(estado.maquina)}" placeholder="Ex.: 043" autocomplete="off" />
        </label>
      </div>` : ''}
`;
}

function telaNota() {
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Conte com as suas palavras</h1>
      <p>A nota vai direto para o analista e fica salva no histórico do chamado.</p>
    </div>
    <div class="bloco bloco-nota">
      <div class="bloco-titulo"><h2>Nota para o analista</h2><span>obrigatória</span></div>
      <div class="nota-caixa campo">
        <textarea id="nota" maxlength="1000" placeholder="Ex.: Desde hoje cedo aparece um X no ícone de rede. Já reiniciei o computador e continua igual.">${esc(estado.nota)}</textarea>
        <div class="nota-medidor" id="notaMedidor"><div class="nota-barra"><span></span></div><span id="notaTexto"></span></div>
      </div>
    </div>
    <p class="aviso aviso-erro erro-etapa" id="erroNota" hidden></p>`;
}

/** Prioridade do rascunho, com a mesma regra usada nos tickets prontos. */
function nivelPrevisto() {
  return Catalogo.nivel({ genero: estado.genero.id, subgenero: estado.sub?.id, impacto: estado.impacto || 'eu' });
}

/**
 * Ticket grande (revisão, impressão e "rever ticket").
 * d.dados: lista de [rótulo, valor já escapado].
 */
function ticketGrande(d) {
  return `
    <div class="ticket-palco">
      <article class="card ticket tk ${d.compacto ? 'tk-compacto' : ''} pri-${d.nivel.id}">
        <header class="tk-faixa">
          <span class="tk-marca">Help<b>IA</b> · Ticket de suporte</span>
          ${seloPrioridade(d.nivel)}
        </header>
        <div class="tk-cabeca">
          <div class="tk-numero ${d.codigo ? '' : 'rascunho'}" data-numero>${d.codigo ? esc(d.codigo) : '#···'}</div>
          <div class="tk-tipo">
            <span class="mini-ico">${Catalogo.icone(d.genero)}</span>
            <div><strong>${esc(d.generoTitulo)}</strong><span>${esc(d.subTitulo)}</span></div>
          </div>
        </div>
        <span class="ticket-picote"></span>
        <dl class="tk-dados">${d.dados.map(([rotulo, valor]) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`).join('')}</dl>
        <div class="tk-textos">
          ${d.nota ? `<p class="tk-nota">“${esc(d.nota)}”</p>` : ''}
          ${d.resolucao ? `<div class="meu-resolucao tk-resolucao"><b>Solução do analista:</b> ${esc(d.resolucao)}</div>` : ''}
        </div>
        <div class="codigo-barras"></div>
        ${d.carimbo || ''}
      </article>
    </div>`;
}

/** O ticket do rascunho (usado na revisão e na impressão). */
function ticketHtml(numero = null) {
  const g = estado.genero;
  return ticketGrande({
    codigo: numero,
    genero: g.id,
    generoTitulo: g.titulo,
    subTitulo: estado.sub.titulo,
    nivel: nivelPrevisto(),
    dados: [
      ['Fila', esc(g.fila)],
      ['Solicitante', esc(usuario.nome)],
      estado.maquina ? ['Máquina', esc(estado.maquina)] : null,
    ].filter(Boolean),
    nota: estado.nota,
    carimbo: '<span class="tk-carimbo">ENVIADO</span>',
  });
}

/** O picote (recorte lateral) acompanha a linha tracejada, seja qual for a altura do conteúdo. */
function alinharPicotes(raiz = elPalco) {
  raiz.querySelectorAll('.tk').forEach((t) => {
    const picote = t.querySelector('.ticket-picote');
    if (picote) t.style.setProperty('--corte', `${picote.offsetTop + 1}px`);
  });
}
document.fonts?.ready.then(() => alinharPicotes());
addEventListener('resize', () => alinharPicotes());

function telaRevisao() {
  return `
    <div class="etapa-cabeca">
      <h1>Seu ticket está <span class="acento">pronto</span></h1>
      <p>Confira os dados. Ao gerar, ele vai direto para a mesa do analista da fila ${esc(estado.genero.fila)}.</p>
    </div>
    ${ticketHtml()}
    <p class="aviso aviso-erro erro-etapa" id="erroEnvio" hidden></p>`;
}

// ---------- Eventos de cada tela ----------
function ligarEventos(etapa) {
  if (etapa === 'mesa') { preencherMesa(); return; }

  elPalco.querySelectorAll('.cartao').forEach((cartao) => {
    cartao.addEventListener('pointerenter', () => cartao.classList.add('ativo-ico'));
    cartao.addEventListener('pointerleave', () => cartao.classList.remove('ativo-ico'));
    cartao.addEventListener('click', () => escolherGenero(cartao.dataset.genero, cartao));
  });

  elPalco.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => escolherSub(b.dataset.sub, b)));

  elPalco.querySelectorAll('[data-impacto]').forEach((b) => b.addEventListener('click', () => {
    estado.impacto = b.dataset.impacto;
    elPalco.querySelectorAll('[data-impacto]').forEach((o) => o.classList.toggle('selecionada', o === b));
    document.querySelector('[data-avancar]')?.removeAttribute('disabled');
    if (estado.impacto !== 'eu') {
      const nivel = nivelPrevisto();
      helpy.dizer(`Entendi, afeta mais gente. Seu ticket vai com prioridade <strong>${nivel.rotulo.toLowerCase()}</strong> ${nivel.id === 'alta' ? ic('chama') : ''}`, { tipo: 'alerta', humor: 'alerta', atraso: 350 });
    }
  }));

  const elMaquina = document.getElementById('maquina');
  if (elMaquina) elMaquina.addEventListener('input', () => { estado.maquina = elMaquina.value.trim(); });

  if (etapa === 'nota') ligarNota();
}

function ligarNota() {
  const elNota = document.getElementById('nota');
  const atualizarMedidor = () => {
    estado.nota = elNota.value;
    const tamanho = elNota.value.trim().length;
    const medidor = document.getElementById('notaMedidor');
    medidor.classList.toggle('ok', tamanho >= MIN_NOTA);
    medidor.querySelector('.nota-barra span').style.width = `${Math.min(100, (tamanho / MIN_NOTA) * 100)}%`;
    document.getElementById('notaTexto').innerHTML = tamanho >= MIN_NOTA
      ? '<i class="ic ic-check" aria-hidden="true"></i> Ótimo, o analista vai entender'
      : `Faltam ${MIN_NOTA - tamanho} caracteres`;
  };
  elNota.addEventListener('input', atualizarMedidor);
  atualizarMedidor();
  setTimeout(() => elNota.focus(), 350);
}

function avancarDe(etapa) {
  if (etapa === 'nota') {
    const erro = document.getElementById('erroNota');
    const problema = estado.nota.trim().length < MIN_NOTA
      ? `A nota precisa de pelo menos ${MIN_NOTA} caracteres. Conte o que aconteceu e desde quando.` : '';
    if (problema) {
      erro.textContent = problema;
      erro.hidden = false;
      helpy.dizer(problema, { tipo: 'alerta', humor: 'alerta', atraso: 300 });
      return;
    }
  }
  irPara(proximaDepois(etapa));
}

function escolherGenero(id, cartao) {
  const genero = Catalogo.genero(id);
  if (!genero) return;
  if (estado.genero?.id !== id) {
    estado = { ...novoEstado(), contato: estado.contato, nota: estado.nota };
    estado.genero = genero;
    if (genero.prioridade) estado.impacto = 'setor';
  }
  cartao?.classList.add('escolhido');
  setTimeout(() => irPara('sub'), cartao ? 260 : 0);
}

function escolherSub(id, botao) {
  estado.sub = estado.genero.subgeneros.find((s) => s.id === id);
  elPalco.querySelectorAll('[data-sub]').forEach((o) => o.classList.toggle('selecionada', o === botao));
  setTimeout(() => irPara(proximaDepois('sub')), 220);
}

// ---------- Helpy: falas pré-prontas por etapa ----------
function falarSobre(etapa) {
  const g = estado.genero;
  if (etapa === 'mesa') {
    const n = pendentes().length;
    helpy.dizer(n
      ? `<p>Oi, <strong>${esc(primeiroNome())}</strong>! Você tem <strong>${n} chamado${n > 1 ? 's' : ''}</strong> em andamento aqui na mesa.</p>
         <p>Eu fico de olho e te aviso assim que o analista agir. Para apagar um ticket, marque a <strong>caixinha</strong> dele e clique no <strong>X</strong>.</p>`
      : `<p>Oi, <strong>${esc(primeiroNome())}</strong>! Eu sou o <strong>Helpy</strong> <i class="ic ic-robo" aria-hidden="true"></i></p>
         <p>Sua mesa está limpinha. Se algo der problema, é só abrir um chamado.</p>`, {
      humor: 'acenando',
      acoes: [
        { rotulo: `${ic('mais')} Abrir chamado`, destaque: true, fn: iniciarChamado },
        { rotulo: `${ic('chat')} Tenho uma dúvida`, fn: perguntas },
      ],
    });
  }
  if (etapa === 'genero') {
    helpy.dizer(`<p>Escolha o cartão que mais parece com o seu problema e eu te guio até o ticket.</p>
      <p>Na dúvida entre dois, escolha o mais parecido: na nota você explica o resto.</p>`, {
      acoes: [
        { rotulo: '<i class="ic ic-duvida" aria-hidden="true"></i> Não achei minha opção', fn: () => atalho('nao-achei') },
        { rotulo: `${ic('chat')} Tenho outra dúvida`, fn: perguntas },
      ],
    });
  }
  if (etapa === 'sub') {
    const frases = {
      senha: 'Problemas de senha são os mais comuns, relaxa! <i class="ic ic-sorriso" aria-hidden="true"></i>',
      computador: 'Vamos ver o que está acontecendo com o equipamento.',
      internet: 'Conexão é fundamental. Vamos resolver isso.',
      setor: 'Setor parado é prioridade máxima. Vou ser rápido! <i class="ic ic-sirene" aria-hidden="true"></i>',
      impressora: 'Impressoras… sempre elas. <i class="ic ic-impressora" aria-hidden="true"></i>',
      sistemas: 'Bora descobrir qual programa está dando trabalho.',
      pedido: 'Pedido de equipamento anotado. É só escolher.',
      outro: 'Sem problemas! Depois você descreve tudo na nota.',
    };
    helpy.dizer(`<p>${frases[g.id] || ''}</p><p><strong>${esc(g.pergunta)}</strong></p>`, {
      humor: g.id === 'setor' ? 'alerta' : 'feliz',
    });
  }
  const vaiDarDica = (etapa === 'situacao' || (etapa === 'nota' && !precisaSituacao()))
    && estado.sub?.dica && estado.dicaVista !== estado.sub.id;
  if (vaiDarDica) { dicaDoSub(); return; }
  if (etapa === 'situacao' && g.pedeMaquina) {
    helpy.dizer('Se souber o <strong>número da máquina</strong>, informe: assim o analista vê se esse problema já aconteceu antes nesse equipamento.');
  }
  if (etapa === 'nota') {
    helpy.dizer('<p>Escreva como se estivesse contando para um colega: <strong>o que aconteceu, desde quando e o que já tentou</strong>.</p>');
  }
  if (etapa === 'ver') {
    const c = chamadoVisto();
    if (c?.status === 'Resolvido') {
      helpy.dizer(`Esse foi resolvido por <strong>${esc(c.analista || 'um analista')}</strong>. Se o problema voltar, abra um chamado novo e cite o ticket <strong>${esc(c.codigo)}</strong>: ajuda o analista a achar a solução mais rápido.`);
    } else if (c) {
      helpy.dizer(c.analista
        ? `<strong>${esc(c.analista)}</strong> está cuidando desse ticket. Eu te aviso assim que ele for resolvido.`
        : 'Esse ticket ainda está na fila. Eu te aviso quando um analista assumir.');
    }
  }
  if (etapa === 'revisao') {
    helpy.dizer('Tudo certo? Quando clicar em <strong>Gerar ticket</strong>, ele sai da impressora direto para a mesa do analista. <i class="ic ic-ticket" aria-hidden="true"></i>', { humor: 'comemorando' });
  }
}

function dicaDoSub() {
  if (!estado.sub?.dica || estado.dicaVista === estado.sub.id) return;   // não repete ao voltar
  estado.dicaVista = estado.sub.id;
  helpy.dizer(`<p><strong>Antes de abrir, tenta isso:</strong></p><p>${esc(estado.sub.dica)}</p>`, {
    tipo: 'dica',
    segurar: true,             // o balão fica até a pessoa responder
    aoMostrar: () => focarNoHelpy(3000),
    acoes: [
      { rotulo: '<i class="ic ic-festa" aria-hidden="true"></i> Resolveu!', fn: () => { helpy.calar(); resolveuSozinho(); } },
      { rotulo: 'Não resolveu, continuar', destaque: true, fn: respostaDica },
    ],
  });
}

/**
 * Resposta ao "Não resolveu": descarta as falas que estavam na fila atrás da
 * dica (senão elas saem todas de uma vez) e deixa UMA mensagem parada na tela,
 * já com a orientação da etapa atual.
 */
function respostaDica() {
  helpy.calar();
  const orientacao = etapaAtual === 'situacao'
    ? (estado.genero.pedeMaquina
      ? 'Agora me diga quem está sendo afetado e, se souber, o <strong>número da máquina</strong>: assim o analista vê se o problema já aconteceu nesse equipamento.'
      : 'Agora me diga quem está sendo afetado.')
    : 'Agora conte com as suas palavras <strong>o que aconteceu, desde quando e o que já tentou</strong>.';
  helpy.dizer(`<p>Sem problemas, seguimos com o ticket. ${ic('seta-baixo')}</p><p>${orientacao}</p>`, { atraso: 300 });
}

function resolveuSozinho() {
  etapaAtual = 'fim';
  renderizarCabecalho();
  elPalco.innerHTML = `
    <section class="etapa-tela entra-dir sucesso resolvido-sozinho">
      <div class="sucesso-selo"><i class="ic ic-check" aria-hidden="true"></i></div>
      <h1>Boa, ${esc(primeiroNome())}! Resolvido sem ticket <i class="ic ic-festa" aria-hidden="true"></i></h1>
      <p>Você mesmo resolveu e liberou a fila para quem precisa. Se voltar a acontecer, é só abrir um chamado.</p>
      <div class="sucesso-acoes"><button type="button" class="btn btn-primary btn-lg" id="recomecar">Voltar para a minha mesa</button></div>
    </section>`;
  Efeitos.confete(elPalco.querySelector('.sucesso-selo'));
  helpy.dizer('Mandou bem! Fico feliz que a dica ajudou. <i class="ic ic-joinha" aria-hidden="true"></i>', { humor: 'comemorando', tipo: 'sucesso' });
  document.getElementById('recomecar').addEventListener('click', recomecar);
}

function recomecar() {
  estado = novoEstado();
  irPara('mesa', 'esq', { falar: false });
}

// ---------- Geração e envio do ticket ----------
async function gerarTicket() {
  const botao = document.getElementById('gerarTicket');
  botao.disabled = true;
  botao.textContent = 'Gerando…';

  let resposta;
  try {
    resposta = await API.abrir({
      genero: estado.genero.id,
      subgenero: estado.sub.id,
      impacto: estado.impacto || 'eu',
      maquina: estado.maquina,
      nota: estado.nota.trim(),
    });
  } catch {
    mostrarOffline(elOffline);
    botao.disabled = false;
    botao.innerHTML = '<i class="ic ic-ticket" aria-hidden="true"></i> Gerar ticket';
    return;
  }

  if (!resposta.ok) {
    const erro = document.getElementById('erroEnvio');
    erro.textContent = resposta.dados.erro || 'Não foi possível gerar o ticket.';
    erro.hidden = false;
    botao.disabled = false;
    botao.innerHTML = '<i class="ic ic-ticket" aria-hidden="true"></i> Gerar ticket';
    helpy.dizer(esc(erro.textContent), { tipo: 'alerta', humor: 'alerta' });
    return;
  }

  const chamado = resposta.dados.chamado;
  statusConhecidos[chamado.numero] = chamado.status;
  animarEnvio(chamado);
}

function animarEnvio(chamado) {
  helpy.calar();
  etapaAtual = 'envio';
  renderizarCabecalho();
  elPalco.innerHTML = `
    <section class="etapa-tela entra-dir">
      <div class="envio-cena" id="cena">
        <div class="envio-impressao">
          <div class="impressora"><span class="impressora-luz"></span></div>
          <div class="saida-papel">${ticketHtml(chamado.codigo)}</div>
          <p class="envio-status" id="envioStatus">Imprimindo seu ticket…</p>
        </div>
        <div class="envio-dica" aria-hidden="true">${ic('robo')} Jogando para o Helpy <span class="envio-seta">→</span></div>
      </div>
    </section>`;

  alinharPicotes();
  const cena = document.getElementById('cena');
  const status = document.getElementById('envioStatus');
  const ticket = cena.querySelector('.tk');
  helpy.dizer('Imprimindo… <i class="ic ic-impressora" aria-hidden="true"></i>', { humor: 'pensando', atraso: 200 });

  requestAnimationFrame(() => cena.classList.add('imprimindo'));
  setTimeout(() => {
    ticket.classList.add('carimbado');
    status.textContent = `Ticket ${chamado.codigo} carimbado!`;
  }, 1700);
  setTimeout(async () => {
    status.textContent = 'Jogando o ticket para o Helpy…';
    // O ticket voa até o Helpy, que pega e leva para a mesa do analista
    const escritorioEl = document.querySelector('.escritorio');
    const helpyEl = escritorioEl?.querySelector('.helpy-avatar') || escritorioEl;
    helpy.humor('acenando');
    ticket.style.visibility = 'hidden';
    await Efeitos.voar(ticket, helpyEl, { duracao: 1050, escalaFinal: .18 });
    if (escritorioEl) {
      const mao = document.createElement('span');
      mao.className = 'ticket-na-mao';
      mao.innerHTML = `${ic('ticket')} ${esc(chamado.codigo)}`;
      escritorioEl.appendChild(mao);
      escritorioEl.classList.remove('pegou');
      void escritorioEl.offsetWidth;
      escritorioEl.classList.add('pegou');
      setTimeout(() => mao.remove(), 2200);
    }
    helpy.humor('comemorando', 1600);
    Efeitos.confete(helpyEl, 50);
    status.innerHTML = `${ic('check-circulo')} O Helpy pegou o ticket ${esc(chamado.codigo)}!`;
    setTimeout(() => voltarComTicket(chamado), 1200);
  }, 2700);
}

/** Depois de enviado, o desktop volta a mostrar os pendentes, com o ticket novo chegando. */
async function voltarComTicket(chamado) {
  destaque = chamado.numero;
  estado = novoEstado();
  await atualizarMeus();
  irPara('mesa', 'dir', { falar: false });
  helpy.dizer(`<p><strong>Peguei o ticket ${esc(chamado.codigo)}!</strong> <i class="ic ic-check-circulo" aria-hidden="true"></i></p>
    <p>Já deixei na mesa do analista da fila <strong>${esc(chamado.fila)}</strong>. Ele entrou com prioridade <strong>${Catalogo.nivel(chamado).rotulo}</strong>. Pode voltar ao trabalho, eu te aviso quando o analista assumir.</p>`, {
    humor: 'comemorando', tipo: 'sucesso',
  });
}

// ---------- Perguntas rápidas (respostas pré-prontas, dentro do balão do Helpy) ----------
function perguntas() {
  helpy.dizer('Claro! Sobre o que você quer saber?', {
    acoes: [
      { rotulo: `${ic('duvida')} Não achei minha opção`, fn: () => atalho('nao-achei') },
      { rotulo: `${ic('etiqueta')} Onde vejo o nº da máquina?`, fn: () => atalho('maquina') },
      { rotulo: `${ic('relogio')} Quanto tempo demora?`, fn: () => atalho('tempo') },
      { rotulo: `${ic('chat')} Como falo com o analista?`, fn: () => atalho('chat') },
    ],
  });
}

/** Botão de INFO do card da máquina: o Helpy explica o passo a passo. */
function explicarMaquina() {
  helpy.calar();
  helpy.dizer(`<p><strong>${ic('etiqueta')} Como achar o número da máquina:</strong></p>
    <ol class="helpy-passos">
      <li>Procure uma <strong>etiqueta de patrimônio</strong>: um adesivo com código de barras e um número.</li>
      <li><strong>Computador de mesa:</strong> lateral ou parte de trás do gabinete. <strong>Notebook:</strong> embaixo, perto da bateria. <strong>Monitor ou impressora:</strong> atrás ou na lateral.</li>
      <li>Digite só o número da etiqueta, por exemplo <strong>043</strong>.</li>
    </ol>
    <p>Não achou? Tudo bem, deixe em branco: o analista descobre no atendimento.</p>`, { humor: 'pensando', atraso: 350 });
}

function atalho(tipo) {
  if (tipo === 'nao-achei') {
    helpy.dizer('Sem problemas! Use o cartão <strong>Outro assunto</strong> e explique tudo na nota. O analista lê com atenção. <i class="ic ic-sorriso" aria-hidden="true"></i>', {
      acoes: [{ rotulo: 'Ir para "Outro assunto"', destaque: true, fn: () => { estado = novoEstado(); escolherGenero('outro'); } }],
    });
  }
  if (tipo === 'maquina') { explicarMaquina(); return; }
  if (tipo === 'tempo') {
    helpy.dizer('<i class="ic ic-relogio" aria-hidden="true"></i> Chamados de <strong>prioridade alta</strong> são atendidos primeiro. Os demais seguem a ordem da fila. Você recebe um aviso aqui assim que um analista assumir.');
  }
  if (tipo === 'chat') {
    helpy.dizer(`${ic('chat')} Se o analista precisar falar com você, ele manda mensagem pelo <strong>HelpIA Chat</strong> (no menu da esquerda). Você recebe o aviso lá e responde por ali mesmo.`);
  }
}

// ---------- Meus chamados: mesa, resolvidos, placar e avisos ----------
async function atualizarMeus() {
  let dados;
  try {
    ({ dados } = await API.listar({ solicitante: usuario.nome }));
    elOffline.hidden = true;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  meus = dados.slice().reverse();

  // Avisos quando o analista age
  for (const c of dados) {
    const anterior = statusConhecidos[c.numero];
    if (anterior && anterior !== c.status) {
      if (c.status === 'Em atendimento') {
        Efeitos.toast(`<strong>${esc(c.analista)}</strong> assumiu o ticket ${esc(c.codigo)}`, { icone: '<i class="ic ic-aceno" aria-hidden="true"></i>' });
        helpy.dizer(`<i class="ic ic-aceno" aria-hidden="true"></i> Boa notícia! <strong>${esc(c.analista)}</strong> assumiu o seu ticket <strong>${esc(c.codigo)}</strong> e já está cuidando do problema.`, { humor: 'acenando' });
      } else if (c.status === 'Resolvido') {
        Efeitos.toast(`Ticket ${esc(c.codigo)} resolvido!`, { icone: '<i class="ic ic-festa" aria-hidden="true"></i>', tipo: 'sucesso' });
        helpy.dizer(`<p><i class="ic ic-festa" aria-hidden="true"></i> Ticket <strong>${esc(c.codigo)}</strong> resolvido por ${esc(c.analista)}!</p>
          ${c.resolucao ? `<div class="helpy-citacao">“${esc(c.resolucao)}”<small>Nota de resolução do analista</small></div>` : ''}`, { humor: 'comemorando', tipo: 'sucesso' });
        Efeitos.confete(null, 50);
      }
    }
    statusConhecidos[c.numero] = c.status;
  }

  const nova = meus.map((c) => `${c.numero}:${c.status}`).join('|');
  if (nova === assinatura) return;
  assinatura = nova;
  atualizarPlacar();
  preencherResolvidos();
  if (etapaAtual === 'mesa') preencherMesa();
}

// ---------- Início ----------
(async () => {
  if (!usuario) return;
  Sessao.montarMenu(usuario);
  await atualizarMeus();
  irPara('mesa');
  setInterval(atualizarMeus, 4000);
})();
