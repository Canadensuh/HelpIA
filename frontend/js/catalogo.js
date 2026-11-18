/* =========================================================
   catalogo.js — opções pré-pensadas para abrir um chamado
   Gênero (tipo de manutenção) → Subgênero → detalhes.
   Cada gênero define categoria, fila e prioridade base do chamado,
   além das dicas que o Helpy mostra antes do ticket ser gerado.

   ATENÇÃO — Reintegração: o backend Python precisa receber este mesmo
   catálogo (ver lista no topo de js/simulador.js).
   ========================================================= */

/* Ícones animados (as animações ficam em css/icones.css) */
const ICONES_HELPIA = {
  computador: `<svg viewBox="0 0 64 64" class="ico ico-computador" aria-hidden="true">
    <rect class="ico-traco" x="8" y="10" width="48" height="32" rx="4"/>
    <rect class="ico-tela" x="13" y="15" width="38" height="22" rx="2"/>
    <path class="ico-traco" d="M24 54h16M32 42v12"/>
    <circle class="ico-led" cx="32" cy="26" r="3"/></svg>`,

  senha: `<svg viewBox="0 0 64 64" class="ico ico-senha" aria-hidden="true">
    <path class="ico-traco ico-argola" d="M22 28v-8a10 10 0 0 1 20 0v8"/>
    <rect class="ico-traco ico-corpo" x="14" y="28" width="36" height="26" rx="5"/>
    <g class="ico-asteriscos"><circle cx="24" cy="41" r="2.8"/><circle cx="32" cy="41" r="2.8"/><circle cx="40" cy="41" r="2.8"/></g></svg>`,

  internet: `<svg viewBox="0 0 64 64" class="ico ico-internet" aria-hidden="true">
    <path class="ico-traco onda o3" d="M8 25a34 34 0 0 1 48 0"/>
    <path class="ico-traco onda o2" d="M16 33a23 23 0 0 1 32 0"/>
    <path class="ico-traco onda o1" d="M24 41a12 12 0 0 1 16 0"/>
    <circle class="ico-ponto" cx="32" cy="49" r="3.6"/></svg>`,

  setor: `<svg viewBox="0 0 64 64" class="ico ico-setor" aria-hidden="true">
    <path class="ico-traco" d="M14 58V28h36v30M8 58h48"/>
    <path class="ico-traco" d="M22 36h6M36 36h6M22 46h6M36 46h6M29 58v-7h6v7"/>
    <path class="ico-sirene" d="M25 28v-6a7 7 0 0 1 14 0v6z"/>
    <g class="ico-raios"><path class="ico-traco" d="M32 4v5M18 9l3.5 3.5M46 9l-3.5 3.5"/></g></svg>`,

  impressora: `<svg viewBox="0 0 64 64" class="ico ico-impressora" aria-hidden="true">
    <path class="ico-traco" d="M18 24V8h28v16"/>
    <rect class="ico-papel" x="19" y="34" width="26" height="22" rx="1.5"/>
    <rect class="ico-traco ico-corpo-imp" x="8" y="22" width="48" height="20" rx="4"/>
    <circle class="ico-led" cx="47" cy="30" r="2.4"/></svg>`,

  sistemas: `<svg viewBox="0 0 64 64" class="ico ico-sistemas" aria-hidden="true">
    <rect class="ico-traco" x="6" y="8" width="44" height="34" rx="4"/>
    <path class="ico-traco" d="M6 16h44"/><circle class="ico-ponto" cx="11" cy="12" r="1.4"/><circle class="ico-ponto" cx="16" cy="12" r="1.4"/>
    <g class="ico-engrenagem">
      <circle class="ico-traco ico-engrenagem-miolo" cx="46" cy="44" r="7"/>
      <path class="ico-traco" d="M46 31v5M46 52v5M33 44h5M54 44h5M36.8 34.8l3.5 3.5M51.7 49.7l3.5 3.5M36.8 53.2l3.5-3.5M51.7 38.3l3.5-3.5"/>
    </g></svg>`,

  pedido: `<svg viewBox="0 0 64 64" class="ico ico-pedido" aria-hidden="true">
    <rect class="ico-traco" x="12" y="30" width="40" height="26" rx="3"/>
    <g class="ico-tampa"><rect class="ico-traco ico-tampa-fundo" x="8" y="21" width="48" height="9" rx="2"/>
    <path class="ico-traco" d="M32 21c-5-9-13-7-11-3s11 3 11 3c0 0 9 1 11-3s-6-6-11 3"/></g>
    <path class="ico-traco" d="M32 30v26"/></svg>`,

  outro: `<svg viewBox="0 0 64 64" class="ico ico-outro" aria-hidden="true">
    <path class="ico-traco" d="M10 12h44v32H30l-10 9v-9H10z"/>
    <g class="ico-interrogacao"><path class="ico-traco" d="M26.5 23a5.5 5.5 0 1 1 7.7 5c-1.5.7-2.2 1.8-2.2 3.6"/>
    <circle class="ico-ponto" cx="32" cy="37.5" r="2"/></g></svg>`,
};

