/* =========================================================
   contas.js — centro de comando do gestor
   Emite crachás (contas), suspende/reativa, promove/rebaixa e
   redefine senhas. Ações de poder exigem "segurar para autorizar".
   Mostra indicadores, ranking de analistas e registro de atividades.
   ========================================================= */

const usuario = Sessao.exigir(['gestor']);

const elForm = document.getElementById('formConta');
const elNome = document.getElementById('nome');
const elEmail = document.getElementById('email');
const elSenha = document.getElementById('senha');
const elAviso = document.getElementById('aviso');
const elBotao = document.getElementById('botaoCriar');
const elDica = document.getElementById('perfilDica');
const elLista = document.getElementById('listaContas');
const elPrevia = document.getElementById('previaCracha');
const elOffline = document.getElementById('avisoOffline');
const elCredencial = document.getElementById('credencial');
const modalPoder = document.getElementById('modalPoder');

const esc = (texto) => escaparHtml(String(texto ?? ''));
const ROTULOS = { gestor: 'Gestor', analista: 'Analista', colaborador: 'Colaborador' };
const DICAS = {
  analista: 'Atende a fila na mesa do analista. Conta no limite do plano.',
  colaborador: 'Abre chamados pelo HelpIA. Não conta no limite de analistas.',
};

let contas = [];
let chamados = [];
let filtro = '';
let idDestacado = null;
const eventosDaSessao = [];

const perfilEscolhido = () => document.querySelector('input[name="perfil"]:checked').value;
const iniciais = (nome) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => letras[n % letras.length]).join('');
}

function mostrarAviso(texto) {
  elAviso.textContent = texto;
  elAviso.hidden = false;
}

// ---------- Crachá ----------
function estatistica(conta) {
  if (conta.perfil === 'colaborador') {
    const abertos = chamados.filter((c) => c.solicitante === conta.nome).length;
    return `${abertos} chamado(s) aberto(s)`;
  }
  const feitos = chamados.filter((c) => c.status === 'Resolvido' && c.analista === conta.nome).length;
  return `${feitos} ticket(s) carimbado(s)`;
}

function crachaHtml(conta, { indice = 0, previa = false } = {}) {
  const suspenso = conta.ativo === false;
  const eu = conta.id === usuario.id;
  const acoes = previa ? '' : eu
    ? '<span class="voce"><i class="ic ic-coroa" aria-hidden="true"></i> Este é você</span>'
    : `<div class="cracha-acoes">
        <button type="button" class="acao-poder ${suspenso ? '' : 'perigo'}" data-poder="${suspenso ? 'reativar' : 'suspender'}" data-id="${conta.id}">${suspenso ? '<i class="ic ic-play" aria-hidden="true"></i> Reativar' : '<i class="ic ic-pausa" aria-hidden="true"></i> Suspender'}</button>
        <button type="button" class="acao-poder" data-poder="senha" data-id="${conta.id}"><i class="ic ic-chave" aria-hidden="true"></i> Senha</button>
        ${conta.perfil === 'colaborador'
          ? `<button type="button" class="acao-poder" data-poder="promover" data-id="${conta.id}"><i class="ic ic-seta-cima" aria-hidden="true"></i> Promover</button>`
          : `<button type="button" class="acao-poder" data-poder="rebaixar" data-id="${conta.id}"><i class="ic ic-seta-baixo" aria-hidden="true"></i> Colaborador</button>`}
      </div>`;
  return `
    <li class="cracha-item" data-id="${conta.id ?? ''}">
      <span class="cordao" aria-hidden="true"></span>
      <article class="cracha p-${conta.perfil} ${suspenso ? 'suspenso' : ''} ${conta.id === idDestacado ? 'emitido' : ''}" style="--i:${indice}">
        <span class="cracha-faixa"></span>
        <span class="cracha-foto">${esc(iniciais(conta.nome || ''))}</span>
        <span class="cracha-nome">${esc(conta.nome || 'Nome da pessoa')}</span>
        <span class="cracha-cargo">${ROTULOS[conta.perfil]}</span>
        <span class="cracha-email">${esc(conta.email || 'email@empresa.com')}</span>
        ${previa ? '' : `<span class="cracha-stat">${estatistica(conta)}</span>`}
        <span class="cracha-id">ID ${String(conta.id ?? 0).padStart(4, '0')} · ${esc(usuario.empresa?.nome || '')}</span>
        <span class="codigo-barras"></span>
        ${suspenso ? '<span class="cracha-suspenso">SUSPENSO</span>' : ''}
      </article>
      ${acoes}
    </li>`;
}

