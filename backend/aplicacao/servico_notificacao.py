"""Camada de Aplicação — mensagens enviadas ao colaborador (CA-03).

Fica separado da entidade Chamado para manter a classe coesa
(melhoria descrita em docs/avaliacao-a2/projeto/analise_projeto.md).
"""
from datetime import datetime

from backend.dominio.chamado import Chamado


def mensagem_confirmacao(chamado: Chamado) -> str:
    data = datetime.fromisoformat(chamado.aberto_em).strftime("%d/%m/%Y às %H:%M")
    return (
        f"Chamado {chamado.codigo} registrado em {data}. "
        f"Categoria: {chamado.categoria} · Fila: {chamado.fila} · "
        f"Status: {chamado.status}. Um analista vai assumir em breve."
    )
