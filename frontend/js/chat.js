/* =========================================================
   chat.js — mesa do colaborador
   Mesmo layout da mesa do analista:
   - esquerda: chamados resolvidos;
   - centro (desktop): chamados pendentes. Ao abrir um chamado,
     todo o passo a passo acontece aqui dentro;
   - direita: Helpy com o café, falando por balão sobre a cabeça.
   Não é um chat livre: são perguntas e respostas pré-prontas.
   Fluxo: Tipo (gênero) → Detalhe (subgênero) → Situação (impacto
   e máquina) → Nota e contato → Revisão → Ticket impresso e enviado.
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

const PASSOS = [
  { id: 'genero', rotulo: 'Tipo' },
  { id: 'sub', rotulo: 'Detalhe' },
  { id: 'situacao', rotulo: 'Situação' },
  { id: 'nota', rotulo: 'Nota e contato' },
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

function renderizarCabecalho() {
  const naMesa = etapaAtual === 'mesa';
  elTitulo.innerHTML = naMesa
    ? `${ic('pastas')} Meus chamados pendentes <span class="contador" id="contadorPendentes">${pendentes().length}</span>`
    : `${ic('ticket')} Novo chamado`;

  if (naMesa) {
    elAcao.innerHTML = `<button type="button" class="btn btn-primary" data-abrir>${ic('mais')} Abrir chamado</button>`;
  } else if (etapaAtual === 'envio') {
    elAcao.innerHTML = '';
  } else {
    elAcao.innerHTML = `<button type="button" class="btn btn-sm" data-cancelar>${ic('x')} ${etapaAtual === 'fim' ? 'Fechar' : 'Cancelar'}</button>`;
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

// "Abrir chamado" e "Cancelar" aparecem em vários lugares (cabeçalho, mesa vazia, Helpy)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-abrir]')) iniciarChamado();
  else if (e.target.closest('[data-cancelar]')) cancelarChamado();
});

function iniciarChamado() {
  estado = novoEstado();
  irPara('genero');
}

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
};

function irPara(etapa, direcao = 'dir', { falar = true } = {}) {
  helpy.calar();                       // o que o Helpy ia dizer da tela anterior não vale mais
  const anterior = elPalco.querySelector('.etapa-tela');
  const mostrar = () => {
    etapaAtual = etapa;
    elPalco.innerHTML = `<section class="etapa-tela entra-${direcao}">${RENDER[etapa]()}</section>`;
    elPalco.scrollTop = 0;
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

// ---------- Telas ----------
/** Desktop: os chamados pendentes, jogados na mesa como no painel do analista. */
function telaMesa() {
  return '<ul class="lista-tickets desktop-tickets" id="listaPendentes"></ul>';
}

function linhaDoTempo(status) {
  const passo = { 'Aguardando': 0, 'Em atendimento': 1, 'Resolvido': 2 }[status] ?? 0;
  const ponto = (i) => (i < passo || status === 'Resolvido' ? 'ok' : i === passo ? 'agora' : '');
  return `<div class="linha-tempo"><span class="${ponto(0)}"></span><i class="${passo >= 1 ? 'ok' : ''}"></i><span class="${ponto(1)}"></span><i class="${passo >= 2 ? 'ok' : ''}"></i><span class="${ponto(2)}"></span></div>
    <div class="linha-rotulos"><span>Na fila</span><span>Em atendimento</span><span>Resolvido</span></div>`;
}

