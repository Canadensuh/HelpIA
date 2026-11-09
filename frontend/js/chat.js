/* =========================================================
   chat.js — conversa do colaborador com o HelpBot
   Fluxo: RN-01 (pedir complemento) → CA-01/CA-02 (registrar e
   classificar) → CA-03 (confirmar número e status).
   ========================================================= */

const elMensagens = document.getElementById('mensagens');
const elForm = document.getElementById('formMensagem');
const elEntrada = document.getElementById('entrada');
const elNome = document.getElementById('nome');
const elLista = document.getElementById('listaMeus');
const elSugestoes = document.getElementById('sugestoes');
const elOffline = document.getElementById('avisoOffline');

let descricaoPendente = '';      // texto guardado enquanto o bot pede complemento (RN-01)
const statusConhecidos = {};     // número do chamado -> último status visto

elNome.value = lerPreferencia('helpia-colaborador', 'João Silva');
elNome.addEventListener('change', () => {
  elNome.value = elNome.value.trim() || 'Colaborador';
  salvarPreferencia('helpia-colaborador', elNome.value);
  atualizarMeusChamados();
});

// ---------- Mensagens ----------
function adicionarMensagem(html, tipo, extraClasse = '') {
  const msg = document.createElement('div');
  msg.className = `msg msg-${tipo} ${extraClasse}`;
  msg.innerHTML = `${html}<span class="msg-hora">${formatarHora(new Date())}</span>`;
  elMensagens.appendChild(msg);
  elMensagens.scrollTop = elMensagens.scrollHeight;
  return msg;
}

function botDiz(html, extraClasse = '') {
  const digitando = adicionarMensagem('<span class="digitando">HelpBot está digitando…</span>', 'bot');
  return new Promise((resolve) => {
    setTimeout(() => {
      digitando.remove();
      resolve(adicionarMensagem(html, 'bot', extraClasse));
    }, 600);
  });
}

// ---------- Envio ----------
async function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;

  adicionarMensagem(escaparHtml(texto), 'usuario');
  elEntrada.value = '';
  elEntrada.disabled = true;

  const descricao = descricaoPendente ? `${descricaoPendente}. ${texto}` : texto;

  try {
    const { status, dados } = await API.abrir(descricao, elNome.value);

    if (status === 422) {
      descricaoPendente = descricao;
      await botDiz(`<strong>Preciso de mais informações 🧐</strong>${escaparHtml(dados.mensagem)}`, 'alerta');
    } else if (status === 201) {
      descricaoPendente = '';
      const c = dados.chamado;
      statusConhecidos[c.numero] = c.status;
      await botDiz(
        `<strong>✅ Chamado ${c.codigo} registrado!</strong>${escaparHtml(dados.mensagem)}
         <div class="detalhes">
           <span class="tag tag-neutra">${escaparHtml(c.categoria)}</span>
           <span class="tag tag-neutra">Fila: ${escaparHtml(c.fila)}</span>
           <span class="tag tag-${c.prioridade.toLowerCase()}">Prioridade ${escaparHtml(c.prioridade)}</span>
         </div>`,
        'sucesso'
      );
      atualizarMeusChamados();
    } else {
      await botDiz('Algo deu errado ao registrar seu chamado. Tente novamente.', 'alerta');
    }
  } catch {
    mostrarOffline(elOffline);
  } finally {
    elEntrada.disabled = false;
    elEntrada.focus();
  }
}

elForm.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviar(elEntrada.value);
});

elSugestoes.addEventListener('click', (evento) => {
  if (evento.target.matches('.chip')) enviar(evento.target.textContent);
});

// ---------- Meus chamados (CA-03 / visão do colaborador) ----------
async function atualizarMeusChamados() {
  try {
    const { dados } = await API.listar({ solicitante: elNome.value });
    elOffline.hidden = true;

    elLista.innerHTML = dados.length
      ? dados.slice().reverse().map((c) => `
          <li class="item-meu">
            <div class="item-meu-topo">
              <strong>${c.codigo}</strong>
              <span class="tag ${classeStatus(c.status)}">${escaparHtml(c.status)}</span>
            </div>
            <p>${escaparHtml(c.descricao)}</p>
            <p>${c.analista ? `Analista: ${escaparHtml(c.analista)}` : `Fila: ${escaparHtml(c.fila)}`}</p>
          </li>`).join('')
      : '<li class="vazio">Nenhum chamado ainda.</li>';

    // Avisa no chat quando o status muda (analista assumiu / resolveu)
    for (const c of dados) {
      const anterior = statusConhecidos[c.numero];
      if (anterior && anterior !== c.status) {
        const texto = c.status === 'Em atendimento'
          ? `👋 ${escaparHtml(c.analista)} assumiu o chamado ${c.codigo} e já está cuidando do seu problema.`
          : `🎉 O chamado ${c.codigo} foi resolvido. Obrigado por usar o HelpIA!`;
        botDiz(texto, 'sucesso');
      }
      statusConhecidos[c.numero] = c.status;
    }
  } catch {
    mostrarOffline(elOffline);
  }
}

// ---------- Início ----------
botDiz(
  `<strong>Olá! Eu sou o HelpBot 🤖</strong>
   Descreva o seu problema que eu registro o chamado e encaminho para a equipe certa.`
);
atualizarMeusChamados();
setInterval(atualizarMeusChamados, 4000);
