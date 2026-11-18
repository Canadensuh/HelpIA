/* =========================================================
   contas.js — centro de comando do gestor
   Emite crachás (contas), suspende/reativa, promove/rebaixa e
   redefine senhas. Ações de poder exigem "segurar para autorizar".
   Tela "Usuários": só os crachás, com abas Geral (todos) / Analistas /
   Colaboradores / Gestores. Cada crachá tem a cor do cargo e uma
   engrenagem no canto superior direito com o menu (editar, senha,
   cargo e suspender/reativar).
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
const modalEmissor = document.getElementById('modalEmissor');
const modalEditar = document.getElementById('modalEditar');
let contaEmEdicao = null;

// Esta tela não tem o Helpy: avisos importantes viram um aviso (toast) rápido
const helpy = { dizer() {} };
const elMenu = document.getElementById('menuCracha');
let menuDe = null;               // id da conta cujo menu está aberto
let helpyCumprimentou = true;
let avisouLimite = false;

const esc = (texto) => escaparHtml(String(texto ?? ''));
const ROTULOS = { gestor: 'Gestor', analista: 'Analista', colaborador: 'Colaborador' };
const DICAS = {
  analista: 'Atende a fila na mesa do analista. Conta no limite do plano.',
  colaborador: 'Abre chamados pelo HelpIA. Não conta no limite de analistas.',
  gestor: 'Vê o Painel de Controle, define metas e cuida dos crachás da empresa.',
};
const ICONES_CARGO = { gestor: 'coroa', analista: 'ferramenta', colaborador: 'usuario' };

let contas = [];
let chamados = [];
let filtro = 'geral';          // aba aberta: geral (todos), analista, colaborador ou gestor
const ORDEM_CARGO = { gestor: 0, analista: 1, colaborador: 2 };
let soSuspensos = false;
let idDestacado = null;
const eventosDaSessao = [];

const perfilEscolhido = () => document.querySelector('input[name="perfil"]:checked').value;
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

/** Crachá no modelo clássico (cordão, faixa listrada, foto redonda, código de barras),
    com a cor do cargo e a engrenagem de configurações no canto superior direito. */
function crachaHtml(conta, { previa = false } = {}) {
  const suspenso = conta.ativo === false;
  const eu = conta.id === usuario.id;
  const engrenagem = previa ? '' : eu
    ? '<span class="cracha-voce"><i class="ic ic-coroa" aria-hidden="true"></i> você</span>'
    : `<button type="button" class="cracha-config" data-menu="${conta.id}" aria-haspopup="menu" aria-expanded="false"
         aria-label="Configurações do crachá de ${esc(conta.nome)}" title="Configurações">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
       </button>`;
  return `
    <li class="cracha-item" data-id="${conta.id ?? ''}">
      <span class="cordao" aria-hidden="true"></span>
      <article class="cracha p-${conta.perfil} ${suspenso ? 'suspenso' : ''} ${conta.id === idDestacado ? 'emitido' : ''}">
        <span class="cracha-faixa"></span>
        ${engrenagem}
        <span class="cracha-foto" aria-hidden="true">${Avatar.conteudo(conta)}</span>
        <span class="cracha-nome">${esc(conta.nome || 'Nome da pessoa')}</span>
        <span class="cracha-cargo">${ROTULOS[conta.perfil]}</span>
        <span class="cracha-email">${esc(conta.email || 'email@empresa.com')}</span>
        <span class="cracha-senha" aria-label="Senha oculta">Senha <b>••••••••</b></span>
        <span class="cracha-id">ID ${String(conta.id ?? 0).padStart(4, '0')} · ${esc(usuario.empresa?.nome || '')}</span>
        <span class="codigo-barras" aria-hidden="true"></span>
        ${suspenso ? '<span class="cracha-suspenso">SUSPENSO</span>' : ''}
        ${conta.trocar_senha ? '<span class="cracha-troca"><i class="ic ic-chave" aria-hidden="true"></i> troca de senha pedida</span>' : ''}
      </article>
    </li>`;
}

