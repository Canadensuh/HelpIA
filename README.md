# Avaliação A2 - Do modelo à arquitetura do MVP

## Equipe

| Integrante | Usuário GitHub | Responsabilidade | Evidência |
|---|---|---|---|
| João Pedro Marques Souza | @marquess07 | Requisitos e rastreabilidade | README, história, critérios |  Modelagem, Projeto e Arquitetura 
| Murilo do Nascimento Bezerra | @Canadensuh | Modelagem, Projeto e Arquitetura | Modelagem revisada, análise de projeto, arquitetura |

## Projeto
CallSync - Sistema de hub de atendimento no Microsoft Teams

## Problema
Colaboradores não têm canal padronizado para abrir chamados, e analistas perdem tempo triando mensagens dispersas no Teams, resultando em atrasos e retrabalho.

## Jornada selecionada
Abrir uma solicitação via Microsoft Teams

## História de usuário
Como colaborador, quero abrir uma solicitação através do Microsoft Teams, para que meu problema seja registrado formalmente e direcionado ao analista correto sem que eu precise procurar alguém.

## Critérios de aceitação
- CA-01: O sistema registra automaticamente o chamado com número único, data e hora.
- CA-02: O sistema classifica a solicitação por categoria e direciona para a fila correta.
- CA-03: O colaborador recebe confirmação no Teams com número e status inicial.

## Regra de negócio
- RN-01: Se a mensagem não contiver descrição suficiente, o sistema deve solicitar informações complementares antes de registrar o chamado.

## Rastreabilidade resumida

| Origem | Representação no projeto |
|---|---|
| História | Jornada de abertura de chamado via Teams |
| CA-01 | Fluxograma (etapa de registro) e Classe Chamado |
| CA-02 | Fluxograma (etapa de classificação) e Classe Chamado |
| CA-03 | Fluxograma (etapa de confirmação) e Protótipo (Tela 2) |
| RN-01 | Fluxograma (decisão) e Casos de Uso |
