"""Erros de regra de negócio do HelpIA.

Cada erro já sabe o seu código HTTP; a camada web (backend/app.py) só
transforma em {"erro": mensagem} com esse código.
"""
from __future__ import annotations


class ErroHelpIA(Exception):
    status = 400

    def __init__(self, mensagem: str, **extra) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.extra = extra


class DadosInvalidos(ErroHelpIA):
    """Dados fora das regras (422)."""
    status = 422


class Conflito(ErroHelpIA):
    """A ação não combina com o estado atual (409)."""
    status = 409


class NaoAutenticado(ErroHelpIA):
    """Sem login ou sessão inválida (401)."""
    status = 401


class AcessoNegado(ErroHelpIA):
    """Logado, mas sem permissão para a ação (403)."""
    status = 403


class NaoEncontrado(ErroHelpIA):
    """Ticket, conta ou conversa que não existe (404)."""
    status = 404
