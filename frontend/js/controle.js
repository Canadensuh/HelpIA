/* =========================================================
   controle.js — Painel de Controle do gestor (dashboard)
   Só visualização: indicadores, atendimentos dos últimos 7 dias,
   tickets em aberto por prioridade, problemas mais comuns,
   analistas x meta de hoje, regra do dia, últimos finalizados
   e atividades. Gráficos em SVG puro, com dica ao passar o
   mouse e a tabela de dados em cada um.
   Cores validadas (scripts/validate_palette.js da skill dataviz,
   sobre o papel #FFFCF2):
   - Abertos/Resolvidos: #2a78d6 / #eb6834 — passa em tudo;
   - Prioridades (alta, média, normal, baixa): #C4452C, #C99300,
     #2a78d6, #2E8B2E — passa; o amarelo fica abaixo de 3:1, por
     isso toda barra de prioridade tem nome e valor escritos.
   ========================================================= */

const usuario = Sessao.exigir(['gestor']);
const esc = TicketUI.esc;
const elPainel = document.getElementById('painel');
const elDica = document.getElementById('dicaGrafico');
const elOffline = document.getElementById('avisoOffline');
const DEMORA_MIN = 30;

const COR = {
  abertos: '#2a78d6', resolvidos: '#eb6834',
  alta: '#C4452C', media: '#C99300', normal: '#2a78d6', baixa: '#2E8B2E',
  barra: '#2a78d6', trilho: '#cde2fb', grade: '#E8DFC6', texto: '#23291B', texto2: '#625E4A',
};

document.getElementById('helpyAvatar').outerHTML = Helpy.avatar('acenando');
const helpy = new Helpy(document.getElementById('helpyRaiz'), document.getElementById('helpyFeed'), { balao: true });
const escritorio = Escritorio.montar();

let chamados = [];
let metas = null;
let assinatura = '';
let falou = false;

/** Largura útil (px) de um cartão que ocupa `colunas` da grade: o SVG é desenhado no tamanho real,
    para as barras ficarem finas (≤ 24px) e o texto não esticar. */
function larguraCartao(colunas = 1) {
  const estilo = getComputedStyle(elPainel);
  const total = estilo.gridTemplateColumns.split(' ').length;
  const gap = parseFloat(estilo.columnGap) || 19;
  const coluna = (elPainel.clientWidth - 10 - gap * (total - 1)) / total;
  const ocupa = Math.min(colunas, total);
  return Math.max(260, Math.floor(coluna * ocupa + gap * (ocupa - 1) - 36));
}
const corta = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

const dia = (iso) => (iso || '').slice(0, 10);
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const numero = (n) => n.toLocaleString('pt-BR');

