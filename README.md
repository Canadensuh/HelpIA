# HelpIA

> Abertura e triagem de chamados de suporte com um assistente (HelpBot).
> Projeto da disciplina de **Engenharia de Software** — curso de **Análise e Desenvolvimento de Sistemas**.

## Equipe

| Integrante | GitHub | Responsabilidade |
|---|---|---|
| João Pedro Marques Souza | @marquess07 | Requisitos e rastreabilidade |
| Murilo do Nascimento Bezerra | @Canadensuh | Modelagem, projeto e arquitetura |

## Problema

Colaboradores não têm um canal padronizado para abrir chamados, e analistas perdem tempo
triando mensagens dispersas, o que gera atrasos e retrabalho.

## História de usuário

> Como **colaborador**, quero **abrir uma solicitação pelo chat**, para que **meu problema seja
> registrado formalmente e direcionado ao analista correto** sem que eu precise procurar alguém.

| Código | Critério / regra | Onde está no código |
|---|---|---|
| CA-01 | Chamado registrado com número único, data e hora | `backend/dominio/chamado.py` → `Chamado` |
| CA-02 | Classificação por categoria e envio para a fila correta | `backend/dominio/chamado.py` → `classificar()` |
| CA-03 | Colaborador recebe confirmação com número e status | `backend/aplicacao/servico_notificacao.py` e `frontend/chat.html` |
| RN-01 | Descrição insuficiente → pedir complemento antes de registrar | `backend/dominio/chamado.py` → `validar_descricao()` |

## Como executar

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

Os testes também rodam automaticamente no GitHub Actions a cada push (`.github/workflows/ci.yml`).

## Roteiro de apresentação (≈ 3 min)

1. Abra a **página inicial** e apresente o problema e a jornada.
2. Abra o **Chat do colaborador** e o **Painel do analista** lado a lado.
3. No chat, envie `ajuda` → o HelpBot pede mais detalhes (**RN-01**).
4. Complemente com `meu computador não liga` → chamado registrado com número, data, categoria e fila (**CA-01, CA-02, CA-03**).
5. No painel, o chamado aparece na fila. Clique em **Assumir** → o chat avisa o colaborador.
6. Clique em **Resolver** → o status muda nas duas telas.

## Estrutura do projeto

```
HelpIA/
├── backend/                      # API Flask em camadas
│   ├── app.py                    # Interface: rotas da API e das telas
│   ├── aplicacao/                # Aplicação: coordena a jornada
│   │   ├── servico_chamado.py
│   │   └── servico_notificacao.py
│   ├── dominio/                  # Domínio: entidade e regras de negócio
│   │   └── chamado.py
│   └── persistencia/             # Persistência: armazenamento dos chamados
│       └── repositorio_chamado.py
├── frontend/                     # Telas (HTML, CSS e JavaScript puro)
│   ├── index.html                # Página de apresentação
│   ├── chat.html                 # Chat do colaborador com o HelpBot
│   ├── painel.html               # Painel do analista
│   ├── css/                      # base, landing, chat, painel
│   ├── js/                       # api, chat, painel
│   └── assets/logo.svg
├── tests/test_app.py             # Testes automatizados (pytest)
├── docs/                         # Documentação das entregas (ver abaixo)
├── .github/workflows/ci.yml      # Integração contínua
└── requirements.txt
```

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/status` | Verifica se o sistema está no ar |
| GET | `/api/chamados?status=&solicitante=` | Lista chamados (filtros opcionais) |
| POST | `/api/chamados` | Abre chamado — `{ "descricao", "solicitante" }`. Retorna `201`, ou `422` se faltar informação (RN-01) |
| GET | `/api/chamados/<numero>` | Detalhes de um chamado |
| POST | `/api/chamados/<numero>/assumir` | Analista assume — `{ "analista" }` |
| POST | `/api/chamados/<numero>/resolver` | Marca como resolvido |

Ciclo de vida: `Aguardando` → `Em atendimento` → `Resolvido`.

## Decisões de projeto

- **Arquitetura em camadas** (Interface, Aplicação, Domínio, Persistência), conforme a
  [análise de projeto](docs/avaliacao-a2/projeto/analise_projeto.md).
- **Persistência em memória** para a demonstração: os dados reiniciam junto com o servidor.
  A troca por PostgreSQL/SQLAlchemy exige apenas um novo repositório com os mesmos métodos.
- **Classificação por palavras-chave** no lugar de um modelo de IA, para manter o MVP simples
  e previsível na apresentação.
- O chat simula o canal do Microsoft Teams descrito nos protótipos.

## Documentação

| Pasta | Conteúdo |
|---|---|
| [docs/E01](docs/E01) | How-To do projeto |
| [docs/E02](docs/E02) | Plano de projeto |
| [docs/E03](docs/E03) | Backlog (e link do Jira) |
| [docs/E04](docs/E04) | Scaffold, CI e protótipos de tela |
| [docs/E05](docs/E05) | Casos de uso, diagrama de classes, fluxograma, história e critérios |
| [docs/avaliacao-a2](docs/avaliacao-a2) | Avaliação A2: arquitetura, modelagem e análise de projeto |
| [docs/evidencias](docs/evidencias) | Evidências das entregas semanais |