const CATALOGO_HELPIA = [
  {
    id: 'computador',
    titulo: 'Computador ou notebook',
    descricao: 'Não liga, está lento, tela, teclado ou mouse',
    categoria: 'Hardware', fila: 'Suporte Técnico',
    pergunta: 'O que está acontecendo com o equipamento?',
    aparelho: 'computador',
    subgeneros: [
      { id: 'nao-liga', titulo: 'Não liga', ic: 'tomada',
        dica: 'Confira se o cabo de força está firme no computador e na tomada, e teste a tomada com outro aparelho. No notebook, segure o botão de ligar por 15 segundos e ligue só no carregador.' },
      { id: 'lento', titulo: 'Lento ou travando', ic: 'velocimetro',
        dica: 'Feche os programas que não está usando e reinicie o computador. Isso resolve boa parte dos casos de lentidão.' },
      { id: 'tela', titulo: 'Tela ou monitor', ic: 'monitor',
        dica: 'Verifique se o cabo de vídeo (HDMI, VGA ou DisplayPort) está firme dos dois lados e se o monitor está ligado na tomada.' },
      { id: 'perifericos', titulo: 'Teclado ou mouse', ic: 'teclado',
        dica: 'Troque o teclado ou mouse de porta USB. Se for sem fio, confira a pilha e o receptor.' },
      { id: 'barulho', titulo: 'Barulho ou esquentando', ic: 'termometro',
        dica: 'Desligue o equipamento se estiver muito quente ou com cheiro de queimado, e não o use até o analista avaliar.' },
      { id: 'outro', titulo: 'Outro problema', ic: 'duvida' },
    ],
  },
  {
    id: 'senha',
    titulo: 'Senha e acesso',
    descricao: 'Esqueci, expirou ou a conta bloqueou',
    categoria: 'Acesso', fila: 'Acessos e Identidade',
    pergunta: 'Senha do quê?',
    aparelho: 'computador',
    subgeneros: [
      { id: 'email', titulo: 'E-mail corporativo', ic: 'envelope',
        dica: 'Use "Esqueci minha senha" na tela de login do e-mail. Confira também se o Caps Lock não está ligado.' },
      { id: 'app-trabalho', titulo: 'Aplicativo de trabalho', ic: 'celular',
        dica: 'Saia e entre de novo no aplicativo. Se aparecer "senha expirada", a troca precisa ser feita pelo analista.' },
      { id: 'sistema-empresa', titulo: 'Sistema específico da empresa', ic: 'predio',
        dica: 'Alguns sistemas internos têm senha própria. Informe na nota qual é o sistema.' },
      { id: 'windows', titulo: 'Login do Windows', ic: 'janela',
        dica: 'Confira o Caps Lock e o idioma do teclado (ABNT2). Após 5 tentativas a conta pode bloquear.' },
      { id: 'vpn', titulo: 'VPN / acesso remoto', ic: 'escudo',
        dica: 'A senha da VPN costuma ser a mesma da rede. Se você trocou a senha hoje, aguarde 15 minutos.' },
      { id: 'bloqueada', titulo: 'Conta bloqueada', ic: 'cadeado' },
    ],
  },
  {
    id: 'internet',
    titulo: 'Internet e rede',
    descricao: 'Sem internet, lenta, Wi-Fi ou cabo',
    categoria: 'Rede', fila: 'Infraestrutura',
    pergunta: 'Qual é o problema de conexão?',
    aparelho: 'computador',
    subgeneros: [
      { id: 'sem-internet', titulo: 'Estou sem internet', ic: 'wifi-off',
        dica: 'Veja se outras pessoas perto de você também estão sem internet. Se for só você, reinicie o computador.' },
      { id: 'lenta', titulo: 'Internet lenta', ic: 'velocimetro',
        dica: 'Feche abas e downloads pesados. Se possível, use o cabo de rede no lugar do Wi-Fi.' },
      { id: 'wifi', titulo: 'Wi-Fi não conecta', ic: 'wifi',
        dica: 'Esqueça a rede Wi-Fi no computador e conecte de novo com a senha atual.' },
      { id: 'cabo', titulo: 'Cabo de rede', ic: 'link',
        dica: 'Desconecte o cabo de rede e conecte de novo, nos dois lados, até ouvir o "clique".' },
      { id: 'vpn', titulo: 'VPN não conecta', ic: 'escudo' },
      { id: 'pasta-rede', titulo: 'Pasta de rede', ic: 'pasta' },
    ],
  },
  {
    id: 'setor',
    titulo: 'Setor parado',
    descricao: 'Várias pessoas sem conseguir trabalhar',
    categoria: 'Incidente', fila: 'Infraestrutura',
    prioridade: 'Alta',            // sempre urgente: não pergunta o impacto
    pergunta: 'O que parou o setor?',
    aparelho: 'computador',
    subgeneros: [
      { id: 'energia', titulo: 'Queda de energia', ic: 'raio' },
      { id: 'sem-internet-setor', titulo: 'Sem internet no setor', ic: 'globo' },
      { id: 'sistema-fora', titulo: 'Sistema principal fora do ar', ic: 'servidor-off' },
      { id: 'telefonia', titulo: 'Telefonia parada', ic: 'telefone' },
      { id: 'outro', titulo: 'Outro motivo', ic: 'duvida' },
    ],
  },
  {
    id: 'impressora',
    titulo: 'Impressora',
    descricao: 'Não imprime, papel atolado ou toner',
    categoria: 'Hardware', fila: 'Suporte Técnico',
    pergunta: 'O que a impressora está fazendo?',
    aparelho: 'impressora',
    subgeneros: [
      { id: 'nao-imprime', titulo: 'Não imprime', ic: 'bloqueio',
        dica: 'Desligue e ligue a impressora. No Windows, abra "Impressoras", clique com o botão direito e limpe a fila de impressão.' },
      { id: 'atolado', titulo: 'Papel atolado', ic: 'documento',
        dica: 'Abra todas as tampas com a impressora desligada e puxe o papel com cuidado, na direção da saída.' },
      { id: 'toner', titulo: 'Toner ou tinta', ic: 'gota' },
      { id: 'falhas', titulo: 'Impressão com falhas', ic: 'falhas' },
      { id: 'instalar', titulo: 'Instalar impressora', ic: 'mais' },
    ],
  },
  {
    id: 'sistemas',
    titulo: 'Programas e sistemas',
    descricao: 'Office, Teams, e-mail, instalação ou erro',
    categoria: 'Software', fila: 'Sistemas',
    pergunta: 'Qual programa está com problema?',
    aparelho: 'computador',
    subgeneros: [
      { id: 'office', titulo: 'Word, Excel ou PowerPoint', ic: 'grafico',
        dica: 'Salve o que estiver aberto e reinicie o programa. Se travar sempre no mesmo arquivo, anexe o nome do arquivo na nota.' },
      { id: 'outlook', titulo: 'Outlook não abre', ic: 'envelope',
        dica: 'Feche o Outlook pelo Gerenciador de Tarefas e abra de novo.' },
      { id: 'teams', titulo: 'Microsoft Teams', ic: 'chat',
        dica: 'Saia da conta do Teams, feche e entre novamente.' },
      { id: 'instalar', titulo: 'Instalar um programa', ic: 'pacote' },
      { id: 'erro-sistema', titulo: 'Sistema da empresa com erro', ic: 'alerta' },
      { id: 'atualizacao', titulo: 'Atualização', ic: 'atualizar' },
    ],
  },
  {
    id: 'pedido',
    titulo: 'Pedir equipamento',
    descricao: 'Mouse, teclado, monitor, headset',
    categoria: 'Solicitação', fila: 'Suporte Técnico',
    pergunta: 'O que você precisa?',
    caixa: true,                   // os itens aparecem dentro de uma caixa, sem etapa de impacto
    subgeneros: [
      { id: 'mouse-teclado', titulo: 'Mouse e teclado', ic: 'teclado', ic2: 'mouse', descricao: 'O kit completo' },
      { id: 'mouse', titulo: 'Mouse', ic: 'mouse', descricao: 'Com ou sem fio' },
      { id: 'teclado', titulo: 'Teclado', ic: 'teclado', descricao: 'Padrão ABNT2' },
      { id: 'notebook', titulo: 'Notebook', ic: 'notebook', descricao: 'Para trabalho fora da mesa' },
      { id: 'monitor', titulo: 'Monitor adicional', ic: 'monitor', descricao: 'Uma segunda tela' },
      { id: 'headset', titulo: 'Headset', ic: 'fone', descricao: 'Para reuniões e ligações' },
      { id: 'cabos', titulo: 'Cabos e adaptadores', ic: 'link', descricao: 'HDMI, USB, rede, carregador' },
      { id: 'outro', titulo: 'Outro equipamento', ic: 'pacote', descricao: 'Conte qual na nota' },
    ],
  },
  {
    id: 'outro',
    titulo: 'Outro assunto',
    descricao: 'Não encontrou? Conte para a gente',
    categoria: 'Geral', fila: 'Service Desk',
    pergunta: 'Sobre o que é?',
    aparelho: 'computador', aparelhoSubs: ['problema'],   // só quando é um problema
    subgeneros: [
      { id: 'duvida', titulo: 'Tenho uma dúvida', ic: 'duvida' },
      { id: 'problema', titulo: 'Tenho um problema', ic: 'ferramenta' },
      { id: 'sugestao', titulo: 'Sugestão ou pedido', ic: 'lampada' },
    ],
  },
];