/** "45 min" ou "1 h 20 min" */
function duracao(minutos) {
  if (minutos == null || Number.isNaN(minutos)) return '—';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Topo "redondo" para o eixo: 0, 1, 2, 5, 10, 20, 50… */
function teto(max) {
  if (max <= 4) return Math.max(2, Math.ceil(max));
  const base = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((k) => k * base).find((v) => v >= max);
}

/** Barra com a ponta de dados arredondada (4px) e a base reta. */
function barraVertical(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function barraHorizontal(x, y, w, h) {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function tabela(titulo, colunas, linhas) {
  return `<details class="dados-tabela"><summary>Ver dados em tabela</summary>
    <table><caption class="sr-only">${esc(titulo)}</caption>
      <thead><tr>${colunas.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${linhas.map((l) => `<tr>${l.map((v, i) => (i ? `<td>${esc(v)}</td>` : `<th scope="row">${esc(v)}</th>`)).join('')}</tr>`).join('')}</tbody>
    </table></details>`;
}

// ---------- Indicadores (números) ----------
function indicadores() {
  const abertos = chamados.filter((c) => c.status !== 'Resolvido');
  const fila = abertos.filter((c) => c.status === 'Aguardando').length;
  const atendimento = abertos.length - fila;
  const hoje = isoDia(new Date());
  const resolvidosHoje = chamados.filter((c) => c.status === 'Resolvido' && dia(c.resolvido_em) === hoje).length;
  const tempos = chamados.filter((c) => c.status === 'Resolvido' && c.resolvido_em)
    .map((c) => (new Date(c.resolvido_em) - new Date(c.aberto_em)) / 60000).filter((m) => m >= 0);
  const medio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  const parados = abertos.filter((c) => TicketUI.minutosParado(c) >= DEMORA_MIN).length;
  const altas = abertos.filter((c) => Catalogo.nivel(c).id === 'alta').length;
  const item = (rotulo, valor, extra = '', classe = '') =>
    `<div class="stat ${classe}"><span class="stat-rotulo">${rotulo}</span><strong class="stat-valor">${valor}</strong>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`;
  return `<section class="cartao-painel cartao-stats" aria-label="Indicadores">
    ${item('Em aberto', numero(abertos.length), `${fila} na fila · ${atendimento} em atendimento`)}
    ${item('Resolvidos hoje', numero(resolvidosHoje), metas ? `meta do time: ${metas.analistas.reduce((s, a) => s + a.meta, 0)}` : '')}
    ${item('Tempo médio até resolver', duracao(medio), `${tempos.length} ticket${tempos.length === 1 ? '' : 's'} finalizado${tempos.length === 1 ? '' : 's'}`)}
    ${item('Prioridade alta em aberto', numero(altas), altas ? `${ic('chama')} atenção` : 'nenhuma agora', altas ? 'stat-alerta' : '')}
    ${item(`Parados há +${DEMORA_MIN} min`, numero(parados), parados ? `${ic('alerta')} <a href="tickets.html">cobrar a equipe</a>` : `${ic('check')} tudo andando`, parados ? 'stat-alerta' : 'stat-ok')}
  </section>`;
}

// ---------- Atendimentos nos últimos 7 dias (colunas agrupadas) ----------
function grafico7Dias() {
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const dados = dias.map((d) => {
    const chave = isoDia(d);
    return {
      rotulo: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      abertos: chamados.filter((c) => dia(c.aberto_em) === chave).length,
      resolvidos: chamados.filter((c) => dia(c.resolvido_em) === chave).length,
    };
  });
  const W = larguraCartao(2); const H = 240; const m = { t: 16, r: 8, b: 40, l: 30 };
  const max = teto(Math.max(1, ...dados.flatMap((d) => [d.abertos, d.resolvidos])));
  const ih = H - m.t - m.b;
  const banda = (W - m.l - m.r) / dados.length;
  const bw = Math.min(24, (banda - 18) / 2);
  const y = (v) => m.t + ih - (v / max) * ih;
  const passos = [0, max / 2, max];
  const marcas = dados.map((d, i) => {
    const cx = m.l + banda * i + banda / 2;
    const xa = cx - bw - 1; const xr = cx + 1;          // 2px de "ar" entre as duas barras
    const hoje = i === dados.length - 1;
    return `
      <g class="grupo-dia">
        <rect class="alvo-hover" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${ih}" fill="transparent"
          data-dica="<b>${esc(d.rotulo)} ${esc(d.data)}</b><br>${d.abertos} aberto${d.abertos === 1 ? '' : 's'} · ${d.resolvidos} resolvido${d.resolvidos === 1 ? '' : 's'}" />
        <path d="${barraVertical(xa, y(d.abertos), bw, y(0) - y(d.abertos))}" fill="${COR.abertos}" />
        <path d="${barraVertical(xr, y(d.resolvidos), bw, y(0) - y(d.resolvidos))}" fill="${COR.resolvidos}" />
        ${hoje ? `<text class="rotulo-valor" x="${xa + bw / 2}" y="${y(d.abertos) - 5}" text-anchor="middle">${d.abertos}</text>
                  <text class="rotulo-valor" x="${xr + bw / 2}" y="${y(d.resolvidos) - 5}" text-anchor="middle">${d.resolvidos}</text>` : ''}
        <text class="rotulo-eixo ${hoje ? 'hoje' : ''}" x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${hoje ? 'hoje' : esc(d.rotulo)}</text>
        <text class="rotulo-eixo fraco" x="${cx}" y="${H - m.b + 30}" text-anchor="middle">${esc(d.data)}</text>
      </g>`;
  }).join('');
  return `<section class="cartao-painel largo-2" aria-labelledby="t7d">
    <header class="cartao-topo"><h3 id="t7d">${ic('grafico')} Atendimentos nos últimos 7 dias</h3>
      <ul class="legenda"><li><i style="background:${COR.abertos}"></i>Abertos</li><li><i style="background:${COR.resolvidos}"></i>Resolvidos</li></ul></header>
    <svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Colunas de tickets abertos e resolvidos por dia, nos últimos 7 dias">
      ${passos.map((v) => `<line class="linha-grade" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" />
        <text class="rotulo-eixo" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${numero(v)}</text>`).join('')}
      ${marcas}
    </svg>
    ${tabela('Atendimentos por dia', ['Dia', 'Abertos', 'Resolvidos'], dados.map((d) => [`${d.rotulo} ${d.data}`, d.abertos, d.resolvidos]))}
  </section>`;
}

// ---------- Barras horizontais (prioridade, problemas) ----------
function barrasHorizontais(itens, { cor = () => COR.barra, sufixo = '' } = {}) {
  const W = larguraCartao(1); const linha = 34; const m = { l: Math.min(170, Math.round(W * .42)), r: 34 };
  const maxTexto = Math.floor((m.l - 12) / 7.2);
  const H = itens.length * linha + 6;
  const max = Math.max(1, ...itens.map((i) => i.valor));
  const largura = W - m.l - m.r;
  return `<svg class="grafico" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(itens.map((i) => `${i.rotulo}: ${i.valor}`).join(', '))}">
    ${itens.map((it, k) => {
      const y = k * linha + 7;
      const w = (it.valor / max) * largura;
      return `<g>
        <rect class="alvo-hover" x="0" y="${y - 4}" width="${W}" height="${linha}" fill="transparent" data-dica="<b>${esc(it.rotulo)}</b><br>${it.valor}${sufixo}" />
        <text class="rotulo-linha" x="${m.l - 10}" y="${y + 15}" text-anchor="end"><title>${esc(it.rotulo)}</title>${esc(corta(it.rotulo, maxTexto))}</text>
        <line class="linha-grade" x1="${m.l}" x2="${m.l}" y1="${y - 4}" y2="${y + linha - 4}" />
        <path d="${barraHorizontal(m.l, y + 2, Math.max(w, it.valor ? 3 : 0), 20)}" fill="${cor(it)}" />
        <text class="rotulo-valor" x="${m.l + w + 7}" y="${y + 16}">${it.valor}</text>
      </g>`;
    }).join('')}
  </svg>`;
}

function graficoPrioridade() {
  const abertos = chamados.filter((c) => c.status !== 'Resolvido');
  const itens = ['alta', 'media', 'normal', 'baixa'].map((id) => ({
    id, rotulo: Catalogo.niveis[id].rotulo, valor: abertos.filter((c) => Catalogo.nivel(c).id === id).length,
  }));
  return `<section class="cartao-painel" aria-labelledby="tPri">
    <header class="cartao-topo"><h3 id="tPri">${ic('chama')} Em aberto por prioridade</h3><span class="cartao-sub">${abertos.length} ticket${abertos.length === 1 ? '' : 's'}</span></header>
    ${barrasHorizontais(itens, { cor: (it) => COR[it.id] })}
    ${tabela('Tickets em aberto por prioridade', ['Prioridade', 'Tickets'], itens.map((i) => [i.rotulo, i.valor]))}
  </section>`;
}

function graficoProblemas() {
  const contagem = {};
  chamados.forEach((c) => { const g = c.genero_titulo || c.categoria; contagem[g] = (contagem[g] || 0) + 1; });
  const itens = Object.entries(contagem).map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor).slice(0, 6);
  return `<section class="cartao-painel" aria-labelledby="tProb">
    <header class="cartao-topo"><h3 id="tProb">${ic('ferramenta')} Problemas mais comuns</h3><span class="cartao-sub">todos os tickets</span></header>
    ${itens.length ? barrasHorizontais(itens, { sufixo: ' ticket(s)' }) : '<p class="cartao-vazio">Ainda sem tickets.</p>'}
    ${tabela('Problemas mais comuns', ['Tipo', 'Tickets'], itens.map((i) => [i.rotulo, i.valor]))}
  </section>`;
}

// ---------- Analistas hoje (medidores feitos / meta) ----------
function analistasHoje() {
  const lista = metas?.analistas || [];
  return `<section class="cartao-painel" aria-labelledby="tAna">
    <header class="cartao-topo"><h3 id="tAna">${ic('equipe')} Analistas hoje</h3><a class="cartao-link" href="metas.html">metas →</a></header>
    ${lista.length ? `<ul class="medidores">${lista.map((a) => {
      const pct = Math.min(100, Math.round((a.feitos_hoje / Math.max(1, a.meta)) * 100));
      const batida = a.feitos_hoje >= a.meta;
      const emMaos = chamados.filter((c) => c.status === 'Em atendimento' && c.analista === a.nome).length;
      return `<li data-dica="<b>${esc(a.nome)}</b><br>${a.feitos_hoje} de ${a.meta} hoje · ${emMaos} na mesa agora">
        <span class="medidor-topo"><b>${esc(a.nome)}</b><span>${batida ? `${ic('check')} meta batida · ` : ''}${a.feitos_hoje}/${a.meta}</span></span>
        <span class="medidor" role="meter" aria-valuemin="0" aria-valuemax="${a.meta}" aria-valuenow="${a.feitos_hoje}" aria-label="${esc(a.nome)}: ${a.feitos_hoje} de ${a.meta}">
          <span style="width:${pct}%"></span></span>
        <small>${emMaos} na mesa agora · ${a.total} no total</small>
      </li>`;
    }).join('')}</ul>` : '<p class="cartao-vazio">Nenhum analista ainda. Emita crachás em Usuários.</p>'}
    ${tabela('Analistas hoje', ['Analista', 'Feitos hoje', 'Meta', 'Na mesa'], lista.map((a) => [a.nome, a.feitos_hoje, a.meta,
      chamados.filter((c) => c.status === 'Em atendimento' && c.analista === a.nome).length]))}
  </section>`;
}

// ---------- Regra do dia e mensagens ----------
function regraDoDia() {
  const regra = metas?.regra_do_dia;
  return `<section class="cartao-painel" aria-labelledby="tRegra">
    <header class="cartao-topo"><h3 id="tRegra">${ic('alvo')} Regra do dia</h3><a class="cartao-link" href="metas.html">editar →</a></header>
    ${regra ? `<blockquote class="regra-papel">“${esc(regra.texto)}”<small>— ${esc(regra.autor)} · ${Efeitos.tempoDesde(regra.em)}</small></blockquote>`
      : '<p class="cartao-vazio">Nenhuma regra publicada hoje. <a href="metas.html">Publicar uma</a>.</p>'}
    ${metas?.motivacionais?.length ? `<p class="cartao-sub">${ic('brilho')} ${metas.motivacionais.length} mensagem(ns) motivacional(is) no ar — o Helpy repete elas para os analistas.</p>` : ''}
  </section>`;
}

// ---------- Últimos finalizados e atividades ----------
function ultimosFinalizados() {
  const lista = chamados.filter((c) => c.status === 'Resolvido')
    .sort((a, b) => (b.resolvido_em || '').localeCompare(a.resolvido_em || '')).slice(0, 5);
  return `<section class="cartao-painel" aria-labelledby="tFin">
    <header class="cartao-topo"><h3 id="tFin">${ic('arquivo')} Últimos finalizados</h3><a class="cartao-link" href="historico.html">histórico completo →</a></header>
    ${lista.length ? `<ul class="lista-simples">${lista.map((c) => `
      <li><button type="button" class="linha-ticket" data-ver="${c.numero}">
        <b>${esc(c.codigo)}</b><span>${esc(c.genero_titulo || c.categoria)} · ${esc(c.solicitante)}</span>
        <small>${ic('carimbo')} ${esc(c.analista || '—')} · ${Efeitos.tempoDesde(c.resolvido_em)}</small></button></li>`).join('')}</ul>`
      : '<p class="cartao-vazio">Nenhum ticket finalizado ainda.</p>'}
  </section>`;
}

function atividades() {
  const eventos = [
    ...chamados.map((c) => ({ quando: c.aberto_em, ico: 'entrada', texto: `<b>${esc(c.solicitante)}</b> abriu ${esc(c.codigo)} · ${esc(c.genero_titulo || '')}` })),
    ...chamados.filter((c) => c.assumido_em).map((c) => ({ quando: c.assumido_em, ico: 'pastas', texto: `<b>${esc(c.analista)}</b> assumiu ${esc(c.codigo)}` })),
    ...chamados.filter((c) => c.resolvido_em).map((c) => ({ quando: c.resolvido_em, ico: 'carimbo', texto: `<b>${esc(c.analista)}</b> carimbou ${esc(c.codigo)}` })),
  ].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 7);
  return `<section class="cartao-painel" aria-labelledby="tAtv">
    <header class="cartao-topo"><h3 id="tAtv">${ic('atividade')} Atividades recentes</h3></header>
    <ol class="lista-simples atividades">${eventos.map((e) => `
      <li><span class="atv-ico">${ic(e.ico)}</span><span>${e.texto}</span><time>${Efeitos.tempoDesde(e.quando)}</time></li>`).join('')}</ol>
  </section>`;
}

// ---------- Montagem ----------
function renderizar() {
  elPainel.innerHTML = indicadores() + grafico7Dias() + graficoPrioridade() + graficoProblemas()
    + analistasHoje() + regraDoDia() + ultimosFinalizados() + atividades();
  const regra = metas?.regra_do_dia?.texto;
  document.getElementById('postItRegra').textContent = regra ? `${regra.slice(0, 40)}${regra.length > 40 ? '…' : ''}` : 'nenhuma';
}

async function carregar() {
  try {
    const [rChamados, rMetas] = await Promise.all([API.listar(), API.metas()]);
    elOffline.hidden = true;
    chamados = rChamados.ok ? rChamados.dados : [];
    metas = rMetas.ok ? rMetas.dados : null;
  } catch {
    mostrarOffline(elOffline);
    return;
  }
  const nova = JSON.stringify([chamados.map((c) => [c.numero, c.status, c.analista]), metas]);
  if (nova !== assinatura) { assinatura = nova; renderizar(); }
  falar();
}

function falar() {
  if (falou) return;
  falou = true;
  const abertos = chamados.filter((c) => c.status !== 'Resolvido');
  const parados = abertos.filter((c) => TicketUI.minutosParado(c) >= DEMORA_MIN);
  helpy.dizer(`<p>Olá, <strong>${esc(usuario.nome.split(' ')[0])}</strong>! Aqui está o resumo da equipe.</p>
    <p>${abertos.length ? `São <strong>${abertos.length}</strong> tickets em aberto agora.` : 'Nenhum ticket em aberto. Tudo tranquilo!'}</p>`, { humor: 'acenando' });
  if (parados.length) {
    helpy.dizer(`<p><strong>Atenção:</strong> ${parados.length} ticket${parados.length > 1 ? 's estão parados' : ' está parado'} há mais de ${DEMORA_MIN} minutos (${parados.map((c) => esc(c.codigo)).join(', ')}).</p>`, {
      tipo: 'alerta', humor: 'alerta', segurar: true,
      aoMostrar: () => escritorio.focar(3000),
      acoes: [{ rotulo: `${ic('entrada')} Ver e cobrar`, destaque: true, fn: () => { location.href = 'tickets.html'; } }, { rotulo: 'Depois', fn: () => {} }],
    });
  }
}

// ---------- Dica ao passar o mouse ----------
elPainel.addEventListener('pointermove', (e) => {
  const alvo = e.target.closest('[data-dica]');
  if (!alvo) { elDica.hidden = true; return; }
  elDica.innerHTML = alvo.dataset.dica;
  elDica.hidden = false;
  const x = Math.min(innerWidth - elDica.offsetWidth - 12, e.clientX + 14);
  elDica.style.left = `${x}px`;
  elDica.style.top = `${e.clientY - elDica.offsetHeight - 12}px`;
});
elPainel.addEventListener('pointerleave', () => { elDica.hidden = true; });
elPainel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ver]');
  const c = b && chamados.find((x) => x.numero === Number(b.dataset.ver));
  if (c) TicketUI.abrir(c);
});

