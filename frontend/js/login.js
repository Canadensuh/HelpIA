/* =========================================================
   login.js — entrada por perfil (Colaborador | Analista)
   O servidor confere se a conta pertence à área escolhida.
   ========================================================= */

const elForm = document.getElementById('formLogin');
const elEmail = document.getElementById('email');
const elSenha = document.getElementById('senha');
const elLembrar = document.getElementById('lembrar');
const elAviso = document.getElementById('aviso');
const elDica = document.getElementById('perfilDica');
const elBotao = document.getElementById('botaoEntrar');

const DICAS = {
  colaborador: 'Você vai para a abertura de tickets.',
  analista: 'Você vai para a mesa de atendimento.',
  gestor: 'Você vai para o painel de controle da empresa.',
};
const params = new URLSearchParams(location.search);

function perfilEscolhido() {
  return document.querySelector('input[name="perfil"]:checked').value;
}

/** Área enviada ao servidor: o gestor entra pela área da equipe de suporte ("analista"). */
const areaDoLogin = (perfil) => (perfil === 'gestor' ? 'analista' : perfil);

function escolherPerfil(perfil) {
  const radio = document.querySelector(`input[name="perfil"][value="${perfil}"]`);
  if (radio) radio.checked = true;
  elDica.textContent = DICAS[perfilEscolhido()];
}

function mostrarAviso(texto, tipo = 'erro') {
  elAviso.textContent = texto;
  elAviso.className = `aviso aviso-${tipo}`;
  elAviso.hidden = false;
}

/** Só aceita voltar para páginas internas conhecidas (evita redirecionamento aberto). */
function destinoDepoisDoLogin(usuario) {
  const permitidas = {
    colaborador: ['chat.html', 'conversas.html', 'historico.html'],
    analista: ['painel.html', 'metas.html', 'conversas.html', 'tickets.html', 'historico.html'],
    gestor: ['controle.html', 'criar-conta.html', 'metas.html', 'conversas.html', 'tickets.html', 'historico.html', 'painel.html'],
  };
  const volta = params.get('volta');
  return volta && (permitidas[usuario.perfil] || []).includes(volta) ? volta : Sessao.destino(usuario);
}

// Já logado? Vai direto para a área do perfil.
const atual = Sessao.usuario();
if (atual) location.replace(Sessao.destino(atual));

document.querySelectorAll('input[name="perfil"]').forEach((radio) => {
  radio.addEventListener('change', () => escolherPerfil(radio.value));
});
escolherPerfil(['analista', 'gestor'].includes(params.get('perfil')) ? params.get('perfil') : 'colaborador');

if (params.get('motivo') === 'expirou') {
  mostrarAviso('Sua sessão terminou. Entre novamente para continuar.');
}

document.querySelectorAll('.ver-senha').forEach((botao) => {
  botao.addEventListener('click', () => {
    const campo = document.getElementById(botao.dataset.alvo);
    const mostrando = campo.type === 'text';
    campo.type = mostrando ? 'password' : 'text';
    botao.textContent = mostrando ? 'Mostrar' : 'Ocultar';
    botao.setAttribute('aria-label', mostrando ? 'Mostrar senha' : 'Ocultar senha');
  });
});

document.querySelectorAll('.demo-conta').forEach((botao) => {
  botao.addEventListener('click', () => {
    escolherPerfil(botao.dataset.perfil);
    elEmail.value = botao.dataset.email;
    elSenha.value = '1234';
    elAviso.hidden = true;
    elBotao.focus();
  });
});

elForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const email = elEmail.value.trim();
  const senha = elSenha.value;
  if (!email || !senha) {
    mostrarAviso('Informe e-mail e senha.');
    return;
  }

  elBotao.disabled = true;
  elBotao.textContent = 'Entrando…';
  try {
    const { ok, dados } = await API.login(email, senha, areaDoLogin(perfilEscolhido()));
    if (!ok) {
      mostrarAviso(dados.erro || 'Não foi possível entrar.');
      return;
    }
    if (perfilEscolhido() === 'gestor' && dados.usuario.perfil !== 'gestor') {
      mostrarAviso('Esta conta não é de gestor. Selecione “Analista” para entrar.');
      return;
    }
    Sessao.salvar(dados, elLembrar.checked);
    location.href = destinoDepoisDoLogin(dados.usuario);
  } catch {
    mostrarAviso('Sem conexão com o servidor. Tente novamente em instantes.');
  } finally {
    elBotao.disabled = false;
    elBotao.textContent = 'Entrar';
  }
});
