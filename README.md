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
| João Pedro Marques Souza | @marquess07 | Requisitos e rastreabilidade |
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
- **Frontend (estático):** `index.html`, `chat.html`, `painel.html`
- **API Flask:** `/api/chamados`, `/api/chamados/<numero>`, `/api/chamados/<numero>/assumir`, `/api/chamados/<numero>/resolver`

> O Render serve o frontend (pasta `frontend/`) como arquivos estáticos e roda o backend Flask na mesma origem — sem problemas de CORS.

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

Os testes também rodam automaticamente no GitHub Actions a cada push (`.github/workflows/ci.yml`).

## Roteiro de apresentação (≈ 3 min)

1. Abra a **página inicial** e apresente o problema e a jornada.
2. Abra o **Chat do colaborador** e o **Painel do analista** lado a lado.
3. No chat, envie `ajuda` → o HelpBot pede mais detalhes (**RN-01**).
4. Complemente com `meu computador não liga` → chamado registrado com número, data, categoria e fila (**CA-01, CA-02, CA-03**).
5. No painel, o chamado aparece na fila. Clique em **Assumir** → o chat avisa o colaborador (**CA-04**).
6. Clique em **Resolver** → o status muda nas duas telas.

> Quando a conversa dentro do chamado (CA-05 a CA-07) estiver implementada, inclua entre os passos
> 5 e 6 uma troca de mensagens entre colaborador e analista.

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
│   ├── chat.html                 # Portal do colaborador: HelpBot e acompanhamento
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

| Método | Rota | Descrição | Situação |
|---|---|---|---|
| GET | `/api/status` | Verifica se o sistema está no ar | Implementado |
| GET | `/api/chamados?status=&solicitante=` | Lista chamados (filtros opcionais) | Implementado |
| POST | `/api/chamados` | Abre chamado — `{ "descricao", "solicitante" }`. Retorna `201`, ou `422` se faltar informação (RN-01) | Implementado |
| GET | `/api/chamados/<numero>` | Detalhes de um chamado | Implementado |
| POST | `/api/chamados/<numero>/assumir` | Analista assume — `{ "analista" }` | Implementado |
| POST | `/api/chamados/<numero>/resolver` | Marca como resolvido | Implementado |
| GET | `/api/chamados/<numero>/mensagens` | Lista a conversa do chamado | Planejado |
| POST | `/api/chamados/<numero>/mensagens` | Envia mensagem no chamado — `{ "autor", "texto" }` | Planejado |

Ciclo de vida: `Aguardando` → `Em atendimento` → `Resolvido`.

## Decisões de projeto

- **Portal de chamados como único canal.** O atendimento acontece no próprio sistema, sem
  depender de integração externa. O Microsoft Teams ficou como possível canal de notificação
  no futuro (registro em [docs/mudanca-escopo](docs/mudanca-escopo/mudanca_escopo_portal.md)).
- **Arquitetura em camadas** (Interface, Aplicação, Domínio, Persistência), conforme a
  [análise de projeto](docs/avaliacao-a2/projeto/analise_projeto.md).
- **Persistência em memória** na versão atual: os dados reiniciam junto com o servidor.
  A migração para **SQLite** está planejada e exige apenas um novo repositório com os mesmos métodos.
- **Classificação por palavras-chave** no lugar de um modelo de IA, para manter o MVP simples
  e previsível na apresentação.
- **Dados fictícios.** O projeto não usa dados reais de chamados nem de colaboradores.

## Próximos passos

1. Migrar a persistência para SQLite.
2. Conversa dentro do chamado (CA-05, CA-06 e RN-02).
3. Registro da solução ao resolver (CA-07).
4. Perfis de colaborador e analista.
5. Trabalho futuro: notificações no Microsoft Teams via webhook.

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