let timerTamanho = null;
addEventListener('resize', () => { clearTimeout(timerTamanho); timerTamanho = setTimeout(renderizar, 150); });

if (usuario) {
  Sessao.montarMenu(usuario);
  carregar();
  setInterval(() => { if (!document.hidden) carregar(); }, 8000);
}

// =========================================================
// Exportar dados do painel: baixar em CSV (abre no Excel) ou
// mandar o resumo no grupo do HelpIA Chat.
// =========================================================
const RECORTES = {
  geral: 'Resumo geral da equipe',
  analistas: 'Desempenho dos analistas',
  tickets: 'Lista de todos os tickets',
};

function dadosDoRecorte(recorte, analista = '') {
  const abertos = chamados.filter((c) => c.status !== 'Resolvido');
  const hoje = isoDia(new Date());
  const doAnalista = (c) => !analista || c.analista === analista;
  if (recorte === 'geral') {
    const resolvidos = chamados.filter((c) => c.status === 'Resolvido');
    const porNivel = ['alta', 'media', 'normal', 'baixa'].map((n) => [Catalogo.niveis[n].rotulo, abertos.filter((c) => Catalogo.nivel(c).id === n).length]);
    const problemas = Object.entries(chamados.reduce((m, c) => { m[c.genero_titulo] = (m[c.genero_titulo] || 0) + 1; return m; }, {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      colunas: ['Indicador', 'Valor'],
      linhas: [
        ['Em aberto', abertos.length],
        ['Na fila', abertos.filter((c) => c.status === 'Aguardando').length],
        ['Em atendimento', abertos.filter((c) => c.status === 'Em atendimento').length],
        ['Resolvidos hoje', resolvidos.filter((c) => dia(c.resolvido_em) === hoje).length],
        ['Resolvidos no total', resolvidos.length],
        [`Parados há +${DEMORA_MIN} min`, abertos.filter((c) => TicketUI.minutosParado(c) >= DEMORA_MIN).length],
        ...porNivel.map(([n, v]) => [`Em aberto · prioridade ${n}`, v]),
        ...problemas.map(([p, v]) => [`Problema · ${p}`, v]),
      ],
    };
  }
  if (recorte === 'analistas') {
    const lista = (metas?.analistas || []).filter((a) => !analista || a.nome === analista);
    return {
      colunas: ['Analista', 'Feitos hoje', 'Meta do dia', 'Na mesa agora', 'Resolvidos no total'],
      linhas: lista.map((a) => [a.nome, a.feitos_hoje, a.meta, chamados.filter((c) => c.status === 'Em atendimento' && c.analista === a.nome).length, a.total]),
    };
  }
  return {
    colunas: ['Ticket', 'Tipo', 'Problema', 'Prioridade', 'Status', 'Solicitante', 'Analista', 'Aberto em', 'Resolvido em'],
    linhas: chamados.filter(doAnalista).sort((a, b) => a.numero - b.numero).map((c) => [
      c.codigo, c.genero_titulo, c.subgenero_titulo, Catalogo.nivel(c).rotulo, c.status, c.solicitante, c.analista || '',
      (c.aberto_em || '').replace('T', ' ').slice(0, 16), (c.resolvido_em || '').replace('T', ' ').slice(0, 16)]),
  };
}

function baixarCsv(nome, { colunas, linhas }) {
  const celula = (v) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = '﻿' + [colunas, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');   // ; e BOM: o Excel em português abre certinho
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Resumo em texto para o chat (até 12 linhas; o resto vai no CSV). */
function textoParaChat(titulo, { colunas, linhas }) {
  const corpo = linhas.slice(0, 12).map((l) => (colunas.length === 2 ? `• ${l[0]}: ${l[1]}` : `• ${l.filter((x) => x !== '').join(' · ')}`));
  const resto = linhas.length > 12 ? [`… e mais ${linhas.length - 12} linha(s) no arquivo exportado.`] : [];
  return [`📊 ${titulo} (${new Date().toLocaleDateString('pt-BR')})`, ...corpo, ...resto].join('\n');
}

function abrirExportar() {
  const analistas = (metas?.analistas || []).map((a) => a.nome);
  const d = document.createElement('dialog');
  d.className = 'modal modal-exportar';
  d.innerHTML = `<div class="modal-conteudo">
    <header class="modal-topo"><h2>${ic('seta-baixo')} Exportar dados do painel</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-fechar-exportar aria-label="Fechar">${ic('x')}</button></header>
    <fieldset class="exportar-recortes"><legend>O que exportar</legend>
      ${Object.entries(RECORTES).map(([id, rotulo], i) => `<label class="exportar-opcao">
        <input type="radio" name="recorte" value="${id}" ${i === 0 ? 'checked' : ''} /><span>${rotulo}</span></label>`).join('')}
    </fieldset>
    <label class="campo">Analista
      <select class="input" data-exportar-analista>
        <option value="">Todos os analistas</option>${analistas.map((n) => `<option>${esc(n)}</option>`).join('')}
      </select><span class="campo-ajuda">Vale para "Desempenho dos analistas" e "Lista de todos os tickets".</span></label>
    <div class="exportar-previa" data-previa></div>
    <div class="modal-acoes">
      <button type="button" class="btn" data-exportar-chat>${ic('chat')} Mencionar no HelpIA Chat</button>
      <button type="button" class="btn btn-primary" data-exportar-csv>${ic('seta-baixo')} Baixar planilha (CSV)</button>
    </div></div>`;
  document.body.appendChild(d);
  const recorte = () => d.querySelector('input[name="recorte"]:checked').value;
  const analista = () => d.querySelector('[data-exportar-analista]').value;
  const titulo = () => `${RECORTES[recorte()]}${analista() && recorte() !== 'geral' ? ` · ${analista()}` : ''}`;
  const previa = () => {
    const dados = dadosDoRecorte(recorte(), analista());
    d.querySelector('[data-previa]').innerHTML = `<strong>${dados.linhas.length} linha(s) · prévia</strong>
      <div class="exportar-tabela"><table><thead><tr>${dados.colunas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${dados.linhas.slice(0, 5).map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  d.addEventListener('change', previa);
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fechar-exportar]')) d.close(); });
  d.addEventListener('close', () => d.remove());
  d.querySelector('[data-exportar-csv]').addEventListener('click', () => {
    const sufixo = analista() ? `-${analista().toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')}` : '';
    const nome = `helpia-${recorte()}${sufixo}-${isoDia(new Date())}.csv`;
    baixarCsv(nome, dadosDoRecorte(recorte(), analista()));
    Efeitos.toast(`Planilha <strong>${esc(nome)}</strong> baixada.`, { icone: ic('check'), tipo: 'sucesso' });
  });
  d.querySelector('[data-exportar-chat]').addEventListener('click', () => {
    const texto = textoParaChat(titulo(), dadosDoRecorte(recorte(), analista()));
    location.href = `conversas.html?${new URLSearchParams({ grupo: '1', texto })}`;
  });
  previa();
  d.showModal();
}
document.getElementById('botaoExportar').addEventListener('click', abrirExportar);
