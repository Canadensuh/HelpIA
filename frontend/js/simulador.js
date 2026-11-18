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
  const PERFIS_CRIAVEIS = [COLABORADOR, ANALISTA, GESTOR];   // o gestor também pode nomear outro gestor
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
      if (bruto) {
        const salvo = JSON.parse(bruto);
        if (garantirExtras(salvo)) salvarDb(salvo);       // bancos antigos ganham chat e metas
        return salvo;
      }
    } catch {}
    const db = { proximoChamado: 1, proximoUsuario: 1, proximaEmpresa: 1, chamados: [], usuarios: [], empresas: [] };
    popularExemplos(db);
    garantirExtras(db);
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
    ativo: u.ativo !== false, criado_em: u.criado_em, trocar_senha: !!u.trocar_senha,
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
    if (!PERFIS_CRIAVEIS.includes(perfil)) throw dadosInvalidos('O cargo deve ser analista, colaborador ou gestor.');
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

  function atualizarConta(db, gestor, id, { ativo, perfil, nome, email, trocar_senha }) {
    const conta = contaDaEmpresa(db, gestor, id);
    if (nome !== undefined) conta.nome = validarNome(nome);
    if (email !== undefined && validarEmail(email) !== conta.email) {
      garantirEmailLivre(db, email);
      conta.email = validarEmail(email);
    }
    if (trocar_senha !== undefined) conta.trocar_senha = Boolean(trocar_senha);
    if (perfil !== undefined && perfil !== conta.perfil) {
      if (!PERFIS_CRIAVEIS.includes(perfil)) throw dadosInvalidos('O cargo deve ser analista, colaborador ou gestor.');
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
    const contato = dados.contato?.valor ? validarContato(dados.contato) : null;   // opcional: o canal é o HelpIA Chat
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


  // =========================================================
  // HelpIA Chat e Metas (só no simulador por enquanto)
  // - Grupo da equipe: analistas e gestores da empresa (sem colaboradores, sem o Helpy).
  // - Conversas diretas: analista ↔ analista/gestor/colaborador. O colaborador só responde.
  // - Mensagens do sistema ("HelpIA") mencionam tickets no grupo.
  // - Metas por empresa: meta diária, regra do dia e mensagens motivacionais.
  // =========================================================
  const usuarioPorId = (db, id) => db.usuarios.find((u) => u.id === id) || null;
  const ehEquipe = (u) => u && (u.perfil === ANALISTA || u.perfil === GESTOR);

  function garantirExtras(db) {
    let mudou = false;
    if (!db.conversas) {
      Object.assign(db, { conversas: [], mensagens: [], leituras: {}, proximaConversa: 1, proximaMensagem: 1 });
      mudou = true;
    }
    if (!db.metas) { db.metas = {}; mudou = true; }
    if (!db.extrasSemeados && db.usuarios.length) { db.extrasSemeados = true; semearExtras(db); mudou = true; }
    return mudou;
  }

  function grupoDaEmpresa(db, empresaId) {
    let grupo = db.conversas.find((c) => c.tipo === 'grupo' && c.empresa_id === empresaId);
    if (!grupo) {
      const empresa = db.empresas.find((e) => e.id === empresaId);
      grupo = { id: db.proximaConversa++, tipo: 'grupo', empresa_id: empresaId, nome: `Equipe ${empresa?.nome || 'HelpIA'}`, criada_em: agora() };
      db.conversas.push(grupo);
    }
    return grupo;
  }
  function participantes(db, conversa) {
    if (conversa.tipo === 'grupo') {
      return db.usuarios.filter((u) => u.empresa_id === conversa.empresa_id && ehEquipe(u) && u.ativo !== false);
    }
    return conversa.membros.map((id) => usuarioPorId(db, id)).filter(Boolean);
  }
  function podeVerConversa(usuario, conversa) {
    if (conversa.tipo === 'grupo') return ehEquipe(usuario) && usuario.empresa_id === conversa.empresa_id;
    return conversa.membros.includes(usuario.id);
  }
  function conversaDoUsuario(db, usuario, id) {
    const conversa = db.conversas.find((c) => c.id === id);
    if (!conversa || !podeVerConversa(usuario, conversa)) throw naoEncontrado('Conversa não encontrada.');
    return conversa;
  }

  function mensagemDict(db, m) {
    const autor = m.autor_id ? usuarioPorId(db, m.autor_id) : null;
    const ticket = m.ticket ? db.chamados.find((c) => c.numero === m.ticket) : null;
    return {
      id: m.id, conversa_id: m.conversa_id, texto: m.texto, em: m.em, anexos: m.anexos || [],
      sistema: !m.autor_id,
      autor_id: m.autor_id, autor_nome: autor ? autor.nome : 'HelpIA', autor_perfil: autor ? autor.perfil : 'sistema',
      ticket: ticket ? chamadoDict(ticket) : null,
    };
  }
  function conversaDict(db, conversa, usuario) {
    const mensagens = db.mensagens.filter((m) => m.conversa_id === conversa.id);
    const lida = db.leituras[`${conversa.id}:${usuario.id}`] || 0;
    const pessoas = participantes(db, conversa);
    const outro = conversa.tipo === 'direta' ? pessoas.find((u) => u.id !== usuario.id) : null;
    const ultima = mensagens[mensagens.length - 1];
    return {
      id: conversa.id, tipo: conversa.tipo,
      nome: conversa.tipo === 'grupo' ? conversa.nome : (outro?.nome || 'Conversa'),
      outro: outro ? usuarioDict(outro) : null,
      participantes: pessoas.map((u) => ({ id: u.id, nome: u.nome, perfil: u.perfil })),
      ticket: conversa.ticket ? chamadoDict(db.chamados.find((c) => c.numero === conversa.ticket) || { numero: conversa.ticket }) : null,
      ultima: ultima ? mensagemDict(db, ultima) : null,
      atividade: ultima ? ultima.em : conversa.criada_em,
      nao_lidas: mensagens.filter((m) => m.id > lida && m.autor_id !== usuario.id).length,
    };
  }
  function postar(db, conversa, autorId, texto, ticket = null, em = agora(), anexos = []) {
    const m = { id: db.proximaMensagem++, conversa_id: conversa.id, autor_id: autorId, texto, ticket, em, anexos };
    db.mensagens.push(m);
    if (autorId) db.leituras[`${conversa.id}:${autorId}`] = m.id;      // quem escreve já leu
    return m;
  }
  function abrirDireta(db, usuario, outroId, ticket = null) {
    const outro = usuarioPorId(db, outroId);
    if (!outro || outro.empresa_id !== usuario.empresa_id || outro.id === usuario.id) throw naoEncontrado('Pessoa não encontrada.');
    if (!ehEquipe(usuario)) throw acessoNegado('Colaboradores respondem às mensagens dos analistas, mas não iniciam conversas.');
    let conversa = db.conversas.find((c) => c.tipo === 'direta' && c.membros.includes(usuario.id) && c.membros.includes(outro.id));
    if (!conversa) {
      conversa = { id: db.proximaConversa++, tipo: 'direta', empresa_id: usuario.empresa_id, membros: [usuario.id, outro.id], ticket: null, criada_em: agora() };
      db.conversas.push(conversa);
    }
    if (ticket) conversa.ticket = ticket;
    return conversa;
  }
  /** Aviso automático do HelpIA no grupo da equipe, mencionando o ticket. */
  function avisarGrupo(db, empresaId, texto, ticket) {
    if (!empresaId) return;
    postar(db, grupoDaEmpresa(db, empresaId), null, texto, ticket);
  }

  function metasDaEmpresa(db, empresaId) {
    if (!db.metas[empresaId]) {
      db.metas[empresaId] = { meta_padrao: 5, por_analista: {}, regra_do_dia: null, motivacionais: [], proximoMotivacional: 1 };
    }
    return db.metas[empresaId];
  }
  function metasDict(db, usuario) {
    const metas = metasDaEmpresa(db, usuario.empresa_id);
    const analistas = db.usuarios.filter((u) => u.empresa_id === usuario.empresa_id && u.perfil === ANALISTA);
    const hoje = agora().slice(0, 10);
    const feitosHoje = (u) => db.chamados.filter((c) => c.status === RESOLVIDO && c.analista === u.nome && (c.resolvido_em || '').startsWith(hoje)).length;
    return {
      meta_padrao: metas.meta_padrao,
      regra_do_dia: metas.regra_do_dia,
      motivacionais: metas.motivacionais,
      analistas: analistas.map((u) => ({
        id: u.id, nome: u.nome, ativo: u.ativo !== false,
        meta: metas.por_analista[u.id] ?? metas.meta_padrao,
        personalizada: metas.por_analista[u.id] != null,
        feitos_hoje: feitosHoje(u),
        total: db.chamados.filter((c) => c.status === RESOLVIDO && c.analista === u.nome).length,
      })),
      minha_meta: usuario.perfil === ANALISTA ? (metas.por_analista[usuario.id] ?? metas.meta_padrao) : null,
    };
  }

  function semearExtras(db) {
    for (const empresa of db.empresas) {
      const pessoa = (email) => db.usuarios.find((u) => u.email === email && u.empresa_id === empresa.id);
      const ana = pessoa('gestor@demo.helpia');
      const carlos = pessoa('analista@demo.helpia');
      const beatriz = pessoa('beatriz@demo.helpia');
      const joao = pessoa('colaborador@demo.helpia');
      const grupo = grupoDaEmpresa(db, empresa.id);
      if (!ana || !carlos || !beatriz) continue;
      postar(db, grupo, ana.id, 'Bom dia, time! Hoje o foco é zerar a bandeja antes do almoço. Bora?', null, minutosAtras(70));
      postar(db, grupo, beatriz.id, 'Peguei a impressora do 2º andar, a equipe toda está parada lá.', 4, minutosAtras(41));
      postar(db, grupo, null, 'Ticket #007 · Setor parado chegou com prioridade ALTA. Quem pode assumir?', 7, minutosAtras(4));
      postar(db, grupo, carlos.id, 'Deixa comigo o #007 assim que eu fechar o que estou fazendo.', null, minutosAtras(3));
      const direta = abrirDireta(db, carlos, beatriz.id);
      postar(db, direta, beatriz.id, 'Carlos, aquele computador 043 do Lúcio voltou a dar problema. Acho que é o estabilizador.', 5, minutosAtras(15));
      if (joao) {
        const comJoao = abrirDireta(db, carlos, joao.id, 6);
        postar(db, comJoao, carlos.id, 'Oi João! Vi seu ticket #006. Enquanto eu não chego aí: o cabo de rede está bem encaixado atrás do computador?', 6, minutosAtras(6));
      }
      const metas = metasDaEmpresa(db, empresa.id);
      metas.regra_do_dia = { texto: 'Prioridade ALTA primeiro, sempre. Ninguém fica mais de 30 minutos esperando na bandeja.', autor: ana.nome, em: minutosAtras(80) };
      metas.motivacionais = [
        { id: metas.proximoMotivacional++, texto: 'Cada ticket fechado é alguém voltando a trabalhar. Obrigada, time!' },
        { id: metas.proximoMotivacional++, texto: 'Uma boa nota de resolução hoje economiza meia hora amanhã.' },
        { id: metas.proximoMotivacional++, texto: 'Respira, toma um café e bora pro próximo! ☕' },
      ];
    }
  }

  function rotasExtras(db, metodo, rota, params, corpo, token) {
    let m;
    const chave = `${metodo} ${rota}`;

    // ---------- Chat ----------
    if (chave === 'GET /chat/conversas') {
      const usuario = usuarioLogado(db, token);
      if (ehEquipe(usuario)) grupoDaEmpresa(db, usuario.empresa_id);
      return [200, db.conversas.filter((c) => c.empresa_id === usuario.empresa_id && podeVerConversa(usuario, c))
        .map((c) => conversaDict(db, c, usuario))
        .filter((c) => c.tipo === 'grupo' || c.ultima || ehEquipe(usuario))
        .sort((a, b) => b.atividade.localeCompare(a.atividade))];
    }
    if (chave === 'GET /chat/nao-lidas') {
      const usuario = usuarioLogado(db, token);
      const total = db.conversas.filter((c) => c.empresa_id === usuario.empresa_id && podeVerConversa(usuario, c))
        .reduce((soma, c) => soma + conversaDict(db, c, usuario).nao_lidas, 0);
      return [200, { total }];
    }
    if (chave === 'GET /chat/contatos') {
      const usuario = usuarioLogado(db, token);
      if (!ehEquipe(usuario)) return [200, []];
      const alvo = usuario.perfil === GESTOR ? [ANALISTA, GESTOR] : [ANALISTA, GESTOR, COLABORADOR];
      return [200, db.usuarios.filter((u) => u.empresa_id === usuario.empresa_id && u.id !== usuario.id && u.ativo !== false && alvo.includes(u.perfil))
        .map(usuarioDict).sort((a, b) => a.nome.localeCompare(b.nome))];
    }
    if (chave === 'POST /chat/conversas') {
      const usuario = usuarioLogado(db, token);
      const ticket = corpo.ticket ? Number(corpo.ticket) : null;
      return [201, conversaDict(db, abrirDireta(db, usuario, Number(corpo.com), ticket), usuario)];
    }
    if (metodo === 'GET' && (m = rota.match(/^\/chat\/conversas\/(\d+)\/mensagens$/))) {
      const usuario = usuarioLogado(db, token);
      const conversa = conversaDoUsuario(db, usuario, Number(m[1]));
      return [200, db.mensagens.filter((x) => x.conversa_id === conversa.id).map((x) => mensagemDict(db, x))];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/chat\/conversas\/(\d+)\/mensagens$/))) {
      const usuario = usuarioLogado(db, token);
      const conversa = conversaDoUsuario(db, usuario, Number(m[1]));
      const texto = String(corpo.texto || '').trim();
      // Anexos: só os dados do arquivo (o arquivo em si fica no IndexedDB do navegador, ver js/anexos.js)
      const anexos = (Array.isArray(corpo.anexos) ? corpo.anexos : []).slice(0, 10).map((a) => ({
        id: String(a.id || '').slice(0, 40), nome: String(a.nome || 'arquivo').slice(0, 200),
        tipo: String(a.tipo || 'application/octet-stream').slice(0, 100), tamanho: Number(a.tamanho) || 0,
      })).filter((a) => a.id);
      if (!texto && !anexos.length) throw dadosInvalidos('Escreva uma mensagem ou anexe um arquivo.');
      const ticket = corpo.ticket ? Number(corpo.ticket) : null;
      if (ticket && !db.chamados.some((c) => c.numero === ticket)) throw dadosInvalidos('Ticket não encontrado.');
      return [201, mensagemDict(db, postar(db, conversa, usuario.id, texto.slice(0, 1000), ticket, agora(), anexos))];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/chat\/conversas\/(\d+)\/lida$/))) {
      const usuario = usuarioLogado(db, token);
      const conversa = conversaDoUsuario(db, usuario, Number(m[1]));
      const ultima = db.mensagens.filter((x) => x.conversa_id === conversa.id).pop();
      if (ultima) db.leituras[`${conversa.id}:${usuario.id}`] = ultima.id;
      return [200, { ok: true }];
    }

    // ---------- Metas ----------
    if (chave === 'GET /metas') {
      const usuario = usuarioLogado(db, token);
      if (!ehEquipe(usuario)) throw acessoNegado('Metas são da equipe de TI.');
      return [200, metasDict(db, usuario)];
    }
    if (chave === 'PATCH /metas') {
      const gestor = usuarioLogado(db, token);
      exigirGestor(gestor);
      const metas = metasDaEmpresa(db, gestor.empresa_id);
      if (corpo.meta_padrao !== undefined) {
        const n = Number(corpo.meta_padrao);
        if (!Number.isInteger(n) || n < 1 || n > 100) throw dadosInvalidos('A meta diária deve ser entre 1 e 100 tickets.');
        metas.meta_padrao = n;
      }
      if (corpo.por_analista) {
        for (const [id, valor] of Object.entries(corpo.por_analista)) {
          if (valor === null || valor === '') { delete metas.por_analista[id]; continue; }
          const n = Number(valor);
          if (!Number.isInteger(n) || n < 1 || n > 100) throw dadosInvalidos('A meta deve ser entre 1 e 100 tickets.');
          metas.por_analista[id] = n;
        }
      }
      if (corpo.regra_do_dia !== undefined) {
        const texto = String(corpo.regra_do_dia || '').trim().slice(0, 280);
        metas.regra_do_dia = texto ? { texto, autor: gestor.nome, em: agora() } : null;
        if (texto) avisarGrupo(db, gestor.empresa_id, `Nova regra do dia: “${texto}”`, null);
      }
      return [200, metasDict(db, gestor)];
    }
    if (chave === 'POST /metas/motivacionais') {
      const gestor = usuarioLogado(db, token);
      exigirGestor(gestor);
      const texto = String(corpo.texto || '').trim().slice(0, 200);
      if (texto.length < 3) throw dadosInvalidos('Escreva a mensagem motivacional.');
      const metas = metasDaEmpresa(db, gestor.empresa_id);
      metas.motivacionais.push({ id: metas.proximoMotivacional++, texto });
      return [201, metasDict(db, gestor)];
    }
    if (metodo === 'DELETE' && (m = rota.match(/^\/metas\/motivacionais\/(\d+)$/))) {
      const gestor = usuarioLogado(db, token);
      exigirGestor(gestor);
      const metas = metasDaEmpresa(db, gestor.empresa_id);
      metas.motivacionais = metas.motivacionais.filter((x) => x.id !== Number(m[1]));
      return [200, metasDict(db, gestor)];
    }
    return null;
  }

  function rotear(db, metodo, rota, params, corpo, token) {
    let m;
    const chave = `${metodo} ${rota}`;
    const extra = rotasExtras(db, metodo, rota, params, corpo, token);
    if (extra) return extra;

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
      conta.trocar_senha = false;
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
        lista = lista.filter((c) => c.solicitante.toLowerCase() === alvo && !c.oculto_solicitante);
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
      if (catalogo().nivel(chamado).id === 'alta') {
        avisarGrupo(db, usuario?.empresa_id, `Ticket ${codigo(chamado.numero)} · ${chamado.genero_titulo} chegou com prioridade ALTA. Quem pode assumir?`, chamado.numero);
      }
      return [201, { chamado: chamadoDict(chamado), mensagem: mensagemConfirmacao(chamado) }];
    }
    if (metodo === 'GET' && (m = rota.match(/^\/chamados\/(\d+)$/))) {
      return [200, chamadoDict(buscarChamado(db, Number(m[1])))];
    }
    // Colaborador tira um ticket resolvido do próprio histórico (o registro continua para a TI)
    if (metodo === 'POST' && (m = rota.match(/^\/chamados\/(\d+)\/ocultar$/))) {
      const chamado = buscarChamado(db, Number(m[1]));
      if (chamado.status !== RESOLVIDO) throw conflito(`Só tickets resolvidos podem sair do histórico.`);
      chamado.oculto_solicitante = true;
      return [200, chamadoDict(chamado)];
    }
    // Colaborador exclui um ticket próprio que ainda está na fila
    if (metodo === 'DELETE' && (m = rota.match(/^\/chamados\/(\d+)$/))) {
      const chamado = buscarChamado(db, Number(m[1]));
      const usuario = usuarioLogado(db, token, false);
      const dono = chamado.solicitante_id != null
        ? chamado.solicitante_id === usuario?.id
        : chamado.solicitante === usuario?.nome;
      if (usuario && usuario.perfil === COLABORADOR && !dono) {
        throw acessoNegado('Você só pode excluir os tickets que você abriu.');
      }
      if (chamado.status !== AGUARDANDO) {
        throw conflito(`O ticket ${codigo(chamado.numero)} já está com ${chamado.analista || 'um analista'} e não pode mais ser excluído.`);
      }
      db.chamados = db.chamados.filter((c) => c !== chamado);
      return [200, { excluido: chamado.numero }];
    }
    if (metodo === 'POST' && (m = rota.match(/^\/chamados\/(\d+)\/assumir$/))) {
      const chamado = buscarChamado(db, Number(m[1]));
      if (chamado.status !== AGUARDANDO) throw conflito(`Chamado ${codigo(chamado.numero)} não está aguardando atendimento.`);
      const usuario = usuarioLogado(db, token, false);
      chamado.analista = usuario?.nome || (corpo.analista || '').trim() || 'Analista';
      chamado.status = EM_ATENDIMENTO;
      chamado.assumido_em = agora();
      if (catalogo().nivel(chamado).id === 'alta') {
        avisarGrupo(db, usuario?.empresa_id, `${chamado.analista} assumiu o ticket ${codigo(chamado.numero)} (prioridade ALTA).`, chamado.numero);
      }
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
