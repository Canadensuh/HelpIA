/* =========================================================
   simulador.js — API simulada no navegador (modo de desenvolvimento)

   Para que serve: trabalhar no frontend sem o backend Python rodando.
   Imita as rotas de backend/app.py com as mesmas regras, mensagens,
   campos e códigos HTTP, para que a reintegração seja só desligá-lo.

   Quando liga:
   - Automaticamente no Go Live / Live Server (localhost ou 127.0.0.1
     em porta diferente de 5000) e em arquivos abertos direto (file://).
   - Nunca no site publicado nem em localhost:5000 (o próprio Flask).
   - Forçar: ?simulador=1   ·   Desligar: ?simulador=0 (fica salvo).

   Dados: ficam no localStorage (chave helpia-simulador-db-v2), compartilhados
   entre abas — o ticket aberto pelo colaborador chega na mesa do analista.
   As senhas ficam em texto puro: são dados fictícios de teste.
   Depende de js/catalogo.js (tipos de manutenção).

   ATENÇÃO — REINTEGRAÇÃO COM O PYTHON — o que o front usa e o backend ainda NÃO tem:
   1. Catálogo (js/catalogo.js): gênero → subgênero define categoria, fila e
      prioridade. Levar para o backend (ex.: GET /api/catalogo).
   2. POST /api/chamados passa a receber { genero, subgenero, impacto, maquina,
      nota, contato: { tipo, valor } } em vez de { descricao }.
      - nota obrigatória (mín. 15 caracteres) — substitui o RN-01 por palavras.
      - contato obrigatório: whatsapp (10 a 13 dígitos), teams ou email (e-mail).
      - prioridade: "Alta" se o gênero exige (setor parado) ou impacto ≠ "eu".
      - descricao vira "Gênero › Subgênero"; guardar solicitante_id da sessão.
   3. Chamado ganha: genero, subgenero, genero_titulo, subgenero_titulo, impacto,
      maquina, nota, contato, solicitante_id, assumido_em, resolvido_em, resolucao.
   4. POST /api/chamados/<n>/assumir usa o nome do usuário da sessão.
   5. POST /api/chamados/<n>/resolver exige { nota } (mín. 10 caracteres) e só
      quem assumiu (ou o gestor) pode finalizar — 403 caso contrário (RN-02).
   6. Usuario ganha "ativo". Conta suspensa não entra (403) e sessão cai (401).
   7. PATCH /api/contas/<id> { ativo?, perfil? } e POST /api/contas/<id>/senha
      { senha } — só o gestor, na própria empresa, nunca na própria conta.
   8. Dados de exemplo: analista Beatriz Rocha, colaborador Lúcio Martins e
      histórico de chamados resolvidos (ver popularExemplos).
   ========================================================= */