function ticketPendente(c, i) {
  const giro = ((c.numero * 37) % 5 - 2) * .7;     // cada ticket "jogado" na mesa num ângulo
  const st = c.status === 'Em atendimento' ? 'st-em-atendimento' : 'st-aguardando';
  return `
    <li class="tkm-sombra ${c.numero === destaque ? 'chegando' : ''}" style="--i:${i}; transform: rotate(${giro}deg)">
      <article class="tkm ticket ${st} ${c.prioridade === 'Alta' ? 'alta' : ''}">
        <div class="tkm-topo">
          <span class="tkm-codigo">${esc(c.codigo)}</span>
          <span class="tkm-tags">
            <span class="tag tag-${c.prioridade.toLowerCase()}">${c.prioridade === 'Alta' ? '<i class="ic ic-chama" aria-hidden="true"></i> ' : ''}${esc(c.prioridade)}</span>
            <span class="tag ${classeStatus(c.status)}">${esc(c.status)}</span>
          </span>
        </div>
        <div class="tkm-tipo">
          <span class="mini-ico">${Catalogo.icone(c.genero)}</span>
          <div><strong>${esc(c.genero_titulo || c.categoria)}</strong><span>${esc(c.subgenero_titulo || c.descricao)}</span></div>
        </div>
        <span class="ticket-picote"></span>
        <div class="tkm-progresso">${linhaDoTempo(c.status)}</div>
        <div class="tkm-meta">
          <span><i class="ic ic-pasta" aria-hidden="true"></i> ${esc(c.fila)}</span>
          <span><i class="ic ic-relogio" aria-hidden="true"></i> aberto ${Efeitos.tempoDesde(c.aberto_em)}</span>
          ${c.analista ? `<span><i class="ic ic-usuario" aria-hidden="true"></i> <b>${esc(c.analista)}</b> está cuidando</span>` : ''}
        </div>
      </article>
    </li>`;
}

function preencherMesa() {
  const lista = document.getElementById('listaPendentes');
  if (!lista) return;
  const abertos = pendentes();
  lista.innerHTML = abertos.length ? abertos.map(ticketPendente).join('') : `
    <li class="mesa-vazia">
      <span><i class="ic ic-sorriso" aria-hidden="true"></i></span>
      <strong>Nenhum chamado pendente</strong>
      <span>Está tudo funcionando? Ótimo! Se algo der problema, abra um chamado.</span>
      <button type="button" class="btn btn-primary btn-lg" data-abrir>${ic('mais')} Abrir chamado</button>
    </li>`;
  destaque = null;
  const contador = document.getElementById('contadorPendentes');
  if (contador) contador.textContent = abertos.length;
}

function preencherResolvidos() {
  const resolvidos = meus.filter((c) => c.status === 'Resolvido');
  elContadorResolvidos.textContent = resolvidos.length;
  elListaResolvidos.innerHTML = resolvidos.length ? resolvidos.map((c) => `
    <li class="tkm-sombra">
      <article class="tkm ticket st-resolvido">
        <div class="tkm-topo">
          <span class="tkm-codigo">${esc(c.codigo)}</span>
          <span class="tag ${classeStatus(c.status)}">${esc(c.status)}</span>
        </div>
        <div class="tkm-tipo">
          <span class="mini-ico">${Catalogo.icone(c.genero)}</span>
          <div><strong>${esc(c.genero_titulo || c.categoria)}</strong><span>${esc(c.subgenero_titulo || c.descricao)}</span></div>
        </div>
        ${c.resolucao ? `<div class="meu-resolucao"><b>Solução:</b> ${esc(c.resolucao)}</div>` : ''}
        <div class="tkm-meta">
          ${c.analista ? `<span><i class="ic ic-usuario" aria-hidden="true"></i> <b>${esc(c.analista)}</b></span>` : ''}
          <span><i class="ic ic-relogio" aria-hidden="true"></i> ${Efeitos.tempoDesde(c.resolvido_em || c.aberto_em)}</span>
        </div>
      </article>
    </li>`).join('') : '<li class="vazio">Seus chamados resolvidos ficam guardados aqui.</li>';
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
          <span class="cartao-tecla">${i + 1}</span>
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
    </div>
    <div class="rodape-etapa">
      <button type="button" class="btn btn-ghost" data-voltar>← Voltar</button>
      <span></span>
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
      <div class="bloco">
        <div class="bloco-titulo"><h2>${esc(g.rotuloMaquina || 'Número da máquina')}</h2><span>opcional, mas ajuda muito</span></div>
        <label class="campo campo-maquina">
          <span class="campo-ajuda">Está na etiqueta de patrimônio colada no equipamento (ex.: 043).</span>
          <input id="maquina" type="text" maxlength="30" value="${esc(estado.maquina)}" placeholder="Ex.: 043" autocomplete="off" />
        </label>
      </div>` : ''}
    <div class="rodape-etapa">
      <button type="button" class="btn btn-ghost" data-voltar>← Voltar</button>
      <button type="button" class="btn btn-primary btn-lg" data-avancar ${perguntaImpacto && !estado.impacto ? 'disabled' : ''}>Continuar →</button>
    </div>`;
}