const IMPACTOS_HELPIA = [
  { id: 'eu', titulo: 'Só eu', ic: 'usuario', descricao: 'Apenas o meu trabalho está afetado' },
  { id: 'equipe', titulo: 'Minha equipe', ic: 'equipe', descricao: 'Algumas pessoas perto de mim também' },
  { id: 'setor', titulo: 'O setor inteiro', ic: 'predio', descricao: 'Ninguém do setor consegue trabalhar' },
];

const CONTATOS_HELPIA = [
  { id: 'whatsapp', titulo: 'WhatsApp', ic: 'celular', placeholder: '(11) 91234-5678' },
  { id: 'teams', titulo: 'Teams', ic: 'chat', placeholder: 'nome@empresa.com' },
  { id: 'email', titulo: 'E-mail', ic: 'envelope', placeholder: 'nome@empresa.com' },
];

/* Níveis de prioridade: cada um pinta a faixa do topo do ticket.
   verde = baixa · azul = normal · amarelo = média · vermelho = alta (pisca). */
const NIVEIS_PRIORIDADE = {
  baixa:  { id: 'baixa',  rotulo: 'Baixa',  descricao: 'Não é tão urgente' },
  normal: { id: 'normal', rotulo: 'Normal', descricao: 'Prioridade normal' },
  media:  { id: 'media',  rotulo: 'Média',  descricao: 'Um pouco mais de prioridade' },
  alta:   { id: 'alta',   rotulo: 'Alta',   descricao: 'Alta prioridade' },
};