(function () {
  // ---------- Ativação ----------
  const CHAVE_PREF = 'helpia-simulador';
  const CHAVE_DB = 'helpia-simulador-db-v2';

  function lerPref() { try { return localStorage.getItem(CHAVE_PREF); } catch { return null; } }
  function salvarPref(valor) { try { localStorage.setItem(CHAVE_PREF, valor); } catch {} }

  const pedido = new URLSearchParams(location.search).get('simulador');
  if (pedido === '1') salvarPref('on');
  if (pedido === '0') salvarPref('off');

  const pref = lerPref();
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
  const ativo = pref === 'on' || (pref !== 'off' && local && location.port !== '5000');

  if (!ativo) {
    window.Simulador = { ativo: false };
    return;
  }

  // ---------- Regras ----------
  const AGUARDANDO = 'Aguardando';
  const EM_ATENDIMENTO = 'Em atendimento';
  const RESOLVIDO = 'Resolvido';
  const STATUS_VALIDOS = [AGUARDANDO, EM_ATENDIMENTO, RESOLVIDO];
  const MIN_NOTA = 15;
  const MIN_RESOLUCAO = 10;

  const COLABORADOR = 'colaborador';
  const ANALISTA = 'analista';
  const GESTOR = 'gestor';
  const PERFIS = [COLABORADOR, ANALISTA, GESTOR];
  const PERFIS_CRIAVEIS = [COLABORADOR, ANALISTA];
  const MIN_SENHA = 6;
  const PLANOS = {
    essencial: { nome: 'Essencial', preco_mensal: 149, limite_analistas: 3 },
    profissional: { nome: 'Profissional', preco_mensal: 390, limite_analistas: 15 },
    empresarial: { nome: 'Empresarial', preco_mensal: null, limite_analistas: null },
  };
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  class ErroHttp extends Error {
    constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.extra = extra; }
  }
  const dadosInvalidos = (msg, extra) => new ErroHttp(422, msg, extra);
  const conflito = (msg) => new ErroHttp(409, msg);
  const naoAutenticado = (msg) => new ErroHttp(401, msg);
  const acessoNegado = (msg) => new ErroHttp(403, msg);
  const naoEncontrado = (msg) => new ErroHttp(404, msg);

  const p2 = (n) => String(n).padStart(2, '0');
  function iso(d) {
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }
  const agora = () => iso(new Date());
  function momento(diasAtras, hora, minuto) {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    d.setHours(hora, minuto, 0, 0);
    return iso(d);
  }
  const minutosAtras = (min) => iso(new Date(Date.now() - min * 60000));
  const codigo = (numero) => `#${String(numero).padStart(3, '0')}`;
  const copia = (valor) => JSON.parse(JSON.stringify(valor));

  function validarNome(nome, campo = 'Nome') {
    nome = (nome || '').split(/\s+/).filter(Boolean).join(' ');
    if (nome.length < 2) throw dadosInvalidos(`${campo} deve ter pelo menos 2 caracteres.`);
    return nome.slice(0, 80);
  }
  function validarEmail(email) {
    email = (email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw dadosInvalidos('Informe um e-mail válido.');
    return email;
  }
  function validarSenha(senha) {
    if ((senha || '').length < MIN_SENHA) throw dadosInvalidos(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
    return senha;
  }
  function validarPlano(plano) {
    plano = (plano || '').trim().toLowerCase();
    if (!PLANOS[plano]) throw dadosInvalidos('Escolha um dos planos disponíveis.');
    return plano;
  }
  function validarContato(contato) {
    const tipo = contato?.tipo;
    const valor = String(contato?.valor || '').trim();
    if (!['whatsapp', 'teams', 'email'].includes(tipo)) throw dadosInvalidos('Escolha uma forma de contato.');
    if (tipo === 'whatsapp') {
      const digitos = valor.replace(/\D/g, '');
      if (digitos.length < 10 || digitos.length > 13) throw dadosInvalidos('Informe o WhatsApp com DDD.');
      return { tipo, valor };
    }
    if (!EMAIL.test(valor)) throw dadosInvalidos('Informe um e-mail válido para contato.');
    return { tipo, valor: valor.toLowerCase() };
  }

  // ---------- "Banco" no localStorage ----------
  function lerDb() {
    try {
      const bruto = localStorage.getItem(CHAVE_DB);
      if (bruto) return JSON.parse(bruto);
    } catch {}
    const db = { proximoChamado: 1, proximoUsuario: 1, proximaEmpresa: 1, chamados: [], usuarios: [], empresas: [] };
    popularExemplos(db);
    salvarDb(db);
    return db;
  }
  function salvarDb(db) {
    try { localStorage.setItem(CHAVE_DB, JSON.stringify(db)); } catch {}
  }

  const empresaDict = (empresa) => ({
    id: empresa.id,
    nome: empresa.nome,
    plano: empresa.plano,
    plano_nome: PLANOS[empresa.plano].nome,
    limite_analistas: PLANOS[empresa.plano].limite_analistas,
  });
  const usuarioDict = (u) => ({
    id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, empresa_id: u.empresa_id,
    ativo: u.ativo !== false, criado_em: u.criado_em,
  });
  const chamadoDict = (c) => ({ ...c, codigo: codigo(c.numero) });

  function perfilPublico(db, usuario) {
    const empresa = db.empresas.find((e) => e.id === usuario.empresa_id);
    return { ...usuarioDict(usuario), empresa: empresa ? empresaDict(empresa) : null };
  }
  const emitirSessao = (db, usuario) => ({ token: `simulador-${usuario.id}`, usuario: perfilPublico(db, usuario) });
  function buscarPorEmail(db, email) {
    const alvo = (email || '').trim().toLowerCase();
    return db.usuarios.find((u) => u.email === alvo) || null;
  }
  function entraComo(usuario, area) {
    if (area === COLABORADOR) return usuario.perfil === COLABORADOR;
    if (area === ANALISTA) return usuario.perfil === ANALISTA || usuario.perfil === GESTOR;
    return false;
  }

  // ---------- Contas ----------
  function criarUsuario(db, nome, email, perfil, empresaId, senha, criadoEm = agora()) {
    if (!PERFIS.includes(perfil)) throw dadosInvalidos('Perfil inválido.');
    const usuario = {
      id: db.proximoUsuario++,
      nome: validarNome(nome),
      email: validarEmail(email),
      perfil,
      empresa_id: empresaId,
      senha: validarSenha(senha),
      ativo: true,
      criado_em: criadoEm,
    };
    db.usuarios.push(usuario);
    return usuario;
  }
  function garantirEmailLivre(db, email) {
    if (buscarPorEmail(db, email)) throw conflito('Já existe uma conta com este e-mail.');
  }
  function exigirGestor(usuario) {
    if (usuario.perfil !== GESTOR) throw acessoNegado('Somente o gestor da empresa pode gerenciar contas.');
  }
  function garantirLimiteAnalistas(db, empresaId) {
    const empresa = db.empresas.find((e) => e.id === empresaId);
    const limite = empresa ? PLANOS[empresa.plano].limite_analistas : null;
    const analistas = db.usuarios.filter((u) => u.empresa_id === empresaId && u.perfil === ANALISTA).length;
    if (limite != null && analistas >= limite) {
      throw conflito(`O plano ${PLANOS[empresa.plano].nome} permite até ${limite} analistas.`);
    }
  }

  function contratar(db, { plano, empresa = {}, responsavel = {} }) {
    plano = validarPlano(plano);
    const nomeEmpresa = validarNome(empresa.nome, 'Nome da empresa');
    validarNome(responsavel.nome, 'Nome do responsável');
    validarEmail(responsavel.email);
    validarSenha(responsavel.senha);
    garantirEmailLivre(db, responsavel.email);
    const nova = {
      id: db.proximaEmpresa++, nome: nomeEmpresa, plano,
      cnpj: (empresa.cnpj || '').trim().slice(0, 20), criada_em: agora(),
    };
    db.empresas.push(nova);
    const gestor = criarUsuario(db, responsavel.nome, responsavel.email, GESTOR, nova.id, responsavel.senha);
    return emitirSessao(db, gestor);
  }

  function criarConta(db, gestor, { nome, email, perfil, senha }, criadoEm) {
    exigirGestor(gestor);
    if (!PERFIS_CRIAVEIS.includes(perfil)) throw dadosInvalidos('O perfil deve ser analista ou colaborador.');
    garantirEmailLivre(db, email);
    if (perfil === ANALISTA) garantirLimiteAnalistas(db, gestor.empresa_id);
    return criarUsuario(db, nome, email, perfil, gestor.empresa_id, senha, criadoEm);
  }

  function contaDaEmpresa(db, gestor, id) {
    exigirGestor(gestor);
    const conta = db.usuarios.find((u) => u.id === id && u.empresa_id === gestor.empresa_id);
    if (!conta) throw naoEncontrado('Conta não encontrada.');
    if (conta.id === gestor.id) throw dadosInvalidos('Você não pode alterar a sua própria conta por aqui.');
    return conta;
  }

  function atualizarConta(db, gestor, id, { ativo, perfil }) {
    const conta = contaDaEmpresa(db, gestor, id);
    if (perfil !== undefined && perfil !== conta.perfil) {
      if (!PERFIS_CRIAVEIS.includes(perfil)) throw dadosInvalidos('O perfil deve ser analista ou colaborador.');
      if (perfil === ANALISTA) garantirLimiteAnalistas(db, gestor.empresa_id);
      conta.perfil = perfil;
    }
    if (ativo !== undefined) conta.ativo = Boolean(ativo);
    return conta;
  }

  // ---------- Chamados ----------
  function catalogo() {
    if (!window.Catalogo) throw new ErroHttp(500, 'Catálogo não carregado (inclua js/catalogo.js na página).');
    return window.Catalogo;
  }

  function montarChamado(db, dados) {
    const cat = catalogo();
    const genero = cat.genero(dados.genero);
    if (!genero) throw dadosInvalidos('Escolha o tipo de problema.');
    const sub = cat.subgenero(genero.id, dados.subgenero);
    if (!sub) throw dadosInvalidos(`Escolha uma das opções de “${genero.titulo}”.`);
    const nota = String(dados.nota || '').trim();
    if (nota.length < MIN_NOTA) {
      throw dadosInvalidos(
        `Escreva uma nota com pelo menos ${MIN_NOTA} caracteres. Ela vai direto para o analista.`,
        { precisa_complemento: true },
      );
    }
    const contato = validarContato(dados.contato);
    const impacto = cat.impactos.some((i) => i.id === dados.impacto) ? dados.impacto : 'eu';
    return {
      numero: db.proximoChamado++,
      descricao: `${genero.titulo} › ${sub.titulo}`,
      genero: genero.id,
      subgenero: sub.id,
      genero_titulo: genero.titulo,
      subgenero_titulo: sub.titulo,
      impacto,
      maquina: String(dados.maquina || '').trim().slice(0, 30),
      nota: nota.slice(0, 1000),
      contato,
      solicitante: (dados.solicitante || '').trim() || 'Colaborador',
      solicitante_id: dados.solicitante_id ?? null,
      categoria: genero.categoria,
      fila: genero.fila,
      prioridade: genero.prioridade || (impacto !== 'eu' ? 'Alta' : 'Normal'),
      status: AGUARDANDO,
      analista: null,
      aberto_em: dados.aberto_em || agora(),
      assumido_em: null,
      resolvido_em: null,
      resolucao: null,
    };
  }

  function mensagemConfirmacao(c) {
    const [data, hora] = c.aberto_em.split('T');
    const [ano, mes, dia] = data.split('-');
    return `Chamado ${codigo(c.numero)} registrado em ${dia}/${mes}/${ano} às ${hora.slice(0, 5)}. `
      + `Categoria: ${c.categoria} · Fila: ${c.fila} · Status: ${c.status}. Um analista vai assumir em breve.`;
  }

  // ---------- Dados de exemplo ----------
  function popularExemplos(db) {
    const sessao = contratar(db, {
      plano: 'profissional',
      empresa: { nome: 'Empresa Demonstração', cnpj: '' },
      responsavel: { nome: 'Ana Lima', email: 'gestor@demo.helpia', senha: 'demo123' },
    });
    const gestor = db.usuarios.find((u) => u.id === sessao.usuario.id);
    const conta = (nome, email, perfil, dias) =>
      criarConta(db, gestor, { nome, email, perfil, senha: 'demo123' }, momento(dias, 9, 0));
    const carlos = conta('Carlos Souza', 'analista@demo.helpia', ANALISTA, 30);
    const beatriz = conta('Beatriz Rocha', 'beatriz@demo.helpia', ANALISTA, 21);
    const joao = conta('João Silva', 'colaborador@demo.helpia', COLABORADOR, 20);
    const maria = conta('Maria Oliveira', 'maria@demo.helpia', COLABORADOR, 18);
    const lucio = conta('Lúcio Martins', 'lucio@demo.helpia', COLABORADOR, 12);

    const chamado = (usuario, dados, extra = {}) => {
      const c = montarChamado(db, { ...dados, solicitante: usuario.nome, solicitante_id: usuario.id });
      Object.assign(c, extra);
      db.chamados.push(c);
      return c;
    };
    const whats = (n) => ({ tipo: 'whatsapp', valor: n });

    // Histórico (já resolvidos)
    chamado(joao, {
      genero: 'senha', subgenero: 'email', impacto: 'eu', aberto_em: momento(2, 8, 40),
      nota: 'Minha senha do e-mail expirou e não consigo trocar pela tela de login.',
      contato: { tipo: 'email', valor: 'colaborador@demo.helpia' },
    }, {
      status: RESOLVIDO, analista: carlos.nome, assumido_em: momento(2, 8, 52), resolvido_em: momento(2, 9, 5),
      resolucao: 'Senha expirada. Redefini no painel do Microsoft 365 e orientei sobre a troca a cada 90 dias.',
    });
    chamado(lucio, {
      genero: 'computador', subgenero: 'nao-liga', impacto: 'eu', maquina: '043', aberto_em: momento(1, 9, 10),
      nota: 'Cheguei e o computador não liga de jeito nenhum, nem a luz acende.',
      contato: whats('(11) 98888-0043'),
    }, {
      status: RESOLVIDO, analista: carlos.nome, assumido_em: momento(1, 9, 18), resolvido_em: momento(1, 9, 40),
      resolucao: 'Cabo de força solto no estabilizador. Reconectei, liguei e testei: funcionando normalmente.',
    });
    chamado(maria, {
      genero: 'internet', subgenero: 'cabo', impacto: 'eu', maquina: '112', aberto_em: momento(1, 14, 5),
      nota: 'O computador mostra "cabo de rede desconectado" mesmo com o cabo ligado.',
      contato: { tipo: 'teams', valor: 'maria@demo.helpia' },
    }, {
      status: RESOLVIDO, analista: beatriz.nome, assumido_em: momento(1, 14, 12), resolvido_em: momento(1, 14, 30),
      resolucao: 'Era só desconectar o cabo de rede e conectar novamente.',
    });

    // Hoje
    chamado(joao, {
      genero: 'impressora', subgenero: 'atolado', impacto: 'equipe', maquina: 'IMP-2º andar', aberto_em: minutosAtras(55),
      nota: 'A impressora do segundo andar travou com papel e ninguém da equipe consegue imprimir.',
      contato: whats('(11) 97777-1234'),
    }, { status: EM_ATENDIMENTO, analista: beatriz.nome, assumido_em: minutosAtras(40) });
    chamado(lucio, {
      genero: 'computador', subgenero: 'nao-liga', impacto: 'eu', maquina: '043', aberto_em: minutosAtras(18),
      nota: 'O computador não ligou de novo hoje cedo. Mesma máquina de ontem.',
      contato: whats('(11) 98888-0043'),
    });
    chamado(joao, {
      genero: 'internet', subgenero: 'cabo', impacto: 'eu', maquina: '087', aberto_em: minutosAtras(9),
      nota: 'Aparece um X no ícone de rede e o cabo parece estar conectado.',
      contato: { tipo: 'email', valor: 'colaborador@demo.helpia' },
    });
    chamado(maria, {
      genero: 'setor', subgenero: 'sem-internet-setor', impacto: 'setor', aberto_em: minutosAtras(4),
      nota: 'O financeiro inteiro ficou sem internet há uns 10 minutos. Urgente, fechamento do mês.',
      contato: whats('(11) 96666-5555'),
    });
  }

  // ---------- Rotas ----------
  function usuarioLogado(db, token, obrigatorio = true) {
    if (!token) {
      if (!obrigatorio) return null;
      throw naoAutenticado('Faça login para continuar.');
    }
    const id = Number(String(token).replace('simulador-', ''));
    const usuario = db.usuarios.find((u) => u.id === id);
    if (!usuario) throw naoAutenticado('Sessão inválida. Entre novamente.');
    if (usuario.ativo === false) throw naoAutenticado('Sua conta foi suspensa pelo gestor.');
    return usuario;
  }

  function buscarChamado(db, numero) {
    const chamado = db.chamados.find((c) => c.numero === numero);
    if (!chamado) throw naoEncontrado(`Chamado ${codigo(numero)} não encontrado.`);
    return chamado;
  }

  function rotear(db, metodo, rota, params, corpo, token) {
    let m;
    const chave = `${metodo} ${rota}`;

    if (chave === 'GET /status') return [200, { sistema: 'HelpIA', status: 'online', versao: '1.2 (simulador)' }];
    if (chave === 'GET /planos') return [200, Object.entries(PLANOS).map(([id, p]) => ({ id, ...p }))];
    if (chave === 'POST /empresas') return [201, contratar(db, corpo)];

    // Login e sessão
    if (chave === 'POST /auth/login') {
      const usuario = buscarPorEmail(db, corpo.email);
      if (!usuario || usuario.senha !== (corpo.senha || '')) throw naoAutenticado('E-mail ou senha incorretos.');
      if (usuario.ativo === false) throw acessoNegado('Esta conta está suspensa. Fale com o gestor da sua empresa.');
      if (corpo.perfil && !entraComo(usuario, corpo.perfil)) {
        const certa = usuario.perfil === COLABORADOR ? 'Colaborador' : 'Analista';
        throw acessoNegado(`Esta conta não é de ${corpo.perfil}. Selecione “${certa}” para entrar.`);
      }
      return [200, emitirSessao(db, usuario)];
    }
    if (chave === 'GET /auth/eu') return [200, perfilPublico(db, usuarioLogado(db, token))];

    // Contas (gestor)
    if (chave === 'GET /contas') {
      const gestor = usuarioLogado(db, token);
      exigirGestor(gestor);
      return [200, db.usuarios.filter((u) => u.empresa_id === gestor.empresa_id).sort((a, b) => a.id - b.id).map(usuarioDict)];
    }
    if (chave === 'POST /contas') return [201, usuarioDict(criarConta(db, usuarioLogado(db, token), corpo))];
    if (metodo === 'PATCH' && (m = rota.match(/^\/contas\/(\d+)$/))) {
      return [200, usuarioDict(atualizarConta(db, usuarioLogado(db, token), Number(m[1]), corpo))];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/contas\/(\d+)\/senha$/))) {
      const conta = contaDaEmpresa(db, usuarioLogado(db, token), Number(m[1]));
      conta.senha = validarSenha(corpo.senha);
      return [200, usuarioDict(conta)];
    }

    // Chamados
    if (chave === 'GET /chamados') {
      let lista = [...db.chamados].sort((a, b) => a.numero - b.numero);
      const status = params.get('status');
      const solicitante = params.get('solicitante');
      if (STATUS_VALIDOS.includes(status)) lista = lista.filter((c) => c.status === status);
      if (solicitante) {
        const alvo = solicitante.trim().toLowerCase();
        lista = lista.filter((c) => c.solicitante.toLowerCase() === alvo);
      }
      return [200, lista.map(chamadoDict)];
    }
    if (chave === 'POST /chamados') {
      const usuario = usuarioLogado(db, token, false);
      const chamado = montarChamado(db, {
        ...corpo,
        solicitante: usuario?.nome || corpo.solicitante,
        solicitante_id: usuario?.id ?? null,
      });
      db.chamados.push(chamado);
      return [201, { chamado: chamadoDict(chamado), mensagem: mensagemConfirmacao(chamado) }];
    }
    if (metodo === 'GET' && (m = rota.match(/^\/chamados\/(\d+)$/))) {
      return [200, chamadoDict(buscarChamado(db, Number(m[1])))];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/chamados\/(\d+)\/assumir$/))) {
      const chamado = buscarChamado(db, Number(m[1]));
      if (chamado.status !== AGUARDANDO) throw conflito(`Chamado ${codigo(chamado.numero)} não está aguardando atendimento.`);
      const usuario = usuarioLogado(db, token, false);
      chamado.analista = usuario?.nome || (corpo.analista || '').trim() || 'Analista';
      chamado.status = EM_ATENDIMENTO;
      chamado.assumido_em = agora();
      return [200, chamadoDict(chamado)];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/chamados\/(\d+)\/resolver$/))) {
      const chamado = buscarChamado(db, Number(m[1]));
      if (chamado.status !== EM_ATENDIMENTO) {
        throw conflito(`Chamado ${codigo(chamado.numero)} precisa estar em atendimento para ser resolvido.`);
      }
      const usuario = usuarioLogado(db, token, false);
      if (usuario && usuario.perfil !== GESTOR && usuario.nome !== chamado.analista) {
        throw acessoNegado(`Só ${chamado.analista}, que assumiu o chamado, pode finalizá-lo.`);
      }
      const nota = String(corpo.nota || '').trim();
      if (nota.length < MIN_RESOLUCAO) {
        throw dadosInvalidos(`Escreva a nota de resolução (mínimo de ${MIN_RESOLUCAO} caracteres).`);
      }
      chamado.status = RESOLVIDO;
      chamado.resolucao = nota.slice(0, 1000);
      chamado.resolvido_em = agora();
      return [200, chamadoDict(chamado)];
    }

    throw naoEncontrado(`Rota ${metodo} /api${rota} não existe no simulador.`);
  }

  /** Mesmo formato de retorno de API.requisitar: { ok, status, dados }. */
  async function responder(metodo, caminho, corpo, token) {
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));   // latência de rede
    const url = new URL(caminho, 'http://simulador');
    const db = lerDb();
    let status;
    let dados;
    try {
      [status, dados] = rotear(db, metodo.toUpperCase(), url.pathname, url.searchParams, corpo || {}, token);
      if (status < 400) salvarDb(db);
    } catch (erro) {
      if (!(erro instanceof ErroHttp)) throw erro;
      status = erro.status;
      dados = { erro: erro.message, ...erro.extra };
    }
    return { ok: status >= 200 && status < 300, status, dados: copia(dados) };
  }

  function limparDados() {
    try { localStorage.removeItem(CHAVE_DB); } catch {}
    window.Sessao?.limpar();
    location.href = 'login.html';
  }

  // ---------- Faixa de aviso ----------
  function mostrarFaixa() {
    const estilo = document.createElement('style');
    estilo.textContent = `
      .simulador-faixa {
        position: fixed; left: 12px; bottom: 12px; z-index: 900;
        display: flex; align-items: center; gap: .6rem;
        padding: .35rem .4rem .35rem .75rem;
        border-radius: 999px;
        background: var(--grafite, #1b1c1f); color: #f4f4f5;
        border: 1px solid var(--primary, #8FA858);
        font: 600 .74rem/1.2 var(--font, system-ui, sans-serif);
        box-shadow: 0 6px 18px rgba(0, 0, 0, .3);
        opacity: .85;
      }
      .simulador-faixa:hover { opacity: 1; }
      .simulador-faixa::before {
        content: ''; width: 8px; height: 8px; border-radius: 50%;
        background: var(--primary, #8FA858); box-shadow: 0 0 0 3px rgba(143, 168, 88, .35);
      }
      .simulador-faixa button {
        font: inherit; cursor: pointer;
        padding: .28rem .65rem; border-radius: 999px; border: 0;
        background: rgba(255, 255, 255, .1); color: inherit;
      }
      .simulador-faixa button:hover { background: var(--primary, #8FA858); color: var(--on-primary, #141A0D); }
    `;
    document.head.appendChild(estilo);

    const faixa = document.createElement('div');
    faixa.className = 'simulador-faixa';
    faixa.setAttribute('role', 'status');
    faixa.innerHTML = '<span>Modo simulação · dados fictícios</span><button type="button">Limpar dados</button>';
    faixa.querySelector('button').addEventListener('click', () => {
      if (confirm('Apagar os chamados e contas simulados e voltar aos dados iniciais?')) limparDados();
    });
    document.body.appendChild(faixa);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarFaixa);
  else mostrarFaixa();

  window.Simulador = { ativo: true, responder, limparDados };
})();