function telaNota() {
  const tipoAtual = Catalogo.contatos.find((c) => c.id === estado.contato.tipo);
  return `
    <div class="etapa-cabeca">
      ${migalha()}
      <h1>Conte com as suas palavras</h1>
      <p>A nota vai direto para o analista e fica salva no histórico do chamado.</p>
    </div>
    <div class="bloco">
      <div class="bloco-titulo"><h2>Nota para o analista</h2><span>obrigatória</span></div>
      <div class="nota-caixa campo">
        <textarea id="nota" maxlength="1000" placeholder="Ex.: Desde hoje cedo aparece um X no ícone de rede. Já reiniciei o computador e continua igual.">${esc(estado.nota)}</textarea>
        <div class="nota-medidor" id="notaMedidor"><div class="nota-barra"><span></span></div><span id="notaTexto"></span></div>
      </div>
    </div>
    <div class="bloco">
      <div class="bloco-titulo"><h2>Como o analista fala com você?</h2><span>obrigatório</span></div>
      <div class="contato-linha">
        ${Catalogo.contatos.map((c, i) => `
          <button type="button" class="opcao ${estado.contato.tipo === c.id ? 'selecionada' : ''}" data-contato="${c.id}" style="--i:${i}">
            <span class="opcao-emoji">${ic(c.ic)}</span><strong>${c.titulo}</strong>
          </button>`).join('')}
        <label class="campo">
          <span class="campo-ajuda" id="contatoRotulo">${tipoAtual.titulo}</span>
          <input id="contatoValor" type="${estado.contato.tipo === 'whatsapp' ? 'tel' : 'email'}" value="${esc(estado.contato.valor)}" placeholder="${tipoAtual.placeholder}" autocomplete="off" />
        </label>
      </div>
      <p class="aviso-urgencia"><i class="ic ic-cadeado" aria-hidden="true"></i> O contato fica anexado ao ticket e só é usado em casos de urgência.</p>
    </div>
    <p class="aviso aviso-erro erro-etapa" id="erroNota" hidden></p>
    <div class="rodape-etapa">
      <button type="button" class="btn btn-ghost" data-voltar>← Voltar</button>
      <button type="button" class="btn btn-primary btn-lg" data-avancar>Revisar ticket →</button>
    </div>`;
}

function prioridadePrevista() {
  return estado.genero.prioridade || (estado.impacto && estado.impacto !== 'eu' ? 'Alta' : 'Normal');
}