function renderizarPrevia() {
  elPrevia.innerHTML = `<ul class="crachas" style="grid-template-columns:1fr">${crachaHtml({
    id: null, nome: elNome.value.trim(), email: elEmail.value.trim(), perfil: perfilEscolhido(), ativo: true,
  }, { previa: true })}</ul>`;
}

// ---------- Painéis ----------
function renderizarHero() {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').innerHTML = `${saudacao}, ${esc(usuario.nome.split(' ')[0])}. Você está no <span>comando</span>.`;
  const empresa = usuario.empresa || {};
  document.getElementById('empresaResumo').textContent =
    `${empresa.nome || 'Sua empresa'} · Plano ${empresa.plano_nome || ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  Efeitos.contarAte(document.getElementById('totalSob'), contas.filter((c) => c.id !== usuario.id).length);
}

function renderizarKpis() {
  const empresa = usuario.empresa || {};
  const analistas = contas.filter((c) => c.perfil === 'analista').length;
  const limite = empresa.limite_analistas;
  Efeitos.contarAte(document.getElementById('kpiAtivas'), contas.filter((c) => c.ativo !== false).length);
  Efeitos.contarAte(document.getElementById('kpiAnalistas'), analistas);
  document.getElementById('kpiAnalistasRotulo').textContent = limite == null ? 'analistas · sem limite' : `de ${limite} analistas no plano`;
  document.getElementById('anelPlano').style.strokeDasharray = `${limite == null ? 100 : Math.min(100, (analistas / limite) * 100)} 100`;
  document.querySelector('.kpi-anel').classList.toggle('cheio', limite != null && analistas >= limite);
  Efeitos.contarAte(document.getElementById('kpiAbertos'), chamados.filter((c) => c.status !== 'Resolvido').length);
  Efeitos.contarAte(document.getElementById('kpiHoje'),
    chamados.filter((c) => c.status === 'Resolvido' && (c.resolvido_em || '').startsWith(hojeIso())).length);
}

function renderizarEquipe() {
  const termo = document.getElementById('busca').value.trim().toLowerCase();
  const visiveis = contas
    .filter((c) => (filtro === 'suspensos' ? c.ativo === false : !filtro || c.perfil === filtro))
    .filter((c) => !termo || `${c.nome} ${c.email}`.toLowerCase().includes(termo))
    .sort((a, b) => (a.perfil === 'gestor' ? -1 : b.perfil === 'gestor' ? 1 : 0) || a.nome.localeCompare(b.nome));
  elLista.innerHTML = visiveis.length
    ? visiveis.map((c, i) => crachaHtml(c, { indice: i })).join('')
    : '<li class="lista-vazia">Ninguém neste filtro.</li>';
}

function renderizarRanking() {
  const placar = {};
  chamados.filter((c) => c.status === 'Resolvido' && c.analista)
    .forEach((c) => { placar[c.analista] = (placar[c.analista] || 0) + 1; });
  const top = Object.entries(placar).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const medalhas = ['ouro', 'prata', 'bronze'].map((m) => ic('medalha', `medalha-${m}`));
  const ordem = [1, 0, 2];   // 2º, 1º, 3º no pódio
  document.getElementById('podio').innerHTML = top.length
    ? ordem.filter((i) => top[i]).map((i) => `
        <div class="degrau d${i + 1}">
          <span class="medalha">${medalhas[i]}</span>
          <strong>${esc(top[i][0])}</strong>
          <small>${top[i][1]} ticket(s)</small>
          <div class="degrau-bloco">${i + 1}</div>
        </div>`).join('')
    : '<p class="lista-vazia">O pódio aparece quando os analistas carimbarem os primeiros tickets.</p>';
}

function renderizarRegistro() {
  const eventos = [
    ...eventosDaSessao,
    ...contas.filter((c) => c.id !== usuario.id).map((c) => ({
      quando: c.criado_em, ico: '<i class="ic ic-cracha" aria-hidden="true"></i>', texto: `Crachá de <strong>${esc(c.nome)}</strong> emitido (${ROTULOS[c.perfil]})`,
    })),
    ...chamados.map((c) => ({ quando: c.aberto_em, ico: '<i class="ic ic-entrada" aria-hidden="true"></i>', texto: `<strong>${esc(c.solicitante)}</strong> abriu ${esc(c.codigo)} · ${esc(c.descricao)}` })),
    ...chamados.filter((c) => c.resolvido_em).map((c) => ({
      quando: c.resolvido_em, ico: '<i class="ic ic-check-circulo" aria-hidden="true"></i>', texto: `<strong>${esc(c.analista)}</strong> carimbou ${esc(c.codigo)}`,
    })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 14);

  document.getElementById('registro').innerHTML = eventos.map((e, i) => `
    <li class="evento ${e.poder ? 'ev-poder' : ''}" style="animation-delay:${i * 30}ms">
      <span class="evento-ico">${e.ico}</span><span>${e.texto}</span><time datetime="${e.quando}">${Efeitos.tempoDesde(e.quando)}</time>
    </li>`).join('');
}

function registrarPoder(ico, texto) {
  const d = new Date();
  const iso = `${hojeIso()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  eventosDaSessao.unshift({ quando: iso, ico, texto, poder: true });
}

let assinatura = '';

async function carregar() {
  try {
    const [respContas, respChamados] = await Promise.all([API.listarContas(), API.listar()]);
    if (respContas.status === 401) return Sessao.sair('expirou');
    if (!respContas.ok) { mostrarAviso(respContas.dados.erro || 'Não foi possível carregar as contas.'); return; }
    elOffline.hidden = true;
    contas = respContas.dados;
    chamados = respChamados.ok ? respChamados.dados : [];
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  // Só redesenha (e reanima) quando algo mudou de verdade
  const nova = JSON.stringify([contas, chamados.map((c) => [c.numero, c.status]), eventosDaSessao.length]);
  if (nova === assinatura) return;
  assinatura = nova;
  setTimeout(() => { idDestacado = null; }, 1500);
  renderizarHero();
  renderizarKpis();
  renderizarEquipe();
  renderizarRanking();
  renderizarRegistro();
}

// ---------- Autorização: segurar para confirmar ----------
function autorizar({ icone, titulo, texto, rotulo, perigo = false, acao }) {
  const conteudo = document.getElementById('conteudoPoder');
  conteudo.innerHTML = `
    <div class="poder-icone ${perigo ? 'perigo' : ''}">${icone}</div>
    <h2>${titulo}</h2>
    <p>${texto}</p>
    <button type="button" class="segurar ${perigo ? 'perigo' : ''}" id="botaoSegurar" aria-label="Segure para ${rotulo}">
      <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16" pathLength="100" id="anelSegurar"/></svg>
      <span>Segure para ${rotulo}</span>
    </button>
    <p class="dica-segurar">Mantenha pressionado por 1 segundo · ou segure Enter</p>
    <p class="aviso aviso-erro" id="erroPoder" hidden></p>
    <div class="modal-acoes"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button></div>`;
  modalPoder.showModal();

  const botao = document.getElementById('botaoSegurar');
  const anel = document.getElementById('anelSegurar');
  const DURACAO = 1000;
  let inicio = null;
  let quadro = null;
  let feito = false;

  const parar = () => {
    if (feito) return;
    cancelAnimationFrame(quadro);
    inicio = null;
    botao.classList.remove('segurando');
    anel.style.strokeDasharray = '0 100';
  };
  const passo = (agora) => {
    const progresso = Math.min(1, (agora - inicio) / DURACAO);
    anel.style.strokeDasharray = `${progresso * 100} 100`;
    if (progresso < 1) { quadro = requestAnimationFrame(passo); return; }
    feito = true;
    executar();
  };
  const comecar = (e) => {
    if (feito || inicio !== null) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    inicio = performance.now();
    botao.classList.add('segurando');
    quadro = requestAnimationFrame(passo);
  };
  const executar = async () => {
    botao.classList.remove('segurando');
    botao.querySelector('span').textContent = '…';
    const resultado = await acao();
    if (resultado?.erro) {
      feito = false;
      parar();
      botao.querySelector('span').textContent = `Segure para ${rotulo}`;
      const erro = document.getElementById('erroPoder');
      erro.textContent = resultado.erro;
      erro.hidden = false;
      return;
    }
    botao.classList.add('autorizado');
    botao.querySelector('span').innerHTML = '<i class="ic ic-check" aria-hidden="true"></i> Autorizado';
    if (resultado?.html) {
      conteudo.querySelector('.dica-segurar').outerHTML = resultado.html;
      conteudo.querySelector('[data-fechar]').textContent = 'Concluir';
    } else {
      setTimeout(() => modalPoder.close(), 750);
    }
  };

  botao.addEventListener('pointerdown', comecar);
  botao.addEventListener('keydown', comecar);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => botao.addEventListener(ev, parar));
  botao.addEventListener('keyup', parar);
  botao.focus();
}

modalPoder.addEventListener('click', (e) => {
  if (e.target === modalPoder || e.target.closest('[data-fechar]')) modalPoder.close();
});

async function aplicarPoder(tipo, id) {
  const conta = contas.find((c) => c.id === Number(id));
  if (!conta) return;
  const nome = `<span class="modal-alvo">${esc(conta.nome)}</span>`;
  const destacar = async () => {
    await carregar();
    const cartao = elLista.querySelector(`[data-id="${conta.id}"] .cracha`);
    cartao?.classList.add('recebeu-poder');
  };

  if (tipo === 'suspender' || tipo === 'reativar') {
    const suspender = tipo === 'suspender';
    autorizar({
      icone: suspender ? '<i class="ic ic-bloqueio" aria-hidden="true"></i>' : '<i class="ic ic-cadeado-aberto" aria-hidden="true"></i>',
      titulo: suspender ? 'Suspender acesso' : 'Reativar acesso',
      texto: suspender
        ? `${nome} perde o acesso imediatamente e é desconectado da plataforma.`
        : `${nome} volta a entrar normalmente na plataforma.`,
      rotulo: suspender ? 'suspender' : 'reativar',
      perigo: suspender,
      acao: async () => {
        const { ok, dados } = await API.atualizarConta(conta.id, { ativo: !suspender });
        if (!ok) return { erro: dados.erro || 'Não foi possível concluir.' };
        registrarPoder(suspender ? '<i class="ic ic-bloqueio" aria-hidden="true"></i>' : '<i class="ic ic-cadeado-aberto" aria-hidden="true"></i>', `Você ${suspender ? 'suspendeu' : 'reativou'} <strong>${esc(conta.nome)}</strong>`);
        Efeitos.toast(`${esc(conta.nome)} ${suspender ? 'foi suspenso(a)' : 'foi reativado(a)'}`, { icone: suspender ? '<i class="ic ic-bloqueio" aria-hidden="true"></i>' : '<i class="ic ic-cadeado-aberto" aria-hidden="true"></i>' });
        destacar();
        return {};
      },
    });
  }

  if (tipo === 'promover' || tipo === 'rebaixar') {
    const promover = tipo === 'promover';
    autorizar({
      icone: promover ? '<i class="ic ic-seta-cima" aria-hidden="true"></i>' : '<i class="ic ic-seta-baixo" aria-hidden="true"></i>',
      titulo: promover ? 'Promover a analista' : 'Tornar colaborador',
      texto: promover
        ? `${nome} passa a atender chamados na mesa do analista.`
        : `${nome} deixa de atender chamados e passa a abrir chamados.`,
      rotulo: promover ? 'promover' : 'confirmar',
      acao: async () => {
        const { ok, dados } = await API.atualizarConta(conta.id, { perfil: promover ? 'analista' : 'colaborador' });
        if (!ok) return { erro: dados.erro || 'Não foi possível concluir.' };
        registrarPoder(promover ? '<i class="ic ic-seta-cima" aria-hidden="true"></i>' : '<i class="ic ic-seta-baixo" aria-hidden="true"></i>', `Você ${promover ? 'promoveu' : 'moveu'} <strong>${esc(conta.nome)}</strong> para ${promover ? 'analista' : 'colaborador'}`);
        if (promover) Efeitos.confete(null, 60);
        Efeitos.toast(`${esc(conta.nome)} agora é <strong>${promover ? 'analista' : 'colaborador'}</strong>`, { icone: promover ? '<i class="ic ic-medalha" aria-hidden="true"></i>' : '<i class="ic ic-atualizar" aria-hidden="true"></i>', tipo: 'sucesso' });
        destacar();
        return {};
      },
    });
  }

  if (tipo === 'senha') {
    const nova = gerarSenha();
    autorizar({
      icone: '<i class="ic ic-chave" aria-hidden="true"></i>',
      titulo: 'Redefinir senha',
      texto: `Uma nova senha provisória será gerada para ${nome}. A senha atual deixa de funcionar.`,
      rotulo: 'redefinir',
      acao: async () => {
        const { ok, dados } = await API.redefinirSenha(conta.id, nova);
        if (!ok) return { erro: dados.erro || 'Não foi possível redefinir.' };
        registrarPoder('<i class="ic ic-chave" aria-hidden="true"></i>', `Você redefiniu a senha de <strong>${esc(conta.nome)}</strong>`);
        destacar();
        return { html: `<div><p>Nova senha de ${esc(conta.nome)}:</p><p class="senha-nova">${esc(nova)}</p></div>` };
      },
    });
  }
}

elLista.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-poder]');
  if (botao) aplicarPoder(botao.dataset.poder, botao.dataset.id);
});

