/* =========================================================
   chat.js — conversa do colaborador com o HelpBot
   Fluxo: saudação → dicas rápidas → RN-01 (pedir complemento)
   → CA-01/CA-02 (registrar e classificar) → CA-03 (confirmar).
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
let aguardandoConfirmacaoDica = false; // true após mostrar dica e perguntar "Quer registrar?"
let conversaEncerrada = false;   // true após bot dizer "tenha um bom dia"
let aguardandoNovoChamado = false; // true após criar chamado e perguntar "Posso ajudar em algo mais?"
let descricaoOriginalDica = '';  // descrição original que disparou a dica (para usar no "sim")

// ---------- Base de conhecimento do HelpBot ----------
const SAUDACOES = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hello', 'tudo bem', 'td bem'];

const DICAS_RAPIDAS = {
  senha: {
    palavras: ['senha', 'password', 'esqueci', 'nao lembro', 'não lembro', 'bloqueado', 'bloqueada', 'acesso'],
    resposta: `<strong>🔐 Esqueceu a senha?</strong>
      <ul>
        <li>Verifique se o <strong>Caps Lock</strong> não está ligado</li>
        <li>Confira se digitou todos os caracteres corretamente (números, letras maiúsculas/minúsculas)</li>
        <li>Tente usar a opção "Esqueci minha senha" no sistema</li>
        <li>Se continuar com problemas, posso abrir um chamado para a equipe de Acessos</li>
      </ul>
      <p>Quer que eu registre o chamado?</p>`
  },
  lentidao: {
    palavras: ['lento', 'lenta', 'devagar', 'travando', 'trava', 'lentidão', 'lentidao', 'demora', 'pesado'],
    resposta: `<strong>🐌 Computador/Sistema lento?</strong>
      <ul>
        <li>Feche programas que não está usando</li>
        <li>Limpe a <strong>Lixeira</strong> e arquivos temporários</li>
        <li>Reinicie o computador (resolve 80% dos casos)</li>
        <li>Verifique se não há atualizações pendentes do Windows</li>
      </ul>
      <p>Se não melhorar, posso abrir chamado para Suporte Técnico. Quer que eu registre?</p>`
  },
  nao_liga: {
    palavras: ['não liga', 'nao liga', 'nao liga', 'desligado', 'apagado', 'tela preta', 'sem sinal', 'preta'],
    resposta: `<strong>💻 Computador não liga / tela preta?</strong>
      <ul>
        <li>Verifique se o cabo de força está bem conectado (computador e tomada)</li>
        <li>Teste a tomada com outro aparelho</li>
        <li>Se for notebook: tire da base/dock, segure o botão power por 15s, ligue só no carregador</li>
        <li>Monitores: confira se o cabo de vídeo (HDMI/VGA/DP) está firme dos dois lados</li>
      </ul>
      <p>Se não resolver, abro chamado para Hardware. Quer que eu registre?</p>`
  },
  rede: {
    palavras: ['internet', 'wifi', 'wi-fi', 'rede', 'conexao', 'conexão', 'caiu', 'offline', 'sem net'],
    resposta: `<strong>📡 Problema de rede/internet?</strong>
      <ul>
        <li>Reinicie o roteador (desliga da tomada, espera 10s, liga)</li>
        <li>Verifique se outros dispositivos também estão sem internet</li>
        <li>Tente cabo de rede no lugar do Wi-Fi (se possível)</li>
        <li>No Windows: <kbd>Win</kbd>+<kbd>R</kbd> → <code>ncpa.cpl</code> → desative e ative a placa de rede</li>
      </ul>
      <p>Se o setor todo está parado, abro chamado para Infraestrutura (prioridade Alta). Quer que eu registre?</p>`
  },
  impressora: {
    palavras: ['impressora', 'imprimir', 'print', 'papel', 'atolado', 'toner', 'tinta'],
    resposta: `<strong>🖨️ Problema com impressora?</strong>
      <ul>
        <li>Verifique se há papel atolado (abra todas as tampas)</li>
        <li>Confira nível de toner/tinta</li>
        <li>Reinicie a impressora (desliga/liga)</li>
        <li>No Windows: <kbd>Win</kbd>+<kbd>R</kbd> → <code>control printers</code> → clique direito na impressora → "Ver o que está imprimindo" → limpe a fila</li>
      </ul>
      <p>Quer que eu abra chamado para Suporte Técnico?</p>`
  }
};

function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function ehSaudacao(texto) {
  const t = normalizar(texto);
  return SAUDACOES.some(s => t.includes(s));
}

function detectarDica(texto) {
  const t = normalizar(texto);
  for (const [chave, dica] of Object.entries(DICAS_RAPIDAS)) {
    if (dica.palavras.some(p => t.includes(p))) {
      return dica.resposta;
    }
  }
  return null;
}

function ehNegativa(texto) {
  const t = normalizar(texto);
  const negativas = ['nao', 'não', 'nao quero', 'não quero', 'obrigado', 'obrigada', 'valeu', 'tchau', 'ate mais', 'até mais', 'deixa pra la', 'deixa pra lá', 'sem chamado', 'nao precisa', 'não precisa', 'resolvi', 'ja resolvi', 'já resolvi', 'consegui'];
  return negativas.some(n => t.includes(n));
}

function ehAfirmativa(texto) {
  const t = normalizar(texto);
  const afirmativas = ['sim', 'quero', 'pode', 'pode sim', 'claro', 'obrigado', 'obrigada', 'valeu', 'ok', 'beleza', 'bora', 'vamos', 'pode abrir', 'quero sim'];
  return afirmativas.some(a => t.includes(a));
}

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

function reiniciarChat() {
  elMensagens.innerHTML = '';
  conversaEncerrada = false;
  aguardandoConfirmacaoDica = false;
  descricaoPendente = '';
  descricaoOriginalDica = '';
  botDiz(
    `<strong>Olá! Eu sou o HelpBot 🤖</strong>
     Descreva o seu problema que eu registro o chamado e encaminho para a equipe certa.
     <br><small>Dica: tente dizer "esqueci a senha", "computador lento" ou "não liga" para dicas rápidas.</small>`
  );
}

// ---------- Envio ----------
async function enviar(texto) {
  texto = texto.trim();
  if (!texto) return;

  // Se conversa foi encerrada, reinicia ao receber nova mensagem
  if (conversaEncerrada) {
    reiniciarChat();
    return;
  }

  adicionarMensagem(escaparHtml(texto), 'usuario');
  elEntrada.value = '';
  elEntrada.disabled = true;

  // 0. Aguardando resposta "Posso ajudar em algo mais?" após criar chamado
  if (aguardandoNovoChamado) {
    aguardandoNovoChamado = false;
    if (ehNegativa(texto)) {
      await botDiz(`Sem problemas! 😊 Se precisar de mais ajuda, é só chamar. Tenha um bom dia!`);
      conversaEncerrada = true;
      elEntrada.disabled = false;
      elEntrada.focus();
      return;
    }
    if (ehAfirmativa(texto)) {
      await botDiz(`Ótimo! 😊 Qual é o novo problema? Descreva para eu registrar.`);
      elEntrada.disabled = false;
      elEntrada.focus();
      return;
    }
    // Se não for clara, assume que quer abrir novo chamado
    // continua para fluxo normal abaixo
  }

  // 1. Saudação -> resposta amigável
  if (ehSaudacao(texto) && !descricaoPendente) {
    await botDiz(
      `<strong>Olá! Tudo bem? 😊</strong> Sou o HelpBot e estou aqui para ajudar você a abrir seu chamado.<br>
      Descreva a situação (ex: "esqueci a senha", "computador não liga", "internet lenta") e eu registro para a equipe certa.`
    );
    elEntrada.disabled = false;
    elEntrada.focus();
    return;
  }

  // 2. Dica rápida detectada -> mostra dica e pergunta se quer abrir chamado
  const dica = detectarDica(texto);
  if (dica && !descricaoPendente) {
    await botDiz(dica, 'dica');
    aguardandoConfirmacaoDica = true;
    descricaoOriginalDica = texto; // guarda a descrição original para usar no "sim"
    elEntrada.disabled = false;
    elEntrada.focus();
    return;
  }

  // 2b. Usuário respondeu à pergunta "Quer registrar?" após dica
  if (aguardandoConfirmacaoDica && !descricaoPendente) {
    aguardandoConfirmacaoDica = false;
    if (ehNegativa(texto)) {
      conversaEncerrada = true;
      descricaoOriginalDica = '';
      await botDiz(`Sem problemas! 😊 Se precisar de mais ajuda, é só chamar. Tenha um bom dia!`);
      elEntrada.disabled = false;
      elEntrada.focus();
      return;
    }
    // Se afirmativa ou ambígua, usa a descrição original da dica para criar o chamado
    if (ehAfirmativa(texto) || descricaoOriginalDica) {
      texto = descricaoOriginalDica; // substitui "sim" pela descrição original
      descricaoOriginalDica = '';
    }
    // continua para fluxo normal abaixo com a descrição correta
  }

  // 3. Fluxo normal: criar chamado (RN-01 → CA-01/CA-02 → CA-03)
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
         </div>
         <br><strong>Posso ajudar em algo mais?</strong> (sim / não)`,
        'sucesso'
      );
      aguardandoNovoChamado = true;
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
elNome.value = lerPreferencia('helpia-colaborador', 'João Silva');
elNome.addEventListener('change', () => {
  elNome.value = elNome.value.trim() || 'Colaborador';
  salvarPreferencia('helpia-colaborador', elNome.value);
  atualizarMeusChamados();
});

botDiz(
  `<strong>Olá! Eu sou o HelpBot 🤖</strong>
   Descreva o seu problema que eu registro o chamado e encaminho para a equipe certa.
   <br><small>Dica: tente dizer "esqueci a senha", "computador lento" ou "não liga" para dicas rápidas.</small>`
);
atualizarMeusChamados();
setInterval(atualizarMeusChamados, 4000);