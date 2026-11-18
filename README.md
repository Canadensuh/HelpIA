# HelpIA

> Portal de chamados de suporte: o colaborador abre o chamado com a ajuda de um assistente
> (HelpBot), ele cai na fila do analista e o atendimento acontece no próprio portal.
> Projeto da disciplina de **Engenharia de Software** — curso de **Análise e Desenvolvimento de Sistemas**.

> **Mudança de escopo (v1.1):** o projeto deixou de usar o Microsoft Teams como canal e passou a
> ser um portal de chamados com atendimento próprio. Motivo, impacto e plano estão em
> [docs/mudanca-escopo](docs/mudanca-escopo/mudanca_escopo_portal.md).

## Equipe

| Integrante | GitHub | Responsabilidade |
|---|---|---|
| João Pedro Marques Souza | @marquess07 | Requisitos, rastreabilidade, documentação, deploy, especificação de produto (chatbot), testes e coordenação |
| Murilo do Nascimento Bezerra | @Canadensuh | Modelagem, projeto e arquitetura |

## Problema

Colaboradores não têm um canal padronizado para abrir chamados, e analistas perdem tempo
triando mensagens dispersas, o que gera atrasos e retrabalho.

## História de usuário

> Como **colaborador**, quero **abrir uma solicitação no portal de chamados e conversar com o
> analista dentro dele**, para que meu problema seja **registrado formalmente, direcionado ao
> analista correto e resolvido sem que eu precise procurar alguém**.

| Código | Critério / regra | Onde está no código | Situação |
|---|---|---|---|
| CA-01 | Chamado registrado com número único, data e hora | `backend/dominio/chamado.py` → `Chamado` | Implementado |
| CA-02 | Classificação por categoria e envio para a fila correta | `backend/dominio/chamado.py` → `classificar()` | Implementado |
| CA-03 | Colaborador recebe confirmação com número e status | `backend/aplicacao/servico_notificacao.py` e `frontend/chat.html` | Implementado |
| RN-01 | Descrição insuficiente → pedir complemento antes de registrar | `backend/dominio/chamado.py` → `validar_descricao()` | Implementado |
| CA-04 | Analista assume o chamado e o status vira "Em atendimento" | `backend/dominio/chamado.py` → `assumir()` e `frontend/painel.html` | Implementado |
| CA-05 | Colaborador e analista trocam mensagens dentro do chamado | — | Planejado |
| CA-06 | Histórico de mensagens preservado no chamado | — | Planejado |
| CA-07 | Ao resolver, o analista registra a solução | — | Planejado |
| RN-02 | Só o analista responsável responde; chamado resolvido não recebe mensagens | — | Planejado |

Os critérios completos e a forma de verificação estão em
[docs/mudanca-escopo](docs/mudanca-escopo/mudanca_escopo_portal.md).

## 🚀 Deploy em Produção (Render)

- **URL:** https://helpia-backend.onrender.com
- O Flask serve o site (pasta `frontend/`) e a API (`/api`) no mesmo endereço, sem problemas de CORS.
- Configuração em [`render.yaml`](render.yaml): `gunicorn --workers 1 backend.app:app`.
  **Um processo só:** os dados ficam em memória, então dois processos teriam dados diferentes.
- Variável de ambiente `HELPIA_SECRET_KEY`: o `render.yaml` já gera uma. Sem ela, as sessões caem a
  cada reinício.
- No plano gratuito, o servidor dorme sem uso e volta ao estado inicial (contas e tickets de
  demonstração) quando acorda.

