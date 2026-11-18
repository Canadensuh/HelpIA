/* =========================================================
   mural.js — "Mural da equipe": regra do dia e mensagens
   motivacionais. O gestor escreve; os analistas leem (o Helpy
   da mesa do analista também repete essas mensagens).
   Uso: Mural.montar(elemento, { editavel: true, aoMudar(dados) {} })
   ========================================================= */

const Mural = {
  montar(raiz, { editavel = false, aoMudar = null, dados = null } = {}) {
    const esc = (t) => escaparHtml(String(t ?? ''));
    let metas = dados;

    const render = () => {
      if (!metas) { raiz.innerHTML = '<p class="vazio">Carregando…</p>'; return; }
      const regra = metas.regra_do_dia;
      raiz.innerHTML = `
        <section class="mural-bloco mural-regra">
          <h3>${ic('alvo')} Regra do dia</h3>
          ${regra
            ? `<blockquote class="regra-papel">“${esc(regra.texto)}”<small>— ${esc(regra.autor)} · ${Efeitos.tempoDesde(regra.em)}</small></blockquote>`
            : `<p class="mural-vazio">${editavel ? 'Nenhuma regra publicada hoje.' : 'O gestor ainda não publicou a regra do dia.'}</p>`}
          ${editavel ? `
            <form class="mural-form" data-form="regra">
              <textarea class="input" name="regra" rows="2" maxlength="280" placeholder="Ex.: Prioridade ALTA primeiro, sempre.">${esc(regra?.texto || '')}</textarea>
              <div class="mural-acoes">
                ${regra ? '<button type="button" class="btn btn-sm" data-tirar-regra>Tirar a regra</button>' : ''}
                <button type="submit" class="btn btn-sm key--green">${ic('enviar')} Publicar regra</button>
              </div>
            </form>` : ''}
        </section>
        <section class="mural-bloco mural-motivacionais">
          <h3>${ic('brilho')} Mensagens motivacionais</h3>
          ${metas.motivacionais.length ? `<ul class="motivacionais">${metas.motivacionais.map((m) => `
            <li><span>${esc(m.texto)}</span>${editavel ? `<button type="button" class="btn btn-ghost btn-sm" data-tirar-motivacional="${m.id}" aria-label="Remover mensagem">${ic('x')}</button>` : ''}</li>`).join('')}</ul>`
            : `<p class="mural-vazio">${editavel ? 'Escreva mensagens para animar o time. O Helpy repete elas na mesa dos analistas.' : 'Nenhuma mensagem por enquanto.'}</p>`}
          ${editavel ? `
            <form class="mural-form mural-linha" data-form="motivacional">
              <input class="input" name="texto" maxlength="200" placeholder="Nova mensagem para o time…" />
              <button type="submit" class="btn btn-sm btn-primary">${ic('mais')} Adicionar</button>
            </form>` : ''}
        </section>`;
    };

    const atualizar = (novo) => { metas = novo; render(); aoMudar?.(novo); };
    const avisarErro = (dadosErro) => Efeitos.toast(esc(dadosErro.erro || 'Não foi possível salvar.'), { icone: ic('alerta'), tipo: 'alerta' });

    raiz.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-form]');
      if (!form) return;
      e.preventDefault();
      if (form.dataset.form === 'regra') {
        const { ok, dados: novo } = await API.salvarMetas({ regra_do_dia: form.regra.value });
        if (!ok) return avisarErro(novo);
        atualizar(novo);
        Efeitos.toast('Regra do dia publicada para o time.', { icone: ic('alvo'), tipo: 'sucesso' });
      } else {
        const { ok, dados: novo } = await API.adicionarMotivacional(form.texto.value);
        if (!ok) return avisarErro(novo);
        atualizar(novo);
      }
      return null;
    });
    raiz.addEventListener('click', async (e) => {
      const tirar = e.target.closest('[data-tirar-motivacional]');
      if (tirar) {
        const { ok, dados: novo } = await API.removerMotivacional(Number(tirar.dataset.tirarMotivacional));
        if (ok) atualizar(novo); else avisarErro(novo);
      }
      if (e.target.closest('[data-tirar-regra]')) {
        const { ok, dados: novo } = await API.salvarMetas({ regra_do_dia: '' });
        if (ok) atualizar(novo); else avisarErro(novo);
      }
    });

    const recarregar = async () => {
      try {
        const { ok, dados: novo } = await API.metas();
        if (ok) atualizar(novo);
      } catch { /* sem conexão: fica o que já está na tela */ }
    };
    render();
    if (!metas) recarregar();
    return { recarregar, set: atualizar };
  },
};

window.Mural = Mural;
