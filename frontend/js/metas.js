/* =========================================================
   metas.js — Metas
   - Analista: a meta dele hoje, a regra do dia, as mensagens
     do gestor e como o time está indo.
   - Gestor: define a meta diária (padrão e por analista),
     publica a regra do dia e as mensagens motivacionais.
   ========================================================= */

const usuario = Sessao.exigir(['analista', 'gestor']);
const esc = (t) => escaparHtml(String(t ?? ''));
const ehGestor = usuario?.perfil === 'gestor';
const elMetas = document.getElementById('metas');
let metas = null;

function anel(feitos, meta, grande = false) {
  const pct = Math.min(100, Math.round((feitos / Math.max(1, meta)) * 100));
  return `<div class="meta-anel ${grande ? 'grande' : ''} ${feitos >= meta ? 'batida' : ''}">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="anel-fundo" cx="18" cy="18" r="15.5"/>
      <circle class="anel-progresso" cx="18" cy="18" r="15.5" pathLength="100" style="stroke-dasharray:${pct} 100"/></svg>
    <span><strong>${feitos}/${meta}</strong><small>${feitos >= meta ? 'batida!' : 'hoje'}</small></span></div>`;
}

function time() {
  const lista = [...metas.analistas].sort((a, b) => b.feitos_hoje / b.meta - a.feitos_hoje / a.meta || b.total - a.total);
  return `<ul class="time-metas">${lista.map((a) => {
    const pct = Math.min(100, Math.round((a.feitos_hoje / Math.max(1, a.meta)) * 100));
    return `<li class="${a.feitos_hoje >= a.meta ? 'batida' : ''}">
      <span class="time-nome"><b>${esc(a.nome)}</b>${a.id === usuario.id ? ' <small>(você)</small>' : ''}</span>
      <span class="time-barra"><span style="width:${pct}%"></span></span>
      <span class="time-num">${a.feitos_hoje}/${a.meta}</span></li>`;
  }).join('')}</ul>`;
}

function renderizar() {
  if (!metas) return;
  if (!ehGestor) {
    const eu = metas.analistas.find((a) => a.id === usuario.id) || { feitos_hoje: 0, total: 0 };
    elMetas.innerHTML = `
      <article class="cartao-meta destaque">
        <h3>${ic('alvo')} Sua meta de hoje</h3>
        ${anel(eu.feitos_hoje, metas.minha_meta, true)}
        <p>${eu.feitos_hoje >= metas.minha_meta ? 'Meta batida! Cada ticket a mais é bônus para o time.' : `Faltam <b>${metas.minha_meta - eu.feitos_hoje}</b> tickets. Você já carimbou ${eu.total} no total.`}</p>
        <a class="btn btn-primary" href="painel.html">${ic('pastas')} Ir para a minha mesa</a>
      </article>
      <article class="cartao-meta mural" id="mural"></article>
      <article class="cartao-meta largo"><h3>${ic('equipe')} O time hoje</h3>${time()}</article>`;
    Mural.montar(document.getElementById('mural'), { dados: metas });
    return;
  }
  elMetas.innerHTML = `
    <article class="cartao-meta">
      <h3>${ic('alvo')} Meta diária do time</h3>
      <form class="meta-padrao" id="formPadrao">
        <label class="campo">Tickets por analista, por dia
          <input class="input" name="meta" type="number" min="1" max="100" value="${metas.meta_padrao}" />
        </label>
        <button type="submit" class="btn key--green">${ic('check')} Salvar meta</button>
      </form>
      <p class="campo-ajuda">Vale para todos, menos quem tiver uma meta própria na lista ao lado.</p>
    </article>
    <article class="cartao-meta">
      <h3>${ic('equipe')} Meta por analista</h3>
      <form id="formAnalistas">
        <ul class="metas-analistas">${metas.analistas.map((a) => `
          <li>${anel(a.feitos_hoje, a.meta)}
            <span class="time-nome"><b>${esc(a.nome)}</b><small>${a.total} carimbados no total${a.ativo ? '' : ' · suspenso'}</small></span>
            <input class="input" type="number" min="1" max="100" name="m${a.id}" data-id="${a.id}" value="${a.personalizada ? a.meta : ''}" placeholder="${metas.meta_padrao}" aria-label="Meta de ${esc(a.nome)}" /></li>`).join('')
          || '<li class="vazio">Nenhum analista ainda. Emita crachás no Painel do Gestor.</li>'}
        </ul>
        ${metas.analistas.length ? `<button type="submit" class="btn key--green">${ic('check')} Salvar metas</button>` : ''}
      </form>
    </article>
    <article class="cartao-meta mural largo" id="mural"></article>
    <article class="cartao-meta largo"><h3>${ic('trofeu')} Como o time está indo hoje</h3>${time()}</article>`;
  Mural.montar(document.getElementById('mural'), { editavel: true, dados: metas, aoMudar: (novo) => { metas = novo; } });

  document.getElementById('formPadrao').addEventListener('submit', async (e) => {
    e.preventDefault();
    salvar({ meta_padrao: Number(e.target.meta.value) }, 'Meta diária salva.');
  });
  document.getElementById('formAnalistas')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const por = {};
    e.target.querySelectorAll('[data-id]').forEach((campo) => { por[campo.dataset.id] = campo.value === '' ? null : Number(campo.value); });
    salvar({ por_analista: por }, 'Metas dos analistas salvas.');
  });
}

async function salvar(dados, mensagem) {
  const { ok, dados: novo } = await API.salvarMetas(dados);
  if (!ok) { Efeitos.toast(esc(novo.erro || 'Não foi possível salvar.'), { icone: ic('alerta'), tipo: 'alerta' }); return; }
  metas = novo;
  renderizar();
  Efeitos.toast(mensagem, { icone: ic('alvo'), tipo: 'sucesso' });
}

(async () => {
  if (!usuario) return;
  Sessao.montarMenu(usuario);
  document.getElementById('subtitulo').textContent = ehGestor
    ? 'Defina a meta de cada analista, a regra do dia e mensagens para animar o time.'
    : 'Metas definidas pelo seu gestor.';
  try {
    const { ok, dados } = await API.metas();
    if (ok) { metas = dados; renderizar(); }
  } catch {
    mostrarOffline(document.getElementById('avisoOffline'));
  }
})();