// ---------- Menu da engrenagem ----------
function abrirMenu(botao) {
  const conta = contas.find((c) => c.id === Number(botao.dataset.menu));
  if (!conta) return;
  if (menuDe === conta.id && !elMenu.hidden) { fecharMenu(); return; }
  fecharMenu();
  menuDe = conta.id;
  const suspenso = conta.ativo === false;
  const outrosCargos = ['analista', 'colaborador', 'gestor'].filter((p) => p !== conta.perfil);
  const item = (poder, icone, rotulo, perigo = false) =>
    `<button type="button" role="menuitem" class="menu-item ${perigo ? 'perigo' : ''}" data-poder="${poder}" data-id="${conta.id}">${ic(icone)} ${rotulo}</button>`;
  elMenu.innerHTML = `
    <span class="menu-titulo">${esc(conta.nome)}</span>
    ${item('editar', 'caneta', 'Editar nome e e-mail')}
    ${item('senha', 'dado', 'Gerar senha nova')}
    ${item('pedir-troca', 'chave', conta.trocar_senha ? 'Cancelar pedido de troca de senha' : 'Pedir troca de senha')}
    <span class="menu-separador" role="separator"></span>
    ${outrosCargos.map((p) => item(`cargo-${p}`, ICONES_CARGO[p], `Tornar ${ROTULOS[p].toLowerCase()}`)).join('')}
    <span class="menu-separador" role="separator"></span>
    <button type="button" role="menuitem" class="menu-acesso ${suspenso ? 'reativar' : 'suspender'}" data-poder="${suspenso ? 'reativar' : 'suspender'}" data-id="${conta.id}">
      ${suspenso ? ic('cadeado-aberto') : ic('bloqueio')}
      <span><b>${suspenso ? 'Reativar acesso' : 'Suspender acesso'}</b>
      <small>${suspenso ? 'A pessoa volta a entrar na plataforma' : 'A pessoa é desconectada na hora'}</small></span>
    </button>`;
  const r = botao.getBoundingClientRect();
  elMenu.hidden = false;
  const largura = elMenu.offsetWidth;
  elMenu.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.right - largura))}px`;
  const cabeEmbaixo = r.bottom + elMenu.offsetHeight + 8 < innerHeight;
  elMenu.style.top = `${cabeEmbaixo ? r.bottom + 6 : r.top - elMenu.offsetHeight - 6}px`;
  botao.setAttribute('aria-expanded', 'true');
  elMenu.querySelector('.menu-item')?.focus();
}
function fecharMenu() {
  elMenu.hidden = true;
  document.querySelectorAll('[data-menu][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  menuDe = null;
}
document.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-menu]');
  if (botao) { e.stopPropagation(); abrirMenu(botao); return; }
  const itemMenu = e.target.closest('#menuCracha [data-poder]');
  if (itemMenu) { fecharMenu(); aplicarPoder(itemMenu.dataset.poder, itemMenu.dataset.id); return; }
  if (!elMenu.hidden && !e.target.closest('#menuCracha')) fecharMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
// Mudou o tamanho da janela: o menu acompanha a engrenagem (em vez de sumir)
addEventListener('resize', () => {
  if (elMenu.hidden || menuDe == null) return;
  const botao = document.querySelector(`[data-menu="${menuDe}"]`);
  if (!botao) { fecharMenu(); return; }
  const r = botao.getBoundingClientRect();
  elMenu.style.left = `${Math.max(8, Math.min(innerWidth - elMenu.offsetWidth - 8, r.right - elMenu.offsetWidth))}px`;
  elMenu.style.top = `${r.bottom + 6}px`;
});

function renderizarPrevia() {
  elPrevia.innerHTML = `<ul class="crachas" style="grid-template-columns:1fr">${crachaHtml({
    id: null, nome: elNome.value.trim(), email: elEmail.value.trim(), perfil: perfilEscolhido(), ativo: true,
  }, { previa: true })}</ul>`;
}

// ---------- Painéis ----------
function renderizarHero() {
  if (!document.getElementById('saudacao')) return;      // o painel novo não tem mais o "hero"
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('saudacao').innerHTML = `${saudacao}, ${esc(usuario.nome.split(' ')[0])}. Você está no <span>comando</span>.`;
  const empresa = usuario.empresa || {};
  document.getElementById('empresaResumo').textContent =
    `${empresa.nome || 'Sua empresa'} · Plano ${empresa.plano_nome || ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  Efeitos.contarAte(document.getElementById('totalSob'), contas.filter((c) => c.id !== usuario.id).length);
}

