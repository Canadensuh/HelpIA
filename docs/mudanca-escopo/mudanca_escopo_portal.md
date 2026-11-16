# Mudança de escopo — do canal Microsoft Teams para um Portal de Chamados

| Campo | Valor |
|---|---|
| Projeto | HelpIA |
| Versão | v1.1 |
| Data | 15/11/2026 |
| Tipo | Mudança de escopo (critério da seção 5 do Plano de Projeto, E02) |
| Status | Proposta — a ser registrada na issue e comunicada à professora |

## 1. Decisão

O primeiro atendimento deixa de acontecer pelo **Microsoft Teams** e passa a acontecer em um
**portal de chamados próprio**. O colaborador abre o chamado no portal, ele cai na fila do
analista e **todo o atendimento acontece dentro do mesmo portal**, por uma conversa vinculada
ao chamado.

O **HelpBot continua** como primeiro contato: pede complemento quando a descrição é insuficiente
(RN-01), classifica o chamado e o envia para a fila correta (CA-02).

A integração com o Teams passa a ser **trabalho futuro** (ver seção 6).

## 2. Motivo

- A integração com o Teams era o maior risco técnico do plano (**R01**) e também o risco de
  conhecimento **R04** (curva de aprendizado da Microsoft Graph API). Ela depende de conta
  Microsoft 365, permissões no tenant e App Registration, itens fora do controle da equipe.
- O MVP já funciona como portal: o chat do colaborador, o painel do analista e a fila existem e
  têm testes automatizados. O que faltava era o atendimento acontecer no próprio sistema, e não
  apenas a atribuição do chamado.
- Um portal com atendimento próprio fecha a jornada inteira (abrir, triar, assumir, conversar e
  resolver) e viabiliza o histórico de atendimento por analista, que era objetivo do projeto
  desde o E01.

## 3. Critérios de mudança de escopo (E02, seção 5)

| Critério | Atende? | Justificativa |
|---|---|---|
| Protege o objetivo do MVP (reduzir o tempo médio de atendimento) | Sim | O atendimento passa a ser medido e concluído no mesmo lugar |
| Cabe no esforço restante | Sim | Reaproveita backend, front-end e testes; acrescenta uma entidade (`Mensagem`) e persistência |
| Reduz risco técnico ou de valor | Sim | Elimina a dependência da Graph API e do tenant Microsoft 365 |
| Solicitada pela professora/cliente | Não | Decisão da equipe; deve ser comunicada à professora |

## 4. O que entra e o que sai

| Entra | Sai do MVP |
|---|---|
| Portal web como único canal (chat com o HelpBot) | Integração com Microsoft Teams (webhook, Graph API) |
| Conversa entre colaborador e analista dentro de cada chamado | Registro de aplicativo (App Registration) e permissões do tenant |
| Perfis de colaborador e analista | Notificação do colaborador dentro do Teams |
| Histórico de mensagens por chamado | |
| Persistência real (SQLite) no lugar da memória | |
| Registro da solução ao resolver | |

Continuam **fora do corte** nesta versão: anexos, SLA, e-mail, tempo real por WebSocket (usa-se
atualização periódica, como hoje) e painel de gestor.

## 5. Artefatos afetados

| Artefato | Situação |
|---|---|
| `README.md` | **Atualizado** (v1.1) |
| História de usuário e critérios (`docs/E05/AS5 - HISTÓRIA DE USUÁRIO E CRITÉRIOS.docx`) | **Atualizado (versão 2)**, conforme a seção 7 |
| Backlog (`docs/E03/E03_Backlog_HelpIA.docx` e `.pdf`) | **Atualizado (versão 2)**: US-01 reescrita, nova US-08, US-05 passa a Alta, critérios, corte e mapa de histórias |
| Plano de projeto (`docs/E02/E02_Plano_Projeto_HelpIA.docx` e `.pdf`) | **Atualizado (versão 2)**: cronograma E07 e E08, dependências, riscos (R01 e R04 encerrados; R07 e R08 novos) e critérios adicionais |
| Responsabilidades das classes (análise de projeto, A2) | **Atualizadas** na seção 8 deste documento |
| Registro de riscos | **Atualizado** na seção 9 e no plano de projeto (E02, versão 2) |
| E01 (`E01_HowTo_HelpIA.docx`), E04 e `docs/avaliacao-a2/` | Mantidos como estão. Registram o que foi decidido na época; as referências ao Teams ali estão **superadas por este documento** |
| Diagrama de casos de uso e fluxograma (`docs/E05/*.drawio`) | **Atualizados (versão 2)**: casos de uso do portal (com os planejados tracejados) e fluxo com o desvio do RN-01 |
| Diagrama de classes (E05, imagem `.jpeg`) | **A atualizar**: incluir `Mensagem` e a solução no `Chamado` |
| Protótipos de tela (E04 e E05, imagens) | **A atualizar**: a Tela 1 ainda mostra o Microsoft Teams |

Cada documento atualizado traz no início uma linha de **"Versão 2 — 15/11/2026"** que aponta para este registro.
O histórico das versões anteriores continua disponível no Git.

## 6. Teams como trabalho futuro

