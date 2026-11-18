/* =========================================================
   historico.js — Histórico de Tickets (tela inteira)
   - Colaborador: os tickets dele já finalizados (pode limpar).
   - Analista: os tickets que ele atendeu.
   - Gestor: tudo o que a equipe finalizou.
   Busca por #ID, pessoa ou problema; filtros por analista,
   colaborador e tipo de problema.
   ========================================================= */

const usuario = Sessao.exigir(['colaborador', 'analista', 'gestor']);
const esc = TicketUI.esc;

const elLista = document.getElementById('lista');
const elBusca = document.getElementById('busca');
const elAnalista = document.getElementById('filtroAnalista');
const elSolicitante = document.getElementById('filtroSolicitante');
const elProblema = document.getElementById('filtroProblema');
const elLimpar = document.getElementById('limparHistorico');
const elModalLimpar = document.getElementById('modalLimpar');
const elOffline = document.getElementById('avisoOffline');

const SUBTITULOS = {
  colaborador: 'Seus tickets já finalizados, com o carimbo do analista que resolveu.',
  analista: 'Os tickets que você atendeu e carimbou.',
  gestor: 'Tudo o que a sua equipe já finalizou.',
};
let todos = [];

async function carregar() {
  let resposta;
  try {
    resposta = await API.listar(usuario.perfil === 'colaborador' ? { solicitante: usuario.nome } : {});
    elOffline.hidden = true;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  todos = (resposta.dados || [])
    .filter((c) => c.status === 'Resolvido')
    .filter((c) => usuario.perfil !== 'analista' || c.analista === usuario.nome)
    .sort((a, b) => (b.resolvido_em || '').localeCompare(a.resolvido_em || ''));
  montarFiltros();
  renderizar();
}

function montarFiltros() {
  const manter = (el, html) => { const v = el.value; el.innerHTML = html; el.value = v; };
  manter(elAnalista, TicketUI.opcoes(todos.map((c) => c.analista), 'Todos os analistas'));
  manter(elSolicitante, TicketUI.opcoes(todos.map((c) => c.solicitante), 'Todos os colaboradores'));
  manter(elProblema, `<option value="">Todos os problemas</option>${Catalogo.generos
    .filter((g) => todos.some((c) => c.genero === g.id))
    .map((g) => `<option value="${g.id}">${esc(g.titulo)}</option>`).join('')}`);
  // O colaborador já sabe quem ele é; o analista já sabe quem atendeu
  elAnalista.hidden = usuario.perfil === 'analista';
  elSolicitante.hidden = usuario.perfil === 'colaborador';
}

const filtrados = () => TicketUI.filtrar(todos, {
  termo: elBusca.value, analista: elAnalista.value, solicitante: elSolicitante.value, genero: elProblema.value,
});

function renderizar() {
  const lista = filtrados();
  document.getElementById('contador').textContent = lista.length;
  elLimpar.hidden = usuario.perfil !== 'colaborador' || !todos.length;
  elLista.classList.toggle('vazia', !lista.length);
  elLista.innerHTML = lista.length
    ? lista.map((c, i) => TicketUI.padrao(c, {
      historico: true, i,
      linhas: [
        `${ic('relogio')} Aberto ${Efeitos.dataCurta(c.aberto_em)}`,
        usuario.perfil === 'colaborador' ? `${ic('pasta')} ${esc(c.fila)}` : `${ic('usuario')} ${esc(c.solicitante)}`,
      ],
    })).join('')
    : `<li class="mesa-vazia mesa-vazia-centro"><span class="mesa-vazia-ico">${ic('arquivo')}</span>
        <strong>${todos.length ? 'Nada encontrado' : 'O histórico está vazio'}</strong>
        <span>${todos.length ? 'Tente outra busca ou limpe os filtros.' : 'Quando um ticket for finalizado, ele aparece aqui com o carimbo.'}</span></li>`;
}

[elBusca, elAnalista, elSolicitante, elProblema].forEach((el) => el.addEventListener('input', renderizar));

elLista.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-ver]');
  if (!botao) return;
  const c = todos.find((x) => x.numero === Number(botao.dataset.ver));
  if (c) TicketUI.abrir(c);
});

// ---------- Limpar histórico (colaborador): some só para ele, a TI continua com o registro ----------
elLimpar.addEventListener('click', () => {
  const lista = filtrados();
  const filtrando = lista.length !== todos.length;
  document.getElementById('textoLimpar').textContent = filtrando
    ? `Os ${lista.length} ticket(s) que aparecem com o filtro atual saem do seu histórico. A equipe de TI continua com o registro dos atendimentos.`
    : `Todos os ${lista.length} ticket(s) saem do seu histórico. A equipe de TI continua com o registro dos atendimentos.`;
  document.getElementById('erroLimpar').hidden = true;
  elModalLimpar.showModal();
});
document.getElementById('confirmarLimpar').addEventListener('click', async (e) => {
  e.currentTarget.disabled = true;
  for (const c of filtrados()) {
    const { ok, dados } = await API.removerDoHistorico(c.numero);
    if (!ok) {
      const erro = document.getElementById('erroLimpar');
      erro.textContent = dados.erro || 'Não foi possível limpar o histórico.';
      erro.hidden = false;
      e.currentTarget.disabled = false;
      return;
    }
  }
  e.currentTarget.disabled = false;
  elModalLimpar.close();
  Efeitos.toast('Histórico limpo.', { icone: ic('check'), tipo: 'sucesso' });
  carregar();
});

if (usuario) {
  Sessao.montarMenu(usuario);
  document.getElementById('subtitulo').textContent = SUBTITULOS[usuario.perfil];
  carregar();
}