/** O ticket (usado na revisão e na impressão). */
function ticketHtml(numero = null) {
  const g = estado.genero;
  const contato = Catalogo.contatos.find((c) => c.id === estado.contato.tipo);
  const prioridade = prioridadePrevista();
  return `
    <div class="ticket-palco">
      <article class="card ticket tk">
        <header class="tk-topo">
          <span class="tk-marca">Help<b>IA</b> · Ticket de suporte</span>
          <span class="tag tag-${prioridade.toLowerCase()}">${prioridade === 'Alta' ? '<i class="ic ic-chama" aria-hidden="true"></i> ' : ''}${prioridade}</span>
        </header>
        <div class="tk-numero ${numero ? '' : 'rascunho'}" data-numero>${numero || '#···'}</div>
        <div class="tk-tipo">
          <span class="mini-ico">${Catalogo.icone(g.id)}</span>
          <div><strong>${esc(g.titulo)}</strong><span>${esc(estado.sub.titulo)}</span></div>
        </div>
        <span class="ticket-picote"></span>
        <dl class="tk-dados">
          <div><dt>Fila</dt><dd>${esc(g.fila)}</dd></div>
          <div><dt>Solicitante</dt><dd>${esc(usuario.nome)}</dd></div>
          ${estado.maquina ? `<div><dt>Máquina</dt><dd>${esc(estado.maquina)}</dd></div>` : ''}
          <div><dt>Contato · ${contato.titulo}</dt><dd>${esc(estado.contato.valor)}</dd></div>
        </dl>
        <p class="tk-nota">“${esc(estado.nota)}”</p>
        <div class="codigo-barras"></div>
        <span class="tk-carimbo">ENVIADO</span>
      </article>
    </div>`;
}

function telaRevisao() {
  return `
    <div class="etapa-cabeca">
      <h1>Seu ticket está <span class="acento">pronto</span></h1>
      <p>Confira os dados. Ao gerar, ele vai direto para a mesa do analista da fila ${esc(estado.genero.fila)}.</p>
    </div>
    ${ticketHtml()}
    <p class="aviso aviso-erro erro-etapa" id="erroEnvio" hidden></p>
    <div class="rodape-etapa">
      <button type="button" class="btn btn-ghost" data-voltar>← Ajustar</button>
      <button type="button" class="btn btn-primary btn-lg" id="gerarTicket"><i class="ic ic-ticket" aria-hidden="true"></i> Gerar ticket</button>
    </div>`;
}

// ---------- Eventos de cada tela ----------
function ligarEventos(etapa) {
  if (etapa === 'mesa') { preencherMesa(); return; }
  elPalco.querySelectorAll('[data-voltar]').forEach((b) => b.addEventListener('click', () => irPara(anteriorA(etapa), 'esq')));
  elPalco.querySelectorAll('[data-avancar]').forEach((b) => b.addEventListener('click', () => avancarDe(etapa)));

  // Brilho seguindo o mouse nos cartões
  elPalco.querySelectorAll('.cartao').forEach((cartao) => {
    cartao.addEventListener('pointermove', (e) => {
      const r = cartao.getBoundingClientRect();
      cartao.style.setProperty('--mx', `${e.clientX - r.left}px`);
      cartao.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    cartao.addEventListener('pointerenter', () => cartao.classList.add('ativo-ico'));
    cartao.addEventListener('pointerleave', () => cartao.classList.remove('ativo-ico'));
    cartao.addEventListener('click', () => escolherGenero(cartao.dataset.genero, cartao));
  });

  elPalco.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => escolherSub(b.dataset.sub, b)));

  elPalco.querySelectorAll('[data-impacto]').forEach((b) => b.addEventListener('click', () => {
    estado.impacto = b.dataset.impacto;
    elPalco.querySelectorAll('[data-impacto]').forEach((o) => o.classList.toggle('selecionada', o === b));
    elPalco.querySelector('[data-avancar]').disabled = false;
    if (estado.impacto !== 'eu') {
      helpy.dizer('Entendi, afeta mais gente. Seu ticket vai com <strong>prioridade alta</strong> <i class="ic ic-chama" aria-hidden="true"></i>', { tipo: 'alerta', humor: 'alerta', atraso: 350 });
    }
  }));

  const elMaquina = document.getElementById('maquina');
  if (elMaquina) elMaquina.addEventListener('input', () => { estado.maquina = elMaquina.value.trim(); });

  if (etapa === 'nota') ligarNota();
  if (etapa === 'revisao') document.getElementById('gerarTicket').addEventListener('click', gerarTicket);
}