O Teams pode voltar como **canal de notificação** (aviso de "chamado assumido" ou "chamado
resolvido" por webhook), sem substituir o portal. Isso exige apenas uma nova implementação de
`ServicoNotificacao`, o que a arquitetura em camadas já permite.

## 7. História de usuário e critérios de aceitação (versão 2)

**Jornada:** abrir e acompanhar uma solicitação no portal de chamados.

**História:**

> Como **colaborador**, quero **abrir uma solicitação no portal de chamados e conversar com o
> analista dentro dele**, para que meu problema seja **registrado formalmente, direcionado ao
> analista correto e resolvido sem que eu precise procurar alguém**.

| Código | Critério / regra | Como verificar | Situação |
|---|---|---|---|
| CA-01 | Chamado registrado com número único, data e hora | Abrir um chamado no portal e ver o número, a data e a hora no painel | Implementado |
| CA-02 | Classificação por categoria e envio para a fila correta | Abrir chamados de categorias diferentes e conferir a fila de cada um | Implementado |
| CA-03 | O colaborador recebe, no portal, a confirmação com número e status inicial (Aguardando) | Observar a resposta do HelpBot após o envio | Implementado |
| RN-01 | Descrição insuficiente → pedir complemento antes de registrar | Enviar "ajuda" e ver o pedido de mais detalhes, sem chamado criado | Implementado |
| CA-04 | O analista assume o chamado da fila e o status muda para "Em atendimento", com o nome do analista | Clicar em Assumir e conferir o status nas duas telas | Implementado |
| CA-05 | Colaborador e analista trocam mensagens dentro do chamado, cada mensagem com autor, data e hora | Enviar mensagens pelas duas telas e ver a conversa nas duas | **Planejado** |
| CA-06 | O histórico de mensagens fica preservado e visível enquanto o chamado existir | Reabrir o chamado e conferir as mensagens | **Planejado** |
| CA-07 | Ao resolver, o analista registra a solução e o chamado passa a "Resolvido" | Resolver um chamado informando a solução e ver o texto no histórico | **Planejado** |
| RN-02 | Somente o analista que assumiu pode responder; chamado resolvido não recebe novas mensagens | Tentar responder como outro analista e em chamado resolvido | **Planejado** |

## 8. Responsabilidades das classes (atualização)

| Classe | Responsabilidade | O que não deve fazer |
|---|---|---|
| Chamado | Representar a solicitação, seus dados e o ciclo de vida (Aguardando → Em atendimento → Resolvido) | Não deve gerenciar banco nem enviar notificações |
| Mensagem *(nova)* | Representar uma mensagem do chamado: autor, perfil, texto, data e hora | Não deve conter regra de fila ou de classificação |
| Usuario | Representar quem usa o portal e seu perfil (colaborador ou analista) | Não deve conter regras específicas do chamado |
| Analista | Assumir chamados e responder dentro deles | Não deve abrir chamados (papel do colaborador) |
| Colaborador | Abrir chamados e conversar no portal | Não deve assumir ou resolver chamados |
| ServicoChamado | Coordenar abertura, atribuição, conversa e resolução | Não deve conhecer detalhes de armazenamento |
| ServicoNotificacao | Montar as mensagens de confirmação e de mudança de status | Não deve decidir regras de negócio |

Módulos (mesmas quatro camadas): **Interface** (telas e rotas), **Aplicação** (serviços),
**Domínio** (entidades e regras) e **Persistência** (repositórios, agora com SQLite).

## 9. Riscos (atualização do registro de riscos do E02)

| ID | Situação |
|---|---|
| R01 — Integração com Teams falha | **Encerrado para o MVP.** Teams passa a ser trabalho futuro |
| R04 — Curva de aprendizado da Graph API | **Encerrado para o MVP** |
| R02 — Escopo maior que a capacidade | **Mantido e reforçado.** Tentação de acrescentar anexos, SLA e tempo real; cortar o que não for da seção 7 |
| R07 — Mudança de escopo avançada no semestre | **Novo.** Documentos anteriores citam o Teams. Resposta: este registro, comunicação à professora e atualização dos diagramas |
| R08 — Perda de dados com persistência em memória | **Novo.** Resposta: migrar para SQLite antes de implementar a conversa |

## 10. Plano de execução sugerido

1. Abrir a issue "Mudança de escopo: Teams → Portal de Chamados" com o texto da seção 1 a 4.
2. Atualizar o diagrama de casos de uso e o de classes (incluir `Mensagem`, retirar o ator Teams).
3. Migrar a persistência para SQLite mantendo os mesmos métodos do repositório.
4. Implementar CA-05 a CA-07 e RN-02, cada um com testes.
5. Atualizar o README quando cada critério deixar de ser "Planejado".

Sugestão de fluxo no Git (em ramificação separada, sem alterar a tag `avaliacao-a2`):

```bash
git switch main
git pull origin main
git switch -c docs/mudanca-escopo-portal
git add README.md docs/mudanca-escopo/
git commit -m "docs: registra mudança de escopo de Teams para portal de chamados"
git push -u origin docs/mudanca-escopo-portal
```

Depois, abra a pull request para a `main` e peça a revisão do colega.