function renderizarKpis() {
  if (!document.getElementById('kpiAtivas')) return;       // indicadores ficam no Painel de Controle
  const empresa = usuario.empresa || {};
  const analistas = contas.filter((c) => c.perfil === 'analista').length;
  const limite = empresa.limite_analistas;
  Efeitos.contarAte(document.getElementById('kpiAtivas'), contas.filter((c) => c.ativo !== false).length);
  Efeitos.contarAte(document.getElementById('kpiAnalistas'), analistas);
  document.getElementById('kpiAnalistasRotulo').textContent = limite == null ? 'analistas · sem limite' : `analistas de ${limite}`;
  document.getElementById('scoreAnalistas').classList.toggle('cheio', limite != null && analistas >= limite);
  Efeitos.contarAte(document.getElementById('kpiAbertos'), chamados.filter((c) => c.status !== 'Resolvido').length);
  Efeitos.contarAte(document.getElementById('kpiHoje'),
    chamados.filter((c) => c.status === 'Resolvido' && (c.resolvido_em || '').startsWith(hojeIso())).length);
}

function renderizarEquipe() {
  const termo = document.getElementById('busca').value.trim().toLowerCase();
  const visiveis = contas
    .filter((c) => filtro === 'geral' || c.perfil === filtro)
    .filter((c) => !soSuspensos || c.ativo === false)
    .filter((c) => !termo || Busca.normalizar(`${c.nome} ${c.email} ${String(c.id).padStart(4, '0')} ${c.id} ${ROTULOS[c.perfil]}`).includes(Busca.normalizar(termo)))
    .sort((a, b) => ORDEM_CARGO[a.perfil] - ORDEM_CARGO[b.perfil] || a.nome.localeCompare(b.nome));
  document.getElementById('contadorCrachas').textContent = visiveis.length;
  // Quantos crachás há em cada aba
  document.querySelectorAll('[data-aba]').forEach((b) => {
    const qtd = b.dataset.aba === 'geral' ? contas.length : contas.filter((c) => c.perfil === b.dataset.aba).length;
    const el = b.querySelector('.aba-qtd');
    if (el) el.textContent = qtd;
  });
  elLista.innerHTML = visiveis.length
    ? visiveis.map((c, i) => crachaHtml(c, { indice: i })).join('')
    : `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('cracha')}</span>
        <strong>${soSuspensos ? 'Ninguém suspenso aqui' : 'Ninguém nesta aba ainda'}</strong>
        <span>${soSuspensos ? 'Ótimo: todo mundo com acesso.' : 'Clique em “Emitir crachá” para criar o acesso.'}</span></li>`;
}

function renderizarRanking() {
  if (!document.getElementById('podio')) return;          // o ranking agora fica na tela de Metas
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
  if (!document.getElementById('registro')) return;        // atividades ficam no Painel de Controle
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
  falarDoPainel();
}

/** Helpy do gestor: boas-vindas e aviso (com foco) quando o plano lota de analistas. */
function falarDoPainel() {
  const empresa = usuario.empresa || {};
  const analistas = contas.filter((c) => c.perfil === 'analista').length;
  const abertos = chamados.filter((c) => c.status !== 'Resolvido').length;
  if (!helpyCumprimentou) {
    helpyCumprimentou = true;
    helpy.dizer(`<p>Olá, <strong>${esc(usuario.nome.split(' ')[0])}</strong>! Daqui você emite os crachás e cuida da equipe.</p>
      <p>${abertos ? `Agora tem <strong>${abertos} chamado${abertos > 1 ? 's' : ''}</strong> em aberto na empresa.` : 'Nenhum chamado em aberto agora. Tudo tranquilo!'}</p>`, { humor: 'acenando' });
  }
  const limite = empresa.limite_analistas;
  if (!avisouLimite && limite != null && analistas >= limite) {
    avisouLimite = true;
    Efeitos.toast(`<strong>Plano no limite:</strong> ${limite} analistas no ${esc(empresa.plano_nome || '')}. Para emitir mais, mude alguém de cargo ou troque de plano.`,
      { icone: ic('alerta'), tipo: 'alerta', duracao: 7000 });
  }
}