function ligarNota() {
  const elNota = document.getElementById('nota');
  const elValor = document.getElementById('contatoValor');
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

  elValor.addEventListener('input', () => { estado.contato.valor = elValor.value; });
  elPalco.querySelectorAll('[data-contato]').forEach((b) => b.addEventListener('click', () => {
    const tipo = Catalogo.contatos.find((c) => c.id === b.dataset.contato);
    const eraTelefone = estado.contato.tipo === 'whatsapp';
    estado.contato.tipo = tipo.id;
    if ((tipo.id === 'whatsapp') !== eraTelefone) estado.contato.valor = tipo.id === 'whatsapp' ? '' : usuario.email;
    elPalco.querySelectorAll('[data-contato]').forEach((o) => o.classList.toggle('selecionada', o === b));
    document.getElementById('contatoRotulo').textContent = tipo.titulo;
    elValor.type = tipo.id === 'whatsapp' ? 'tel' : 'email';
    elValor.placeholder = tipo.placeholder;
    elValor.value = estado.contato.valor;
    elValor.focus();
  }));
}

function validarContato() {
  const valor = estado.contato.valor.trim();
  if (estado.contato.tipo === 'whatsapp') {
    const digitos = valor.replace(/\D/g, '').length;
    return digitos >= 10 && digitos <= 13 ? '' : 'Informe o WhatsApp com DDD, ex.: (11) 91234-5678.';
  }
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor) ? '' : 'Informe um e-mail válido para contato.';
}

function avancarDe(etapa) {
  if (etapa === 'nota') {
    const erro = document.getElementById('erroNota');
    const problema = estado.nota.trim().length < MIN_NOTA
      ? `A nota precisa de pelo menos ${MIN_NOTA} caracteres. Conte o que aconteceu e desde quando.`
      : validarContato();
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
         <p>Eu fico de olho e te aviso assim que o analista agir.</p>`
      : `<p>Oi, <strong>${esc(primeiroNome())}</strong>! Eu sou o <strong>Helpy</strong> <i class="ic ic-robo" aria-hidden="true"></i></p>
         <p>Sua mesa está limpinha. Se algo der problema, é só abrir um chamado.</p>`, {
      humor: 'acenando',
      acoes: [{ rotulo: `${ic('mais')} Abrir chamado`, destaque: true, fn: iniciarChamado }],
    });
  }
  if (etapa === 'genero') {
    helpy.dizer(`<p>Escolha o cartão que mais parece com o seu problema e eu te guio até o ticket.</p>
      <p>Dica: dá para usar as teclas <strong>1 a 8</strong>.</p>`, {
      acoes: [
        { rotulo: '<i class="ic ic-duvida" aria-hidden="true"></i> Não achei minha opção', fn: () => atalho('nao-achei') },
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
  if (etapa === 'situacao' || (etapa === 'nota' && !precisaSituacao())) dicaDoSub();
  if (etapa === 'situacao' && g.pedeMaquina) {
    helpy.dizer('Se souber o <strong>número da máquina</strong>, informe: assim o analista vê se esse problema já aconteceu antes nesse equipamento.');
  }
  if (etapa === 'nota') {
    helpy.dizer('<p>Escreva como se estivesse contando para um colega: <strong>o que aconteceu, desde quando e o que já tentou</strong>.</p><p>O contato só é usado em urgência. <i class="ic ic-cadeado" aria-hidden="true"></i></p>');
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
    acoes: [
      { rotulo: '<i class="ic ic-festa" aria-hidden="true"></i> Resolveu!', fn: resolveuSozinho },
      { rotulo: 'Não resolveu, continuar', destaque: true, fn: () => helpy.dizer('Sem problemas, seguimos com o ticket. <i class="ic ic-seta-baixo" aria-hidden="true"></i>', { atraso: 300 }) },
    ],
  });
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
      contato: { tipo: estado.contato.tipo, valor: estado.contato.valor.trim() },
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
        <div class="mesa-destino" id="mesaDestino">
          <span class="mesa-icone"><i class="ic ic-pastas" aria-hidden="true"></i></span>
          <strong>Mesa do analista</strong>
          <small>Fila: ${esc(chamado.fila)}</small>
        </div>
      </div>
    </section>`;

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
    status.textContent = 'Enviando para a mesa do analista…';
    const destino = document.getElementById('mesaDestino');
    ticket.style.visibility = 'hidden';
    await Efeitos.voar(ticket, destino, { duracao: 900, escalaFinal: .15 });
    destino.classList.add('recebeu');
    destino.querySelector('.mesa-icone').innerHTML = '<i class="ic ic-check-circulo" aria-hidden="true"></i>';
    destino.querySelector('strong').textContent = 'Recebido!';
    Efeitos.confete(destino, 60);
    status.textContent = '';
    setTimeout(() => voltarComTicket(chamado), 900);
  }, 2700);
}