> **Plano B da apresentação:** só o frontend, com o simulador, publicado no GitHub Pages pelo
> repositório [HelpIA-Frontend](https://github.com/Canadensuh/HelpIA-Frontend).

---

## 💻 Como executar localmente

Pré-requisito: **Python 3.10+**.

```bash
pip install -r requirements.txt
python -m backend.app
```

Acesse **http://localhost:5000**.

> O comando deve ser executado na pasta raiz do projeto (onde está este README).

### Rodar os testes

```bash
python -m pytest -v
```

Os testes também rodam automaticamente no GitHub Actions a cada push
(`.github/workflows/testes.yml`): dá para conferir o backend mesmo sem Python na máquina.

### Só o frontend, sem Python (modo simulação)

Abrindo a pasta `frontend` pelo **Live Server / Go Live** do VS Code, o `js/simulador.js` assume o
lugar da API: imita as rotas do backend com as mesmas regras e guarda os dados no navegador.

- Forçar o simulador: `?simulador=1` na URL · Desligar: `?simulador=0` (a escolha fica salva).
- Ele nunca liga no site publicado nem em `localhost:5000` (o Flask).
- O simulador e o backend têm as mesmas rotas: o que mudar em um precisa mudar no outro.

### Contas de demonstração

Criadas pelo backend (`servico_simulacao.py`) e pelo simulador do frontend, com os mesmos dados.
Senha de todas: `1234`. Os gestores são os donos do projeto e usam a foto do GitHub; as demais
contas são fictícias e usam o ícone do cargo.

| Perfil | Nome | E-mail | Abre em |
|---|---|---|---|
| Gestor | Murilo do Nascimento B. | `MuriloNB@HelpIA.com.br` | `controle.html` |
| Gestor | João Pedro M. | `JoãoPM@HelpIA.com.br` (aceita também `joaopm@…`) | `controle.html` |
| Analista | Carlos Souza | `carlos@helpia.com.br` | `painel.html` |
| Analista | Beatriz Rocha | `beatriz@helpia.com.br` | `painel.html` |
| Colaborador | João Silva | `joao.silva@helpia.com.br` | `chat.html` |
| Colaborador | Maria Oliveira | `maria@helpia.com.br` | `chat.html` |

No menu da conta (cartão no canto superior direito), o gestor liga ou desliga o **Modo simulação**
(tickets fictícios) e usa **Limpar dados** para apagar os tickets e as conversas da empresa.

> A sessão fica guardada por aba do navegador, então dá para entrar como colaborador em uma aba
> e como analista em outra.

## Roteiro de apresentação (≈ 3 min)

1. Abra a **página inicial** e apresente o problema, os perfis e os planos.
2. Em uma aba, entre como **colaborador** (Maria); em outra, como **analista** (Carlos).
3. A Maria abre um chamado com o Helpy: tipo, detalhe, impacto, nota e máquina. Uma nota curta
   não passa (**RN-01**); o ticket sai com número, data, fila e prioridade (**CA-01, CA-02, CA-03**).
4. Na mesa do Carlos, o ticket chega na bandeja. Ele assume e o Helpy lembra de casos parecidos.
5. O Carlos fala com a Maria pelo **HelpIA Chat** (ela pode mandar uma foto pelo celular).
6. O Carlos carimba com a nota de resolução (**RN-02**): a Maria é avisada e a conversa se encerra.
7. Como gestor (Murilo): painel, exportar dados, Cobrar e Gerenciar tickets, crachás da equipe.

## Estrutura do projeto

```
HelpIA/
├── backend/                      # API Flask em camadas
│   ├── app.py                    # Interface: rotas da API e o site
│   ├── aplicacao/                # Aplicação: coordena as jornadas
│   │   ├── servico_conta.py      # contratação, login, sessão e contas da equipe
│   │   ├── servico_chamado.py    # abrir, assumir, carimbar; ações do gestor
│   │   ├── servico_chat.py       # HelpIA Chat: grupo, conversas, respostas, /clear
│   │   ├── servico_metas.py      # metas, regra do dia e mensagens motivacionais
│   │   ├── servico_simulacao.py  # dados de demonstração e Modo simulação
│   │   ├── servico_anexos.py     # anexos do chat (fotos, documentos)
│   │   └── servico_notificacao.py
│   ├── dominio/                  # Domínio: entidades e regras de negócio
│   │   ├── catalogo.py           # tipos de chamado, impacto e prioridade
│   │   ├── chamado.py            # o ticket e as regras do atendimento
│   │   ├── chat.py               # conversa, mensagem e metas
│   │   ├── usuario.py            # Usuario, Empresa, perfis e planos
│   │   ├── erros.py              # erros de regra (cada um com o seu código HTTP)
│   │   └── relogio.py            # hora de Brasília
│   └── persistencia/
│       └── banco.py              # armazenamento em memória
├── frontend/                     # Telas (HTML, CSS e JavaScript puro)
│   ├── index.html                # Landing
│   ├── contratar.html · login.html
│   ├── chat.html                 # Colaborador: mesa e abertura com o Helpy
│   ├── painel.html               # Analista: bandeja e mesa
│   ├── controle.html             # Gestor: painel de controle
│   ├── criar-conta.html          # Gestor: crachás da equipe
│   ├── conversas.html            # HelpIA Chat
│   ├── tickets.html · historico.html · metas.html
│   ├── css/ · js/ · assets/
│   └── js/simulador.js           # a API simulada (modo sem backend)
├── tests/                        # Testes automatizados (pytest)
├── render.yaml                   # Deploy no Render
├── .github/workflows/testes.yml  # Testes no GitHub Actions
└── requirements.txt
```

## API

Todas as rotas, menos status, planos, contratação e login, pedem o cabeçalho
`Authorization: Bearer <token>`. Os erros voltam como `{ "erro": "mensagem" }`.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/status` | Verifica se o sistema está no ar |
| GET | `/api/planos` | Planos para empresas |
| POST | `/api/empresas` | Contrata um plano: cria a empresa e o gestor |
| POST | `/api/auth/login` | Login por área (`colaborador` ou `analista`; o gestor entra pela do analista) |
| GET | `/api/auth/eu` | Usuário da sessão |
| POST | `/api/auth/senha` | Troca a própria senha — `{ "atual", "nova" }` |
| GET · POST | `/api/contas` | Crachás da empresa (gestor) |
| PATCH | `/api/contas/<id>` | Suspender/reativar, cargo, nome, e-mail |
| POST | `/api/contas/<id>/senha` | Gestor gera senha nova |
| GET · POST | `/api/chamados` | Lista (o colaborador vê só os dele) e abre tickets — `{ genero, subgenero, impacto, maquina, nota, contato? }` |
| GET · PATCH · DELETE | `/api/chamados/<n>` | Detalhes · prioridade (gestor) · excluir |
| POST | `/api/chamados/<n>/assumir` · `/resolver` · `/atribuir` · `/ocultar` | Assumir · carimbar `{ nota }` · passar para um analista (gestor) · tirar da coluna Histórico |
| GET · POST | `/api/chat/conversas` | Conversas · abrir conversa direta `{ com, ticket? }` |
| PATCH | `/api/chat/conversas/<id>` | Tirar o ticket do assunto |
| GET · POST · DELETE | `/api/chat/conversas/<id>/mensagens` | Mensagens · enviar `{ texto, ticket?, anexos?, resposta? }` · `/clear` (gestor) |
| POST | `/api/chat/conversas/<id>/lida` | Marca como lida |
| GET | `/api/chat/nao-lidas` · `/api/chat/contatos` | Contador e pessoas para conversar |
| POST · GET | `/api/anexos` · `/api/anexos/<id>` | Envia (multipart, campo `arquivo`, até 25 MB) e baixa anexos |
| GET · PATCH | `/api/metas` | Metas da equipe · gestor define |
| POST · DELETE | `/api/metas/motivacionais` | Mensagens motivacionais |
| GET · POST | `/api/simulacao` | Modo simulação (gestor) |
| POST | `/api/simulacao/limpar` | Limpar dados (gestor) |

Ciclo de vida: `Aguardando` → `Em atendimento` → `Resolvido`.

## Decisões de projeto

- **Portal de chamados como único canal.** O atendimento acontece no próprio sistema, pelo
  HelpIA Chat. O Microsoft Teams ficou como possível canal de notificação no futuro (registro em
  [docs/mudanca-escopo](docs/mudanca-escopo/mudanca_escopo_portal.md)).
- **Arquitetura em camadas** (Interface, Aplicação, Domínio, Persistência), conforme a
  [análise de projeto](docs/avaliacao-a2/projeto/analise_projeto.md).
- **Persistência em memória:** os dados reiniciam junto com o servidor e voltam aos de
  demonstração. Trocar por um banco de verdade exige só uma nova classe em `persistencia/`.
- **Abertura guiada por catálogo** no lugar de um modelo de IA: o colaborador escolhe tipo e
  detalhe, e a fila e a prioridade saem do catálogo e do impacto. Simples e previsível.
- **Dados fictícios.** O projeto não usa dados reais de chamados nem de colaboradores.

## Próximos passos

1. Banco de dados de verdade (PostgreSQL) para os dados não sumirem ao reiniciar.
2. Anexos guardados fora da memória (armazenamento de arquivos).
3. Trabalho futuro: notificações no Microsoft Teams via webhook.

## Documentação

| Pasta | Conteúdo |
|---|---|
| [docs/E01](docs/E01) | How-To do projeto |
| [docs/E02](docs/E02) | Plano de projeto |
| [docs/E03](docs/E03) | Backlog (e link do Jira) |
| [docs/E04](docs/E04) | Scaffold, CI e protótipos de tela |
| [docs/E05](docs/E05) | Casos de uso, diagrama de classes, fluxograma, história e critérios |
| [docs/avaliacao-a2](docs/avaliacao-a2) | Avaliação A2: arquitetura, modelagem e análise de projeto |
| [docs/mudanca-escopo](docs/mudanca-escopo) | Mudança de escopo: do Teams para o portal de chamados (v1.1) |
| [docs/evidencias](docs/evidencias) | Evidências das entregas semanais |

> Os documentos E02, E03 e E05 foram atualizados para a versão 2 (portal de chamados). E01, E04 e a A2
> registram o que foi decidido em cada semana e ainda citam o Microsoft Teams. Onde houver diferença,
> vale o documento de mudança de escopo.