// ---------- Autorização: segurar para confirmar ----------
/* Botão largo que vai "enchendo" enquanto você segura. Soltou antes do fim:
   a barra volta devagar e a dica avisa. Encheu: vira check e a ação acontece. */
function autorizar({ icone, titulo, texto, rotulo, perigo = false, acao, conta = null }) {
  const conteudo = document.getElementById('conteudoPoder');
  const DURACAO = 1200;
  const DICA = `Mantenha pressionado por ${(DURACAO / 1000).toLocaleString('pt-BR')} segundo · ou segure Enter`;
  conteudo.innerHTML = `
    <div class="poder-icone ${perigo ? 'perigo' : ''}">${icone}</div>
    <h2>${titulo}</h2>
    ${conta ? `<div class="poder-alvo">${Avatar.html(conta, 'poder-avatar')}
      <span><b>${esc(conta.nome)}</b><small>${ROTULOS[conta.perfil]} · ${esc(conta.email)}</small></span></div>` : ''}
    <p>${texto}</p>
    <button type="button" class="segurar ${perigo ? 'perigo' : ''}" id="botaoSegurar" aria-label="Segure para ${rotulo}">
      <span class="segurar-barra" aria-hidden="true"></span>
      <span class="segurar-texto">${icone}<span data-rotulo>Segure para ${rotulo}</span></span>
      <span class="segurar-pct" aria-hidden="true"></span>
    </button>
    <p class="dica-segurar" id="dicaSegurar" aria-live="polite">${DICA}</p>
    <p class="aviso aviso-erro" id="erroPoder" hidden></p>
    <div class="modal-acoes"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button></div>`;
  modalPoder.showModal();

  const botao = document.getElementById('botaoSegurar');
  const elRotulo = botao.querySelector('[data-rotulo]');
  const elPct = botao.querySelector('.segurar-pct');
  const elDica = document.getElementById('dicaSegurar');
  let inicio = null;
  let quadro = null;
  let feito = false;
  let progresso = 0;

  const pintar = (p) => {
    progresso = p;
    botao.style.setProperty('--p', p.toFixed(3));
    botao.classList.toggle('meio', p > .5);
    elPct.textContent = p > 0 && p < 1 ? `${Math.round(p * 100)}%` : '';
  };
  const parar = () => {
    if (feito || inicio === null) return;
    cancelAnimationFrame(quadro);
    inicio = null;
    botao.classList.remove('segurando');
    if (progresso > .05) {
      elDica.textContent = 'Quase! Segure até a barra encher por completo.';
      elDica.classList.add('alerta');
      botao.classList.remove('tremeu'); void botao.offsetWidth; botao.classList.add('tremeu');
    }
    pintar(0);
  };
  const passo = (agora) => {
    const p = Math.min(1, (agora - inicio) / DURACAO);
    pintar(p);
    if (p < 1) { quadro = requestAnimationFrame(passo); return; }
    feito = true;
    executar();
  };
  const comecar = (e) => {
    if (feito || inicio !== null) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    inicio = performance.now();
    botao.classList.add('segurando');
    elDica.textContent = 'Segurando… não solte';
    elDica.classList.remove('alerta');
    navigator.vibrate?.(12);
    quadro = requestAnimationFrame(passo);
  };
  const executar = async () => {
    botao.classList.remove('segurando');
    botao.classList.add('processando');
    elRotulo.textContent = 'Aplicando…';
    const resultado = await acao();
    botao.classList.remove('processando');
    if (resultado?.erro) {
      feito = false;
      inicio = null;
      pintar(0);
      elRotulo.textContent = `Segure para ${rotulo}`;
      elDica.textContent = DICA;
      const erro = document.getElementById('erroPoder');
      erro.textContent = resultado.erro;
      erro.hidden = false;
      return;
    }
    navigator.vibrate?.([20, 40, 20]);
    botao.classList.add('autorizado');
    botao.querySelector('.segurar-texto').innerHTML = '<i class="ic ic-check" aria-hidden="true"></i><span>Feito!</span>';
    if (resultado?.html) {
      elDica.outerHTML = resultado.html;
      conteudo.querySelector('[data-fechar]').textContent = 'Concluir';
    } else {
      elDica.textContent = 'Autorizado.';
      setTimeout(() => modalPoder.close(), 900);
    }
  };

  botao.addEventListener('pointerdown', comecar);
  botao.addEventListener('keydown', comecar);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => botao.addEventListener(ev, parar));
  botao.addEventListener('keyup', parar);
  botao.addEventListener('contextmenu', (e) => e.preventDefault());     // segurar no celular não abre o menu
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

  if (tipo === 'editar') { abrirEdicao(conta); return; }

  if (tipo === 'pedir-troca') {
    const { ok, dados } = await API.atualizarConta(conta.id, { trocar_senha: !conta.trocar_senha });
    if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível concluir.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
    registrarPoder(ic('chave'), dados.trocar_senha ? `Você pediu para <strong>${esc(conta.nome)}</strong> trocar a senha` : `Você cancelou o pedido de troca de senha de <strong>${esc(conta.nome)}</strong>`);
    Efeitos.toast(dados.trocar_senha ? `Pedido de troca de senha enviado para <strong>${esc(conta.nome)}</strong>.` : 'Pedido de troca cancelado.', { icone: ic('chave') });
    destacar();
    return;
  }

  if (tipo.startsWith('cargo-')) {
    const novo = tipo.slice(6);
    const TEXTOS = {
      analista: 'passa a atender chamados na mesa do analista.',
      colaborador: 'passa a abrir chamados (e deixa de atender).',
      gestor: 'passa a ver o Painel de Controle, definir metas e cuidar dos crachás.',
    };
    autorizar({
      conta,
      icone: ic(ICONES_CARGO[novo]),
      titulo: `Tornar ${ROTULOS[novo].toLowerCase()}`,
      texto: `${nome} ${TEXTOS[novo]}`,
      rotulo: 'confirmar',
      perigo: novo === 'gestor',
      acao: async () => {
        const { ok, dados } = await API.atualizarConta(conta.id, { perfil: novo });
        if (!ok) return { erro: dados.erro || 'Não foi possível concluir.' };
        registrarPoder(ic(ICONES_CARGO[novo]), `Você tornou <strong>${esc(conta.nome)}</strong> ${ROTULOS[novo].toLowerCase()}`);
        Efeitos.toast(`${esc(conta.nome)} agora é <strong>${ROTULOS[novo].toLowerCase()}</strong>`, { icone: ic(ICONES_CARGO[novo]), tipo: 'sucesso' });
        if (filtro !== "geral") escolherAba(novo);
        destacar();
        return {};
      },
    });
    return;
  }

  if (tipo === 'suspender' || tipo === 'reativar') {
    const suspender = tipo === 'suspender';
    autorizar({
      conta,
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
      conta,
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
      conta,
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
    if (filtro !== "geral") escolherAba(resposta.perfil);
    registrarPoder('<i class="ic ic-cracha" aria-hidden="true"></i>', `Você emitiu o crachá de <strong>${esc(resposta.nome)}</strong> (${ROTULOS[resposta.perfil]})`);
    await carregar();
    elLista.querySelector(`[data-id="${resposta.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    Efeitos.confete(elLista.querySelector(`[data-id="${resposta.id}"]`), 50);
    Efeitos.toast(`Crachá de <strong>${esc(resposta.nome)}</strong> emitido!`, { icone: '<i class="ic ic-cracha" aria-hidden="true"></i>', tipo: 'sucesso' });
    helpy.dizer(`Crachá de <strong>${esc(resposta.nome)}</strong> pronto! <i class="ic ic-cracha" aria-hidden="true"></i> Não esqueça de enviar os dados de acesso para a pessoa.`, { humor: 'comemorando', tipo: 'sucesso' });

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

// ---------- Abas (Analistas / Colaboradores) e "só suspensos" ----------
function escolherAba(aba) {
  filtro = aba;
  document.querySelectorAll('[data-aba]').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.aba === aba);
    b.setAttribute('aria-selected', String(b.dataset.aba === aba));
  });
  renderizarEquipe();
}
document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => escolherAba(b.dataset.aba)));
document.getElementById('soSuspensos').addEventListener('click', (e) => {
  soSuspensos = !soSuspensos;
  e.currentTarget.classList.toggle('ativo', soSuspensos);
  e.currentTarget.setAttribute('aria-pressed', String(soSuspensos));
  renderizarEquipe();
});

// ---------- Emitir crachá (modal) ----------
document.getElementById('abrirEmissor').addEventListener('click', () => {
  elCredencial.hidden = true;
  elAviso.hidden = true;
  elNome.value = '';
  elEmail.value = '';
  elSenha.value = gerarSenha();
  document.getElementById({ colaborador: 'novoColaborador', gestor: 'novoGestor' }[filtro] || 'novoAnalista').checked = true;
  elDica.textContent = DICAS[perfilEscolhido()];
  renderizarPrevia();
  modalEmissor.showModal();
  setTimeout(() => elNome.focus(), 50);
});
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
  if (e.target === d || e.target.closest('[data-fechar]')) {
    if (d !== modalPoder) d.close();
  }
}));

// ---------- Editar crachá ----------
function abrirEdicao(conta) {
  contaEmEdicao = conta;
  document.getElementById('editarNome').value = conta.nome;
  document.getElementById('editarEmail').value = conta.email;
  document.getElementById('erroEditar').hidden = true;
  desenharSenhaEdicao();
  modalEditar.showModal();
}
function desenharSenhaEdicao() {
  const conta = contaEmEdicao;
  document.getElementById('editarSenha').innerHTML = `
    <strong><i class="ic ic-chave" aria-hidden="true"></i> Senha</strong>
    <p>${conta.trocar_senha ? 'Troca de senha pedida: no próximo acesso, a pessoa precisa criar uma senha nova.' : 'Peça para a pessoa trocar a senha ou gere uma senha provisória nova.'}</p>
    <div class="editar-senha-acoes">
      <button type="button" class="btn btn-sm" data-trocar-senha>${conta.trocar_senha ? 'Cancelar o pedido de troca' : 'Solicitar troca de senha'}</button>
      <button type="button" class="btn btn-sm" data-nova-senha><i class="ic ic-dado" aria-hidden="true"></i> Gerar senha nova</button>
    </div>`;
}
document.getElementById('editarSenha').addEventListener('click', async (e) => {
  const conta = contaEmEdicao;
  if (!conta) return;
  if (e.target.closest('[data-trocar-senha]')) {
    const { ok, dados } = await API.atualizarConta(conta.id, { trocar_senha: !conta.trocar_senha });
    if (!ok) { Efeitos.toast(esc(dados.erro || 'Não foi possível concluir.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
    contaEmEdicao = dados;
    desenharSenhaEdicao();
    registrarPoder(ic('chave'), dados.trocar_senha ? `Você pediu para <strong>${esc(conta.nome)}</strong> trocar a senha` : `Você cancelou o pedido de troca de senha de <strong>${esc(conta.nome)}</strong>`);
    Efeitos.toast(dados.trocar_senha ? `Pedido de troca de senha enviado para <strong>${esc(conta.nome)}</strong>.` : 'Pedido de troca cancelado.', { icone: ic('chave') });
    carregar();
  }
  if (e.target.closest('[data-nova-senha]')) {
    modalEditar.close();
    aplicarPoder('senha', conta.id);
  }
});
document.getElementById('formEditar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const conta = contaEmEdicao;
  const erro = document.getElementById('erroEditar');
  const nome = document.getElementById('editarNome').value.trim();
  const email = document.getElementById('editarEmail').value.trim();
  const { ok, dados } = await API.atualizarConta(conta.id, { nome, email });
  if (!ok) { erro.textContent = dados.erro || 'Não foi possível salvar.'; erro.hidden = false; return; }
  modalEditar.close();
  registrarPoder(ic('caneta'), `Você editou o crachá de <strong>${esc(dados.nome)}</strong>`);
  Efeitos.toast(`Crachá de <strong>${esc(dados.nome)}</strong> atualizado.`, { icone: ic('caneta'), tipo: 'sucesso' });
  await carregar();
  elLista.querySelector(`[data-id="${conta.id}"] .cracha`)?.classList.add('recebeu-poder');
});

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