// ---------- Emissão de crachá ----------
elForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  elAviso.hidden = true;
  const dados = { nome: elNome.value.trim(), email: elEmail.value.trim(), perfil: perfilEscolhido(), senha: elSenha.value };
  if (!dados.nome || !dados.email) { mostrarAviso('Preencha nome e e-mail.'); return; }
  if (dados.senha.length < 6) { mostrarAviso('A senha provisória deve ter pelo menos 6 caracteres.'); return; }

  elBotao.disabled = true;
  elBotao.textContent = 'Emitindo…';
  try {
    const { ok, status, dados: resposta } = await API.criarConta(dados);
    if (status === 401) return Sessao.sair('expirou');
    if (!ok) { mostrarAviso(resposta.erro || 'Não foi possível criar a conta.'); return; }

    // Imprime o crachá na prévia e voa para a equipe
    elPrevia.innerHTML = `<ul class="crachas" style="grid-template-columns:1fr">${crachaHtml(resposta, { previa: true })}</ul>`;
    elPrevia.classList.remove('imprimindo');
    void elPrevia.offsetWidth;
    elPrevia.classList.add('imprimindo');
    await new Promise((r) => setTimeout(r, 1050));
    await Efeitos.voar(elPrevia.querySelector('.cracha-item'), elLista, { duracao: 750, escalaFinal: .6 });

    idDestacado = resposta.id;
    filtro = '';
    document.querySelectorAll('.filtro').forEach((b) => b.classList.toggle('ativo', b.dataset.filtro === ''));
    registrarPoder('<i class="ic ic-cracha" aria-hidden="true"></i>', `Você emitiu o crachá de <strong>${esc(resposta.nome)}</strong> (${ROTULOS[resposta.perfil]})`);
    await carregar();
    elLista.querySelector(`[data-id="${resposta.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    Efeitos.confete(elLista.querySelector(`[data-id="${resposta.id}"]`), 50);
    Efeitos.toast(`Crachá de <strong>${esc(resposta.nome)}</strong> emitido!`, { icone: '<i class="ic ic-cracha" aria-hidden="true"></i>', tipo: 'sucesso' });

    document.getElementById('credNome').textContent = resposta.nome;
    document.getElementById('credArea').textContent = ROTULOS[resposta.perfil];
    document.getElementById('credEmail').textContent = resposta.email;
    document.getElementById('credSenha').textContent = dados.senha;
    elCredencial.hidden = false;

    elForm.reset();
    elSenha.value = gerarSenha();
    elDica.textContent = DICAS[perfilEscolhido()];
    renderizarPrevia();
  } catch {
    mostrarOffline(elOffline);
  } finally {
    elBotao.disabled = false;
    elBotao.textContent = 'Emitir crachá';
  }
});

[elNome, elEmail].forEach((campo) => campo.addEventListener('input', renderizarPrevia));
document.querySelectorAll('input[name="perfil"]').forEach((radio) => radio.addEventListener('change', () => {
  elDica.textContent = DICAS[perfilEscolhido()];
  renderizarPrevia();
}));
document.getElementById('gerarSenha').addEventListener('click', () => { elSenha.value = gerarSenha(); });

document.getElementById('copiarCredencial').addEventListener('click', async (evento) => {
  const dd = elCredencial.querySelectorAll('dd');
  const texto = `Acesso ao HelpIA\nÁrea de login: ${dd[0].textContent}\nE-mail: ${dd[1].textContent}\nSenha: ${dd[2].textContent}`;
  try {
    await navigator.clipboard.writeText(texto);
    evento.target.innerHTML = '<i class="ic ic-check" aria-hidden="true"></i> Copiado';
  } catch {
    evento.target.textContent = 'Não foi possível copiar';
  }
  setTimeout(() => { evento.target.innerHTML = '<i class="ic ic-copiar" aria-hidden="true"></i> Copiar dados'; }, 2000);
});

// ---------- Filtros ----------
document.querySelectorAll('.filtro').forEach((botao) => botao.addEventListener('click', () => {
  document.querySelectorAll('.filtro').forEach((b) => b.classList.toggle('ativo', b === botao));
  filtro = botao.dataset.filtro;
  renderizarEquipe();
}));
document.getElementById('busca').addEventListener('input', renderizarEquipe);

// ---------- Início ----------
if (usuario) {
  Sessao.montarMenu(usuario);
  if (new URLSearchParams(location.search).has('bem-vindo')) document.getElementById('boasVindas').hidden = false;
  elDica.textContent = DICAS[perfilEscolhido()];
  elSenha.value = gerarSenha();
  renderizarPrevia();
  carregar();
  setInterval(() => { if (!modalPoder.open && !document.hidden) carregar(); }, 8000);
}
