"""Camada de Persistência — armazena os chamados.

Para a apresentação os dados ficam em memória (somem ao reiniciar o servidor).
Trocar por PostgreSQL/SQLAlchemy (decisão técnica registrada em docs/) só exige
uma nova classe com os mesmos métodos.
"""
from __future__ import annotations

from backend.dominio.chamado import Chamado


class RepositorioChamadoMemoria:
    def __init__(self) -> None:
        self._chamados: dict[int, Chamado] = {}
        self._proximo_numero = 1

    def proximo_numero(self) -> int:
        numero = self._proximo_numero
        self._proximo_numero += 1
        return numero

    def salvar(self, chamado: Chamado) -> Chamado:
        self._chamados[chamado.numero] = chamado
        return chamado

    def buscar(self, numero: int) -> Chamado | None:
        return self._chamados.get(numero)

    def listar(self) -> list[Chamado]:
        return sorted(self._chamados.values(), key=lambda c: c.numero)