/** Depois de enviado, o desktop volta a mostrar os pendentes, com o ticket novo chegando. */
async function voltarComTicket(chamado) {
  destaque = chamado.numero;
  estado = novoEstado();
  await atualizarMeus();
  irPara('mesa', 'dir', { falar: false });
  helpy.dizer(`<p><strong>Ticket ${esc(chamado.codigo)} entregue!</strong> <i class="ic ic-check-circulo" aria-hidden="true"></i></p>
    <p>Ele está na fila <strong>${esc(chamado.fila)}</strong> com prioridade <strong>${esc(chamado.prioridade)}</strong>. Pode voltar ao trabalho, eu te aviso quando o analista assumir.</p>`, {
    humor: 'comemorando', tipo: 'sucesso',
  });
}

// ---------- Perguntas rápidas (respostas pré-prontas) ----------
function atalho(tipo) {
  if (tipo === 'nao-achei') {
    helpy.dizer('Sem problemas! Use o cartão <strong>Outro assunto</strong> e explique tudo na nota. O analista lê com atenção. <i class="ic ic-sorriso" aria-hidden="true"></i>', {
      acoes: [{ rotulo: 'Ir para "Outro assunto"', destaque: true, fn: () => { estado = novoEstado(); escolherGenero('outro'); } }],
    });
  }
  if (tipo === 'maquina') {
    helpy.dizer('<i class="ic ic-etiqueta" aria-hidden="true"></i> O número da máquina fica numa <strong>etiqueta de patrimônio</strong>, normalmente na lateral ou embaixo do equipamento. No notebook, olhe embaixo, perto da bateria.');
  }
  if (tipo === 'tempo') {
    helpy.dizer('<i class="ic ic-relogio" aria-hidden="true"></i> Chamados de <strong>prioridade alta</strong> são atendidos primeiro. Os demais seguem a ordem da fila. Você recebe um aviso aqui assim que um analista assumir.');
  }
  if (tipo === 'contato') {
    helpy.dizer('<i class="ic ic-telefone" aria-hidden="true"></i> O contato fica anexado ao ticket e o analista <strong>só usa em urgência</strong>, por exemplo, se precisar de acesso à sua máquina na hora.');
  }
}

document.querySelectorAll('[data-atalho]').forEach((b) => b.addEventListener('click', () => atalho(b.dataset.atalho)));

// Teclas 1–8 escolhem o tipo na primeira tela
document.addEventListener('keydown', (e) => {
  if (etapaAtual !== 'genero' || e.target.matches('input, textarea')) return;
  const indice = Number(e.key) - 1;
  const genero = Catalogo.generos[indice];
  if (genero) escolherGenero(genero.id, elPalco.querySelector(`[data-genero="${genero.id}"]`));
});

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