/* Pedidos e dúvidas que não travam o trabalho de ninguém ('*' = o gênero inteiro). */
const SUBS_BAIXA = {
  pedido: '*',
  outro: ['duvida', 'sugestao'],
  impressora: ['toner', 'instalar'],
  sistemas: ['instalar', 'atualizacao'],
};

const Catalogo = {
  generos: CATALOGO_HELPIA,
  impactos: IMPACTOS_HELPIA,
  contatos: CONTATOS_HELPIA,
  niveis: NIVEIS_PRIORIDADE,
  icone(id) { return ICONES_HELPIA[id] || ICONES_HELPIA.outro; },
  genero(id) { return CATALOGO_HELPIA.find((g) => g.id === id) || null; },
  subgenero(generoId, subId) {
    return this.genero(generoId)?.subgeneros.find((s) => s.id === subId) || null;
  },

  /** Equipamento que o analista precisa acessar: 'computador', 'impressora' ou null. */
  aparelho(generoId, subId) {
    const g = this.genero(generoId);
    if (!g?.aparelho) return null;
    if (g.aparelhoSubs && !g.aparelhoSubs.includes(subId)) return null;
    return g.aparelho;
  },

  /**
   * Nível de prioridade de um chamado (ou rascunho): { id, rotulo, descricao }.
   * Recebe { genero, subgenero, impacto, prioridade } — os mesmos campos da API.
   * Chamados antigos, sem impacto, usam a prioridade "Alta"/"Normal" que vier do backend.
   */
  nivel({ genero, subgenero, impacto, prioridade } = {}) {
    if (this.genero(genero)?.prioridade === 'Alta' || impacto === 'setor') return NIVEIS_PRIORIDADE.alta;
    if (impacto === 'equipe') return NIVEIS_PRIORIDADE.media;
    if (!impacto && prioridade === 'Alta') return NIVEIS_PRIORIDADE.alta;
    const baixas = SUBS_BAIXA[genero];
    if (baixas === '*' || baixas?.includes(subgenero)) return NIVEIS_PRIORIDADE.baixa;
    return NIVEIS_PRIORIDADE.normal;
  },
};

window.Catalogo = Catalogo;

/* Ícone de interface (css/simbolos.css). Ex.: ic('ticket'), ic('chama', 'ic-perigo') */
window.ic = (nome, extra = '') =>
  `<i class="ic ic-${nome}${extra ? ' ' + extra : ''}" aria-hidden="true"></i>`;
