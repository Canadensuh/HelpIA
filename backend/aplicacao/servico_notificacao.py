"""Camada de Aplicação — mensagens enviadas ao colaborador (CA-03).

Fica separado da entidade Chamado para manter a classe coesa
(melhoria descrita em docs/avaliacao-a2/projeto/analise_projeto.md).
"""
from backend.dominio.chamado import Chamado


def mensagem_confirmacao(chamado: Chamado) -> str:
    data, hora = chamado.aberto_em.split("T")
    ano, mes, dia = data.split("-")
    return (
        f"Chamado {chamado.codigo} registrado em {dia}/{mes}/{ano} às {hora[:5]}. "
        f"Categoria: {chamado.categoria} · Fila: {chamado.fila} · "
        f"Status: {chamado.status}. Um analista vai assumir em breve."
    )
