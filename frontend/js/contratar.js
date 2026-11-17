/* =========================================================
   contratar.js — contratação de plano pela empresa.
   Cria a empresa + conta do gestor e já entra logado.
   ========================================================= */

const elForm = document.getElementById('formContratar');
const elAviso = document.getElementById('aviso');
const elResumo = document.getElementById('resumoPlano');
const elBotao = document.getElementById('botaoContratar');
const campo = (id) => document.getElementById(id);

const RESUMO = {
  essencial: 'Essencial · R$ 149/mês',
  profissional: 'Profissional · R$ 390/mês',
  empresarial: 'Empresarial · sob consulta',
};

function planoEscolhido() {
  return document.querySelector('input[name="plano"]:checked').value;
}

function atualizarResumo() {
  const plano = planoEscolhido();
  elResumo.textContent = RESUMO[plano];
  elBotao.textContent = plano === 'empresarial'
    ? 'Solicitar proposta e criar conta de gestor'
    : 'Contratar e criar conta de gestor';
}

function mostrarAviso(texto) {
  elAviso.textContent = texto;
  elAviso.className = 'aviso aviso-erro';
  elAviso.hidden = false;
  elAviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Plano vindo da landing (?plano=essencial)
const planoUrl = new URLSearchParams(location.search).get('plano');
const radioUrl = planoUrl && document.querySelector(`input[name="plano"][value="${CSS.escape(planoUrl)}"]`);
if (radioUrl) radioUrl.checked = true;

document.querySelectorAll('input[name="plano"]').forEach((r) => r.addEventListener('change', atualizarResumo));
atualizarResumo();

document.querySelectorAll('.ver-senha').forEach((botao) => {
  botao.addEventListener('click', () => {
    const alvo = campo(botao.dataset.alvo);
    const mostrando = alvo.type === 'text';
    alvo.type = mostrando ? 'password' : 'text';
    botao.textContent = mostrando ? 'Mostrar' : 'Ocultar';
  });
});

elForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  elAviso.hidden = true;

  const dados = {
    plano: planoEscolhido(),
    empresa: { nome: campo('empresaNome').value.trim(), cnpj: campo('empresaCnpj').value.trim() },
    responsavel: {
      nome: campo('respNome').value.trim(),
      email: campo('respEmail').value.trim(),
      senha: campo('respSenha').value,
    },
  };

  if (!dados.empresa.nome || !dados.responsavel.nome || !dados.responsavel.email) {
    mostrarAviso('Preencha o nome da empresa, o seu nome e o e-mail.');
    return;
  }
  if (dados.responsavel.senha.length < 6) {
    mostrarAviso('A senha deve ter pelo menos 6 caracteres.');
    return;
  }
  if (dados.responsavel.senha !== campo('respSenha2').value) {
    mostrarAviso('As senhas não conferem.');
    return;
  }

  elBotao.disabled = true;
  try {
    const { ok, dados: resposta } = await API.contratar(dados);
    if (!ok) {
      mostrarAviso(resposta.erro || 'Não foi possível concluir a contratação.');
      return;
    }
    Sessao.salvar(resposta);
    location.href = 'criar-conta.html?bem-vindo=1';
  } catch {
    mostrarAviso('Sem conexão com o servidor. Tente novamente em instantes.');
  } finally {
    elBotao.disabled = false;
  }
});
