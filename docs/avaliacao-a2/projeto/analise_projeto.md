# Análise de projeto

## Classes e responsabilidades

| Classe | Responsabilidade | O que não deve fazer |
|---|---|---|
| Chamado | Representar uma solicitação de suporte com seus dados e status | Não deve gerenciar conexões de banco |
| Usuario | Representar quem interage com o sistema (colaborador ou analista) | Não deve conter regras de negócio específicas do chamado |
| Analista | Gerenciar fila de chamados e assumir solicitações | Não deve registrar chamados (papel do colaborador) |
| Colaborador | Abrir solicitações via Teams | Não deve assumir ou resolver chamados |

## Módulos

| Módulo | Responsabilidade | Classes ou funções |
|---|---|---|
| Interface | Exibir telas e capturar ações do usuário | Tela Teams, Painel Analista, Rotas Flask |
| Aplicação | Coordenar a jornada de abertura de chamado | ServicoChamado, Rotas API |
| Domínio | Concentrar as regras de negócio | Chamado, Usuario, Analista |
| Persistência | Armazenar e recuperar dados | RepositorioChamado, RepositorioUsuario |

## Coesão e acoplamento

| Elemento | Situação | Evidência |
|---|---|---|
| Coesão | Adequado | A classe Chamado tem uma única responsabilidade: representar a solicitação e seu ciclo de vida |
| Acoplamento | Atenção | A camada de Aplicação depende diretamente da Persistência; poderia usar uma interface para reduzir acoplamento |

## Melhoria
Problema encontrado: A classe Chamado estava acumulando responsabilidades de notificação.
Alteração realizada ou proposta: Separar a notificação em um serviço específico (ServicoNotificacao).
Benefício esperado: Maior coesão da classe Chamado e menor acoplamento com o Teams.

## Decisões técnicas

| Decisão | Escolha | Justificativa | Consequência |
|---|---|---|---|
| Organização da aplicação | Arquitetura em camadas (Interface, Aplicação, Domínio, Persistência) | Separa responsabilidades e facilita manutenção e testes | Mais arquivos para gerenciar; exige disciplina |
| Persistência ou integração | PostgreSQL via SQLAlchemy | Banco relacional gratuito, bem suportado e disponível na AWS | Curva de aprendizado do ORM; necessidade de configurar conexão |