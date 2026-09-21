# CallSync

Sistema de hub de atendimento que integra Microsoft Teams para triagem e direcionamento de chamados de suporte.

## Integrantes

- João Pedro Marques Souza (@marquess07)
- Murilo do Nascimento Bezerra (@Canadensuh)

## Descrição

O CallSync é uma plataforma web que organiza o atendimento de suporte técnico dentro do Microsoft Teams. Quando um colaborador tem um problema, ele envia uma mensagem no Teams, o sistema registra automaticamente um chamado, classifica por categoria e direciona para a fila do analista correto. O analista visualiza a fila, assume o chamado e o colaborador recebe uma confirmação.

### Problema resolvido

- Chamados chegam de forma desorganizada (chat privado, canal geral)
- Analistas perdem tempo triando mensagens manualmente
- Não há histórico centralizado de atendimentos
- Colaboradores não sabem se serão atendidos

### Solução

- Registro automático de chamados via Teams
- Classificação por categoria (Hardware, Software, Rede)
- Direcionamento para filas de analistas
- Painel do analista com fila de chamados
- Confirmação automática para o colaborador

## Tecnologias

- Python 3.12
- Flask
- PostgreSQL
- Microsoft Graph API (integração com Teams)
- AWS (EC2 + RDS - free tier)
- GitHub Actions (CI)

## Como executar localmente

### Pré-requisitos

- Python 3.12 ou superior
- Git
- pip

### Passos

1. Clone o repositório:
   ```bash
   git clone https://github.com/Canadensuh/CallSync.git
   cd CallSync
